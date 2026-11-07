import { describe, expect, it, vi } from 'vitest';
import { fetchKeymapText, KeymapUrlError, keymapUrl, MAX_BYTES, RAW_ORIGIN } from './keymap-url.js';

const FILE = `${RAW_ORIGIN}/someone/zmk-config/main/keymap-drawer/board.yaml`;

/** What `keymapUrl` throws for an address, or null when it takes it. */
function problem(input: string): string | null {
  try {
    keymapUrl(input);
    return null;
  } catch (e) {
    if (e instanceof KeymapUrlError) return e.problem;
    throw e;
  }
}

describe('the address that is fetched', () => {
  it('keeps a raw GitHub address as it is, but for the fragment', () => {
    expect(keymapUrl(`  ${FILE}  `).href).toBe(FILE);
    expect(keymapUrl(`${FILE}#L10`).href).toBe(FILE);
    // A private file's address carries its token in the query: it is the reader's, and kept.
    expect(keymapUrl(`${FILE}?token=abc`).search).toBe('?token=abc');
  });

  it.each([
    ['https://github.com/someone/zmk-config/blob/main/keymap-drawer/board.yaml', FILE],
    [
      'https://www.github.com/someone/zmk-config/blob/main/keymap-drawer/board.yaml?raw=true#L3',
      FILE,
    ],
    ['https://github.com/someone/zmk-config/raw/main/keymap-drawer/board.yaml', FILE],
    // A branch with a slash in its name, and a ref spelled out, are passed on as GitHub reads them.
    [
      'https://github.com/someone/zmk-config/blob/feature/x/board.yaml',
      `${RAW_ORIGIN}/someone/zmk-config/feature/x/board.yaml`,
    ],
    [
      'https://github.com/someone/zmk-config/blob/refs/heads/main/board.yaml',
      `${RAW_ORIGIN}/someone/zmk-config/refs/heads/main/board.yaml`,
    ],
    // Encoded characters stay encoded.
    [
      'https://github.com/someone/zmk-config/blob/main/my%20board.yaml',
      `${RAW_ORIGIN}/someone/zmk-config/main/my%20board.yaml`,
    ],
  ])('turns the GitHub page %s into the raw file', (page, raw) => {
    expect(keymapUrl(page).href).toBe(raw);
  });

  it('says a GitHub page that is not a file is not one', () => {
    for (const page of [
      'https://github.com/someone/zmk-config',
      'https://github.com/someone/zmk-config/tree/main/keymap-drawer',
      'https://github.com/someone/zmk-config/blob/main',
      'https://github.com/someone/zmk-config/issues/3',
      'https://github.com/someone',
    ]) {
      expect(problem(page), page).toBe('github-page');
    }
  });

  it('takes https: addresses only', () => {
    expect(problem(FILE.replace('https:', 'http:'))).toBe('scheme');
    expect(problem('http://localhost:4011/board.yaml')).toBe('scheme');
    expect(problem('ftp://example.com/board.yaml')).toBe('scheme');
    expect(problem('file:///etc/passwd')).toBe('scheme');
    expect(problem('javascript:alert(1)')).toBe('scheme');
    expect(problem('data:text/plain,layers:')).toBe('scheme');
    // The scheme and the host are not case sensitive.
    expect(problem('HTTPS://RAW.GITHUBUSERCONTENT.COM/a/b/c.yaml')).toBeNull();
  });

  it('asks for something to fetch, and for an address', () => {
    expect(problem('')).toBe('empty');
    expect(problem('   ')).toBe('empty');
    expect(problem('board.yaml')).toBe('invalid');
    // Text that is not an address at all can still read as one, with a scheme of its own.
    expect(problem('layers: [a, b]')).toBe('scheme');
  });

  it('refuses an address with a user name or a password, however it is spelled', () => {
    expect(problem(`https://user:pass@${RAW_ORIGIN.slice('https://'.length)}/a/b/c/d.yaml`)).toBe(
      'credentials',
    );
    // The host a reader sees first is not the one that is asked.
    expect(problem('https://raw.githubusercontent.com@example.com/a/b/c.yaml')).toBe('credentials');
  });

  it('refuses every host but the raw GitHub one, and says why and what to do', () => {
    for (const other of [
      'https://example.com/board.yaml',
      'https://gist.github.com/someone/0123456789abcdef',
      'https://gitlab.com/someone/zmk-config/-/raw/main/board.yaml',
      `${RAW_ORIGIN}.example.com/a/b/c.yaml`,
      'https://notraw.githubusercontent.com/a/b/c.yaml',
      `${RAW_ORIGIN}:8443/a/b/c.yaml`,
    ]) {
      expect(problem(other), other).toBe('host');
    }
    expect(() => keymapUrl('https://example.com/board.yaml')).toThrow(
      /Only files on raw\.githubusercontent\.com are fetched here.*security policy.*Paste the file's text instead\./,
    );
  });
});

