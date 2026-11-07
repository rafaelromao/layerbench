import type { Layout } from '@layerbench/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeymapDrawerImport } from './KeymapDrawerImport.js';

/** A keymap-drawer file that only names its keyboard, the way `keymap parse` writes one. */
const KEYMAP = `layout:
  zmk_keyboard: hummingbird
layers:
  Def:
  - [W, F, M, P, G, K, U, O, Y, SQT]
  - [R, S, N, T, B, J, A, E, I, H]
  - [C, L, D, X, ',', .]
  - {t: Nav, h: sticky}
  - SPACE
  - {t: LSHFT, h: sticky}
  - {t: Num, h: sticky}
  Nav:
  - [F1, F2, F3, F4, F5, ESC, HOME, UARW, END, PG UP]
  - [LGUI, LALT, LSHFT, LCTRL, LC(Z), DEL, LARW, ENTER, RARW, PG DN]
  - [LC(X), LC(C), LC(V), BSPC, DARW, TAB]
  - [{type: held}, '', '', '']
  Num:
  - ['', '', '', '', '', '', '', '', '', '']
  - ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  - ['', '', '', '', '', '']
  - ['', '', '', {type: held}]
combos:
  - {p: [1, 2], k: V, l: [Def]}
`;

const RAW = 'https://raw.githubusercontent.com/someone/zmk-config/main/keymap-drawer/board.yaml';
const PAGE = 'https://github.com/someone/zmk-config/blob/main/keymap-drawer/board.yaml';

afterEach(() => vi.unstubAllGlobals());

/** Answers every fetch with `reply`; the stub is what a test then asks about. */
function serving(reply: () => Response | Promise<Response>) {
  const stub = vi.fn<typeof fetch>(async () => reply());
  vi.stubGlobal('fetch', stub);
  return stub;
}

const plain = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/plain' }, ...init });

/** One request, held out until the test settles it. */
interface Held {
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (reason: unknown) => void;
}

/**
 * A fetch that keeps every request out, and lists them. With `abortRejects`, as a browser's does, a
 * request whose signal aborts rejects with `AbortError` at once; without, it is left to the test,
 * as one that is slow to unwind is.
 */
function holding(abortRejects: boolean): Held[] {
  const held: Held[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          if (abortRejects) {
            signal.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }
          held.push({ signal, resolve, reject });
        }),
    ),
  );
  return held;
}

/** Let what is settled run: the promises, then a turn of the event loop. */
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 0)));

const yamlBox = () => screen.getByLabelText<HTMLTextAreaElement>('keymap-drawer YAML');
const addressBox = () => screen.getByLabelText('Address of the file on GitHub');
const fetchButton = () => screen.getByRole('button', { name: /^Fetch/ });

/** Type an address and press Fetch. */
async function fetchFrom(user: ReturnType<typeof userEvent.setup>, address: string) {
  await user.click(addressBox());
  await user.paste(address);
  await user.click(fetchButton());
}

