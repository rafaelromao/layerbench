import { type Binding, bindingModule, compileLayout, type Layout } from '@layerbench/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BehaviorsPanel,
  CombosPanel,
  ConfigurationPanel,
  ExportPanel,
  LayersPanel,
  PathsPanel,
} from './panels.js';
import { initialState } from './reducer.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [
    {
      id: 'base',
      name: 'Base',
      bindings: { LHM: kp('a'), LHI: kp('b'), RHM: kp('c'), RHI: kp('d') },
    },
    { id: 'num', name: 'Numbers', bindings: { '*': { kind: 'trans' }, LHM: kp('1') } },
    { id: 'sym', name: 'Symbols', bindings: { '*': { kind: 'trans' }, LHM: kp('!') } },
  ],
  combos: [
    { keys: ['LHM', 'LHI'], binding: kp('q') },
    { keys: ['RHM', 'RHI'], binding: kp('z') },
  ],
};
const state = initialState(layout, compileLayout(layout));

/** The layout with a key that morphs on shift, a special behavior. */
const morphing: Layout = {
  ...layout,
  layers: [
    {
      ...layout.layers[0],
      bindings: {
        ...layout.layers[0].bindings,
        LHP: { kind: 'mod_morph', mods: ['LSHIFT'], default: kp('x'), morphed: kp('y') },
      },
    },
    ...layout.layers.slice(1),
  ],
};

const producers = {
  a: [
    { id: 'LHM', kind: 'key', cost: 1 },
    { id: 'LHI+LHM', kind: 'combo', cost: 2 },
  ],
  ' ': [
    { id: 'R0', kind: 'key', cost: 1 },
    { id: 'L0', kind: 'key', cost: 1 },
  ],
};

describe('every panel but the Board and the board of Combos is a carousel', () => {
  const send = vi.fn();
  const panels: [string, () => React.ReactElement][] = [
    ['Layers', () => <LayersPanel state={state} send={send} />],
    ['Configuration', () => <ConfigurationPanel state={state} send={send} />],
    ['Combos', () => <CombosPanel state={state} send={send} />],
    ['Special Behaviors', () => <BehaviorsPanel state={state} send={send} />],
    ['Typing paths', () => <PathsPanel state={state} send={send} producers={producers} />],
    ['Export', () => <ExportPanel state={state} send={send} />],
  ];
  it.each(panels)('%s', (_name, panel) => {
    const { container } = render(panel());
    const strips = container.querySelectorAll('.lb-carousel');
    expect(strips).toHaveLength(1);
    // Scrollable by keyboard, and every item of it a slide.
    expect(strips[0]).toHaveAttribute('tabindex', '0');
    const items = [...strips[0].children];
    expect(items.length).toBeGreaterThan(0);
    // Not `lb-card`, which the Numbers' metric cards are too: a slide's fixed size would cut them.
    for (const item of items) {
      expect(item).toHaveClass('lb-slide');
      expect(item).not.toHaveClass('lb-card');
    }
  });
});

describe('the Layers carousel', () => {
  it('ends with the cards that add a layer and a condition', () => {
    render(<LayersPanel state={state} send={vi.fn()} />);
    const items = within(screen.getByRole('list', { name: 'Layers' })).getAllByRole('listitem');
    expect(items).toHaveLength(3 + 2);
    expect(items[3]).toHaveTextContent('New layer');
    expect(items[4]).toHaveTextContent('New condition');
  });

  it('adds a layer, named or not, from its card', async () => {
    const send = vi.fn();
    render(<LayersPanel state={state} send={send} />);
    await userEvent.setup().type(screen.getByLabelText('New layer name'), 'Nav');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add layer' }));
    expect(send).toHaveBeenCalledWith({ type: 'edit', edit: { kind: 'addLayer', name: 'Nav' } });
  });

  it('adds a layer with no name too, which the layout then names', async () => {
    const send = vi.fn();
    render(<LayersPanel state={state} send={send} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add layer' }));
    expect(send).toHaveBeenCalledWith({ type: 'edit', edit: { kind: 'addLayer', name: '' } });
  });

  it('adds a condition from its card, and says why when there is no layer for one', async () => {
    const send = vi.fn();
    const { unmount } = render(<LayersPanel state={state} send={send} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'New condition' }));
    expect(send.mock.calls[0][0].edit.kind).toBe('addConditionalLayer');
    unmount();
    const two: Layout = { ...layout, layers: layout.layers.slice(0, 2) };
    render(<LayersPanel state={initialState(two, compileLayout(two))} send={send} />);
    expect(screen.getByRole('button', { name: 'New condition' })).toBeDisabled();
    expect(screen.getByText(/needs two layers besides the base one/)).toBeInTheDocument();
  });
});

