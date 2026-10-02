import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundledLayout, type Layout, toCanonicalJson } from '@layoutmaster/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisClient, AnalyzeRequest } from '../engine/protocol.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { renderRoute, testClient } from '../test/render.js';
import { setPointerKind } from '../test/setup.js';

let counter = 0;
const freshStorage = () => new IndexedDbAdapter(`layoutmaster-edit-${++counter}`);

/** Drag one key onto another, the way a pointer does it. */
async function dragKey(
  from: string,
  to: string,
  options: { altKey?: boolean; onto?: Element } = {},
): Promise<void> {
  const svg = document.getElementById('kb-edit') as unknown as SVGSVGElement;
  const source = svg.querySelector(`g[data-key="${from}"]`) as Element;
  const target = options.onto ?? (svg.querySelector(`g[data-key="${to}"]`) as Element);
  const { altKey = false } = options;

  // jsdom has no layout, so hit testing has to be told what is under the pointer.
  const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => target);

  svg.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }) as Event &
      PointerEvent,
  );
  source.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }) as Event &
      PointerEvent,
  );
  svg.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 20, clientY: 20, altKey }) as Event &
      PointerEvent,
  );
  svg.dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, clientX: 20, clientY: 20, altKey }) as Event &
      PointerEvent,
  );
  elementFromPoint.mockRestore();
}

/** Open the edit view on Qwerty and wait for its first analysis. */
async function openEdit(): Promise<void> {
  renderRoute('/edit?layout=qwerty&corpus=en-conv&sample=20000', { storage: freshStorage() });
  await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
}

const key = (name: string) => screen.getByRole('button', { name });

/** The bar above the board: the layout's name, author and description, Save, corpus and rules. */
const bar = () => screen.getByRole('region', { name: 'Layout' });

