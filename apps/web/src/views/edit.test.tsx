import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
  renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', { storage: freshStorage() });
  await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });
}

const key = (name: string) => screen.getByRole('button', { name });

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

    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', {
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

  it('saves the edited layout under a slug of its name', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', { storage });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(screen.getByRole('tab', { name: 'Save' }));
    const panel = screen
      .getByRole('button', { name: 'Save to library' })
      .closest('form') as HTMLElement;
    const name = within(panel).getByLabelText('Layout name');
    await user.clear(name);
    await user.type(name, 'Qwerty swapped');
    await user.click(within(panel).getByRole('button', { name: 'Save to library' }));

    expect(await screen.findByText('Saved as qwerty-swapped')).toBeInTheDocument();
    const stored = await storage.get('layouts', 'qwerty-swapped');
    expect(stored?.doc.name).toBe('Qwerty swapped');
  });

  it('selects a key and edits its binding', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', { storage: freshStorage() });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    expect(screen.getByText('Select a key on the keyboard.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Key LHM: d' }));
    const symbol = await screen.findByLabelText('Symbol');
    expect(symbol).toHaveValue('d');

    await user.clear(symbol);
    await user.type(symbol, 'ç');
    await user.click(screen.getByRole('button', { name: 'Apply to LHM' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Key LHM: ç' })).toBeInTheDocument();
    });
    expect(screen.getByText('unsaved')).toBeInTheDocument();
  });

  it('adds and removes a layer', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', { storage: freshStorage() });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Symbols');
    await user.click(screen.getByRole('button', { name: '+ layer' }));

    expect(await screen.findByRole('tab', { name: 'Symbols' })).toBeInTheDocument();

    // The base layer is the one layer that cannot go.
    const baseName = screen.getByLabelText('Name of layer base');
    const row = baseName.closest('div') as HTMLElement;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(within(row).getByRole('button', { name: '✕' }));
    expect(await screen.findByText('cannot remove the base layer')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("shows Magic Romak's special features and lets one be turned off", async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
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
    expect(screen.getByLabelText('Magic key')).toBeChecked();

    // The adaptive triggers are visible without opening the JSON panel.
    const magic = screen.getByRole('table', { name: 'Magic key triggers' });
    expect(within(magic).getByText('v')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Sentence case'));
    expect(screen.getByLabelText('Sentence case')).not.toBeChecked();
    expect(await screen.findByText('unsaved')).toBeInTheDocument();
  });

  it('builds a macro that types text and then arms a layer', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(screen.getByRole('button', { name: /^Key LTR/ }));
    await user.selectOptions(screen.getByLabelText('Binding kind'), 'macro');

    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.type(screen.getByLabelText('Step 1 text'), 'ão');
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.selectOptions(screen.getByLabelText('Step 2 kind'), 'sl');
    await user.selectOptions(screen.getByLabelText('Step 2 layer'), 'alpha2');
    await user.type(screen.getByLabelText('Binding tag'), 'alpha2');
    await user.click(screen.getByRole('button', { name: /^Apply to LTR/ }));

    // The key now types the text and arms the layer, and says so on its legend.
    expect(await screen.findByRole('button', { name: /^Key LTR: ão/ })).toBeInTheDocument();
    expect(await screen.findByText('unsaved')).toBeInTheDocument();
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
    expect(screen.getByRole('group', { name: 'Edit LHM' }).textContent).toContain('⇩Base');

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Key LHM: ⇩Base' })).toBeInTheDocument();
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

  it('keeps Space selecting the key, and Enter editing it', async () => {
    const user = userEvent.setup();
    await openEdit();

    // Space activates the key like the button it says it is.
    key('Key LHM: d').focus();
    await user.keyboard(' ');
    expect(screen.queryByRole('textbox', { name: 'Binding for LHM' })).toBeNull();
    expect(await screen.findByLabelText('Symbol')).toHaveValue('d');

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('textbox', { name: 'Binding for LHM' })).toHaveValue('&kp d');
  });

  it('abandons an edit on Escape and clears a key on Delete', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHM: d').focus();
    await user.keyboard('z');
    await screen.findByRole('textbox', { name: 'Binding for LHM' });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Binding for LHM' })).toBeNull();
    });
    expect(key('Key LHM: d')).toBeInTheDocument();

    await user.keyboard('{Delete}');
    expect(await screen.findByRole('button', { name: 'Key LHM: empty' })).toBeInTheDocument();
  });

  it('refuses a key a feature generated, rather than losing the edit on the next compile', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    // The space key's tap arm is wrapped by the sentence-case feature, so anything written on it
    // would be replaced the next time the layout compiles.
    const space = await screen.findByRole('button', { name: /^Key L0:/ });
    space.focus();
    await user.keyboard('x');

    const editor = await screen.findByRole('group', { name: 'Edit L0' });
    expect(editor.textContent).toContain('sentenceCase');
    expect(screen.queryByRole('textbox', { name: 'Binding for L0' })).toBeNull();
    expect(screen.queryByText('unsaved')).toBeNull();
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

  it('places a binding taken from the palette', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(within(screen.getByLabelText('Bindings to place')).getByTitle('&key_repeat'));
    expect(await screen.findByText(/Carrying/)).toBeInTheDocument();

    await user.click(key('Key LHM: d'));
    expect(await screen.findByRole('button', { name: 'Key LHM: ⟳' })).toBeInTheDocument();
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

  it('opens the editor on a tap, since a finger cannot type on a key', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const editor = await screen.findByRole('group', { name: 'Edit LHM' });
    expect(within(editor).getByRole('textbox', { name: 'Binding for LHM' })).toHaveValue('&kp d');
    // The on-screen keyboard is not summoned before the reader has asked to type.
    expect(document.activeElement).not.toBe(
      within(editor).getByRole('textbox', { name: 'Binding for LHM' }),
    );
  });

  it('builds a whole binding by tapping, with nothing typed', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const editor = await screen.findByRole('group', { name: 'Edit LHM' });
    // `&` sits on the symbol page of an on-screen keyboard, so the menu has to be there already.
    await user.click(within(editor).getByRole('button', { name: /^&mo/ }));
    await user.click(await within(editor).findByRole('button', { name: /^base/ }));
    await user.click(within(editor).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('button', { name: 'Key LHM: ⇩Base' })).toBeInTheDocument();
    expect(screen.getByText('unsaved')).toBeInTheDocument();
  });

  it('copies to a key by tapping, the way Alt-drag does with a mouse', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(await screen.findByRole('button', { name: 'copy to…' }));
    await user.click(key('Key LHI: f'));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Key LH[MI]: d$/ })).toHaveLength(2);
    });
  });

  it('leaves the mouse alone: a click selects, it does not open the editor', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    expect(screen.queryByRole('group', { name: 'Edit LHM' })).toBeNull();
    expect(await screen.findByLabelText('Symbol')).toHaveValue('d');
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
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
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

  it('will not let the Key panel flatten a binding it has no room for', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    // The right inner thumb is a one-shot carrying release options, which `BindingFields` cannot
    // hold: applying the form to it would drop them silently.
    const thumb = await screen.findByRole('button', { name: /^Key R0:/ });
    const before = thumb.getAttribute('aria-label');
    await user.click(thumb);

    expect(await screen.findByText(/one-shot carrying release options/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to R0' })).toBeDisabled();
    expect(screen.getByLabelText('Symbol')).toBeDisabled();

    // Replacing it is still allowed, but only after saying so.
    await user.click(screen.getByRole('button', { name: 'Replace anyway' }));
    expect(screen.getByRole('button', { name: 'Apply to R0' })).toBeEnabled();
    // And nothing has changed merely by unlocking the form.
    expect(screen.getByRole('button', { name: /^Key R0:/ })).toHaveAttribute('aria-label', before);
    expect(screen.queryByText('unsaved')).toBeNull();
  });

  it('will not let the Key panel edit a key a feature generates', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(await screen.findByRole('button', { name: /^Key L0:/ }));

    expect(await screen.findByText('sentenceCase')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to L0' })).toBeDisabled();
    // There is no way through: the next compile would undo whatever was written here.
    expect(screen.queryByRole('button', { name: 'Replace anyway' })).toBeNull();
    expect(screen.getByRole('button', { name: 'clear' })).toBeDisabled();
  });
});
