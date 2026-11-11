import type { Layout } from '@layerbench/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  bar,
  freshStorage,
  inspector,
  key,
  openMagicRomak,
  saveCopy,
  seed,
  svgKey,
} from '../test/analyze-editing.js';
import { keyNamed, withoutShare } from '../test/keys.js';
import { layerNameEl, showLayer, shownLayer } from '../test/layers.js';
import { qwertyAsWritten } from '../test/qwerty.js';
import { customInLink, renderRoute } from '../test/render.js';

describe('Edit', () => {
  it('reorders a typing path that was never declared', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await user.click(screen.getByRole('tab', { name: 'Typing paths' }));

    const order = () =>
      screen
        .getAllByRole('listitem')
        // A path, not the card of the symbol that holds them.
        .filter((li) => li.querySelector('input[type="checkbox"]') && !li.querySelector('li'))
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
    await showLayer(user, 'Ç extension');
    await user.click(await screen.findByRole('button', { name: /^Key L1:/ }));
    const editor = await inspector('L1');
    expect(within(editor).getByRole('textbox', { name: 'Binding for L1' })).toHaveValue('&sl 1');
    expect(within(editor).getByRole('radio', { name: 'One-shot' })).toBeChecked();
    // Exactly the layer choice: the editor also has an "On Alpha 2 board" button.
    expect(within(editor).getByRole('button', { name: 'Alpha 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText('unsaved')).toBeNull();

    await user.click(within(editor).getByRole('radio', { name: 'Momentary' }));
    expect(
      await screen.findByRole('button', { name: keyNamed('Key L1: hold A2') }),
    ).toBeInTheDocument();
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

  /** The circle that picks a colour for the Symbols layer, in the Layers tab. */
  const symbolsColour = (name: string) =>
    within(screen.getByRole('radiogroup', { name: 'Colour of layer Symbols' })).getByRole('radio', {
      name,
    });

  it('draws a layer in the colour chosen for it, undoes the choice, and saves it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    // The navigator writes the layer's name in the colour its keys are drawn in.
    await showLayer(user, 'Symbols');
    const dot = () => layerNameEl().getAttribute('style');
    // By its place in the list, Symbols is the fourth colour.
    expect(dot()).toContain('var(--lb-layer-4)');

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.click(symbolsColour('Teal'));
    await user.click(screen.getByRole('tab', { name: 'Board' }));
    expect(dot()).toContain('var(--lb-layer-6)');
    expect(screen.getByText('unsaved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(dot()).toContain('var(--lb-layer-4)');
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(symbolsColour('Automatic')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(symbolsColour('Teal')).toBeChecked();

    await saveCopy(user);
    expect(await screen.findByText('Saved Magic Romak copy')).toBeInTheDocument();
    await waitFor(async () => {
      const doc = (await storage.get('layouts', 'magic-romak-copy'))?.doc as unknown as Layout;
      expect(doc.layers.find((l) => l.id === 'sym')?.color).toBe('teal');
    });
  }, 60_000);

  it('offers a layer in the inspector in the colour chosen for it', async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.click(symbolsColour('Teal'));

    // The Ç extension's thumb is a layer key, so its editor offers every layer as a chip.
    await showLayer(user, 'Ç extension');
    await user.click(await screen.findByRole('button', { name: /^Key L1:/ }));
    const editor = await inspector('L1');
    const dot = within(editor)
      .getByRole('button', { name: 'Symbols' })
      .querySelector('span')
      ?.getAttribute('style');
    expect(dot).toContain('var(--lb-layer-6)');
  }, 60_000);

  it('marks on each layer the keys held or tapped to reach it, and follows an edit', async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    // The base layer is always on: nothing reaches it.
    expect(document.querySelector('#kb-analyze .lb-key-reach')).toBeNull();

    await showLayer(user, 'Symbols');
    expect(
      await screen.findByRole('button', {
        name: keyNamed('Key R0: transparent, held to reach Symbols'),
      }),
    ).toBeInTheDocument();
    expect((await screen.findByRole('list', { name: 'Key legend' })).textContent).toContain(
      'held from Alpha 1 or Numbers to reach Symbols',
    );

    // The only way into Ç extension is the ç macro on Alpha 2, and the key says it.
    await showLayer(user, 'Ç extension');
    await user.click(
      await screen.findByRole('button', {
        name: keyNamed('Key LBM: empty, tapped to reach Ç extension'),
      }),
    );
    expect(
      within(await inspector('LBM')).getByText(
        'Tapped from Alpha 2 by the ç macro to reach Ç extension.',
      ),
    ).toBeInTheDocument();

    // Ç extension's L1 re-arms Alpha 2 for one key; made a hold, it is held to get there too.
    await user.click(await screen.findByRole('button', { name: /^Key L1:/ }));
    await user.click(within(await inspector('L1')).getByRole('radio', { name: 'Momentary' }));
    await screen.findByRole('button', { name: keyNamed('Key L1: hold A2') });
    await showLayer(user, 'Alpha 2');
    expect(
      await screen.findByRole('button', {
        name: (name) => /^Key L1: .*, held or tapped to reach Alpha 2$/.test(withoutShare(name)),
      }),
    ).toBeInTheDocument();
  });
});

describe('Special Behaviors', () => {
  it("lists Magic Romak's special features, and picking one shows it on the board", async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    const firstLayer = shownLayer();
    // Reached from the Combos tab with the arrow keys, as any panel is.
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Special Behaviors', selected: true })).toHaveFocus();
    const list = screen.getByRole('region', { name: 'Special features' });
    for (const kind of ['Macro', 'Mod morph'])
      expect(within(list).getAllByText(kind).length).toBeGreaterThan(0);

    // A feature on a layer other than the one shown: its layer turns up, the key selected.
    const place = (b: HTMLElement) => b.querySelector('.font-mono')?.textContent ?? '';
    const keys = within(list)
      .getAllByRole('button')
      .filter((b) => !place(b).startsWith('Combo'));
    const away = keys.find((b) => !place(b).startsWith(`${firstLayer} · `)) ?? keys[0];
    const [layerName, keyId] = place(away).split(' · ');
    // An n-gram outlined from a card gives way to the feature.
    const outlined = () => document.querySelectorAll('#kb-analyze .lb-key-highlight').length;
    await user.click(
      document.querySelector<HTMLButtonElement>('.lb-items li button') as HTMLElement,
    );
    await waitFor(() => expect(outlined()).toBeGreaterThan(0));
    // Back in the list, the feature is picked again: the outline gives way to it.
    const reopen = async (b: HTMLElement) => {
      await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
      const list2 = within(screen.getByRole('region', { name: 'Special features' }));
      return list2.getAllByRole('button').find((x) => place(x) === place(b)) as HTMLElement;
    };
    await user.click(await reopen(away));
    expect(outlined()).toBe(0);
    expect(shownLayer()).toBe(layerName);
    expect(await inspector(keyId)).toBeInTheDocument();
    expect(await reopen(away)).toHaveAttribute('aria-current', 'true');
    // The board is under the strip, as on Combos: the pick did not take the editor to the Board tab.
    expect(screen.getByRole('tab', { name: 'Special Behaviors', selected: true })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Board' })).toBeInTheDocument();

    // Picked while a word plays, a feature stops it, so the board shows the feature.
    await user.click(screen.getByRole('tab', { name: 'Board' }));
    await user.type(screen.getByLabelText('How is this typed?'), 'ação');
    await screen.findByRole('list', { name: 'Presses' }, { timeout: 10_000 });
    const other = keys.find((b) => !place(b).startsWith(`${layerName} · `)) ?? keys[0];
    const [otherLayer] = place(other).split(' · ');
    await user.click(await reopen(other));
    expect(shownLayer()).toBe(otherLayer);

    // A feature on a combo, the à macro, opens its combo as the Combos tab does, its keys outlined
    // and its editor beside the board, and a swap armed gives way.
    const selected = (
      screen.getByRole('group', { name: /^Edit / }).getAttribute('aria-label') ?? ''
    ).replace('Edit ', '');
    await user.click(within(await inspector(selected)).getByRole('button', { name: 'Swap with…' }));
    expect(screen.getByText(/is armed/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
    await user.click(
      within(screen.getByRole('region', { name: 'Special features' })).getByRole('button', {
        name: /^Combo agrave/,
      }),
    );
    await waitFor(() =>
      expect(document.querySelectorAll('#kb-analyze .lb-key-highlight').length).toBeGreaterThan(1),
    );
    expect(screen.queryByText(/is armed/)).toBeNull();
    expect(await screen.findByRole('group', { name: /^Edit combo / })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Special Behaviors', selected: true })).toBeVisible();

    // Picked while a combo's keys are being picked, a feature ends the pick.
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.click(screen.getAllByRole('button', { name: /^Edit [A-Z0-9]+\+[A-Z0-9]+$/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Pick again on the board' }));
    expect(screen.getByText(/^Picking keys for a combo:/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
    await user.click(
      within(screen.getByRole('region', { name: 'Special features' })).getAllByRole('button')[0],
    );
    expect(screen.queryByText(/^Picking keys for a combo:/)).toBeNull();
  }, 60_000);

  it('says so when a layout has no special features', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
    expect(
      screen.getByText(
        'This layout has no adaptive keys, alt repeats, macros, mod morphs or sentence spaces.',
      ),
    ).toBeInTheDocument();
  }, 60_000);
});

describe('Special Behaviors, adaptive keys and alt repeats', () => {
  it("lists Magic Romak's adaptive keys and alt repeat with its other uses, and picking one shows it", async () => {
    const user = userEvent.setup();
    await openMagicRomak();
    const firstLayer = shownLayer();
    await user.click(screen.getByRole('tab', { name: 'Special Behaviors' }));
    const list = within(screen.getByRole('list', { name: 'Special behaviors' }));
    for (const kind of ['Adaptive key', 'Alt repeat', 'Macro', 'Mod morph'])
      expect(list.getAllByText(kind).length).toBeGreaterThan(0);

    // The alt repeat is on L1 of the first layer: the board shows it with the key selected.
    const altRepeat = list
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('Alt repeat')) as HTMLElement;
    await user.click(altRepeat);
    expect(shownLayer()).toBe(firstLayer);
    expect(await inspector('L1')).toBeInTheDocument();
    // On the board under the strip, on this tab, as Special Behaviors shows its own.
    expect(screen.getByRole('tab', { name: 'Special Behaviors', selected: true })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Board' })).toBeInTheDocument();
  }, 60_000);
});

describe('Analyze, while editing', () => {
  it("shows a selected key's numbers on the layer shown, and what a layer key was pressed for", async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await user.click(screen.getByRole('button', { name: /^Key R0:/ }));
    // In a section of their own, right above the summary, not in the key's editor.
    const numbers = await screen.findByRole('region', { name: 'Key numbers' });
    expect(within(numbers).getByRole('heading', { name: /^Its numbers on / })).toBeInTheDocument();
    expect(
      numbers.compareDocumentPosition(screen.getByRole('region', { name: 'Summary' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(await inspector('R0')).queryByRole('list', { name: /^Parts of / })).toBeNull();
    const parts = within(numbers).getByRole('list', { name: /^Parts of R0 on / });
    expect(within(parts).getByText('Effort')).toBeInTheDocument();
    expect(
      await within(numbers).findByText('Pressed for:', undefined, { timeout: 10_000 }),
    ).toBeInTheDocument();

    // Escape in them closes the key, as in its editor, and with nothing selected they are gone.
    await user.click(within(numbers).getByRole('button', { name: /^Every number/ }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Key numbers' })).toBeNull());
    expect(screen.getByRole('button', { name: /^Key R0:/ })).toHaveFocus();
  }, 60_000);

  it("opens what a layer key was pressed for from a pair in a key's numbers", async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    // A pair a card lists as ending on a layer key, such as `t→A2`, and the key it starts on.
    const card = [...document.querySelectorAll<HTMLButtonElement>('.lb-items li button')].find(
      (b) => b.getAttribute('aria-haspopup') === 'dialog',
    );
    const letter = card?.textContent?.split('→')[0] ?? '';
    expect(letter).not.toBe('');
    const first = screen
      .getAllByRole('button', { name: /^Key \w+: / })
      // The letter alone, or the letter and what a home block mod holds there.
      .find((b) => {
        const label = withoutShare(b.getAttribute('aria-label') ?? '');
        return label.endsWith(`: ${letter}`) || label.includes(`: ${letter}, hold `);
      });
    await user.click(first as HTMLElement);
    const editor = await screen.findByRole('region', { name: 'Key numbers' });

    // Open the key's parts until one lists that pair, which opens the same popup.
    const parts = await within(editor).findByRole('list', { name: /^Parts of / });
    await waitFor(
      () =>
        expect(within(parts).queryAllByRole('button', { expanded: false }).length).toBeGreaterThan(
          0,
        ),
      { timeout: 10_000 },
    );
    // The pair may be in a number the key shows only with the rest of them.
    await user.click(within(editor).getByRole('button', { name: /^Every number/ }));
    let ending: HTMLElement | undefined;
    for (const part of within(editor)
      .getByRole('list', { name: /^Parts of / })
      .querySelectorAll<HTMLElement>('button[aria-expanded="false"]')) {
      await user.click(part);
      ending = within(editor)
        .queryAllByRole('list', { name: / through / })
        .flatMap((list) => within(list).queryAllByRole('button'))
        .find((b) => b.getAttribute('aria-haspopup') === 'dialog');
      if (ending) break;
    }
    expect(ending, 'a pair through the key that ends on a layer key').toBeDefined();
    // The row names the keys of the pair, as a card's does.
    expect(ending?.getAttribute('title')).toMatch(/ → /);
    await user.click(ending as HTMLElement);
    const dialog = await screen.findByRole('dialog', {
      name: new RegExp(`^${ending?.textContent}`),
    });
    expect(within(dialog).getByRole('list', { name: 'Keys pressed next' })).toBeInTheDocument();
  }, 60_000);

  it('asks before another layout replaces unsaved edits', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });

    const picker = within(bar()).getByRole('combobox', { name: 'Layout' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.selectOptions(picker, 'colemak');
    expect(confirm).toHaveBeenCalled();
    expect(key('Key LHM: ç')).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.selectOptions(picker, 'colemak');
    expect(
      await screen.findByRole('button', { name: keyNamed('Key LHM: s') }, { timeout: 25_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('unsaved')).toBeNull();
    confirm.mockRestore();
  }, 60_000);

  it('lists every character of the text the layout cannot type', async () => {
    await openPlain();
    const list = tray();
    expect(within(list).getByRole('button', { name: /^ã/ })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /^ç/ })).toBeInTheDocument();
  }, 60_000);
});

/**
 * Open Analyze on Qwerty as written, with no way to the accents, on Portuguese, and wait for the
 * missing-keys tray.
 */
async function openPlain(): Promise<void> {
  // Every bundled layout reaches the accents, through Accents or Magic Romak's dead keys; Qwerty as
  // written does not.
  const storage = freshStorage();
  const plain = qwertyAsWritten();
  await seed(storage, 'qwerty', 'plain', { name: 'Plain', layers: plain.layers });
  renderRoute('/analyze?layout=custom%3Aplain&corpus=pt-br-general&sample=20000', { storage });
  await screen.findByRole('list', { name: 'Missing keys' }, { timeout: 25_000 });
}

const tray = () => screen.getByRole('list', { name: 'Missing keys' });
/** The chip of the tray for `char`, or null when the tray does not have it. */
const chip = (char: string) =>
  within(tray()).queryByRole('button', { name: new RegExp(`^${char}(,|$)`) });

/** Drag a chip of the tray onto a key of the board, the way a pointer does it. */
function dragChip(from: HTMLElement, to: string): void {
  const target = svgKey(to);
  const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => target);
  const at = (type: string, x: number) =>
    from.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: x,
        isPrimary: true,
      }) as Event & PointerEvent,
    );
  at('pointerdown', 1);
  at('pointermove', 20);
  at('pointerup', 20);
  elementFromPoint.mockRestore();
}

describe('the missing-keys tray', () => {
  it('puts a character dragged onto a key, and the one it displaces in the tray', async () => {
    const user = userEvent.setup();
    await openPlain();
    expect(chip('d')).toBeNull();

    dragChip(chip('ç') as HTMLElement, 'LHM');
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: ç') })).toBeInTheDocument();
    // Nothing else types d now: it waits in the tray, and ç is not missing any more.
    expect(chip('d')).toBeInTheDocument();
    expect(chip('ç')).toBeNull();

    // One edit: one Undo brings d back, and the tray as it was.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(key('Key LHM: d')).toBeInTheDocument();
    expect(chip('ç')).toBeInTheDocument();
    expect(chip('d')).toBeNull();
  }, 60_000);

  it('puts a character tapped on the next key tapped', async () => {
    const user = userEvent.setup();
    await openPlain();
    const cedilla = chip('ç') as HTMLElement;
    await user.click(cedilla);
    expect(cedilla).toHaveAttribute('aria-pressed', 'true');

    await user.click(key('Key LHM: d'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: ç') })).toBeInTheDocument();
    expect(chip('d')).toHaveAttribute('aria-pressed', 'false');

    // The character it displaced goes back the same way, on another key.
    await user.click(chip('d') as HTMLElement);
    await user.click(key('Key LHI: f'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHI: d') })).toBeInTheDocument();
    expect(chip('f')).toBeInTheDocument();
    expect(chip('d')).toBeNull();
  }, 60_000);

  it('puts a character armed on a key picked from the keyboard, and Escape puts it down', async () => {
    const user = userEvent.setup();
    await openPlain();
    const cedilla = chip('ç') as HTMLElement;
    await user.click(cedilla);
    await user.keyboard('{Escape}');
    expect(cedilla).toHaveAttribute('aria-pressed', 'false');

    await user.click(cedilla);
    key('Key LHM: d').focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: ç') })).toBeInTheDocument();
  }, 60_000);

  it('puts a character tapped down on a click between the keys', async () => {
    const user = userEvent.setup();
    await openPlain();
    const cedilla = chip('ç') as HTMLElement;
    await user.click(cedilla);
    await user.click(screen.getByRole('group', { name: 'Keyboard layout' }));
    expect(cedilla).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/is armed/)).toBeNull();
  }, 60_000);

  it('takes a finger tap that wanders a little on a chip as a tap', async () => {
    await openPlain();
    const cedilla = chip('ç') as HTMLElement;
    const at = (type: string, x: number) =>
      cedilla.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX: x,
          clientY: x,
          isPrimary: true,
          pointerType: 'touch',
        }) as Event & PointerEvent,
      );
    at('pointerdown', 10);
    at('pointermove', 16);
    at('pointerup', 16);
    fireEvent.click(cedilla);
    expect(cedilla).toHaveAttribute('aria-pressed', 'true');
  }, 60_000);

  it('arms a swap with Alt+S without putting the character armed on the key', async () => {
    const user = userEvent.setup();
    await openPlain();
    const cedilla = chip('ç') as HTMLElement;
    await user.click(cedilla);
    key('Key LHM: d').focus();
    await user.keyboard('{Alt>}s{/Alt}');
    expect(key('Key LHM: d')).toBeInTheDocument();
    expect(cedilla).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/is armed — tap the key to swap it with/)).toBeInTheDocument();
  }, 60_000);
});

describe('the layouts Analyze offers', () => {
  it('lists the custom layouts beside the bundled ones, and opens one picked', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'colemak-dh', 'my-colemak', { name: 'My Colemak' });
    const { currentSearch } = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      storage,
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    const picker = within(bar()).getByRole('combobox', { name: 'Layout' });
    const option = await within(picker).findByRole('option', { name: 'My Colemak' });
    expect(option.closest('optgroup')).toHaveAttribute('label', 'Custom');

    await user.selectOptions(picker, 'custom:my-colemak');
    await waitFor(async () => expect(await customInLink(currentSearch())).toBe('my-colemak'));
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('My Colemak'), {
      timeout: 25_000,
    });
  }, 60_000);
});