describe('Importing a keymap-drawer file by its address', () => {
  it('reads the file at an address as the same file pasted, and fetches the raw file of a GitHub page', async () => {
    const user = userEvent.setup();
    const pasted = vi.fn<(layout: Layout) => void>();
    const first = render(<KeymapDrawerImport onImport={pasted} />);
    await user.click(yamlBox());
    await user.paste(KEYMAP);
    await user.click(await screen.findByRole('button', { name: 'Import and edit' }));
    first.unmount();

    const get = serving(() => plain(KEYMAP));
    const fetched = vi.fn<(layout: Layout) => void>();
    render(<KeymapDrawerImport onImport={fetched} />);
    await fetchFrom(user, PAGE);

    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0][0]).toBe(RAW);
    await waitFor(() => expect(yamlBox().value).toBe(KEYMAP));
    expect(await screen.findByRole('combobox', { name: 'Board to import onto' })).toHaveValue(
      '23332+2',
    );
    await user.click(await screen.findByRole('button', { name: 'Import and edit' }));

    expect(fetched).toHaveBeenCalledOnce();
    expect(pasted).toHaveBeenCalledOnce();
    expect(fetched.mock.calls[0][0]).toEqual(pasted.mock.calls[0][0]);
  }, 60_000);

  it('fetches nothing until Fetch is pressed, and there is nothing to press with no address', async () => {
    const user = userEvent.setup();
    const get = serving(() => plain(KEYMAP));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    expect(fetchButton()).toBeDisabled();
    await user.click(addressBox());
    await user.paste(RAW);
    expect(fetchButton()).toBeEnabled();
    expect(get).not.toHaveBeenCalled();
    await user.clear(addressBox());
    expect(fetchButton()).toBeDisabled();
  });

  it('submits on Enter, shows that it is fetching, and says where the text came from', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    const get = serving(() => new Promise<Response>((resolve) => (release = resolve)));
    render(<KeymapDrawerImport onImport={vi.fn()} />);

    await user.click(addressBox());
    await user.paste(`${RAW}?token=abc`);
    await user.keyboard('{Enter}');

    expect(get).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Fetching the file…');
    expect(fetchButton()).toHaveTextContent('Fetching…');
    // Not `disabled`, which would drop the keyboard's place; pressing it again asks for nothing.
    expect(fetchButton()).toHaveAttribute('aria-disabled', 'true');
    await user.click(fetchButton());
    expect(get).toHaveBeenCalledOnce();
    // The text is not there yet, nor anything said about it.
    expect(yamlBox().value).toBe('');
    expect(screen.queryByText(/^Read from/)).toBeNull();

    release(plain(KEYMAP));
    await waitFor(() => expect(yamlBox().value).toBe(KEYMAP));
    // The region stays, empty, for the next announcement.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(fetchButton()).toHaveTextContent('Fetch');
    expect(fetchButton()).toBeEnabled();
    expect(fetchButton()).not.toHaveAttribute('aria-disabled');
    // Where it was read from, without the query: a private file's address carries its token there.
    const read = screen.getByText(/^Read from/);
    expect(read).toHaveTextContent(`Read from ${RAW}.`);
    expect(read).not.toHaveTextContent('token');
  });

  it('forgets where the text came from once the text is edited', async () => {
    const user = userEvent.setup();
    serving(() => plain(KEYMAP));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    await screen.findByText(/^Read from/);
    await user.type(yamlBox(), '#');
    expect(screen.queryByText(/^Read from/)).toBeNull();
  });

  it.each([
    [
      'a missing file',
      RAW,
      () => plain('404: Not Found', { status: 404 }),
      /^No file at that address \(404\)\./,
    ],
    [
      'a server error',
      RAW,
      () => plain('', { status: 503, statusText: 'Service Unavailable' }),
      /^The server answered 503 Service Unavailable, which is its own trouble/,
    ],
    [
      'a refusal by the network, CORS among its causes',
      RAW,
      () => Promise.reject(new TypeError('Failed to fetch')),
      /CORS.*Paste the file's text instead\.$/,
    ],
    [
      'a file over the size cap',
      RAW,
      () => plain('layers: {}', { headers: { 'content-length': '2000000' } }),
      /^That file is larger than 1 MB/,
    ],
    [
      'a web page',
      RAW,
      () => plain('<html></html>', { headers: { 'content-type': 'text/html' } }),
      /web page, not a YAML file/,
    ],
    ['an empty file', RAW, () => plain(''), /^That file is empty\./],
  ])(
    'says so on %s, leaves the text empty and lets the reader try again',
    async (_case, address, reply, said) => {
      const user = userEvent.setup();
      serving(reply);
      render(<KeymapDrawerImport onImport={vi.fn()} />);
      await fetchFrom(user, address);

      const error = await screen.findByText(said);
      // Shown the way the dialog shows every other import error, and announced.
      expect(error).toHaveClass('text-error', 'text-xs');
      expect(error).toHaveAttribute('role', 'alert');
      expect(addressBox()).toHaveAttribute('aria-invalid', 'true');
      expect(addressBox()).toHaveAccessibleDescription(
        expect.stringContaining(error.textContent ?? ''),
      );
      expect(yamlBox().value).toBe('');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(fetchButton()).toBeEnabled();
      expect(screen.queryByText(/^Read from/)).toBeNull();
    },
  );

  it.each([
    ['not https', 'http://raw.githubusercontent.com/a/b/c/d.yaml', /^Only https:\/\/ addresses/],
    [
      'another host',
      'https://example.com/board.yaml',
      /^Only files on raw\.githubusercontent\.com/,
    ],
    [
      'a GitHub page that is not a file',
      'https://github.com/someone/zmk-config',
      /not the file itself/,
    ],
    ['not an address', 'board.yaml', /^That is not a web address/],
  ])('refuses %s without asking', async (_case, address, said) => {
    const user = userEvent.setup();
    const get = serving(() => plain(KEYMAP));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, address);

    expect(await screen.findByText(said)).toHaveClass('text-error', 'text-xs');
    expect(get).not.toHaveBeenCalled();
    expect(fetchButton()).toBeEnabled();
  });

  it('reads what it fetched as a pasted file is read, and says what is wrong with a file that is not YAML', async () => {
    const user = userEvent.setup();
    serving(() => plain('layers: [a, b'));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    // The reader's own message, as for the same text pasted; the fetch itself went well.
    expect(await screen.findByText(/line 1: unclosed \[/)).toHaveClass('text-error');
    expect(yamlBox().value).toBe('layers: [a, b');
    expect(screen.queryByText(/^No file|^The server|CORS/)).toBeNull();
  });

  it('keeps the file that was there when a fetch fails', async () => {
    const user = userEvent.setup();
    serving(() => plain('', { status: 500, statusText: 'Internal Server Error' }));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await user.click(yamlBox());
    await user.paste(KEYMAP);
    await screen.findByRole('combobox', { name: 'Board to import onto' });

    await fetchFrom(user, RAW);
    expect(await screen.findByText(/^The server answered 500/)).toBeInTheDocument();
    expect(yamlBox().value).toBe(KEYMAP);
    expect(screen.getByRole('combobox', { name: 'Board to import onto' })).toBeInTheDocument();
  }, 60_000);

  it('replaces the file that was there when a fetch succeeds, and clears an earlier failure', async () => {
    const user = userEvent.setup();
    let reply: () => Response = () => plain('', { status: 404 });
    serving(async () => reply());
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    await screen.findByText(/^No file at that address/);

    reply = () => plain(KEYMAP);
    await user.click(fetchButton());
    await waitFor(() => expect(yamlBox().value).toBe(KEYMAP));
    expect(screen.queryByText(/^No file at that address/)).toBeNull();
  });

  it('stops a request still out when the Library is left', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | null | undefined;
    const get = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', get);
    const { unmount } = render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    expect(get).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('lets what the reader pastes or chooses win over a request still out', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    let signal: AbortSignal | null | undefined;
    // A fetch that ignores the abort, as one whose answer was already on its way would.
    const get = vi.fn<typeof fetch>((_url, init) => {
      signal = init?.signal;
      return new Promise<Response>((resolve) => (release = resolve));
    });
    vi.stubGlobal('fetch', get);
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    expect(screen.getByRole('status')).toHaveTextContent('Fetching the file…');

    await user.click(yamlBox());
    await user.paste('layers: [a, b');
    // Pasting stops the request, and the box says so: nothing is fetching.
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(fetchButton()).toBeEnabled();

    release(plain(KEYMAP));
    await screen.findByText(/line 1: unclosed \[/);
    // The answer came and was dropped: the paste is still what is there, with nothing said of it.
    expect(yamlBox().value).toBe('layers: [a, b');
    expect(screen.queryByText(/^Read from/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears an earlier failure when the reader gives the text another way', async () => {
    const user = userEvent.setup();
    serving(() => plain('', { status: 404 }));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    await screen.findByRole('alert');

    await user.click(yamlBox());
    await user.paste(KEYMAP);
    expect(screen.queryByText(/^No file at that address/)).toBeNull();
    expect(addressBox()).not.toHaveAttribute('aria-invalid');
  }, 60_000);

  it('describes the field by its hint, and by the failure when there is one', async () => {
    const user = userEvent.setup();
    serving(() => plain('', { status: 404 }));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    expect(addressBox()).toHaveAccessibleDescription(/^Or the address of the file on GitHub/);
    expect(addressBox()).not.toHaveAttribute('aria-invalid');
    await fetchFrom(user, RAW);
    await screen.findByRole('alert');
    expect(addressBox()).toHaveAccessibleDescription(
      /^Or the address of the file on GitHub.*No file at that address/,
    );
  });

  it('says nothing of a request that the reader stopped by pasting, when the browser rejects it', async () => {
    const user = userEvent.setup();
    const held = holding(true);
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    await user.click(yamlBox());
    await user.paste('layers: [a, b');
    await settle();

    // The request was rejected with AbortError; that is not a failure to report.
    expect(held[0].signal.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(addressBox()).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(fetchButton()).toBeEnabled();
    expect(fetchButton()).not.toHaveAttribute('aria-disabled');
    expect(yamlBox().value).toBe('layers: [a, b');
  });

  it('leaves a newer request alone when an older one it stopped settles late', async () => {
    const user = userEvent.setup();
    const held = holding(false);
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    await user.click(yamlBox());
    await user.paste('layers: [a, b');
    // The first request is stopped but has not unwound; the reader asks again.
    expect(held[0].signal.aborted).toBe(true);
    await user.click(fetchButton());
    expect(held).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Fetching the file…');

    held[0].reject(new DOMException('The operation was aborted.', 'AbortError'));
    await settle();
    // Its settling changes nothing: the second request is still out, and still stoppable.
    expect(screen.getByRole('status')).toHaveTextContent('Fetching the file…');
    expect(fetchButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(yamlBox());
    await user.paste('x: 1');
    expect(held[1].signal.aborted).toBe(true);
  });

  it('lets a slow fetch be cancelled, says nothing of it and gives the field back', async () => {
    const user = userEvent.setup();
    const held = holding(true);
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await fetchFrom(user, RAW);
    expect(screen.getByRole('status')).toHaveTextContent('Fetching the file…');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(held[0].signal.aborted).toBe(true);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(fetchButton()).toBeEnabled();
    // The button the keyboard was on is gone; the field takes it.
    expect(addressBox()).toHaveFocus();
    expect(yamlBox().value).toBe('');
    // And the reader may ask again.
    await user.click(fetchButton());
    expect(held).toHaveLength(2);
  });

  it('forgets a failure when the address it was for is edited', async () => {
    const user = userEvent.setup();
    serving(() => plain('', { status: 404 }));
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    await fetchFrom(user, RAW);
    await screen.findByRole('alert');

    await user.type(addressBox(), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(addressBox()).not.toHaveAttribute('aria-invalid');
    expect(addressBox()).toHaveAccessibleDescription(/^Or the address of the file on GitHub/);
  });

  it('does not share the name of the box for the file, which a substring query would find twice', () => {
    // Playwright's getByLabel matches a substring, as this regular expression does: the phone
    // e2e fills the box by 'keymap-drawer YAML' and must find that one element.
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    expect(screen.getAllByLabelText(/keymap-drawer YAML/i)).toEqual([yamlBox()]);
  });

  it('asks the phone not to correct or capitalise an address', () => {
    render(<KeymapDrawerImport onImport={vi.fn()} />);
    expect(addressBox()).toHaveAttribute('spellcheck', 'false');
    expect(addressBox()).toHaveAttribute('autocapitalize', 'none');
    expect(addressBox()).toHaveAttribute('autocomplete', 'off');
    expect(addressBox()).toHaveAttribute('inputmode', 'url');
  });
});
