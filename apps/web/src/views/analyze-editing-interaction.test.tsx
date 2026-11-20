import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
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
import { keyNamed } from '../test/keys.js';
import { showLayer, shownLayer } from '../test/layers.js';
import { setPointerKind, setViewportWidth } from '../test/setup.js';

describe('Edit', () => {
  it('makes a home-row mod out of a letter', async () => {
    const user = userEvent.setup();
    await openEditWithDefaults();

    await user.click(key('Key LHC: g'));
    await user.click(within(await inspector('LHC')).getByRole('button', { name: 'Tap-hold' }));
    // A letter keeps its tap; a layer is the first thing a hold is given.
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHC: g, hold Numb') }),
    ).toBeInTheDocument();

    await user.selectOptions(
      within(await inspector('LHC')).getByLabelText('Hold kind'),
      'modifier',
    );
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHC: g, hold ⇧') }),
    ).toBeInTheDocument();
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
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHM: d, hold !') }),
    ).toBeInTheDocument();
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
      expect(
        screen.getAllByRole('button', { name: keyNamed('Key LHM: d', 'Key LHI: d') }),
      ).toHaveLength(2);
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
    await user.click(await screen.findByRole('button', { name: keyNamed('Key LHM: d') }));

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Send LHM to another layer' }),
      'Nav',
    );

    // The view follows the binding to the layer it landed on, and the source is left empty. Nothing
    // is left selected, and the board has focus, on the key there.
    await waitFor(() => expect(shownLayer()).toBe('Nav'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: d') })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Edit / })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(svgKey('LHM')));
    await showLayer(user, 'Base');
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHM: empty') }),
    ).toBeInTheDocument();
  }, 90_000);

  it('sends keys picked with Shift to another layer together, and one Undo takes them all back', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Nav');
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await showLayer(user, 'Base');

    await user.click(await screen.findByRole('button', { name: keyNamed('Key LHM: d') }));
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
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: d') })).toBeInTheDocument();
    expect(key('Key LHI: f')).toBeInTheDocument();
    expect(key('Key LHR: transparent')).toBeInTheDocument();
    // Nothing is left selected, the board focused on the first of them.
    expect(screen.queryByRole('group', { name: 'Edit 2 keys' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(svgKey('LHM')));

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(shownLayer()).toBe('Base'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: d') })).toBeInTheDocument();
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
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHM: empty') }),
    ).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: q') })).toBeInTheDocument();
  });

  it('takes back an edit, and puts it back again', async () => {
    const user = userEvent.setup();
    await openEdit();

    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });

    await user.keyboard('{Control>}z{/Control}');
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: d') })).toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: ç') })).toBeInTheDocument();

    // A finger has no Ctrl+Z, so the same is a button away.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: d') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: ç') })).toBeInTheDocument();
  });

  it('puts away whatever is picked on a click between the keys, but not after a swipe', async () => {
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
    // A drop puts the selection away itself, the board focused on the key dropped on. (That the
    // board swallows the click its release sends is Keyboard.test.tsx's.)
    await dragKey('LTR', 'LTM');
    expect(await screen.findByRole('button', { name: keyNamed('Key LTR: e') })).toBeInTheDocument();
    await waitFor(() => expect(editing()).toBeNull());
    expect(document.activeElement).toBe(svgKey('LTM'));
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

    await user.click(await screen.findByRole('button', { name: keyNamed('Key LHM: d') }));
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
    await screen.findByRole('button', { name: keyNamed('Key LHM: f') });

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
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHM: hold Numb') }),
    ).toBeInTheDocument();
    // Said by its hold, since it taps nothing.
    expect(screen.getByText('LHM set to hold Numb')).toBeInTheDocument();

    await user.click(within(await inspector('LHM')).getByRole('radio', { name: 'One-shot' }));
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHM: Numb (1×)') }),
    ).toBeInTheDocument();
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
      expect(
        screen.getAllByRole('button', { name: keyNamed('Key LHM: d', 'Key LHI: d') }),
      ).toHaveLength(2);
    });
  });

  it('copies to a key of another layer, tapped after turning the board to it', async () => {
    setPointerKind('touch');
    const user = userEvent.setup();
    await openEditWithDefaults();

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Copy to…' }));
    await showLayer(user, 'Numbers');
    // Still armed, and the hint says where the key armed is, the board showing another layer.
    expect(screen.getByText(/on Base is armed — tap the key to copy it onto/)).toBeInTheDocument();
    await user.click(svgKey('LHI'));

    expect(await screen.findByRole('button', { name: keyNamed('Key LHI: d') })).toBeInTheDocument();
    expect(shownLayer()).toBe('Numbers');
    expect(screen.queryByText(/is armed/)).toBeNull();
    // Read out with where each key is, the board showing only Numbers.
    expect(screen.getByText('LHM on Base copied to LHI on Numbers')).toBeInTheDocument();
    await showLayer(user, 'Base');
    expect(key('Key LHM: d')).toBeInTheDocument();
  }, 90_000);

  it('selects nothing once Swap with… or Copy to… lands, the page left on the board', async () => {
    // A phone: the editor opens under the board, and is brought into view when a key is selected.
    setPointerKind('touch');
    setViewportWidth(390);
    const user = userEvent.setup();
    await openEdit();
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => scrolled.mockRestore());
    const toEditor = () =>
      scrolled.mock.contexts.filter((el) => (el as Element).matches('.lb-edit-inspector')).length;
    const editing = () => screen.queryByRole('group', { name: /^Edit / });

    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Swap with…' }));
    expect(toEditor()).toBeGreaterThan(0);
    scrolled.mockClear();
    await user.click(key('Key LHI: f'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHI: d') })).toBeInTheDocument();
    // Nothing is left selected, so the page stays on the board rather than going to the editor.
    // (The tap itself focuses the key tapped; the focus a move hands back is the Send and drop
    // tests'.)
    expect(editing()).toBeNull();
    expect(document.activeElement).toBe(svgKey('LHI'));
    expect(toEditor()).toBe(0);

    await user.click(key('Key LHI: d'));
    await user.click(within(await inspector('LHI')).getByRole('button', { name: 'Copy to…' }));
    scrolled.mockClear();
    await user.click(key('Key LHR: s'));
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: keyNamed('Key LHI: d', 'Key LHR: d') }),
      ).toHaveLength(2);
    });
    expect(editing()).toBeNull();
    expect(document.activeElement).toBe(svgKey('LHR'));
    expect(toEditor()).toBe(0);

    // One Undo takes the copy back, and the key copied is selected again.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHR: s') })).toBeInTheDocument();
    expect(await inspector('LHI')).toBeInTheDocument();
  }, 90_000);

  /** The page scrolled to, in a run that spies on `scrollIntoView`: how many times each element. */
  const scrollsTo = (spy: { mock: { contexts: unknown[] } }, selector: string) =>
    spy.mock.contexts.filter((el) => (el as Element).matches(selector)).length;

  it.each([
    ['on a phone', 390],
    ['at a desk', 1280],
  ])(
    'brings the whole board into view when Swap with… or Copy to… is tapped, %s',
    async (_where, width) => {
      // The next step is a tap on the board, which the page can have been scrolled away from: to the
      // editor under it on a phone, or to whatever was being read at a desk.
      setPointerKind(width < 1024 ? 'touch' : 'mouse');
      setViewportWidth(width);
      const user = userEvent.setup();
      await openEdit();
      const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
      onTestFinished(() => scrolled.mockRestore());
      const toBoard = () => scrollsTo(scrolled, '.lb-board-area');

      await user.click(key('Key LHM: d'));
      scrolled.mockClear();
      await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Swap with…' }));
      expect(toBoard()).toBe(1);
      // As little as it takes: the card as it is, clear of the header by its own margin.
      expect(scrolled.mock.calls.at(-1)?.[0]).toMatchObject({ block: 'nearest' });

      // Asked again, after the page was scrolled away, it scrolls again: the button is the ask.
      await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Copy to…' }));
      expect(toBoard()).toBe(2);
      expect(scrolled.mock.contexts.at(-1)).toBe(document.querySelector('.lb-board-area'));

      // The tap that lands the copy is no ask: the key it lands on is what comes back into view.
      scrolled.mockClear();
      await user.click(key('Key LHI: f'));
      await waitFor(() => {
        expect(
          screen.getAllByRole('button', { name: keyNamed('Key LHM: d', 'Key LHI: d') }),
        ).toHaveLength(2);
      });
      expect(toBoard()).toBe(0);
    },
    90_000,
  );

  it('shows the board from its top when it is taller than the screen', async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    await openEdit();
    await user.click(key('Key LHM: d'));
    const box = Element.prototype.getBoundingClientRect;
    const drawn = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.matches('.lb-board-area')
        ? DOMRect.fromRect({ x: 0, y: 0, width: 390, height: window.innerHeight + 200 })
        : box.call(this);
    });
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => {
      drawn.mockRestore();
      scrolled.mockRestore();
    });

    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Swap with…' }));
    // Not all of it fits, and its top, the keys, is what the tap that follows is made on.
    expect(scrolled.mock.calls.at(-1)?.[0]).toMatchObject({ block: 'start' });
    expect(scrolled.mock.contexts.at(-1)).toBe(document.querySelector('.lb-board-area'));
  }, 90_000);

  it("brings the whole board into view when a combo's keys are to be picked on it", async () => {
    setPointerKind('touch');
    setViewportWidth(390);
    const user = userEvent.setup();
    await openComboEdit();
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    const combos = within(screen.getByRole('region', { name: 'Combos' }));
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => scrolled.mockRestore());

    scrolled.mockClear();
    await user.click(combos.getByRole('button', { name: 'New combo' }));
    expect(scrollsTo(scrolled, '.lb-board-area')).toBe(1);
    await user.click(combos.getByRole('button', { name: 'Cancel' }));

    // A combo's card is a pick too: it is shown on the board, which is what the page is left on.
    scrolled.mockClear();
    await user.click(combos.getByRole('button', { name: 'Edit LHR+LHM' }));
    expect(scrollsTo(scrolled, '.lb-board-area')).toBe(1);

    scrolled.mockClear();
    const editor = within(screen.getByRole('group', { name: 'Edit combo LHR+LHM' }));
    await user.click(editor.getByRole('button', { name: 'Pick again on the board' }));
    expect(scrollsTo(scrolled, '.lb-board-area')).toBe(1);
  }, 90_000);

  it('brings the whole board into view when a missing key is armed on it', async () => {
    setPointerKind('touch');
    setViewportWidth(390);
    const user = userEvent.setup();
    await openEdit();
    const chip = within(await screen.findByRole('list', { name: 'Missing keys' })).getAllByRole(
      'button',
    )[0];
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => scrolled.mockRestore());

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(scrollsTo(scrolled, '.lb-board-area')).toBe(1);

    // A second tap puts the character down again, which waits for no tap on the board.
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(scrollsTo(scrolled, '.lb-board-area')).toBe(1);
  }, 90_000);

  it("leaves the page on the board, not the key's editor, when a use is picked in Special Behaviors", async () => {
    // A key picked there is selected, which on a phone brings its editor, under the board, into
    // view; the board is what the card is for, so it is the last the page is taken to.
    setPointerKind('touch');
    setViewportWidth(390);
    const user = userEvent.setup();
    await openMagicRomak();
    await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => scrolled.mockRestore());

    const card = within(screen.getByRole('list', { name: 'Special behaviors' })).getAllByRole(
      'button',
      { name: / · [LR][HBT][A-Z]/ },
    )[0];
    await user.click(card);
    expect(scrollsTo(scrolled, '.lb-edit-inspector')).toBeGreaterThan(0);
    expect(scrolled.mock.contexts.at(-1)).toBe(document.querySelector('.lb-board-area'));
  }, 90_000);

  it('leaves the page where it is when Undo or Redo bring a selection back', async () => {
    // A phone: selecting a key brings its editor, under the board, into view. Undo and Redo are
    // above the board, and a tap on one is no wish to be taken down to the editor.
    setPointerKind('touch');
    setViewportWidth(390);
    const user = userEvent.setup();
    await openEdit();
    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Swap with…' }));
    await user.click(key('Key LHI: f'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHI: d') })).toBeInTheDocument();
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => scrolled.mockRestore());

    // Undo takes the swap back and the key swapped is selected again, the page left alone.
    scrolled.mockClear();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await inspector('LHM')).toBeInTheDocument();
    expect(scrolled).not.toHaveBeenCalled();

    // Redo puts it forward again: nothing selected, and the page left alone as well.
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHI: d') })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Edit / })).toBeNull();
    expect(scrolled).not.toHaveBeenCalled();

    // A key picked after that is the user's own pick, and its editor is brought into view as ever.
    await user.click(key('Key LHM: f'));
    expect(await inspector('LHM')).toBeInTheDocument();
    expect(scrollsTo(scrolled, '.lb-edit-inspector')).toBeGreaterThan(0);
  }, 90_000);

  it('brings the key back into view on a phone once a move lands, though it had focus all along', async () => {
    setPointerKind('touch');
    setViewportWidth(390);
    const user = userEvent.setup();
    await openEdit();
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Nav');
    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await showLayer(user, 'Base');
    await user.click(await screen.findByRole('button', { name: keyNamed('Key LHM: d') }));
    // The tap focused the key, and the list is picked from with focus left there, as a test driver
    // picks: focusing the key again moves nothing, so focus alone would leave the page where it is,
    // scrolled down to the editor and the key out of sight above.
    expect(document.activeElement).toBe(svgKey('LHM'));
    const box = Element.prototype.getBoundingClientRect;
    const drawn = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.matches('[data-key="LHM"]')
        ? DOMRect.fromRect({ x: 10, y: -600, width: 40, height: 40 })
        : box.call(this);
    });
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => {
      drawn.mockRestore();
      scrolled.mockRestore();
    });
    const send = await screen.findByRole('combobox', { name: 'Send LHM to another layer' });
    const nav = within(send).getByRole('option', { name: 'Nav' }) as HTMLOptionElement;
    fireEvent.change(send, { target: { value: nav.value } });

    await waitFor(() => expect(shownLayer()).toBe('Nav'));
    expect(screen.queryByRole('group', { name: /^Edit / })).toBeNull();
    expect(document.activeElement).toBe(svgKey('LHM'));
    expect(scrolled.mock.contexts).toContain(svgKey('LHM'));
  }, 90_000);

  it('cancels a swap with Escape in the editor or the key numbers, the key staying selected', async () => {
    const user = userEvent.setup();
    await openEdit();

    await user.click(key('Key LHM: d'));
    const swap = within(await inspector('LHM')).getByRole('button', { name: 'Swap with…' });
    await user.click(swap);
    expect(screen.getByText(/is armed/)).toBeInTheDocument();
    // Focus is still on the button that armed it, in the editor.
    expect(document.activeElement).toBe(swap);
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/is armed/)).toBeNull();
    expect(await inspector('LHM')).toBeInTheDocument();
    // The next Escape closes the editor, focus back on the key.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('group', { name: /^Edit / })).toBeNull());
    expect(document.activeElement).toBe(svgKey('LHM'));

    // In the key's numbers, the same.
    await user.click(key('Key LHM: d'));
    await user.click(within(await inspector('LHM')).getByRole('button', { name: 'Swap with…' }));
    const numbers = await screen.findByRole('region', { name: 'Key numbers' });
    fireEvent.keyDown(numbers, { key: 'Escape' });
    expect(screen.queryByText(/is armed/)).toBeNull();
    expect(await inspector('LHM')).toBeInTheDocument();
    fireEvent.keyDown(numbers, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('group', { name: /^Edit / })).toBeNull());

    // A missing key tapped, waiting for its key, is put down the same way.
    await user.click(key('Key LHM: d'));
    const chip = within(await screen.findByRole('list', { name: 'Missing keys' })).getAllByRole(
      'button',
    )[0];
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(await inspector('LHM'), { key: 'Escape' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(await inspector('LHM')).toBeInTheDocument();
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
