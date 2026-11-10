import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  dragKey,
  inspector,
  key,
  openComboEdit,
  openEdit,
  openEditWithDefaults,
  openMagicRomak,
  svgKey,
  touchEvent,
} from '../test/analyze-editing.js';
import { showLayer, shownLayer } from '../test/layers.js';
import { setPointerKind } from '../test/setup.js';

describe('Edit', () => {
  it('makes a home-row mod out of a letter', async () => {
    const user = userEvent.setup();
    await openEditWithDefaults();

    await user.click(key('Key LHC: g'));
    await user.click(within(await inspector('LHC')).getByRole('button', { name: 'Tap-hold' }));
    // A letter keeps its tap; a layer is the first thing a hold is given.
    expect(
      await screen.findByRole('button', { name: 'Key LHC: g, hold Numb' }),
    ).toBeInTheDocument();

    await user.selectOptions(
      within(await inspector('LHC')).getByLabelText('Hold kind'),
      'modifier',
    );
    expect(await screen.findByRole('button', { name: 'Key LHC: g, hold ⇧' })).toBeInTheDocument();
  });

  it('gives a hold anything a tap can be, such as a symbol', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Tap-hold' }));
    const kinds = within(await inspector('LHM')).getByLabelText('Hold kind');
    // Every kind the tap offers, and never another tap-hold.
    expect([...(kinds as HTMLSelectElement).options].map((o) => o.value)).not.toContain('taphold');
    await user.selectOptions(kinds, 'symbol');
    await user.type(within(await inspector('LHM')).getByLabelText('Hold symbol'), '!{Enter}');
    expect(await screen.findByRole('button', { name: 'Key LHM: d, hold !' })).toBeInTheDocument();
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

  it('sends a key to another layer from its editor, leaving its place empty', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Nav');
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    // Adding a layer moves to it; the key being sent lives on the one before.
    await showLayer(user, 'Base');
    await user.click(await screen.findByRole('button', { name: 'Key LHM: d' }));

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Send LHM to another layer' }),
      'Nav',
    );

    // The view follows the binding to the layer it landed on, and the source is left empty.
    await waitFor(() => expect(shownLayer()).toBe('Nav'));
    expect(await screen.findByRole('button', { name: 'Key LHM: d' })).toBeInTheDocument();
    await showLayer(user, 'Base');
    expect(await screen.findByRole('button', { name: 'Key LHM: empty' })).toBeInTheDocument();
  }, 90_000);

  it('sends keys picked with Shift to another layer together, and one Undo takes them all back', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Nav');
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await showLayer(user, 'Base');

    await user.click(await screen.findByRole('button', { name: 'Key LHM: d' }));
    await user.keyboard('{Shift>}');
    await user.click(key('Key LHI: f'));
    await user.click(key('Key LHR: s'));
    // A second Shift-click takes a key back out.
    await user.click(key('Key LHR: s'));
    await user.keyboard('{/Shift}');
    const editor = await screen.findByRole('group', { name: 'Edit 2 keys' });

    await user.selectOptions(
      within(editor).getByRole('combobox', { name: 'Send the selected keys to another layer' }),
      'Nav',
    );
    await waitFor(() => expect(shownLayer()).toBe('Nav'));
    expect(await screen.findByRole('button', { name: 'Key LHM: d' })).toBeInTheDocument();
    expect(key('Key LHI: f')).toBeInTheDocument();
    expect(key('Key LHR: transparent')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(shownLayer()).toBe('Base'));
    expect(await screen.findByRole('button', { name: 'Key LHM: d' })).toBeInTheDocument();
    expect(key('Key LHI: f')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Edit 2 keys' })).toBeInTheDocument();
  }, 90_000);

  it('adds a key to the ones picked when a finger rests on it, and clears them all at once', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const rest = svgKey('LHI');
    rest.dispatchEvent(touchEvent('pointerdown'));
    await new Promise((done) => setTimeout(done, 400));
    rest.dispatchEvent(touchEvent('pointerup'));
    // The click a lifted finger may still send, with no press before it, must not pick that key
    // alone.
    rest.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const editor = await screen.findByRole('group', { name: 'Edit 2 keys' });
    await user.click(within(editor).getByRole('button', { name: 'Clear' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: empty' })).toBeInTheDocument();
    expect(key('Key LHI: empty')).toBeInTheDocument();
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

  it('puts away whatever is picked on a click between the keys, but not after a drag or a swipe', async () => {
    const user = userEvent.setup();
    await openEdit();
    const board = screen.getByRole('group', { name: 'Keyboard layout' });
    const editing = () => screen.queryByRole('group', { name: /^Edit / });
    const outlined = () => document.querySelectorAll('#kb-analyze .lb-key-highlight').length;

    // Keys picked together.
    await user.click(key('Key LHM: d'));
    await user.keyboard('{Shift>}');
    await user.click(key('Key LHI: f'));
    await user.keyboard('{/Shift}');
    expect(await screen.findByRole('group', { name: 'Edit 2 keys' })).toBeInTheDocument();
    await user.click(board);
    await waitFor(() => expect(editing()).toBeNull());

    // A swap armed.
    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Swap with…' }));
    expect(screen.getByText(/is armed/)).toBeInTheDocument();
    await user.click(board);
    expect(screen.queryByText(/is armed/)).toBeNull();
    expect(editing()).toBeNull();

    // A pair outlined from a card.
    await user.click(
      document.querySelector<HTMLButtonElement>('.lb-items li button') as HTMLElement,
    );
    await waitFor(() => expect(outlined()).toBeGreaterThan(0));
    await user.click(board);
    expect(outlined()).toBe(0);
    expect(document.querySelectorAll('#kb-analyze .lb-arc path')).toHaveLength(0);

    // A finger swiped across the board keeps the key picked.
    await user.click(key('Key LHM: d'));
    await inspector('LHM');
    fireEvent.pointerDown(board, { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.pointerUp(board, { clientX: 140, clientY: 12, pointerType: 'touch' });
    fireEvent.click(board, { clientX: 140, clientY: 12 });
    expect(await inspector('LHM')).toBeInTheDocument();
    // So does a drop: the board holds the pointer while a key is dragged, so the click its release
    // sends lands on the board, and must not put away the key the drop picked.
    await dragKey('LTR', 'LTM');
    expect(await screen.findByRole('button', { name: 'Key LTR: e' })).toBeInTheDocument();
    await inspector('LTM');
    fireEvent.click(board, { clientX: 20, clientY: 20 });
    expect(await inspector('LTM')).toBeInTheDocument();
  });

  it('puts Swap with…, Copy to… and Send to layer… first in the editor, for one key and for several', async () => {
    const user = userEvent.setup();
    await openEdit();
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Nav');
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await showLayer(user, 'Base');
    // The controls under the editor's header, in order, each by what it says or is labelled.
    const controls = (editor: HTMLElement) =>
      [...editor.querySelectorAll<HTMLElement>('button, select, input, textarea')]
        .filter((c) => !c.closest('header'))
        .map((c) => c.getAttribute('aria-label') ?? c.textContent?.trim());

    await user.click(await screen.findByRole('button', { name: 'Key LHM: d' }));
    expect(controls(await inspector('LHM')).slice(0, 3)).toEqual([
      'Swap with…',
      'Copy to…',
      'Send LHM to another layer',
    ]);

    await user.keyboard('{Shift>}');
    await user.click(key('Key LHI: f'));
    await user.keyboard('{/Shift}');
    expect(controls(await screen.findByRole('group', { name: 'Edit 2 keys' })).slice(0, 2)).toEqual(
      ['Send the selected keys to another layer', 'Copy the selected keys to another layer'],
    );
  }, 90_000);

  it('keeps the board first, with the layers under it and Heat; Undo and Redo sit with the tabs', async () => {
    await openEdit();
    const region = screen.getByRole('region', { name: 'Board' });
    const board = within(region).getByRole('group', { name: 'Keyboard layout' });
    const layers = within(region).getByRole('group', { name: 'Layers' });
    const heat = within(region).getByLabelText('Heat');
    const after = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    // Nothing is drawn above the board.
    for (const control of [layers, heat]) expect(after(board, control)).toBe(true);
    expect(after(layers, heat)).toBe(true);
    expect(layers.closest('.lb-board-tools')).toBeNull();
    // Undo and Redo are on every tab, so they are not on the board.
    const editor = within(screen.getByRole('region', { name: 'Editor' }));
    expect(editor.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(editor.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Undo' })).toBeNull();
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

    await user.click(key('Key LHC: g'));
    const editor = await inspector('LHC');
    const text = within(editor).getByRole('textbox', { name: 'Binding for LHC' });
    expect(text).toHaveValue('&kp g');
    // The on-screen keyboard is not summoned before the reader has asked to type.
    expect(document.activeElement).not.toBe(text);
  });

  it('builds a whole binding by tapping, with nothing typed', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEditWithDefaults();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Layer' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: hold Numb' })).toBeInTheDocument();
    // Said by its hold, since it taps nothing.
    expect(screen.getByText('LHM set to hold Numb')).toBeInTheDocument();

    await user.click(within(await inspector('LHM')).getByRole('radio', { name: 'One-shot' }));
    expect(await screen.findByRole('button', { name: 'Key LHM: Numb (1×)' })).toBeInTheDocument();
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

    const svg = document.getElementById('kb-analyze') as unknown as SVGSVGElement;
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

  it('builds a combo from keys picked on the board, then gives it an output in the combo editor', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.click(screen.getByRole('button', { name: 'New combo' }));

    await user.click(key('Key LHM: d'));
    await user.click(key('Key LHI: f'));
    expect(screen.getByLabelText('Combo keys picked')).toHaveTextContent('LHM+LHI');
    await user.click(screen.getByRole('button', { name: /^Add combo on/ }));

    // It has a small board in the strip, and is open in the editor, which takes the same syntax as
    // a key, so a combo is not limited to a single symbol.
    const combos = within(screen.getByRole('region', { name: 'Combos' }));
    expect(await combos.findByRole('button', { name: 'Edit LHM+LHI' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const editor = within(await screen.findByRole('group', { name: 'Edit combo LHM+LHI' }));
    const line = editor.getByLabelText('Binding for combo LHM+LHI');
    await user.clear(line);
    await user.type(line, '&macro ão{Enter}');
    await waitFor(() =>
      expect(combos.getByRole('button', { name: 'Edit LHM+LHI' })).toHaveTextContent('ão'),
    );
  });

  /** What the boxes the board draws for combos say, by their keys and legend. */
  const boxes = () =>
    [...document.querySelectorAll('#kb-analyze .lb-combo title')].map((t) => t.textContent);

  it('turns the board to the first layer a combo works on, with the combo selected there', async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    // The combo open on the board: a combo the layer shown does not work on is not drawn at all.
    const open = () =>
      [...document.querySelectorAll('#kb-analyze .lb-combo-open title')].map((t) => t.textContent);
    expect(open()).toEqual([]);
    // The à works on Alpha 2 only, and Alpha 1 is the layer shown.
    // Three cards share RHM+RHR: a letter chord on Alpha 1, the à on Alpha 2, a letter on Numbers.
    const agrave = within(screen.getByRole('region', { name: 'Combos' }))
      .getAllByRole('button', { name: 'Edit RHM+RHR' })
      .find((b) => b.querySelector('.lb-combo-slide-layers')?.textContent === 'Alpha 2');
    expect(agrave).toBeDefined();
    await user.click(agrave as HTMLElement);
    await waitFor(() => expect(open()).toEqual([expect.stringMatching(/^Combo RHM \+ RHR/)]));
    // The board is turned to Alpha 2, so its navigator and the combo's own layers both say so.
    expect(screen.getAllByText('Alpha 2').length).toBeGreaterThan(1);
  }, 60_000);

  it('says of a combo that is a command that it is not typed, and draws no box for it on the board', async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    const combos = within(screen.getByRole('region', { name: 'Combos' }));
    // The colon on Alpha 2: the keymap has it, and the layout types `:` another way.
    const colon = combos
      .getAllByRole('button', { name: 'Edit RBM+RBR' })
      .find(
        (b) => b.querySelector('.lb-combo-slide-layers')?.textContent === 'Alpha 2 · not typed',
      );
    expect(colon).toBeDefined();
    await user.click(colon as HTMLElement);
    const editor = within(await screen.findByRole('group', { name: /^Edit combo / }));
    const typing = editor.getByRole('checkbox', { name: 'Combo RBM+RBR is used for typing' });
    expect(typing).not.toBeChecked();
    expect(document.querySelectorAll('#kb-analyze .lb-combo-open')).toHaveLength(0);
    // Ticked, it types: the box is drawn, and the card no longer says it is not typed.
    await user.click(typing);
    await waitFor(() =>
      expect(document.querySelectorAll('#kb-analyze .lb-combo-open')).toHaveLength(1),
    );
    expect(
      combos
        .getAllByRole('button', { name: 'Edit RBM+RBR' })
        .some((b) => b.querySelector('.lb-combo-slide-layers')?.textContent?.includes('not typed')),
    ).toBe(false);
  }, 60_000);

  it("changes a combo's output, keys and layers in the combo editor, one undo for each", async () => {
    const user = userEvent.setup();
    await openComboEdit();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    const combos = within(screen.getByRole('region', { name: 'Combos' }));
    expect(boxes()).toEqual(['Combo LHR + LHM: Acce']);
    await user.click(combos.getByRole('button', { name: 'Edit LHR+LHM' }));
    const editor = () => within(screen.getByRole('group', { name: /^Edit combo / }));

    // The output: typed in the syntax a key takes, kept when the field is left.
    const output = editor().getByLabelText('Binding for combo LHR+LHM');
    await user.clear(output);
    await user.type(output, '&macro ão{Enter}');
    await waitFor(() => expect(boxes()).toEqual(['Combo LHR + LHM: ão']));
    // What the syntax cannot read is refused, and the combo keeps what it had.
    const again = editor().getByLabelText('Binding for combo LHR+LHM');
    await user.clear(again);
    await user.type(again, '&mo nowhere{Enter}');
    expect(await screen.findByText(/no layer called/)).toBeInTheDocument();
    expect(boxes()).toEqual(['Combo LHR + LHM: ão']);

    // The keys: picked again on the board, which names the keys the combo is on.
    await user.click(editor().getByRole('button', { name: 'Pick again on the board' }));
    await user.click(key('Key LHM: d'));
    await user.click(key('Key LHI: f'));
    expect(editor().getByLabelText('Keys picked for combo LHR+LHM')).toHaveTextContent('LHM+LHI');
    await user.click(editor().getByRole('button', { name: 'Use these keys' }));
    await waitFor(() => expect(boxes()).toEqual(['Combo LHM + LHI: ão']));
    expect(combos.getByRole('button', { name: 'Edit LHM+LHI' })).toBeInTheDocument();

    // The layers: chosen from all of the layout's, and never none.
    await user.click(editor().getByLabelText('Numbers'));
    await user.click(editor().getByLabelText('Base'));
    await waitFor(() => expect(boxes()).toEqual([]));
    await user.click(editor().getByLabelText('Numbers'));
    expect(await screen.findByText('a combo needs at least one layer')).toBeInTheDocument();

    // Each change is one edit, and one Undo takes it back.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(boxes()).toEqual(['Combo LHM + LHI: ão']));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(boxes()).toEqual(['Combo LHR + LHM: ão']));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(boxes()).toEqual(['Combo LHR + LHM: Acce']));
  });

  /** The combo editor, opened from the Accents combo's box on the board. */
  const openAccents = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Edit combo LHR + LHM: Acce' }));
    const editor = within(await screen.findByRole('group', { name: 'Edit combo LHR+LHM' }));
    return { editor, tiles: within(editor.getByRole('group', { name: 'Kind of key' })) };
  };
  const pressed = (tiles: ReturnType<typeof within>, kind: string) =>
    waitFor(() =>
      expect(tiles.getByRole('button', { name: kind })).toHaveAttribute('aria-pressed', 'true'),
    );

  it('closes a combo and the keys a panel outlined on a click between the keys, but not a pick', async () => {
    const user = userEvent.setup();
    await openComboEdit();
    const board = screen.getByRole('group', { name: 'Keyboard layout' });
    const outlined = () => document.querySelectorAll('#kb-analyze .lb-key-highlight').length;

    // A combo open in the editor.
    await openAccents(user);
    await user.click(board);
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Edit combo LHR+LHM' })).toBeNull(),
    );

    // A combo open from the strip outlines its keys.
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    const combos = within(screen.getByRole('region', { name: 'Combos' }));
    await user.click(combos.getByRole('button', { name: 'Edit LHR+LHM' }));
    await waitFor(() => expect(outlined()).toBe(2));
    await user.click(board);
    await waitFor(() => expect(outlined()).toBe(0));

    // Keys being picked for a combo are all the board is doing: a click between them keeps the pick.
    await user.click(combos.getByRole('button', { name: 'New combo' }));
    await user.click(key('Key LHM: d'));
    await user.click(board);
    expect(combos.getByLabelText('Combo keys picked')).toHaveTextContent('LHM');
  });

  it('opens a combo from its box, with any kind of key but Transparent', async () => {
    const user = userEvent.setup();
    await openComboEdit();
    const { editor, tiles } = await openAccents(user);
    expect(tiles.getByRole('button', { name: 'Layer' })).toHaveAttribute('aria-pressed', 'true');
    expect(tiles.queryByRole('button', { name: 'Transparent' })).toBeNull();
    expect(editor.queryByRole('combobox', { name: /^Role of combo/ })).toBeNull();
  });

  it("changes a combo's kind from the tiles, one undo for each, with the combo still open", async () => {
    const user = userEvent.setup();
    await openComboEdit();
    const { tiles } = await openAccents(user);
    await user.click(tiles.getByRole('button', { name: 'Tap-hold' }));
    await pressed(tiles, 'Tap-hold');
    await user.click(tiles.getByRole('button', { name: 'Macro' }));
    await pressed(tiles, 'Macro');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await pressed(tiles, 'Tap-hold');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await pressed(tiles, 'Layer');
  });

  it('opens a combo from its row, and gives the inspector back to a key clicked', async () => {
    const user = userEvent.setup();
    await openComboEdit();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    const combos = within(screen.getByRole('region', { name: 'Combos' }));
    await user.click(combos.getByRole('button', { name: 'Edit LHR+LHM' }));
    expect(await screen.findByRole('group', { name: 'Edit combo LHR+LHM' })).toBeInTheDocument();
    await user.click(key('Key LHI: f'));
    expect(screen.queryByRole('group', { name: 'Edit combo LHR+LHM' })).toBeNull();
  });

  it('opens a combo just added in the combo editor, to be built there', async () => {
    const user = userEvent.setup();
    await openEdit();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.click(screen.getByRole('button', { name: 'New combo' }));
    await user.click(key('Key LHM: d'));
    await user.click(key('Key LHI: f'));
    await user.click(screen.getByRole('button', { name: /^Add combo on/ }));

    const editor = within(await screen.findByRole('group', { name: 'Edit combo LHM+LHI' }));
    const tiles = within(editor.getByRole('group', { name: 'Kind of key' }));
    expect(tiles.getByRole('button', { name: 'Nothing' })).toHaveAttribute('aria-pressed', 'true');
    const line = editor.getByLabelText('Binding for combo LHM+LHI');
    await user.clear(line);
    await user.type(line, 'x{Enter}');
    await waitFor(() => expect(boxes()).toContain('Combo LHM + LHI: x'));
    await user.click(tiles.getByRole('button', { name: 'Adaptive' }));
    await pressed(tiles, 'Adaptive');
  });

  it("picks a combo's keys again from the combo editor", async () => {
    const user = userEvent.setup();
    await openComboEdit();
    const { editor } = await openAccents(user);
    await user.click(editor.getByRole('button', { name: 'Pick again on the board' }));
    await user.click(key('Key LHI: f'));
    await user.click(key('Key LHP: a'));
    await user.click(editor.getByRole('button', { name: 'Use these keys' }));
    expect(await screen.findByRole('group', { name: 'Edit combo LHI+LHP' })).toBeInTheDocument();
  });

  it("stops picking a combo's keys again when told to", async () => {
    const user = userEvent.setup();
    await openComboEdit();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    const combos = within(screen.getByRole('region', { name: 'Combos' }));
    await user.click(combos.getByRole('button', { name: 'Edit LHR+LHM' }));
    const editor = () => within(screen.getByRole('group', { name: 'Edit combo LHR+LHM' }));
    await user.click(editor().getByRole('button', { name: 'Pick again on the board' }));
    expect(editor().getByLabelText('Keys picked for combo LHR+LHM')).toHaveTextContent(
      'click the keys',
    );
    // Picking the keys it already has is nothing to change, and ends the pick.
    await user.click(key('Key LHM: d'));
    await user.click(key('Key LHR: s'));
    await user.click(editor().getByRole('button', { name: 'Use these keys' }));
    expect(editor().queryByLabelText('Keys picked for combo LHR+LHM')).toBeNull();
    await user.click(editor().getByRole('button', { name: 'Pick again on the board' }));
    // The card for a new combo is not the one picking.
    expect(combos.getByRole('button', { name: 'New combo' })).toBeInTheDocument();
    await user.click(editor().getByRole('button', { name: 'Cancel' }));
    expect(editor().queryByLabelText('Keys picked for combo LHR+LHM')).toBeNull();
  });

  it('refuses a combo output it cannot read, instead of guessing', async () => {
    const user = userEvent.setup();
    await openComboEdit();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.click(screen.getByRole('button', { name: 'Edit LHR+LHM' }));
    const line = within(screen.getByRole('group', { name: 'Edit combo LHR+LHM' })).getByLabelText(
      'Binding for combo LHR+LHM',
    );
    await user.clear(line);
    await user.type(line, '&mo nowhere{Enter}');

    expect(await screen.findByText(/no layer called/)).toBeInTheDocument();
    expect(boxes()).toEqual(['Combo LHR + LHM: Acce']);
  });

  it('orders its tabs as the guide does, with Configuration where Geometry was', async () => {
    await openMagicRomak();
    const tabs = (screen.getByRole('tab', { name: 'Board' }).closest('[role="tablist"]') ??
      document.body) as HTMLElement;
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent?.trim()),
    ).toEqual([
      'Board',
      'Layers',
      'Combos',
      'Special Behaviors',
      'Typing paths',
      'Configuration',
      'Export',
    ]);
  }, 60_000);

  it('lists Layers and Special Behaviors as cards', async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    const layers = screen.getByRole('list', { name: 'Layers' });
    expect(within(layers).getAllByLabelText(/^Name of layer /)).toHaveLength(5);
    // The two cards that add one more come last.
    const [addLayer, addCondition] = within(layers).getAllByRole('listitem').slice(-2);
    expect(addLayer).toHaveTextContent('New layer');
    expect(addCondition).toHaveTextContent('New condition');
    await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
    const special = within(screen.getByRole('list', { name: 'Special behaviors' }));
    // Only the uses, adaptive keys and alt repeats included: the one-shots are in Configuration.
    expect(special.queryByRole('group', { name: /^One-shot/ })).toBeNull();
    expect(special.getAllByText('Macro').length).toBeGreaterThan(0);
    // Magic Romak's shift key is the mod morph that starts caps word, like any other mod morph.
    expect(special.getAllByText('Mod morph').length).toBeGreaterThan(0);
    expect(special.getAllByText('Adaptive key').length).toBeGreaterThan(0);
  }, 60_000);
});