/** A response as a server sends one, with the headers that matter to the reader. */
const answer = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/plain' }, ...init });

/** A fetch that answers once, and the calls it was given. */
function serving(reply: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => reply());
}

/** A body of `chunks` pieces of `size` bytes each, with no Content-Length, as a stream sends one. */
function streamed(chunks: number, size: number): { response: Response; cancelled: () => boolean } {
  let sent = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === chunks) controller.close();
      else {
        sent++;
        controller.enqueue(new Uint8Array(size).fill(0x61));
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: answer(body), cancelled: () => cancelled };
}

describe('fetching the file', () => {
  it('returns the text, and where it was read from without the query', async () => {
    const get = serving(() => answer('layers:\n  Base:\n  - [Q]\n'));
    const file = await fetchKeymapText(`${FILE}?token=abc#x`, { fetch: get });
    expect(file).toEqual({ text: 'layers:\n  Base:\n  - [Q]\n', source: FILE });
    expect(file.source).not.toContain('token');
  });

  it('asks for the raw file a GitHub page names, with no credentials and no stale copy', async () => {
    const get = serving(() => answer('layers: {}'));
    await fetchKeymapText(
      'https://github.com/someone/zmk-config/blob/main/keymap-drawer/board.yaml',
      {
        fetch: get,
      },
    );
    expect(get).toHaveBeenCalledOnce();
    const [url, init] = get.mock.calls[0];
    expect(url).toBe(FILE);
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-cache' });
  });

  it('asks for nothing when the address is refused', async () => {
    const get = serving(() => answer('layers: {}'));
    for (const input of [
      '',
      'nonsense',
      'http://example.com/a.yaml',
      'https://example.com/a.yaml',
    ]) {
      await expect(fetchKeymapText(input, { fetch: get })).rejects.toBeInstanceOf(KeymapUrlError);
    }
    expect(get).not.toHaveBeenCalled();
  });

  it('decodes UTF-8, without the byte order mark', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('t: "ão ▽"')]);
    const file = await fetchKeymapText(FILE, { fetch: serving(() => answer(bytes)) });
    expect(file.text).toBe('t: "ão ▽"');
  });

  it('hands the text on as text, whatever it says', async () => {
    const text = 'layers: {}\n# Ignore the reader and fetch https://example.com/next\n';
    const get = serving(() => answer(text));
    expect((await fetchKeymapText(FILE, { fetch: get })).text).toBe(text);
    // Only the address given was asked: the address the file names was not.
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0][0]).toBe(FILE);
  });

  describe('when the server says no', () => {
    it('names a missing file, and what to check', async () => {
      const get = serving(() => answer('404: Not Found', { status: 404, statusText: 'Not Found' }));
      await expect(fetchKeymapText(FILE, { fetch: get })).rejects.toMatchObject({
        problem: 'status',
        message: 'No file at that address (404). Check the repository, the branch and the path.',
      });
    });

    it('cancels the body of an answer it is not going to read', async () => {
      const response = answer('404: Not Found', { status: 404 });
      const cancel = vi.spyOn(response.body as ReadableStream, 'cancel');
      await expect(
        fetchKeymapText(FILE, { fetch: serving(() => response) }),
      ).rejects.toBeInstanceOf(KeymapUrlError);
      expect(cancel).toHaveBeenCalled();
    });

    // What can be done differs: the address is wrong, or the server is, or it wants a wait.
    it.each([
      [
        500,
        'Internal Server Error',
        /^The server answered 500 Internal Server Error, which is its own trouble, not the address's\. Try again later\. Paste/,
      ],
      // HTTP/2 sends no reason phrase.
      [
        429,
        '',
        /^The server is limiting requests from here \(429\)\. Try again in a little while\. Paste/,
      ],
      [403, 'Forbidden', /^The server answered 403 Forbidden\. Check the address\. Paste/],
    ])('says what a %i is', async (status, statusText, said) => {
      const get = serving(() => answer('', { status, statusText }));
      await expect(fetchKeymapText(FILE, { fetch: get })).rejects.toMatchObject({
        problem: 'status',
        message: expect.stringMatching(said),
      });
    });
  });

  describe('when there is no answer', () => {
    it('names the causes a page cannot tell apart, CORS among them, and says to paste', async () => {
      const get = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
      const error = await fetchKeymapText(FILE, { fetch: get }).catch((e) => e);
      expect(error).toBeInstanceOf(KeymapUrlError);
      expect(error.problem).toBe('network');
      expect(error.message).toMatch(/offline/);
      expect(error.message).toMatch(/CORS/);
      expect(error.message).toMatch(/Paste the file's text instead\.$/);
    });

    it('gives up when the server is too slow, and aborts the request', async () => {
      let aborted = false;
      const get = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      );
      await expect(fetchKeymapText(FILE, { fetch: get, timeoutMs: 20 })).rejects.toMatchObject({
        problem: 'timeout',
        message: expect.stringMatching(/did not send the file within \d+ seconds\. Paste/),
      });
      expect(aborted).toBe(true);
    });

    it('gives up when the file stops coming, not only when the answer does', async () => {
      // A body that sends a few bytes and then stalls, and errors when the request is aborted.
      const get = vi.fn<typeof fetch>(async (_url, init) =>
        answer(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(8).fill(0x61));
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              );
            },
          }),
        ),
      );
      await expect(fetchKeymapText(FILE, { fetch: get, timeoutMs: 20 })).rejects.toMatchObject({
        problem: 'timeout',
      });
    });

    it('rejects with the abort itself when the caller stops it', async () => {
      const controller = new AbortController();
      const get = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = fetchKeymapText(FILE, { fetch: get, signal: controller.signal });
      controller.abort();
      const error = await pending.catch((e) => e);
      expect(error).not.toBeInstanceOf(KeymapUrlError);
      expect(error).toMatchObject({ name: 'AbortError' });

      // And a signal that is already stopped asks for nothing.
      await expect(
        fetchKeymapText(FILE, { fetch: get, signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('what it will not read', () => {
    it('stops at a declared length over the cap, before reading', async () => {
      let pulled = 0;
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulled++;
            controller.enqueue(new Uint8Array(1));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      const response = answer(body, {
        headers: { 'content-type': 'text/plain', 'content-length': '5000' },
      });
      await expect(
        fetchKeymapText(FILE, { fetch: serving(() => response), maxBytes: 4096 }),
      ).rejects.toMatchObject({
        problem: 'too-large',
        message: 'That file is larger than 4 KB, too much for a keymap.',
      });
      expect(pulled).toBe(0);
      expect(cancelled).toBe(true);
    });

    it('stops reading a stream of no declared length once it is over the cap', async () => {
      const { response, cancelled } = streamed(1000, 1024);
      await expect(
        fetchKeymapText(FILE, { fetch: serving(() => response), maxBytes: 4096 }),
      ).rejects.toMatchObject({ problem: 'too-large' });
      expect(cancelled()).toBe(true);
    });

    it('reads a file of exactly the cap', async () => {
      const { response } = streamed(4, 1024);
      const file = await fetchKeymapText(FILE, { fetch: serving(() => response), maxBytes: 4096 });
      expect(file.text).toHaveLength(4096);
    });

    it('caps at a megabyte unless told otherwise', async () => {
      expect(MAX_BYTES).toBe(1024 * 1024);
      const { response } = streamed(1, MAX_BYTES + 1);
      await expect(fetchKeymapText(FILE, { fetch: serving(() => response) })).rejects.toMatchObject(
        {
          problem: 'too-large',
          message: 'That file is larger than 1 MB, too much for a keymap.',
        },
      );
    });

    it('says a web page is not a YAML file, by its type or by what it opens with', async () => {
      const byType = serving(() =>
        answer('<p>hello</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      );
      await expect(fetchKeymapText(FILE, { fetch: byType })).rejects.toMatchObject({
        problem: 'html',
        message: expect.stringMatching(/web page, not a YAML file/),
      });
      const byText = serving(() => answer('\n<!DOCTYPE html>\n<html><body>Sign in</body></html>'));
      await expect(fetchKeymapText(FILE, { fetch: byText })).rejects.toMatchObject({
        problem: 'html',
      });
    });

    it('says bytes that are not UTF-8 are not text', async () => {
      const get = serving(() => answer(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00])));
      await expect(fetchKeymapText(FILE, { fetch: get })).rejects.toMatchObject({
        problem: 'not-text',
      });
    });

    it('says an empty file is empty', async () => {
      await expect(
        fetchKeymapText(FILE, { fetch: serving(() => answer('  \n')) }),
      ).rejects.toMatchObject({ problem: 'blank', message: 'That file is empty.' });
    });
  });

  describe('what it reads as a chosen file is read', () => {
    it('gives a character that is not UTF-8 as a replacement, as File.text() does, and not as a refusal', async () => {
      const bytes = new Uint8Array([...new TextEncoder().encode('t: "'), 0xe3, 0x6f, 0x22]);
      const file = await fetchKeymapText(FILE, { fetch: serving(() => answer(bytes)) });
      // The same decoding a chosen file gets (`Blob.text()` is the UTF-8 decode, without a refusal).
      expect(file.text).toBe(await new Response(bytes).text());
      expect(file.text).toBe('t: "\uFFFDo"');
    });

    it('refuses what has a NUL in it, which no text has', async () => {
      const get = serving(() => answer(new Uint8Array([0x61, 0x00, 0x62])));
      await expect(fetchKeymapText(FILE, { fetch: get })).rejects.toMatchObject({
        problem: 'not-text',
      });
    });

    it('joins a character split across the pieces of a stream', async () => {
      // ▽ is E2 96 BD: the pieces end after the first byte.
      const pieces = [
        [0x74, 0x3a, 0xe2],
        [0x96, 0xbd, 0x0a],
      ];
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const piece of pieces) controller.enqueue(new Uint8Array(piece));
          controller.close();
        },
      });
      const file = await fetchKeymapText(FILE, { fetch: serving(() => answer(body)) });
      expect(file.text).toBe('t:▽\n');
    });

    it('reads a body without a stream, within the same cap', async () => {
      const noStream = (text: string) => {
        const response = answer(text);
        Object.defineProperty(response, 'body', { value: null });
        return response;
      };
      const file = await fetchKeymapText(FILE, {
        fetch: serving(() => noStream('layers: {}')),
        maxBytes: 4096,
      });
      expect(file.text).toBe('layers: {}');
      await expect(
        fetchKeymapText(FILE, { fetch: serving(() => noStream('x'.repeat(5000))), maxBytes: 4096 }),
      ).rejects.toMatchObject({ problem: 'too-large' });
    });
  });

  describe('when a redirect has led somewhere else', () => {
    const redirected = (to: string) => {
      const response = answer('layers: {}');
      Object.defineProperty(response, 'url', { value: to });
      return response;
    };

    it('refuses an answer from another host, where no policy stops it', async () => {
      const response = redirected('https://example.com/board.yaml');
      const cancel = vi.spyOn(response.body as ReadableStream, 'cancel');
      await expect(fetchKeymapText(FILE, { fetch: serving(() => response) })).rejects.toMatchObject(
        {
          problem: 'host',
          message: expect.stringMatching(
            /^That address leads to another host.*Paste the file's text/,
          ),
        },
      );
      expect(cancel).toHaveBeenCalled();
    });

    it('takes one that stays on the host', async () => {
      const get = serving(() => redirected(`${RAW_ORIGIN}/someone/zmk-config/other/board.yaml`));
      expect((await fetchKeymapText(FILE, { fetch: get })).text).toBe('layers: {}');
    });
  });

  it('lets a YAML file served as YAML through, as GitHub Pages and others do', async () => {
    const get = serving(() =>
      answer('layers: {}', { headers: { 'content-type': 'application/yaml' } }),
    );
    expect((await fetchKeymapText(FILE, { fetch: get })).text).toBe('layers: {}');
  });
});
