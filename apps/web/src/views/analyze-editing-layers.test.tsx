import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { toast } from '../state/toasts.js';
import {
  bar,
  freshStorage,
  inspector,
  key,
  openEdit,
  openEditWithDefaults,
  openMagicRomak,
  recording,
} from '../test/analyze-editing.js';
import { layerNameEl, showLayer, shownLayer } from '../test/layers.js';
import { openSettings, renderRoute } from '../test/render.js';
import { setViewportWidth } from '../test/setup.js';

describe('Edit', () => {
  it('switches text and rules without losing edits', async () => {
    const user = userEvent.setup();
    const { client, requests } = recording();
    const { currentSearch } = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      client,
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    const settings = await openSettings();
    const corpus = within(settings).getByRole('combobox', { name: 'Corpus' });
    expect(corpus).toHaveValue('en-general');
    expect(requests.map((r) => r.settings.corpus)).toContain('en-general');

    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: 'Key LHM: ç' });

    await waitFor(() => expect(within(corpus).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(corpus, 'en-general');
    await user.selectOptions(
      within(bar()).getByRole('combobox', { name: 'Rule set' }),
      'cyanophage',
    );
    await waitFor(() => expect(currentSearch()).toContain('rules=cyanophage'));
    expect(currentSearch()).toContain('corpus=en-general');

    // The editor stayed open on the edit, which is still unsaved, and the numbers follow the text.
    expect(key('Key LHM: ç')).toBeInTheDocument();
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    await waitFor(
      () => expect(requests.some((r) => r.settings.corpus === 'en-general')).toBe(true),
      {
        timeout: 25_000,
      },
    );
  }, 60_000);

  it('selects a key and edits its binding', async () => {
    const user = userEvent.setup();
    await openEdit();

    expect(screen.getByText(/Tap or click a key on the board to edit it/)).toBeInTheDocument();

    await user.click(key('Key LHC: g'));
    const editor = await inspector('LHC');
    expect(within(editor).getByRole('button', { name: 'Symbol' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const symbol = within(editor).getByLabelText('Symbol');
    expect(symbol).toHaveValue('g');

    await user.clear(symbol);
    await user.type(symbol, 'ç{Enter}');

    expect(await screen.findByRole('button', { name: 'Key LHC: ç' })).toBeInTheDocument();
    expect(screen.getByText('unsaved')).toBeInTheDocument();
  });

  it('adds, reorders, duplicates, renames and removes layers', async () => {
    const user = userEvent.setup();
    await openEditWithDefaults();

    // New layers go after the default ones Qwerty has.
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Nav');
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await user.type(screen.getByLabelText('New layer name'), 'Fun');
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    // Read straight from the panel: a label query over the whole page is slow on a slow runner.
    const order = () =>
      [...document.querySelectorAll<HTMLInputElement>('input[aria-label^="Name of layer "]')].map(
        (input) => input.value,
      );
    expect(order()).toEqual(['Base', 'Numbers', 'Symbols', 'Accents', 'Nav', 'Fun']);

    // The base layer, which every key falls back to, stays first and cannot go.
    expect(screen.getByRole('button', { name: 'Remove Base' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Move Base left' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move Numbers left' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Fun left' }));
    expect(order()).toEqual(['Base', 'Numbers', 'Symbols', 'Accents', 'Fun', 'Nav']);

    await user.click(screen.getByRole('button', { name: 'Duplicate Nav' }));
    expect(order()).toEqual(['Base', 'Numbers', 'Symbols', 'Accents', 'Fun', 'Nav', 'Nav copy']);

    await user.click(screen.getByRole('tab', { name: 'Board' }));
    // The board has turned to the copy; its name is renamed where it stands.
    expect(shownLayer()).toBe('Nav copy');
    await user.dblClick(layerNameEl());
    const field = screen.getByLabelText('Rename Nav copy');
    await user.clear(field);
    await user.type(field, 'Extra{Enter}');
    await waitFor(() => expect(shownLayer()).toBe('Extra'));
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.getByLabelText('Name of layer Extra')).toHaveValue('Extra');

    const info = vi.spyOn(toast, 'info');
    await user.click(screen.getByRole('button', { name: 'Remove Extra' }));
    await waitFor(() => expect(screen.queryByLabelText('Name of layer Extra')).toBeNull());
    // The toast lives six seconds of real time, which a loaded runner can outlast between finding
    // it and looking at it: what it said is what `info` was called with.
    await waitFor(() => expect(info).toHaveBeenCalledWith('Removed Extra — Undo brings it back'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByLabelText('Name of layer Extra')).toHaveValue('Extra');
    expect(screen.getByText('Undone')).toBeInTheDocument();
    // Undo and Redo are not edits: they say what they did, and the removal is not told again.
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(screen.queryByLabelText('Name of layer Extra')).toBeNull());
    expect(screen.getByText('Redone')).toBeInTheDocument();
    expect(info.mock.calls.map(([text]) => text)).toEqual(['Removed Extra — Undo brings it back']);
    info.mockRestore();

    // A layer a key still reaches stays, and the editor says which key, once, with nothing to undo.
    await user.click(screen.getByRole('button', { name: 'Remove Numbers' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /^Numbers is still reached from Base \w+/,
    );
    expect(screen.getAllByText(/^Numbers is still reached from/)).toHaveLength(1);
    expect(screen.getByLabelText('Name of layer Numbers')).toBeInTheDocument();
    expect(screen.queryByText('Removed Numbers — Undo brings it back')).toBeNull();
  }, 120_000);

  it('offers Cancel beside Save while changes are unsaved, which discards them and Undo brings back', async () => {
    const user = userEvent.setup();
    await openEdit();
    const cancel = () => within(bar()).queryByRole('button', { name: 'Cancel' });
    // Nothing to discard on a layout as it was opened.
    expect(cancel()).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    const name = screen.getByLabelText('Name of layer Base');
    await user.clear(name);
    await user.type(name, 'Main{Enter}');
    expect(await screen.findByLabelText('Name of layer Main')).toHaveValue('Main');
    expect(screen.getByText('unsaved')).toBeInTheDocument();

    // Cancel gives the layout back as it was opened, with no question asked.
    const confirm = vi.spyOn(window, 'confirm');
    await user.click(cancel() as HTMLElement);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
    expect(await screen.findByLabelText('Name of layer Base')).toHaveValue('Base');
    expect(screen.queryByText('unsaved')).toBeNull();
    expect(cancel()).toBeNull();
    expect(await screen.findByText('Discarded the changes — Undo brings them back')).toBeVisible();

    // One Undo brings the change back, as unsaved as it was, and the button with it.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByLabelText('Name of layer Main')).toHaveValue('Main');
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    expect(cancel()).not.toBeNull();
  }, 120_000);

  it('names layers without exposing IDs, and sets one-shot timing', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.queryByLabelText(/^Id of layer /)).toBeNull();
    const name = screen.getByLabelText('Name of layer Base');
    await user.clear(name);
    await user.type(name, 'Main{Enter}');
    expect(await screen.findByLabelText('Name of layer Main')).toHaveValue('Main');

    // One-shot keys release as the next key goes down, or wait, and for how long.
    await user.click(screen.getByRole('tab', { name: 'Configuration' }));
    const keys = within(screen.getByRole('group', { name: 'One-shot keys' }));
    const quick = keys.getByLabelText('Release as the next key goes down');
    expect(quick).not.toBeChecked();
    await user.click(quick);
    expect(
      within(screen.getByRole('group', { name: 'One-shot keys' })).getByLabelText(
        'Release as the next key goes down',
      ),
    ).toBeChecked();
    const after = screen.getByLabelText('One-shot keys: release after, in milliseconds');
    await user.clear(after);
    await user.type(after, '1500');
    expect(screen.getByLabelText('One-shot keys: release after, in milliseconds')).toHaveValue(
      1500,
    );
  }, 120_000);

  it('brings a layer on by itself while others are on, from the Layers panel', async () => {
    const user = userEvent.setup();
    await openEditWithDefaults();
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    const section = () => within(screen.getByRole('list', { name: 'Layers' }));
    const add = () => section().getByRole('button', { name: 'New condition' });
    await user.click(add());
    // Every layer is reached already, so the latest comes on: Accents, while Numbers is on.
    const brings = () => section().getByRole('combobox', { name: 'Layer condition 1 brings on' });
    expect(brings()).toHaveValue('accents');
    const waits = (name: string) =>
      within(section().getByRole('group', { name: `Layers ${name} waits for` }));
    // Neither the base layer, always on, nor Accents itself is one to wait for.
    expect(
      waits('Accents')
        .getAllByRole('button')
        .map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
    ).toEqual([
      ['Numbers', 'true'],
      ['Symbols', 'false'],
    ]);
    // What reached Accents no longer does: the condition alone brings it on.
    expect(section().getByText(/Accents comes on only by this condition/)).toBeInTheDocument();
    await user.click(waits('Accents').getByRole('button', { name: /Symbols/ }));
    const symbols = waits('Accents').getByRole('button', { name: /Symbols/ });
    expect(symbols).toHaveAttribute('aria-pressed', 'true');
    expect(symbols).toHaveFocus();
    // Every layer now comes on by the condition or is waited for: none is left to add.
    expect(add()).toBeDisabled();
    expect(section().getByText(/Every layer besides the base one/)).toBeInTheDocument();
    // A layer waits for others, never for itself.
    await user.selectOptions(brings(), 'sym');
    expect(await screen.findByRole('alert')).toHaveTextContent('Symbols cannot wait for itself');
    await user.click(waits('Accents').getByRole('button', { name: /Symbols/ }));
    await user.selectOptions(brings(), 'sym');
    expect(brings()).toHaveValue('sym');
    expect(brings()).toHaveFocus();
    // Accents is later in the list, so its keys cover Symbols while both are on.
    await user.click(waits('Symbols').getByRole('button', { name: /Accents/ }));
    expect(section().getByText(/Symbols comes before Accents in the list/)).toBeInTheDocument();
    await user.click(section().getByRole('button', { name: 'Remove the condition for Symbols' }));
    expect(section().queryByRole('combobox', { name: 'Layer condition 1 brings on' })).toBeNull();
    expect(add()).toBeEnabled();
  }, 60_000);

  it("shows Magic Romak's special features as uses of its keys, with none to turn on or off", async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    // The behaviours the keymap builds with extra layers, as it once did sentence case, are not
    // layers here.
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.getByLabelText('Name of layer Alpha 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name of layer Sentence case')).toBeNull();
    expect(screen.queryByLabelText('Name of layer Shift Alpha 2')).toBeNull();
    expect(screen.queryByLabelText('Name of layer Alt Repeat 2')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
    const uses = within(screen.getByRole('list', { name: 'Special behaviors' }));
    // The space key's tap is a sentence space, listed as the use it is, and not a switch.
    expect(uses.getAllByText('Sentence case').length).toBeGreaterThan(0);
    expect(screen.queryByRole('checkbox', { name: 'Sentence case' })).toBeNull();
    // Caps word is a key, made and edited on the key, not a feature to turn on.
    expect(screen.queryByLabelText('Caps word')).toBeNull();
    // Adaptive keys and the alt repeat are keys like any other, made and edited on the key.
    expect(uses.getAllByText('Adaptive key').length).toBeGreaterThan(0);
    expect(uses.getAllByText('Alt repeat').length).toBeGreaterThan(0);
  }, 60_000);

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

    key('Key LHC: g').focus();
    await user.keyboard('{Enter}');
    const input = await screen.findByRole('textbox', { name: 'Binding for LHC' });
    expect(input).toHaveValue('&kp g');
    await user.clear(input);
    await user.type(input, '&mo base');

    // The preview is drawn from the same legend the cap will draw.
    expect(screen.getByRole('group', { name: 'Edit LHC' }).textContent).toContain('· / Base');

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Key LHC: hold Base' })).toBeInTheDocument();
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
    key('Key LHC: g').focus();
    await user.keyboard(' ');
    const editor = await inspector('LHC');
    expect(within(editor).getByLabelText('Symbol')).toHaveValue('g');
    expect(document.activeElement).toBe(key('Key LHC: g'));

    await user.keyboard('{Enter}');
    const text = within(editor).getByRole('textbox', { name: 'Binding for LHC' });
    expect(text).toHaveValue('&kp g');
    expect(document.activeElement).toBe(text);
  });

  it('abandons an edit on Escape and clears a key on Delete', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHC: g').focus();
    await user.keyboard('z');
    const text = await screen.findByRole('textbox', { name: 'Binding for LHC' });
    expect(text).toHaveValue('z');
    await user.keyboard('{Escape}');
    expect(text).toHaveValue('&kp g');
    expect(document.activeElement).toBe(key('Key LHC: g'));

    await user.keyboard('{Delete}');
    expect(await screen.findByRole('button', { name: 'Key LHC: empty' })).toBeInTheDocument();
    // Said once it has landed, since the key's new legend is not announced on its own.
    expect(screen.getByText('LHC does nothing')).toBeInTheDocument();

    // A second Escape, from the key, puts the inspector away.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Edit LHC' })).toBeNull());
  });

  it("edits the space key's tap-hold as any other, its tap being a sentence space", async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    // The space key's tap is a sentence space the layout holds on the key itself, so the key is
    // edited as it is, with its text line, and no feature owns it.
    await user.click(await screen.findByRole('button', { name: /^Key L0:/ }));
    const editor = await inspector('L0');
    expect(editor.textContent).not.toContain('sentenceCase');
    expect(within(editor).getByRole('textbox', { name: 'Binding for L0' })).toBeInTheDocument();
    expect(within(editor).queryByText(/Remove .* from this key/)).toBeNull();

    // What the tile does is said where it is made, with the module that has it.
    expect(
      within(editor).getByText(/leaves a capital for the next key pressed/),
    ).toBeInTheDocument();
    expect(
      within(editor).getByRole('link', { name: 'rafaelromao/zmk-sentence-case' }),
    ).toBeInTheDocument();
    expect(within(editor).queryByLabelText('Sentence-ending punctuation')).toBeNull();
  });

  it("edits a layout's own adaptive key as one made in the editor, and turns it into a symbol", async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    // Alpha 2's v or h, an adaptive key of its own: the one on Alpha 1 is a tap-hold's tap.
    await showLayer(user, 'Alpha 2');
    await user.click(await screen.findByRole('button', { name: /^Key LBI:/ }));
    const editor = await inspector('LBI');
    // The same tile, the same controls and the same text line as for any adaptive key.
    expect(within(editor).getByRole('button', { name: 'Adaptive' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(editor).queryByLabelText('Adaptive key name')).toBeNull();
    expect(within(editor).getByRole('textbox', { name: 'Binding for LBI' })).toBeInTheDocument();
    const then = within(editor).getByLabelText('Branch 1 symbol');
    expect(then).toHaveValue('h');
    await user.clear(then);
    await user.type(then, 'w{Enter}');

    const legendList = await screen.findByRole('list', { name: 'Key legend' });
    await waitFor(() => expect(legendList.textContent).toContain('→ types w'));

    // A kind change keeps what carries over: the adaptive key's default letter.
    await user.click(within(await inspector('LBI')).getByRole('button', { name: 'Symbol' }));
    expect(await screen.findByRole('button', { name: 'Key LBI: v' })).toBeInTheDocument();
  });

  it("puts a copy of one of the layout's adaptive keys on another key", async () => {
    const user = userEvent.setup();
    await openMagicRomak();

    // Its home block mod holds Alt there.
    await user.click(await screen.findByRole('button', { name: 'Key LHM: s, hold ⌥' }));
    const editor = await inspector('LHM');
    // Adaptive keys come first among the keys the layout already has, in sight without "All".
    await user.click(within(editor).getByRole('button', { name: 'Use h ✦' }));

    // The adaptive key types its default, h, until a vowel comes before it.
    expect(await screen.findByRole('button', { name: 'Key LHM: h' })).toBeInTheDocument();
    const copy = await inspector('LHM');
    expect(within(copy).getByRole('button', { name: 'Adaptive' })).toHaveAttribute(
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

  it('makes an adaptive key the tap of a tap-hold, keeping its hold', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Tap-hold' }));
    await user.selectOptions(within(await inspector('LHM')).getByLabelText('Tap kind'), 'adaptive');
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

    await user.click(key('Key LHC: g'));
    await user.click(within(await inspector('LHC')).getByRole('button', { name: 'Adaptive' }));
    await user.click(within(await inspector('LHC')).getByRole('button', { name: 'Add branch' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));
    await user.click(screen.getByRole('button', { name: 'Load into editor' }));
    await user.click(screen.getByRole('tab', { name: 'Board' }));

    // The document the editor wrote is one it can read: the branch is still there to fill in.
    expect(screen.queryByText(/a trigger needs/)).toBeNull();
    await user.click(key('Key LHC: g'));
    expect(within(await inspector('LHC')).getByLabelText('Branch 1 after')).toHaveValue('');
  });

  it('shows every kind of key as a tile where there is room, with nothing behind More', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const kinds = within(await inspector('LHM')).getByRole('group', { name: 'Kind of key' });
    for (const name of ['Symbol', 'Nothing', 'Alt repeat', 'Tap dance', 'Dead key']) {
      expect(within(kinds).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(kinds).queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('closes the list of more kinds on a phone on a choice, a tap elsewhere or More again, and keeps the choice in sight', async () => {
    setViewportWidth(375);
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const editor = await inspector('LHM');
    await user.click(within(editor).getByRole('button', { name: 'More' }));
    expect(within(editor).getByRole('group', { name: 'More kinds' })).toBeInTheDocument();
    // A tap anywhere else puts the list away, like any menu.
    await user.click(within(editor).getByRole('textbox', { name: 'Binding for LHM' }));
    expect(within(editor).queryByRole('group', { name: 'More kinds' })).toBeNull();
    // So does More itself.
    await user.click(within(editor).getByRole('button', { name: 'More' }));
    await user.click(within(editor).getByRole('button', { name: 'More', expanded: true }));
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
});