describe('the Typing paths carousel', () => {
  it('begins with how a capital and a doubled letter are typed, ahead of the characters', async () => {
    const send = vi.fn();
    // A layout with a shift key, so there is a kind of shift to set.
    const shifted: Layout = {
      ...layout,
      keys: { ...layout.keys, shift: { key: 'R1', kind: 'sk' } },
      layers: [
        {
          ...layout.layers[0],
          bindings: { ...layout.layers[0].bindings, R1: { kind: 'sk', mod: 'LSHIFT' } },
        },
        ...layout.layers.slice(1),
      ],
    };
    const s = initialState(shifted, compileLayout(shifted));
    render(<PathsPanel state={s} send={send} producers={producers} />);
    const items = within(screen.getByRole('list', { name: 'Typing paths' })).getAllByRole(
      'listitem',
    );
    expect(items[0]).toHaveTextContent('Shift kind');
    expect(items[1]).toHaveTextContent('Doubled letters');
    const user = userEvent.setup();
    // A layout that says nothing about repeats has the repeat key.
    expect(screen.getByLabelText('Shift kind')).toHaveValue('sk');
    expect(screen.getByLabelText('Doubled letters')).toHaveValue('repeatKey');
    await user.selectOptions(screen.getByLabelText('Shift kind'), 'hold');
    expect(send).toHaveBeenLastCalledWith({
      type: 'edit',
      edit: { kind: 'setKeys', shiftKind: 'hold' },
    });
    await user.selectOptions(screen.getByLabelText('Doubled letters'), 'tapTwice');
    expect(send).toHaveBeenLastCalledWith({
      type: 'edit',
      edit: { kind: 'setKeys', repeat: 'tapTwice' },
    });
  });

  it('has no kind of shift to set on a layout with no shift key, and says why', () => {
    render(<PathsPanel state={state} send={vi.fn()} producers={producers} />);
    const select = screen.getByLabelText('Shift kind');
    expect(select).toBeDisabled();
    // The reason is the select's description, for whoever cannot see the card.
    expect(select).toHaveAccessibleDescription(/no shift key/);
    expect(screen.getByLabelText('Doubled letters')).toBeEnabled();
  });

  it('draws each character on a key at the left of its slide', () => {
    render(<PathsPanel state={state} send={vi.fn()} producers={producers} />);
    const cards = within(screen.getByRole('list', { name: 'Typing paths' })).getAllByRole(
      'heading',
    );
    expect(cards.map((h) => h.textContent)).toEqual(['␣', 'a']);
    for (const key of cards) {
      expect(key).toHaveClass('lb-keycap');
      // The key comes first in its card, the ways to type it after.
      expect(key.parentElement?.firstElementChild).toBe(key);
    }
  });
});

/**
 * A strip 300 wide, as the browser would lay it out, with the second combo's slide past its edge, or
 * the slide of the behavior at `farAt` (by its place) when it is a strip of behaviors. Done before a
 * panel is rendered, it is what its effects measure as they mount.
 */