/** The engine, keeping every analysis it is asked for. */
function recording(): { client: AnalysisClient; requests: AnalyzeRequest[] } {
  const real = testClient();
  const requests: AnalyzeRequest[] = [];
  const client = new Proxy(real, {
    get(target, prop) {
      if (prop === 'analyze') {
        return (...args: Parameters<AnalysisClient['analyze']>) => {
          requests.push(args[0]);
          return target.analyze(...args);
        };
      }
      const member = Reflect.get(target, prop);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  return { client, requests };
}

/** A saved copy of a bundled layout, under its own id and name. */
async function seed(storage: IndexedDbAdapter, from: string, id: string, extra: Partial<Layout>) {
  const layout = bundledLayout(from) as Layout;
  await storage.put('layouts', id, toCanonicalJson({ ...layout, id, ...extra }), {
    message: 'seed',
  });
}

/** The inspector for one key, which is where every edit to it is made. */
const inspector = (keyId: string) => screen.findByRole('group', { name: `Edit ${keyId}` });

async function openMagicRomak(): Promise<void> {
  renderRoute('/edit?layout=magic-romak&corpus=pt-br-conv&sample=20000', {
    storage: freshStorage(),
  });
  await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
}

describe('Edit', () => {
  it('swaps two keys by dragging, estimates while the analysis runs, then settles on it', async () => {
    // Re-scoring an existing run is milliseconds; simulating the edited layout is not. Slowing the
    // analysis down makes that gap observable, which is exactly the gap the estimate fills.
    const client = testClient();
    const analyze = client.analyze.bind(client);
    let release: (() => void) | null = null;
    vi.spyOn(client, 'analyze').mockImplementation(async (request, opts) => {
      const report = await analyze(request, opts);
      if (release)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return report;
    });

    renderRoute('/edit?layout=qwerty&corpus=en-conv&sample=20000', {
      client,
      storage: freshStorage(),
    });

    // The summary only appears once an analysis has completed, and that report is what the
    // estimate is derived from.
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    // From here on, the next analysis parks until released.
    release = () => {};
    await dragKey('LTP', 'LTR');

    expect(await screen.findByText('unsaved')).toBeInTheDocument();
    expect(await screen.findByText(/estimate after swap/)).toBeInTheDocument();

    // Letting the real analysis finish replaces the estimate.
    release = null;
    vi.mocked(client.analyze).mockImplementation(analyze);
    await dragKey('LTR', 'LTM');
    await waitFor(() => expect(screen.queryByText(/estimate after swap/)).toBeNull(), {
      timeout: 25_000,
    });
  });

  it('saves from beside the unsaved badge, under the name in the bar', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute('/edit?layout=qwerty&corpus=en-conv&sample=20000', {
      storage,
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
    // Saving is no longer a panel to go looking for.
    expect(screen.queryByRole('tab', { name: 'Save' })).toBeNull();

    const name = within(bar()).getByLabelText('Name');
    await user.clear(name);
    // Not committed with Enter: leaving the field for Save commits it on the way.
    await user.type(name, 'Qwerty swapped');
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved Qwerty swapped')).toBeInTheDocument();
    expect((await storage.get('layouts', 'qwerty-swapped'))?.doc.name).toBe('Qwerty swapped');
    await waitFor(() => expect(currentSearch()).toContain('saved%3Aqwerty-swapped'));
  });

  it('opens the saved copy after a first save, edits included, and saves it again in place', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/edit?layout=qwerty&corpus=en-conv&sample=20000', { storage });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: 'Key LHM: ç' });
    const name = within(bar()).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Qwerty plus{Enter}');
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved Qwerty plus')).toBeInTheDocument();

    // The editor opens afresh, with no history, on the copy it saved: not on the bundled Qwerty
    // that was still loaded when the link moved to the copy.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled(), {
      timeout: 25_000,
    });
    expect(key('Key LHM: ç')).toBeInTheDocument();
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty plus');

    key('Key LHI: f').focus();
    await user.keyboard('ã{Enter}');
    await screen.findByRole('button', { name: 'Key LHI: ã' });
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const doc = (await storage.get('layouts', 'qwerty-plus'))?.doc as unknown as Layout;
      expect(doc.layers[0].bindings.LHI).toEqual({ kind: 'kp', symbol: 'ã' });
    });
    const doc = (await storage.get('layouts', 'qwerty-plus'))?.doc as unknown as Layout;
    expect(doc.layers[0].bindings.LHM).toEqual({ kind: 'kp', symbol: 'ç' });
    expect(await storage.get('layouts', 'qwerty-plus-2')).toBeNull();
  }, 60_000);

  it('moves a saved layout to the id of its new name, and says its name', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'qwerty', 'qwerty-copy', { name: 'Qwerty copy' });
    const { currentSearch } = renderRoute(
      '/edit?layout=saved%3Aqwerty-copy&corpus=en-conv&sample=20000',
      { storage },
    );
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    // Author and description are there to fill in, with nothing to open first.
    expect(screen.queryByRole('button', { name: 'Layout details' })).toBeNull();
    const fill = async (label: string, text: string) => {
      const field = within(bar()).getByLabelText(label);
      await user.clear(field);
      await user.type(field, `${text}{Enter}`);
    };
    await fill('Name', 'My layout');
    await fill('Author', 'Me');
    await fill('Description', 'Qwerty, my way');
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved My layout')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await storage.get('layouts', 'my-layout'))?.doc).toMatchObject({
        id: 'my-layout',
        name: 'My layout',
        author: 'Me',
        description: 'Qwerty, my way',
      }),
    );
    // Moved, not copied: the Library shows it once, under its new name.
    expect(await storage.get('layouts', 'qwerty-copy')).toBeNull();
    await waitFor(() => expect(currentSearch()).toContain('saved%3Amy-layout'));
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
    expect(within(bar()).getByLabelText('Name')).toHaveValue('My layout');
    expect(screen.queryByText('unsaved')).toBeNull();
  }, 60_000);

  it('renames onto a name another saved layout has by saving beside it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'qwerty', 'qwerty-copy', { name: 'Qwerty copy' });
    await seed(storage, 'colemak-dh', 'my-layout', { name: 'My layout' });
    renderRoute('/edit?layout=saved%3Aqwerty-copy&corpus=en-conv&sample=20000', { storage });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    const name = within(bar()).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'My layout{Enter}');
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved My layout')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await storage.get('layouts', 'my-layout-2'))?.doc.name).toBe('My layout'),
    );
    // The other one is left as it was.
    expect((await storage.get('layouts', 'my-layout'))?.doc.geometry).toEqual(
      toCanonicalJson(bundledLayout('colemak-dh') as Layout).geometry,
    );
    expect(await storage.get('layouts', 'qwerty-copy')).toBeNull();
  }, 60_000);

  it('saves a layout for the first time beside a saved one of the same name, not over it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'qwerty', 'qwerty', { description: 'mine' });
    renderRoute('/edit?layout=qwerty&corpus=en-conv&sample=20000', { storage });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(within(bar()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved Qwerty')).toBeInTheDocument();
    expect((await storage.get('layouts', 'qwerty'))?.doc.description).toBe('mine');
    expect((await storage.get('layouts', 'qwerty-2'))?.doc.name).toBe('Qwerty');
  });

  it('analyzes the layout typed without the features switched off, and still edits it as written', async () => {
    const user = userEvent.setup();
    const { client, requests } = recording();
    const { currentSearch } = renderRoute('/edit?layout=magic-romak&sample=20000', {
      client,
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
    const typed = (r: AnalyzeRequest | undefined) => JSON.stringify(r?.layout ?? null);
    await waitFor(() => expect(typed(requests[0])).toContain('"qu"'));

    await user.click(
      within(within(bar()).getByRole('group', { name: 'Analyze with' })).getByRole('checkbox', {
        name: 'Multi-letter macros',
      }),
    );
    await waitFor(() => expect(currentSearch()).toContain('off=macros'));
    // The numbers are for the layout without its `qu` macro; the layout being edited keeps it.
    await waitFor(() => expect(typed(requests.at(-1))).not.toContain('"qu"'), {
      timeout: 25_000,
    });
    await user.click(screen.getByRole('tab', { name: 'Alpha 2' }));
    expect(await screen.findByRole('button', { name: /^Key LTM: qu/ })).toBeInTheDocument();
  }, 60_000);

  it('analyzes on English news unless the link names a corpus, and switches without losing edits', async () => {
    const user = userEvent.setup();
    const { client, requests } = recording();
    const { currentSearch } = renderRoute('/edit?layout=qwerty&sample=20000', {
      client,
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
    const corpus = within(bar()).getByRole('combobox', { name: 'Corpus' });
    expect(corpus).toHaveValue('en-general');
    expect(requests.map((r) => r.corpusId)).toContain('en-general');

    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: 'Key LHM: ç' });

    await waitFor(() => expect(within(corpus).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(corpus, 'en-conv');
    await user.selectOptions(
      within(bar()).getByRole('combobox', { name: 'Rule set' }),
      'cyanophage',
    );
    await waitFor(() => expect(currentSearch()).toContain('rules=cyanophage'));
    expect(currentSearch()).toContain('corpus=en-conv');

    // The editor stayed open on the edit, which is still unsaved, and the numbers follow the text.
    expect(key('Key LHM: ç')).toBeInTheDocument();
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    await waitFor(() => expect(requests.some((r) => r.corpusId === 'en-conv')).toBe(true), {
      timeout: 25_000,
    });
  }, 60_000);

  it('selects a key and edits its binding', async () => {
    const user = userEvent.setup();
    await openEdit();

    expect(screen.getByText(/Tap or click a key on the board to edit it/)).toBeInTheDocument();

    await user.click(key('Key LHM: d'));
    const editor = await inspector('LHM');
    expect(within(editor).getByRole('button', { name: 'Symbol' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const symbol = within(editor).getByLabelText('Symbol');
    expect(symbol).toHaveValue('d');

    await user.clear(symbol);
    await user.type(symbol, 'ç{Enter}');

    expect(await screen.findByRole('button', { name: 'Key LHM: ç' })).toBeInTheDocument();
    expect(screen.getByText('unsaved')).toBeInTheDocument();
  });

  it('adds, reorders, duplicates, renames and removes layers', async () => {
    const user = userEvent.setup();
    await openEdit();

    // Layers is the panel the editor opens on.
    await user.type(screen.getByLabelText('New layer name'), 'Symbols');
    await user.click(screen.getByRole('button', { name: '+ layer' }));
    await user.type(screen.getByLabelText('New layer name'), 'Numbers');
    await user.click(screen.getByRole('button', { name: '+ layer' }));
    const order = () =>
      within(screen.getByRole('tablist', { name: 'Layers' }))
        .getAllByRole('tab')
        .map((t) => t.textContent);
    expect(order()).toEqual(['Base', 'Symbols', 'Numbers']);

    // The base layer, which every key falls back to, stays first and cannot go.
    expect(screen.getByRole('button', { name: 'Remove Base' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Move Base up' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move Symbols up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Numbers up' }));
    expect(order()).toEqual(['Base', 'Numbers', 'Symbols']);

    await user.click(screen.getByRole('button', { name: 'Duplicate Symbols' }));
    expect(order()).toEqual(['Base', 'Numbers', 'Symbols', 'Symbols copy']);

    // A tab is renamed where it stands.
    await user.dblClick(screen.getByRole('tab', { name: 'Symbols copy' }));
    const field = screen.getByLabelText('Rename Symbols copy');
    await user.clear(field);
    await user.type(field, 'Extra{Enter}');
    expect(await screen.findByRole('tab', { name: 'Extra' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name of layer symbols-copy')).toHaveValue('Extra');

    await user.click(screen.getByRole('button', { name: 'Remove Extra' }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Extra' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('tab', { name: 'Extra' })).toBeInTheDocument();
  });

  it('will not remove a layer a key still reaches, and says which key', async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    await user.click(screen.getByRole('button', { name: 'Remove Numbers' }));
    expect(
      await screen.findByText(/Numbers is still reached from Alpha 1 L0\b/),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Numbers' })).toBeInTheDocument();
  });

  it("shows Magic Romak's special features and lets one be turned off", async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-conv&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    // The four behaviours firmware needs extra layers for are no longer layers.
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.getByLabelText('Name of layer alpha1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name of layer sen_case')).toBeNull();
    expect(screen.queryByLabelText('Name of layer sft_a2')).toBeNull();
    expect(screen.queryByLabelText('Name of layer altrep2')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Features' }));
    expect(screen.getByLabelText('Sentence case')).toBeChecked();
    expect(screen.getByLabelText('Caps word')).toBeChecked();
    // Magic keys and the alt repeat are keys like any other, made and edited on the key.
    expect(screen.queryByLabelText('Magic key')).toBeNull();
    expect(screen.queryByLabelText('Alt repeat')).toBeNull();

    await user.click(screen.getByLabelText('Sentence case'));
    expect(screen.getByLabelText('Sentence case')).not.toBeChecked();
    expect(await screen.findByText('unsaved')).toBeInTheDocument();
  });

  it('builds a macro that types text and then arms a layer', async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    await user.click(screen.getByRole('button', { name: /^Key LTR/ }));
    const editor = await inspector('LTR');
    await user.click(within(editor).getByRole('button', { name: 'Macro' }));
    await user.click(await within(editor).findByRole('radio', { name: 'Steps' }));

    // The key's own letter is the first step already; it is replaced rather than added to.
    const first = await within(editor).findByLabelText('Step 1 text');
    await user.clear(first);
    await user.type(first, 'ão{Enter}');
    await user.click(within(editor).getByRole('button', { name: 'Add step' }));
    await user.selectOptions(within(editor).getByLabelText('Step 2 kind'), 'sl');
    await user.selectOptions(within(editor).getByLabelText('Step 2 layer'), 'alpha2');
    await user.type(within(editor).getByLabelText('Binding tag'), 'alpha2{Enter}');

    // The key now types the text and arms the layer, and says so on its legend.
    expect(await screen.findByRole('button', { name: /^Key LTR: ão/ })).toBeInTheDocument();
    expect(await screen.findByText('unsaved')).toBeInTheDocument();
    expect(within(await inspector('LTR')).getByText(/types ão, then Alpha 2/)).toBeInTheDocument();
  });

  it('sets a key by typing on it', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHM: d').focus();
    await user.keyboard('ç');

    // The character that opened the editor is already in it, so nothing is typed twice.
    const input = await screen.findByRole('textbox', { name: 'Binding for LHM' });
    expect(input).toHaveValue('ç');

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Key LHM: ç' })).toBeInTheDocument();
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    // Focus goes back to the key, so the next arrow press or keystroke lands where it should.
    expect(document.activeElement).toBe(key('Key LHM: ç'));
  });

  it('takes the ZMK spelling of a layer tap, and shows what it will be before it lands', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHM: d').focus();
    await user.keyboard('{Enter}');
    const input = await screen.findByRole('textbox', { name: 'Binding for LHM' });
    expect(input).toHaveValue('&kp d');
    await user.clear(input);
    await user.type(input, '&mo base');

    // The preview is drawn from the same legend the cap will draw.
    expect(screen.getByRole('group', { name: 'Edit LHM' }).textContent).toContain('Base (hold)');

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Key LHM: Base (hold)' })).toBeInTheDocument();
  });

  it('says what is wrong instead of applying it', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHM: d').focus();
    await user.keyboard('{F2}');
    const input = await screen.findByRole('textbox', { name: 'Binding for LHM' });
    await user.clear(input);
    await user.type(input, '&mo nowhere{Enter}');

    expect(await screen.findByText(/no layer called/)).toBeInTheDocument();
    expect(key('Key LHM: d')).toBeInTheDocument();
    expect(screen.queryByText('unsaved')).toBeNull();
  });

  it('keeps Space selecting the key, and Enter typing on it', async () => {
    const user = userEvent.setup();
    await openEdit();

    // Space activates the key like the button it says it is: the inspector opens on it, and the
    // key keeps the focus, so the arrow keys still move.
    key('Key LHM: d').focus();
    await user.keyboard(' ');
    const editor = await inspector('LHM');
    expect(within(editor).getByLabelText('Symbol')).toHaveValue('d');
    expect(document.activeElement).toBe(key('Key LHM: d'));

    await user.keyboard('{Enter}');
    const text = within(editor).getByRole('textbox', { name: 'Binding for LHM' });
    expect(text).toHaveValue('&kp d');
    expect(document.activeElement).toBe(text);
  });

  it('abandons an edit on Escape and clears a key on Delete', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHM: d').focus();
    await user.keyboard('z');
    const text = await screen.findByRole('textbox', { name: 'Binding for LHM' });
    expect(text).toHaveValue('z');
    await user.keyboard('{Escape}');
    expect(text).toHaveValue('&kp d');
    expect(document.activeElement).toBe(key('Key LHM: d'));

    await user.keyboard('{Delete}');
    expect(await screen.findByRole('button', { name: 'Key LHM: empty' })).toBeInTheDocument();

    // A second Escape, from the key, puts the inspector away.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Edit LHM' })).toBeNull());
  });

  it('edits the feature a key belongs to, rather than a binding the next compile would replace', async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    // The space key's tap is wrapped by the sentence-case feature, so anything typed on the key
    // itself would be rewritten the next time the layout compiles.
    const space = await screen.findByRole('button', { name: /^Key L0:/ });
    space.focus();
    await user.keyboard('x');

    const editor = await inspector('L0');
    expect(editor.textContent).toContain('sentenceCase');
    expect(within(editor).queryByRole('textbox', { name: 'Binding for L0' })).toBeNull();
    expect(screen.queryByText('unsaved')).toBeNull();

    // What the feature does is edited here instead.
    const after = within(editor).getByLabelText('Sentence-ending punctuation');
    expect(after).toHaveValue('. ? !');
    await user.clear(after);
    await user.type(after, '. ? ! ;{Enter}');
    expect(await screen.findByText('unsaved')).toBeInTheDocument();
    expect(within(await inspector('L0')).getByLabelText('Sentence-ending punctuation')).toHaveValue(
      '. ? ! ;',
    );
  });

  it("edits a layout's own magic key as one made in the editor, and turns it into a symbol", async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    await user.click(await screen.findByRole('button', { name: /^Key RBI:/ }));
    const editor = await inspector('RBI');
    // The same tile, the same controls and the same text line as for any magic key.
    expect(within(editor).getByRole('button', { name: 'Magic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(editor).queryByLabelText('Magic key name')).toBeNull();
    expect(within(editor).getByRole('textbox', { name: 'Binding for RBI' })).toBeInTheDocument();
    const then = within(editor).getByLabelText('Branch 1 symbol');
    expect(then).toHaveValue('v');
    await user.clear(then);
    await user.type(then, 'w{Enter}');

    const legendList = await screen.findByRole('list', { name: 'Key legend' });
    await waitFor(() => expect(legendList.textContent).toContain('→ types w'));

    // A kind change keeps what carries over: the magic key's default letter.
    await user.click(within(await inspector('RBI')).getByRole('button', { name: 'Symbol' }));
    expect(await screen.findByRole('button', { name: 'Key RBI: h' })).toBeInTheDocument();
  });

  it("puts a copy of one of the layout's magic keys on another key", async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    await user.click(await screen.findByRole('button', { name: 'Key LHM: s' }));
    const editor = await inspector('LHM');
    // Magic keys come first among the keys the layout already has, in sight without "All".
    await user.click(within(editor).getByRole('button', { name: 'Use h ✦' }));

    // The magic key types its default, h, until a vowel comes before it.
    expect(await screen.findByRole('button', { name: 'Key LHM: h' })).toBeInTheDocument();
    const copy = await inspector('LHM');
    expect(within(copy).getByRole('button', { name: 'Magic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(copy).getByLabelText('Branch 1 symbol')).toHaveValue('v');
  });

  it('creates an alt repeat key from the editor', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const editor = await inspector('LHM');
    await user.click(within(editor).getByRole('button', { name: 'More' }));
    await user.click(within(editor).getByRole('button', { name: 'Alt repeat' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: ⟳' })).toBeInTheDocument();

    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Add branch' }));
    await user.type(within(await inspector('LHM')).getByLabelText('Branch 1 after'), 'a{Enter}');
    await user.type(within(await inspector('LHM')).getByLabelText('Branch 1 symbol'), 'h{Enter}');

    const legendList = await screen.findByRole('list', { name: 'Key legend' });
    await waitFor(() => expect(legendList.textContent).toContain('after a → types h'));
  });

  it('gives an alt repeat a second stage: a tagged branch, moved above the plain one', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'More' }));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Alt repeat' }));
    await screen.findByRole('button', { name: 'Key LHM: ⟳' });

    const field = async (label: string, text: string) =>
      user.type(within(await inspector('LHM')).getByLabelText(label), `${text}{Enter}`);
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Add branch' }));
    await field('Branch 1 after', 'a');
    await field('Branch 1 symbol', 'h');
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Add branch' }));
    await field('Branch 2 after', 'a');
    await field('Branch 2 symbol', 'x');
    const branches = within(await inspector('LHM')).getByRole('list', { name: 'Branches' });
    const second = within(branches).getAllByRole('listitem')[1];
    await user.click(within(second).getByText('Only after a tagged key'));
    await field('Branch 2 tags', 'alpha2');

    // Tried from the top: the tagged branch has to come first, or the plain one always wins.
    await user.click(
      within(await inspector('LHM')).getByRole('button', { name: 'Move branch 2 up' }),
    );
    const legendList = await screen.findByRole('list', { name: 'Key legend' });
    await waitFor(() =>
      expect(legendList.textContent).toContain(
        'after a, from a key tagged alpha2 → types x; after a → types h',
      ),
    );
  });

  it('opens a layout saved while magic keys were features with each one on its key', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const old = JSON.parse(
      readFileSync(
        resolve(process.cwd(), '../../packages/core/golden/legacy/magic-romak-features.json'),
        'utf8',
      ),
    );
    await storage.put('layouts', 'old-magic', { ...old, id: 'old-magic' }, { message: 'seed' });
    renderRoute('/edit?layout=saved%3Aold-magic&corpus=pt-br-conv&sample=20000', { storage });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(await screen.findByRole('button', { name: /^Key L1:/ }));
    const editor = await inspector('L1');
    expect(
      within(editor).getByRole('button', { name: 'More kinds: Alt repeat' }),
    ).toBeInTheDocument();
    // The second stage is the branches at the top, each asking for the tag.
    expect(within(editor).getByLabelText('Branch 1 tags')).toHaveValue('alpha2');
    expect(within(editor).getByLabelText('Branch 4 after')).toHaveValue('a');
    // Opening it is not an edit.
    expect(screen.queryByText('unsaved')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Features' }));
    expect(screen.queryByLabelText('Magic key')).toBeNull();
  });

  it('makes a magic key the tap of a tap-hold, keeping its hold', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Tap-hold' }));
    await user.selectOptions(within(await inspector('LHM')).getByLabelText('Tap kind'), 'magic');
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Add branch' }));
    await user.type(
      within(await inspector('LHM')).getByLabelText('Tap branch 1 after'),
      'a{Enter}',
    );
    await user.type(
      within(await inspector('LHM')).getByLabelText('Tap branch 1 symbol'),
      'v{Enter}',
    );

    const legendList = await screen.findByRole('list', { name: 'Key legend' });
    await waitFor(() => expect(legendList.textContent).toContain('after a → types v'));
    // Still a tap-hold: the tap adapts, the hold reaches the layer.
    expect(
      within(await inspector('LHM')).getByRole('button', { name: 'Tap-hold' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('reads a branch back that names no key yet', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Magic' }));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Add branch' }));
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'Load into editor' }));

    // The document the editor wrote is one it can read: the branch is still there to fill in.
    expect(screen.queryByText(/a trigger needs/)).toBeNull();
    await user.click(key('Key LHM: d'));
    expect(within(await inspector('LHM')).getByLabelText('Branch 1 after')).toHaveValue('');
  });

  it('closes the list of more kinds on a choice or a tap elsewhere, and keeps the choice in sight', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const editor = await inspector('LHM');
    await user.click(within(editor).getByRole('button', { name: 'More' }));
    expect(within(editor).getByRole('group', { name: 'More kinds' })).toBeInTheDocument();
    // A tap anywhere else puts the list away, like any menu.
    await user.click(within(editor).getByRole('textbox', { name: 'Binding for LHM' }));
    expect(within(editor).queryByRole('group', { name: 'More kinds' })).toBeNull();

    await user.click(within(editor).getByRole('button', { name: 'More' }));
    await user.click(within(editor).getByRole('button', { name: 'Tap dance' }));
    const after = await inspector('LHM');
    expect(within(after).queryByRole('group', { name: 'More kinds' })).toBeNull();
    // The kind chosen from the list now stands in its tile.
    expect(within(after).getByRole('button', { name: 'More kinds: Tap dance' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('closes the suggestions once one that needs nothing more is taken', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const field = within(await inspector('LHM')).getByRole('textbox', { name: 'Binding for LHM' });
    await user.clear(field);
    await user.type(field, '&key');
    const list = await screen.findByRole('list', { name: 'Suggestions' });
    await user.click(within(list).getByRole('button', { name: /&key_repeat/ }));
    expect(field).toHaveValue('&key_repeat');
    expect(screen.queryByRole('list', { name: 'Suggestions' })).toBeNull();
  });

  it('makes a home-row mod out of a letter', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Tap-hold' }));
    // A letter keeps its tap; a layer is the first thing a hold is given.
    expect(
      await screen.findByRole('button', { name: 'Key LHM: d, hold Base' }),
    ).toBeInTheDocument();

    await user.click(within(await inspector('LHM')).getByRole('radio', { name: 'Modifier' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: d, hold ⇧' })).toBeInTheDocument();
  });

  it('moves between keys with the arrow keys, from one tab stop', async () => {
    const user = userEvent.setup();
    await openEdit();

    const stops = screen
      .getAllByRole('button')
      .filter((el) => el.hasAttribute('data-key') && el.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);

    key('Key LHM: d').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(key('Key LHI: f'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(key('Key LTI: r'));
  });

  it('copies a key with a modifier held instead of swapping', async () => {
    await openEdit();

    await dragKey('LHM', 'LHI', { altKey: true });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Key LH[MI]: d$/ })).toHaveLength(2);
    });
  });

  it('sends a key to another layer when it is dropped on that tab', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Numbers');
    await user.click(screen.getByRole('button', { name: '+ layer' }));

    const tab = await screen.findByRole('tab', { name: 'Numbers' });
    // Adding a layer moves to it; the key being sent lives on the one before.
    await user.click(screen.getByRole('tab', { name: 'Base' }));
    await screen.findByRole('button', { name: 'Key LHM: d' });

    await dragKey('LHM', '', { onto: tab });

    // The view follows the binding to the layer it landed on, and the source is left empty.
    await waitFor(() => {
      expect(tab).toHaveAttribute('aria-selected', 'true');
    });
    expect(await screen.findByRole('button', { name: 'Key LHM: d' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Base' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: empty' })).toBeInTheDocument();
  });

  it('reuses a key the layout already has', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const editor = await inspector('LHM');
    const all = within(editor).queryByRole('button', { name: /^All \d+/ });
    if (all) await user.click(all);
    await user.click(within(editor).getByRole('button', { name: 'Use q' }));

    expect(await screen.findByRole('button', { name: 'Key LHM: q' })).toBeInTheDocument();
  });

  it('takes back an edit, and puts it back again', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: 'Key LHM: ç' });

    await user.keyboard('{Control>}z{/Control}');
    expect(await screen.findByRole('button', { name: 'Key LHM: d' })).toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(await screen.findByRole('button', { name: 'Key LHM: ç' })).toBeInTheDocument();

    // A finger has no Ctrl+Z, so the same is a button away.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: d' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: ç' })).toBeInTheDocument();
  });

  it('lets the next click through when a drop was followed by no click at all', async () => {
    const user = userEvent.setup();
    await openEdit();

    // A pointer released away from the board fires no click, so the suppression a drop arms must
    // not survive to eat an unrelated click later.
    await dragKey('LHM', 'LHI');
    await screen.findByRole('button', { name: 'Key LHM: f' });

    await user.click(key('Key LTR: w'));
    expect(await screen.findByLabelText('Symbol')).toHaveValue('w');
  });

  it('opens the same editor on a tap as on a click, without raising the on-screen keyboard', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const editor = await inspector('LHM');
    const text = within(editor).getByRole('textbox', { name: 'Binding for LHM' });
    expect(text).toHaveValue('&kp d');
    // The on-screen keyboard is not summoned before the reader has asked to type.
    expect(document.activeElement).not.toBe(text);
  });

  it('builds a whole binding by tapping, with nothing typed', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Layer' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: Base (hold)' })).toBeInTheDocument();

    await user.click(within(await inspector('LHM')).getByRole('radio', { name: 'One-shot' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: Base (1×)' })).toBeInTheDocument();
    expect(screen.getByText('unsaved')).toBeInTheDocument();
  });

  it('copies to a key by tapping, the way Alt-drag does with a mouse', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Copy to…' }));
    await user.click(key('Key LHI: f'));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Key LH[MI]: d$/ })).toHaveLength(2);
    });
  });

  it('does not swap when the gesture is cancelled', async () => {
    await openEdit();

    const svg = document.getElementById('kb-edit') as unknown as SVGSVGElement;
    const source = svg.querySelector('g[data-key="LHM"]') as Element;
    const target = svg.querySelector('g[data-key="LHI"]') as Element;
    const spy = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => target);
    source.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }) as Event &
        PointerEvent,
    );
    svg.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 20, clientY: 20 }) as Event &
        PointerEvent,
    );
    svg.dispatchEvent(
      new PointerEvent('pointercancel', { bubbles: true, clientX: 20, clientY: 20 }) as Event &
        PointerEvent,
    );
    spy.mockRestore();

    expect(key('Key LHM: d')).toBeInTheDocument();
    expect(key('Key LHI: f')).toBeInTheDocument();
    expect(screen.queryByText('unsaved')).toBeNull();
  });

  it('builds a combo from keys picked on the board', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.click(screen.getByRole('button', { name: 'pick on board' }));

    await user.click(key('Key LHR: s'));
    await user.click(key('Key LHM: d'));
    expect(screen.getByLabelText('Combo keys picked')).toHaveTextContent('LHR+LHM');

    // The output takes the same syntax as a key, so a combo is not limited to a single symbol.
    await user.type(screen.getByLabelText('Combo output'), '&macro ão');
    await user.click(screen.getByRole('button', { name: /^Add combo on/ }));

    const combos = within(screen.getByLabelText('Combos'));
    expect(await combos.findByText('LHR+LHM')).toBeInTheDocument();
    expect(combos.getByText('ão')).toBeInTheDocument();
  });

  it('refuses a combo output it cannot read, instead of guessing', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.type(screen.getByLabelText('Combo keys'), 'LHR+LHM');
    await user.type(screen.getByLabelText('Combo output'), '&mo nowhere');
    await user.click(screen.getByRole('button', { name: /^Add combo on/ }));

    expect(await screen.findByText(/no layer called/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('Combos')).queryByText('LHR+LHM')).toBeNull();
  });

  it('reorders a typing path that was never declared', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-conv&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
    await user.click(screen.getByRole('tab', { name: 'Typing paths' }));

    const order = () =>
      screen
        .getAllByRole('listitem')
        .filter((li) => li.querySelector('input[type="checkbox"]'))
        .map((li) => li.textContent);

    const before = order();
    expect(before.length).toBeGreaterThan(1);

    // Nothing was declared for this symbol yet: the panel sends the list it is showing, so the
    // first move lands instead of silently doing nothing.
    const down = screen.getAllByRole('button', { name: /^Move .* down$/ })[0];
    await user.click(down);

    await waitFor(() => {
      expect(order()[0]).toBe(before[1]);
    });
    expect(order()[1]).toBe(before[0]);
  });

  it('edits what the key says, not what the layout defaults fill in around it', async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    // The Ç extension's thumb is a plain one-shot layer; the release options it arrives at the
    // simulator with are the layout's defaults, not the key's, so they are nothing to protect.
    await user.click(await screen.findByRole('tab', { name: 'Ç extension' }));
    await user.click(await screen.findByRole('button', { name: /^Key L1:/ }));
    const editor = await inspector('L1');
    expect(within(editor).getByRole('textbox', { name: 'Binding for L1' })).toHaveValue(
      '&sl alpha2',
    );
    expect(within(editor).getByRole('radio', { name: 'One-shot' })).toBeChecked();
    expect(within(editor).getByRole('button', { name: /Alpha 2/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText('unsaved')).toBeNull();

    await user.click(within(editor).getByRole('radio', { name: 'Hold' }));
    expect(await screen.findByRole('button', { name: 'Key L1: A2 (hold)' })).toBeInTheDocument();
  });

  it('reaches the symbols from the Alpha 2 thumb, as the author’s keymap does', async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    // Tapped it is Alpha 2 for one key; held it is the Symbols layer.
    await user.click(await screen.findByRole('button', { name: /^Key R0:/ }));
    const editor = await inspector('R0');
    expect(within(editor).getByRole('button', { name: /Tap-hold/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Key R0: A2, hold Symb/ })).toBeInTheDocument();
  });

  it('draws a layer in the colour chosen for it, undoes the choice, and saves it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-conv&sample=20000', { storage });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    const dot = () =>
      screen.getByRole('tab', { name: 'Symbols' }).querySelector('span')?.getAttribute('style');
    // By its place in the list, Symbols is the fourth colour.
    expect(dot()).toContain('var(--lm-layer-4)');

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.selectOptions(screen.getByLabelText('Colour of layer sym'), 'teal');
    expect(dot()).toContain('var(--lm-layer-6)');
    expect(screen.getByText('unsaved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(dot()).toContain('var(--lm-layer-4)');
    expect(screen.getByLabelText('Colour of layer sym')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByLabelText('Colour of layer sym')).toHaveValue('teal');

    await user.click(within(bar()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved Magic Romak')).toBeInTheDocument();
    await waitFor(async () => {
      const doc = (await storage.get('layouts', 'magic-romak'))?.doc as unknown as Layout;
      expect(doc.layers.find((l) => l.id === 'sym')?.color).toBe('teal');
    });
  }, 60_000);

  it('marks on each layer the keys held or tapped to reach it, and follows an edit', async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    // The base layer is always on: nothing reaches it.
    expect(document.querySelector('#kb-edit .lm-key-reach')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Symbols' }));
    expect(
      await screen.findByRole('button', { name: 'Key R0: empty, held to reach Symbols' }),
    ).toBeInTheDocument();
    expect((await screen.findByRole('list', { name: 'Key legend' })).textContent).toContain(
      'held from Alpha 1 or Numbers to reach Symbols',
    );

    // The only way into Ç extension is the ç macro on Alpha 2, and the key says it.
    await user.click(screen.getByRole('tab', { name: 'Ç extension' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Key LBM: transparent, tapped to reach Ç extension',
      }),
    );
    expect(
      within(await inspector('LBM')).getByText(
        'Tapped from Alpha 2 by the ç macro to reach Ç extension.',
      ),
    ).toBeInTheDocument();

    // Ç extension's L1 re-arms Alpha 2 for one key; made a hold, it is held to get there too.
    await user.click(await screen.findByRole('button', { name: /^Key L1:/ }));
    await user.click(within(await inspector('L1')).getByRole('radio', { name: 'Hold' }));
    await screen.findByRole('button', { name: 'Key L1: A2 (hold)' });
    await user.click(screen.getByRole('tab', { name: 'Alpha 2' }));
    expect(
      await screen.findByRole('button', { name: /^Key L1: .*, held or tapped to reach Alpha 2$/ }),
    ).toBeInTheDocument();
  });
});
