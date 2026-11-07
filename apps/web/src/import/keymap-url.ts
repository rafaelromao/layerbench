/**
 * Reading a keymap-drawer file by its address, for Import: which addresses are fetched, the one
 * form that is rewritten, and what each failure says. Nothing here reads the YAML: the text goes to
 * the reader a pasted file goes to, so the two give the same layout.
 *
 * Only one file server is fetched from, GitHub's `RAW_ORIGIN`, because it is the one the built
 * page's content security policy can name in `connect-src` (`contentSecurityPolicy` in
 * `vite.config.ts`; the dev server sends none) and one that lets any site read what it serves.
 * Every other host is refused before asking: the browser reports a policy block, a CORS refusal and
 * a dead connection alike as a network error, and that tells the reader nothing.
 */

/**
 * GitHub's file server, for files of public repositories. It answers with
 * `access-control-allow-origin: *`, so a page on any origin may read what it serves.
 */
export const RAW_ORIGIN = 'https://raw.githubusercontent.com';

/** The most of a file that is read: a keymap runs to tens of kilobytes, so this is generous. */
export const MAX_BYTES = 1024 * 1024;

/** How long the server has to send the whole file. */
export const TIMEOUT_MS = 15_000;

/** What went wrong, for a caller that wants to tell the cases apart. */
export type KeymapUrlProblem =
  | 'empty'
  | 'invalid'
  | 'scheme'
  | 'credentials'
  | 'github-page'
  | 'host'
  | 'network'
  | 'timeout'
  | 'status'
  | 'html'
  | 'too-large'
  | 'not-text'
  | 'blank';

/** A failure to get the file, its message written to be shown as it is. */
export class KeymapUrlError extends Error {
  constructor(
    readonly problem: KeymapUrlProblem,
    message: string,
  ) {
    super(message);
    this.name = 'KeymapUrlError';
  }
}

const PASTE_INSTEAD = "Paste the file's text instead.";
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

/**
 * The raw file behind a GitHub page of one, `/owner/repo/blob/ref/path` or `/owner/repo/raw/ref/path`
 * (which GitHub answers with a redirect no page may follow); null for any other GitHub page.
 */
function rawFromGitHub(url: URL): URL | null {
  const [owner, repo, kind, ...rest] = url.pathname.split('/').filter(Boolean);
  // A ref and at least one name after it.
  if (!owner || !repo || (kind !== 'blob' && kind !== 'raw') || rest.length < 2) return null;
  return new URL(`${RAW_ORIGIN}/${[owner, repo, ...rest].join('/')}`);
}

/**
 * The address to fetch for what was typed: `https:` only, with no user name or password in it, a
 * GitHub page of a file turned into the file, and nothing but `RAW_ORIGIN` let through.
 */
export function keymapUrl(input: string): URL {
  const text = input.trim();
  if (text === '') throw new KeymapUrlError('empty', 'Enter the address of a YAML file.');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new KeymapUrlError('invalid', 'That is not a web address. It starts with https://.');
  }
  if (url.protocol !== 'https:') {
    throw new KeymapUrlError('scheme', 'Only https:// addresses are fetched.');
  }
  if (url.username || url.password) {
    throw new KeymapUrlError(
      'credentials',
      'An address with a user name or a password in it is not fetched.',
    );
  }
  if (GITHUB_HOSTS.has(url.hostname)) {
    const raw = rawFromGitHub(url);
    if (!raw) {
      throw new KeymapUrlError(
        'github-page',
        `That is a page on GitHub, not the file itself. Open the file there, press Raw and use that address. ${PASTE_INSTEAD}`,
      );
    }
    return raw;
  }
  if (url.origin !== RAW_ORIGIN) {
    throw new KeymapUrlError(
      'host',
      `Only files on ${new URL(RAW_ORIGIN).host} are fetched here: this page's security policy keeps it from reaching other hosts, and many of them do not let other sites read their files anyway. ${PASTE_INSTEAD}`,
    );
  }
  url.hash = '';
  return url;
}

function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes / (1024 * 1024)} MB`;
}

const tooLarge = (max: number) =>
  new KeymapUrlError('too-large', `That file is larger than ${size(max)}, too much for a keymap.`);

/** The body, read only up to `max` bytes: a longer one is dropped as soon as that is clear. */
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (Number(res.headers.get('content-length')) > max) throw tooLarge(max);
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > max) throw tooLarge(max);
    return bytes;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw tooLarge(max);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

const looksLikeHtml = (contentType: string, text: string) =>
  /^text\/html\b/i.test(contentType) || /^\s*<(!doctype\s+html|html)\b/i.test(text);

export interface FetchedKeymap {
  text: string;
  /** Where it was read from, without a query string, which may carry a private file's token. */
  source: string;
}

export interface FetchOptions {
  /** Stops the request, which then rejects with the signal's own abort error. */
  signal?: AbortSignal;
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
}

/**
 * The text of the file at an address, for the reader a pasted file goes to. The text is data: it is
 * decoded, checked to be text and handed on, never run or followed.
 *
 * Rejects with a `KeymapUrlError` for everything the reader can put right, and with the signal's
 * abort error when the caller stopped it.
 */
export async function fetchKeymapText(
  input: string,
  { signal, fetch: get = fetch, maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS }: FetchOptions = {},
): Promise<FetchedKeymap> {
  const url = keymapUrl(input);
  if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });

  try {
    const res = await get(url.href, {
      signal: controller.signal,
      cache: 'no-cache',
      credentials: 'omit',
    });
    if (!res.ok) {
      throw new KeymapUrlError(
        'status',
        res.status === 404
          ? 'No file at that address (404). Check the repository, the branch and the path, and that the repository is public.'
          : `The server answered ${`${res.status} ${res.statusText}`.trim()}. Check the address. ${PASTE_INSTEAD}`,
      );
    }
    const bytes = await readCapped(res, maxBytes);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new KeymapUrlError('not-text', 'That file is not text, so it is not a YAML file.');
    }
    if (looksLikeHtml(res.headers.get('content-type') ?? '', text)) {
      throw new KeymapUrlError(
        'html',
        `That address is a web page, not a YAML file. Use the file's own address. ${PASTE_INSTEAD}`,
      );
    }
    if (text.trim() === '') throw new KeymapUrlError('blank', 'That file is empty.');
    return { text, source: `${url.origin}${url.pathname}` };
  } catch (e) {
    if (e instanceof KeymapUrlError) throw e;
    if (timedOut) {
      throw new KeymapUrlError(
        'timeout',
        `The server did not send the file within ${Math.round(timeoutMs / 1000)} seconds. ${PASTE_INSTEAD}`,
      );
    }
    if (signal?.aborted) throw e;
    throw new KeymapUrlError(
      'network',
      `The browser could not fetch the file: the address may be wrong, you may be offline, or the host may not let other sites read its files (a CORS refusal, which a page cannot tell apart from the rest). ${PASTE_INSTEAD}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}
