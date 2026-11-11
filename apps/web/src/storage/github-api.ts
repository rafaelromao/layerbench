export const API = 'https://api.github.com';

/**
 * How long a request to GitHub has to answer. One that never did would leave a save, or the
 * sending of everything saved offline, waiting for ever.
 */
const REQUEST_MS = 30_000;

/**
 * How a request to GitHub gets its credentials. The token comes from the sign-in session, which
 * renews it before it expires; a 401 still tells the session which token GitHub turned down, so it
 * can have that one renewed, or find out the session is over.
 */
export interface GitHubAccess {
  token: () => Promise<string>;
  onUnauthorized?: (rejected: string) => void;
}

/**
 * A signal that aborts after `ms`, where `AbortSignal.timeout` is missing (Safari before 16) made
 * by hand, so that no browser is left with a request that can wait for ever.
 */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined') return undefined;
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
  return controller.signal;
}

/**
 * A request to the GitHub API. The token goes in the authorization header and nowhere else: never
 * in a URL, a body or an error message.
 */
export async function gitHubFetch(
  access: GitHubAccess,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  const token = await access.token();
  const res = await fetch(url, {
    method: init.method,
    body: init.body,
    signal: timeoutSignal(REQUEST_MS),
    // Asked again each time: GitHub lets a browser keep an answer for a minute, which would show a
    // version another browser has since replaced.
    cache: 'no-cache',
    headers: {
      // The browser sets its own user agent; GitHub accepts that.
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  }).catch((e: unknown) => {
    // A write that was cut off may still have landed: trying again finds the document there, as the
    // same (a gist's first write is looked for again, `GistAdapter.write`).
    throw e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
      ? new Error('GitHub did not answer in time')
      : e;
  });
  if (res.status === 401) access.onUnauthorized?.(token);
  return res;
}
