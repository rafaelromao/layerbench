import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { LIBRARY, renderRoute } from '../test/render.js';

let counter = 0;

/** Each test gets its own database, so saved documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layoutmaster-library-${++counter}`);
}

describe('Creating layouts', () => {
  it('creates a layout from scratch and opens it in the editor', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const dialog = screen.getByRole('form', { name: 'New layout' });
    const name = within(dialog).getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'Bird nest');
    await user.selectOptions(within(dialog).getByLabelText('New layout board'), '23332+2');
    await user.click(within(dialog).getByLabelText('Add number and symbol layers'));
    await user.click(within(dialog).getByRole('button', { name: 'Create and edit' }));

    await waitFor(() => expect(currentSearch()).toContain('saved%3Abird-nest'));
    const stored = await storage.get('layouts', 'bird-nest');
    expect(stored).not.toBeNull();
    const doc = stored?.doc as { name: string; layers: unknown[] };
    expect(doc.name).toBe('Bird nest');
    expect(doc.layers).toHaveLength(3);
  });

  it('duplicates a bundled layout under a free id instead of overwriting', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByRole('button', { name: 'Duplicate Qwerty' }));
    await waitFor(async () =>
      expect((await storage.get('layouts', 'qwerty-copy'))?.doc.name).toBe('Qwerty copy'),
    );
  });
});

describe('Ranking layouts', () => {
  /** The value a card shows for one metric, read back as a number. */
  function valueOn(card: HTMLElement, metric: 'Effort' | 'SFB'): number {
    const term = within(card).getByText(metric, { selector: 'dt' });
    return Number.parseFloat(term.nextElementSibling?.textContent ?? 'NaN');
  }

  const cards = () =>
    [...document.querySelectorAll('article')].filter((a) => a.querySelector('dt')) as HTMLElement[];

  it('shows Effort and SFB on every layout, and sorts by either', async () => {
    const user = userEvent.setup();
    // A small sample keeps twenty-odd analyses quick; the ordering is what is under test.
    renderRoute('/library?corpus=en-work&sample=1000', { storage: freshStorage() });

    // Every bundled layout gets both numbers once scoring settles.
    await screen.findByText(/^Lower is better for both/, undefined, { timeout: 60_000 });
    expect(cards().length).toBeGreaterThan(10);
    for (const card of cards()) {
      expect(Number.isFinite(valueOn(card, 'Effort'))).toBe(true);
      expect(Number.isFinite(valueOn(card, 'SFB'))).toBe(true);
    }

    // Effort is the default order: best first.
    const efforts = cards().map((c) => valueOn(c, 'Effort'));
    expect(efforts).toEqual([...efforts].sort((a, b) => a - b));

    await user.click(screen.getByRole('radio', { name: 'SFB' }));
    const sfbs = cards().map((c) => valueOn(c, 'SFB'));
    expect(sfbs).toEqual([...sfbs].sort((a, b) => a - b));
  }, 90_000);
});

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

describe('Importing from keymap-drawer', () => {
  it('imports the layers chosen, under the names given, and opens the result in the editor', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByLabelText('keymap-drawer YAML'));
    await user.paste(KEYMAP);

    // The file only names its keyboard; its thirty keys are the Hummingbird preset.
    expect(await screen.findByRole('combobox', { name: 'Board to import onto' })).toHaveValue(
      '23332+2',
    );
    expect(screen.getByText(/^Onto/)).toHaveTextContent(/^Onto Split columnar 23332 \+ 2 thumbs/);
    const layers = within(screen.getByRole('list', { name: 'Layers to import' }));
    await user.click(layers.getByLabelText('Import Num'));
    const name = layers.getByLabelText('Name for Def');
    await user.clear(name);
    await user.type(name, 'Base{Enter}');
    // A key that reaches a layer left out is kept as it was drawn, not dropped.
    expect(await layers.findByText(/kept as imported: .*Num/)).toBeInTheDocument();

    const layoutName = screen.getByLabelText('Name of the imported layout');
    await user.clear(layoutName);
    await user.type(layoutName, 'Humming{Enter}');
    await user.click(screen.getByRole('button', { name: 'Import and edit' }));

    await waitFor(() => expect(currentSearch()).toContain('saved%3Ahumming'));
    const stored = (await storage.get('layouts', 'humming'))?.doc as {
      geometry: unknown;
      layers: { id: string; name: string; bindings: Record<string, unknown> }[];
      combos: { keys: string[] }[];
    };
    expect(stored.geometry).toEqual({ preset: '23332+2' });
    expect(stored.layers.map((l) => l.name)).toEqual(['Base', 'Nav']);
    expect(stored.layers[0].bindings.LTP).toEqual({ kind: 'kp', symbol: 'w' });
    expect(stored.layers[0].bindings.L1).toEqual({ kind: 'sl', layer: 'nav' });
    expect(stored.combos[0].keys).toEqual(['LTR', 'LTM']);
    // And every imported key can be selected in the editor like any other.
    expect(await screen.findByRole('button', { name: 'Key LTP: w' })).toBeInTheDocument();
  }, 60_000);

  it('says what is wrong with a file it cannot read', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await user.click(await screen.findByLabelText('keymap-drawer YAML'));
    await user.paste('layers: [a, b');
    expect(await screen.findByText(/line 1: unclosed \[/)).toBeInTheDocument();
  });
});