function mockLayout(farAt = 'base RHP') {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('lb-carousel') ? 300 : 0;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('lb-carousel')) return { left: 0, width: 300 } as DOMRect;
    const { combo, layer, at } = (this as HTMLElement).dataset;
    if (combo === '1' || layer === '3' || at === farAt) {
      return { left: 900, width: 176 } as DOMRect;
    }
    return { left: 0, width: 0 } as DOMRect;
  });
}

/** The same, for a strip already rendered, which is given a `scrollTo` to look at. */
function layOut(strip: HTMLElement, farAt = 'base RHP') {
  const scrollTo = vi.fn();
  strip.scrollTo = scrollTo;
  mockLayout(farAt);
  return scrollTo;
}

describe('a combo picked in its card', () => {
  it('asks for the board to turn to the first layer the combo works on', async () => {
    const send = vi.fn();
    const everywhere = layout.combos?.[0];
    const only: Layout = {
      ...layout,
      combos: [everywhere, { ...layout.combos?.[1], layers: ['sym', 'num'] }] as Layout['combos'],
    };
    render(<CombosPanel state={initialState(only, compileLayout(only))} send={send} />);
    const user = userEvent.setup();
    // A combo with no layers works on every layer: the first is the base layer, as its card draws it.
    await user.click(screen.getByRole('button', { name: 'Edit LHM+LHI' }));
    expect(send).toHaveBeenLastCalledWith({ type: 'selectCombo', combo: 0, layer: 0 });
    // Its list names the layers, and the first named is the one: Symbols, not Numbers.
    await user.click(screen.getByRole('button', { name: 'Edit RHM+RHI' }));
    expect(send).toHaveBeenLastCalledWith({ type: 'selectCombo', combo: 1, layer: 2 });
  });

  it('closes the combo, and leaves the board where it is, when the open one is picked again', async () => {
    const send = vi.fn();
    render(<CombosPanel state={{ ...state, combo: 0, comboPicks: 1 }} send={send} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit LHM+LHI' }));
    expect(send).toHaveBeenLastCalledWith({ type: 'selectCombo', combo: null });
  });
});

describe('a combo opened from the board', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The combo open, and how many times one has been picked: a pick is what brings it into view. */
  const open = (combo: number | null, comboPicks = 0) => ({ ...state, combo, comboPicks });
  const reveal = { left: 900 - (300 - 176) / 2, behavior: 'smooth' };

  it('is brought into view in the strip and takes focus there', () => {
    const { rerender } = render(<CombosPanel state={open(null)} send={vi.fn()} />);
    const scrollTo = layOut(screen.getByRole('list', { name: 'Combo boards' }));
    rerender(<CombosPanel state={open(1, 1)} send={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledWith(reveal);
    expect(screen.getByRole('button', { name: 'Edit RHM+RHI' })).toHaveFocus();
  });

  it('is brought back when the one already open is picked again from the board', () => {
    const { rerender } = render(<CombosPanel state={open(1, 1)} send={vi.fn()} />);
    const scrollTo = layOut(screen.getByRole('list', { name: 'Combo boards' }));
    screen.getByRole('button', { name: 'Edit RHM+RHI' }).blur();
    // The same combo, picked once more: nothing about it changed but the pick.
    rerender(<CombosPanel state={open(1, 2)} send={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledWith(reveal);
    expect(screen.getByRole('button', { name: 'Edit RHM+RHI' })).toHaveFocus();
  });

  it('takes no focus when it only moved, as an Undo or a removal moves it', () => {
    const { rerender } = render(<CombosPanel state={open(0, 1)} send={vi.fn()} />);
    layOut(screen.getByRole('list', { name: 'Combo boards' }));
    // The open combo is another now, and no one picked it.
    rerender(<CombosPanel state={open(1, 1)} send={vi.fn()} />);
    expect(document.body).toHaveFocus();
  });

  it('is shown, without taking focus, when the tab comes up with one already open', () => {
    render(<CombosPanel state={open(1, 1)} send={vi.fn()} />);
    expect(document.body).toHaveFocus();
  });
});

describe('a layer or a condition added', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is brought into view, where the cards that add one have moved on', () => {
    const { rerender } = render(<LayersPanel state={state} send={vi.fn()} />);
    const scrollTo = layOut(screen.getByRole('list', { name: 'Layers' }));
    const four: Layout = {
      ...layout,
      layers: [...layout.layers, { id: 'nav', name: 'Nav', bindings: { '*': { kind: 'trans' } } }],
    };
    // The board turns to the layer added, which is the fourth.
    rerender(<LayersPanel state={initialState(four, compileLayout(four), 3)} send={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledWith({ left: 900 - (300 - 176) / 2, behavior: 'smooth' });
  });
});

describe('a symbol on a key, in the slides that name one', () => {
  it('shows what a combo types on a key', () => {
    render(<CombosPanel state={state} send={vi.fn()} />);
    const slide = screen.getByRole('button', { name: 'Edit LHM+LHI' });
    expect(slide.querySelector('.lb-keycap')).toHaveTextContent('q');
    expect(
      screen.getByRole('button', { name: 'Edit RHM+RHI' }).querySelector('.lb-keycap'),
    ).toHaveTextContent('z');
  });

  it('draws a macro in an alt repeat branch as what it types, and one on a key tap as its key', () => {
    const altRepeat: Binding = {
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [{ afterAny: ['LHM'], binding: { kind: 'macro', symbols: 'ões' } }],
    };
    const holdMacro: Binding = {
      kind: 'hold_tap',
      tap: { kind: 'macro', symbols: 'qu' },
      hold: { kind: 'mo', layer: 'num' },
    };
    const [base, ...rest] = layout.layers;
    const nested: Layout = {
      ...layout,
      layers: [
        { ...base, bindings: { ...base.bindings, LHP: altRepeat, RHP: holdMacro } },
        ...rest,
      ],
    };
    render(<BehaviorsPanel state={initialState(nested, compileLayout(nested))} send={vi.fn()} />);
    const keycap = (button: HTMLElement) => button.querySelector('.lb-keycap');
    // Two uses on the key: the alt repeat as the key is drawn, and the macro its branch types.
    const [repeat, macro] = screen.getAllByRole('button', { name: /^Base · LHP/ });
    expect(repeat).toHaveTextContent('Alt repeat');
    expect(keycap(repeat)).toHaveTextContent('⟳');
    expect(macro).toHaveTextContent('Macro');
    expect(keycap(macro)).toHaveTextContent('ões');
    expect(keycap(macro)).not.toHaveTextContent('⟳');
    // A macro that is the tap of the key is the key as the board draws it, its hold included.
    expect(keycap(screen.getByRole('button', { name: /^Base · RHP/ }))).toHaveTextContent('Numb');
  });

  it('shows what a special behavior types on a key, named by its place and its kind', () => {
    const s = initialState(morphing, compileLayout(morphing));
    render(<BehaviorsPanel state={s} send={vi.fn()} />);
    const slide = screen.getByRole('button', { name: /^Base · LHP/ });
    expect(slide.querySelector('.lb-keycap')).toHaveTextContent('x');
    // The key is drawn for the eye: the slide's name is its place, its label and its kind.
    expect(slide.querySelector('.lb-keycap')).toHaveAttribute('aria-hidden', 'true');
    expect(slide).toHaveTextContent('Mod morph');
  });
});

describe('the Layers carousel, drawn', () => {
  it('numbers each layer, in the colour its keys are drawn in', () => {
    render(<LayersPanel state={state} send={vi.fn()} />);
    const slides = within(screen.getByRole('list', { name: 'Layers' })).getAllByRole('listitem');
    expect(slides.slice(0, 3).map((li) => li.querySelector('.lb-layer-no')?.textContent)).toEqual([
      '1',
      '2',
      '3',
    ]);
    // The base layer has no colour of its own; the others follow their place in the list.
    expect((slides[0] as HTMLElement).style.getPropertyValue('--lb-accent')).toBe('');
    expect((slides[1] as HTMLElement).style.getPropertyValue('--lb-accent')).toBe(
      'var(--lb-layer-1)',
    );
  });

  it('moves a layer left and right', async () => {
    const send = vi.fn();
    render(<LayersPanel state={state} send={send} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Move Symbols left' }));
    expect(send).toHaveBeenCalledWith({
      type: 'edit',
      edit: { kind: 'moveLayer', layer: 'sym', to: 1 },
    });
  });
});

describe("a layer's colour, picked from a group of circles", () => {
  const COLOURS = ['Automatic', 'Blue', 'Green', 'Amber', 'Red', 'Violet', 'Teal', 'Lime'];
  const group = (layer: string) =>
    screen.getByRole('radiogroup', { name: `Colour of layer ${layer}` });

  it('offers Automatic and each colour of the palette, one checked', () => {
    render(<LayersPanel state={state} send={vi.fn()} />);
    const radios = within(group('Symbols')).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(COLOURS);
    // Left to its place in the list, a layer is on Automatic and on nothing else.
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toEqual([radios[0]]);
  });

  it('checks the colour the layer chose', () => {
    const teal: Layout = {
      ...layout,
      layers: layout.layers.map((l) => (l.id === 'sym' ? { ...l, color: 'teal' } : l)),
    };
    render(<LayersPanel state={initialState(teal, compileLayout(teal))} send={vi.fn()} />);
    expect(within(group('Symbols')).getByRole('radio', { name: 'Teal' })).toBeChecked();
    expect(within(group('Symbols')).getByRole('radio', { name: 'Automatic' })).not.toBeChecked();
    // The layers around it are not touched.
    expect(within(group('Numbers')).getByRole('radio', { name: 'Automatic' })).toBeChecked();
  });

  it('draws each circle in the colour it picks, and Automatic in the one the place gives', () => {
    render(<LayersPanel state={state} send={vi.fn()} />);
    const fill = (layer: string, name: string) =>
      within(group(layer)).getByRole('radio', { name }).style.getPropertyValue('--lb-colour');
    expect(fill('Symbols', 'Teal')).toBe('var(--lb-layer-6)');
    expect(fill('Symbols', 'Blue')).toBe('var(--lb-layer-1)');
    // Symbols is the second layer after the base one; Numbers is the first.
    expect(fill('Symbols', 'Automatic')).toBe('var(--lb-layer-2)');
    expect(fill('Numbers', 'Automatic')).toBe('var(--lb-layer-1)');
    // The base layer has none by its place: its Automatic circle is drawn on the card's ground.
    expect(fill('Base', 'Automatic')).toBe('');
  });

  it('sends the colour clicked, and none for Automatic', async () => {
    const send = vi.fn();
    const user = userEvent.setup();
    const teal: Layout = {
      ...layout,
      layers: layout.layers.map((l) => (l.id === 'sym' ? { ...l, color: 'teal' } : l)),
    };
    const { unmount } = render(<LayersPanel state={state} send={send} />);
    await user.click(within(group('Symbols')).getByRole('radio', { name: 'Teal' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'edit',
      edit: { kind: 'colorLayer', layer: 'sym', color: 'teal' },
    });
    unmount();
    render(<LayersPanel state={initialState(teal, compileLayout(teal))} send={send} />);
    await user.click(within(group('Symbols')).getByRole('radio', { name: 'Automatic' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'edit',
      edit: { kind: 'colorLayer', layer: 'sym', color: undefined },
    });
  });

  it('is one group of radios per layer, moved through with the arrow keys', async () => {
    const send = vi.fn();
    const user = userEvent.setup();
    render(<LayersPanel state={state} send={send} />);
    // One name for a layer's eight and another for each other layer, which is what keeps the
    // arrows inside the group.
    const nameOf = (layer: string) => [
      ...new Set(
        within(group(layer))
          .getAllByRole('radio')
          .map((r) => (r as HTMLInputElement).name),
      ),
    ];
    expect(nameOf('Numbers')).toHaveLength(1);
    expect(nameOf('Symbols')).toHaveLength(1);
    expect(nameOf('Numbers')).not.toEqual(nameOf('Symbols'));

    within(group('Symbols')).getByRole('radio', { name: 'Automatic' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(send).toHaveBeenLastCalledWith({
      type: 'edit',
      edit: { kind: 'colorLayer', layer: 'sym', color: 'blue' },
    });
  });

  it('names each circle and says it again as a tooltip', () => {
    render(<LayersPanel state={state} send={vi.fn()} />);
    const symbols = within(group('Symbols'));
    expect(symbols.getByRole('radio', { name: 'Teal' }).closest('label')).toHaveAttribute(
      'title',
      'Teal',
    );
    expect(symbols.getByRole('radio', { name: 'Automatic' }).closest('label')).toHaveAttribute(
      'title',
      'Automatic: by its place in the list',
    );
    expect(
      within(group('Base')).getByRole('radio', { name: 'Automatic' }).closest('label'),
    ).toHaveAttribute('title', 'Automatic: the text colour');
  });
});

/** The layout with an adaptive key, an alt repeat, a macro, a mod morph and a sentence space. */
const behaving: Layout = {
  ...layout,
  layers: [
    {
      ...layout.layers[0],
      bindings: {
        ...layout.layers[0].bindings,
        LHP: {
          kind: 'adaptive',
          default: kp('h'),
          triggers: [{ afterAny: ['LHM'], binding: kp('v') }],
        },
        LHR: {
          kind: 'adaptive',
          default: { kind: 'key_repeat' },
          triggers: [{ afterAny: ['LHM'], binding: kp('e') }],
        },
        LTP: { kind: 'macro', symbols: 'xyz' },
        RHP: { kind: 'mod_morph', mods: ['LSHIFT'], default: kp('x'), morphed: kp('y') },
        R0: { kind: 'sentence_space' },
      },
    },
    ...layout.layers.slice(1),
  ],
};

describe('the Special Behaviors carousel', () => {
  const items = () =>
    within(screen.getByRole('list', { name: 'Special behaviors' })).getAllByRole('listitem');

  it('has no one-shot cards and no sentence case card to turn on', () => {
    render(<BehaviorsPanel state={state} send={vi.fn()} />);
    expect(screen.queryByRole('group', { name: /^One-shot/ })).toBeNull();
    expect(screen.queryByLabelText('Sentence case')).toBeNull();
    expect(screen.queryByLabelText('Caps word')).toBeNull();
  });

  it('lists every use, kind by kind, a sentence space as Sentence case', () => {
    const s = initialState(behaving, compileLayout(behaving));
    render(<BehaviorsPanel state={s} send={vi.fn()} />);
    const uses = items().map((li) => li.textContent ?? '');
    const at = (text: string) => uses.findIndex((u) => u.includes(text));
    for (const text of ['Adaptive key', 'Sentence case', 'Alt repeat', 'Macro', 'Mod morph']) {
      expect(at(text), text).toBeGreaterThanOrEqual(0);
    }
    expect(at('Adaptive key')).toBeLessThan(at('Alt repeat'));
    expect(at('Alt repeat')).toBeLessThan(at('Macro'));
    expect(at('Macro')).toBeLessThan(at('Mod morph'));
    // A sentence space is an adaptive kind of key, named as itself.
    expect(uses[at('Sentence case')]).toContain('Adaptive key');
  });

  it('says so when the layout has no use', () => {
    render(<BehaviorsPanel state={state} send={vi.fn()} />);
    expect(items()[0]).toHaveTextContent(
      'This layout has no adaptive keys, alt repeats, macros, mod morphs or sentence spaces.',
    );
  });

  it('knows which kinds need a ZMK module: adaptive keys and sentence spaces, not macros or morphs', () => {
    expect(bindingModule('adaptive')).not.toBeNull();
    expect(bindingModule('sentence_space')).not.toBeNull();
    expect(bindingModule('macro')).toBeNull();
    expect(bindingModule('mod_morph')).toBeNull();
  });
});

describe('the Special Behaviors board', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The layout with a macro on a combo, which works on Symbols and then Numbers. */
  const comboMacro: Layout = {
    ...layout,
    combos: [
      { keys: ['LHM', 'LHI'], binding: { kind: 'macro', symbols: 'xy' }, layers: ['sym', 'num'] },
    ],
  };

  it('is the board under the strip: picking a key selects it on its layer, on this tab', async () => {
    const send = vi.fn();
    const onShow = vi.fn();
    const s = initialState(behaving, compileLayout(behaving));
    render(<BehaviorsPanel state={s} send={send} onShow={onShow} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Base · RHP/ }));
    expect(onShow).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setPanel' }));
    // Whatever the board was doing gives way.
    expect(send).toHaveBeenCalledWith({ type: 'comboPickCancel' });
    expect(send).toHaveBeenCalledWith({ type: 'cancelSwap' });
    expect(send).toHaveBeenCalledWith({ type: 'selectLayer', layer: 0 });
    expect(send).toHaveBeenLastCalledWith({ type: 'keyClick', keyId: 'RHP' });
  });

  it('opens the combo of a feature on a combo, turned to the first layer it works on', async () => {
    const send = vi.fn();
    const s = initialState(comboMacro, compileLayout(comboMacro));
    render(<BehaviorsPanel state={s} send={send} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Combo/ }));
    // As the Combos tab opens one: the combo itself, which outlines its own keys.
    expect(send).toHaveBeenLastCalledWith({ type: 'selectCombo', combo: 0, layer: 2 });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setPanel' }));
  });

  it('marks the slide of the key that is open, and of the combo that is open', () => {
    const s = initialState(behaving, compileLayout(behaving));
    const { rerender } = render(
      <BehaviorsPanel state={{ ...s, selected: 'RHP' }} send={vi.fn()} />,
    );
    const slideOf = (name: RegExp) => screen.getByRole('button', { name }).closest('li');
    expect(slideOf(/^Base · RHP/)).toHaveClass('lb-slide-current');
    expect(screen.getByRole('button', { name: /^Base · RHP/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(slideOf(/^Base · LTP/)).not.toHaveClass('lb-slide-current');
    // The same key on another layer is another place.
    rerender(<BehaviorsPanel state={{ ...s, selected: 'RHP', layer: 1 }} send={vi.fn()} />);
    expect(slideOf(/^Base · RHP/)).not.toHaveClass('lb-slide-current');

    const c = initialState(comboMacro, compileLayout(comboMacro));
    rerender(<BehaviorsPanel state={{ ...c, combo: 0, selected: null }} send={vi.fn()} />);
    expect(slideOf(/^Combo/)).toHaveClass('lb-slide-current');
  });

  it('brings the slide of a key picked on the board into view, and takes no focus', () => {
    const s = initialState(behaving, compileLayout(behaving));
    const { rerender } = render(<BehaviorsPanel state={s} send={vi.fn()} />);
    const scrollTo = layOut(screen.getByRole('list', { name: 'Special behaviors' }));
    rerender(<BehaviorsPanel state={{ ...s, selected: 'RHP' }} send={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledWith({ left: 900 - (300 - 176) / 2, behavior: 'smooth' });
    expect(document.body).toHaveFocus();
  });

  it('brings the slide of a combo opened on the board into view', () => {
    const s = initialState(comboMacro, compileLayout(comboMacro));
    const { rerender } = render(<BehaviorsPanel state={s} send={vi.fn()} />);
    const scrollTo = layOut(screen.getByRole('list', { name: 'Special behaviors' }), 'combo 0');
    rerender(<BehaviorsPanel state={{ ...s, combo: 0, comboPicks: 1 }} send={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledWith({ left: 900 - (300 - 176) / 2, behavior: 'smooth' });
  });

  it('brings a slide into view when the key already open is given a behavior', () => {
    const s = initialState(behaving, compileLayout(behaving));
    const { rerender } = render(
      <BehaviorsPanel state={{ ...s, selected: 'LHM' }} send={vi.fn()} />,
    );
    const scrollTo = layOut(screen.getByRole('list', { name: 'Special behaviors' }), 'base LHM');
    // The open key is made a macro in its editor: its slide is new, and the key is the same.
    const [base, ...rest] = behaving.layers;
    const made: Layout = {
      ...behaving,
      layers: [
        { ...base, bindings: { ...base.bindings, LHM: { kind: 'macro', symbols: 'ab' } } },
        ...rest,
      ],
    };
    const next = { ...initialState(made, compileLayout(made)), selected: 'LHM' };
    rerender(<BehaviorsPanel state={next} send={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledWith({ left: 900 - (300 - 176) / 2, behavior: 'smooth' });
  });

  it('moves nothing when no key or combo is open, and moves once one is', () => {
    // The layout is mocked, and every strip given a scrollTo, before anything is rendered: what
    // the panel does as it mounts is what is looked at.
    mockLayout();
    const scrollTo = vi.fn();
    const had = Element.prototype.scrollTo;
    Element.prototype.scrollTo = scrollTo;
    try {
      const s = initialState(behaving, compileLayout(behaving));
      const { rerender } = render(<BehaviorsPanel state={s} send={vi.fn()} />);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(screen.getByText(/on the board below/)).toBeInTheDocument();
      rerender(<BehaviorsPanel state={{ ...s, selected: 'RHP' }} send={vi.fn()} />);
      expect(scrollTo).toHaveBeenCalledOnce();
    } finally {
      // jsdom has no scrollTo on an element: leave it as it was found.
      if (had) Element.prototype.scrollTo = had;
      else Reflect.deleteProperty(Element.prototype, 'scrollTo');
    }
  });
});

describe('the Export carousel', () => {
  it('loads the text into the editor from its button, with no form for Enter to submit', async () => {
    const send = vi.fn();
    const { container } = render(<ExportPanel state={state} send={send} />);
    expect(container.querySelector('form')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load into editor' }));
    expect(send.mock.calls[0][0].edit.kind).toBe('replaceLayout');
    // Enter on a format choice is only a choice of format.
    send.mockClear();
    screen.getByRole('radio', { name: /keymap-drawer YAML/ }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps its two buttons in their places in either format, the primary on the right', async () => {
    render(<ExportPanel state={state} send={vi.fn()} />);
    const user = userEvent.setup();
    const group = () => screen.getByRole('group', { name: /^(The text|Export the file)$/ });
    const buttons = () => within(group()).getAllByRole('button');
    // JSON: refresh the text from the editor, or load it into the editor.
    expect(buttons().map((b) => b.textContent)).toEqual([
      'Refresh from editor',
      'Load into editor',
    ]);
    expect(buttons()[1]).toHaveClass('btn-primary');
    expect(buttons()[0]).not.toHaveClass('btn-primary');
    // YAML: the same two places, for downloading and for copying.
    await user.click(screen.getByRole('radio', { name: /keymap-drawer YAML/ }));
    expect(buttons().map((b) => b.textContent)).toEqual(['Download .yaml', 'Copy']);
    expect(buttons()[1]).toHaveClass('btn-primary');
    // Both rows are one grid, of equal size, whatever the labels say.
    expect(group()).toHaveClass('lb-export-actions');
  });

  it('shows what the text could not be loaded for, clamped to the slide, in full on hover', () => {
    const s = { ...state, jsonError: 'Unexpected token } in JSON at position 4821' };
    render(<ExportPanel state={s} send={vi.fn()} />);
    const message = screen.getByText(/Unexpected token/);
    expect(message).toHaveClass('lb-export-message');
    expect(message).toHaveAttribute('title', s.jsonError);
  });
});
