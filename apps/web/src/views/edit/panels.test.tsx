import { type Binding, bindingModule, compileLayout, type Layout } from '@layerbench/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BehaviorsPanel,
  CombosPanel,
  EXTERNAL_KINDS,
  FeaturesPanel,
  GeometryPanel,
  JsonPanel,
  LayersPanel,
  PathsPanel,
  SPECIAL_KINDS,
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
    ['External Behaviors', () => <FeaturesPanel state={state} send={send} />],
    ['Physical Layout', () => <GeometryPanel state={state} send={send} />],
    ['Combos', () => <CombosPanel state={state} send={send} />],
    ['Special Behaviors', () => <BehaviorsPanel state={state} send={send} />],
    ['Typing paths', () => <PathsPanel state={state} send={send} producers={producers} />],
    ['JSON', () => <JsonPanel state={state} send={send} />],
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

/** A strip 300 wide, as the browser would lay it out, with the second combo's slide past its edge. */
function layOut(strip: HTMLElement) {
  const scrollTo = vi.fn();
  strip.scrollTo = scrollTo;
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('lb-carousel') ? 300 : 0;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('lb-carousel')) return { left: 0, width: 300 } as DOMRect;
    const { combo, layer } = (this as HTMLElement).dataset;
    if (combo === '1' || layer === '3') return { left: 900, width: 176 } as DOMRect;
    return { left: 0, width: 0 } as DOMRect;
  });
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

/** The layout with an adaptive key, an alt repeat and a macro, as the two behaviour panels list. */
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
      },
    },
    ...layout.layers.slice(1),
  ],
};

describe('the External Behaviors carousel', () => {
  it('lights the band of a feature that is on', () => {
    // The panel reads the features as written; it does not need them compiled.
    const on = { ...state, layout: { ...layout, features: { sentenceCase: {} } } };
    render(<FeaturesPanel state={on} send={vi.fn()} />);
    const sentence = screen.getByLabelText('Sentence case').closest('li') as HTMLElement;
    expect(sentence.style.getPropertyValue('--lb-accent')).toBe('var(--color-primary)');
    const off = render(<FeaturesPanel state={state} send={vi.fn()} />);
    const idle = within(off.container).getByLabelText('Sentence case').closest('li') as HTMLElement;
    expect(idle.style.getPropertyValue('--lb-accent')).toBe('');
  });

  it('has sentence case and no caps word, which is a key and not a feature', () => {
    render(<FeaturesPanel state={state} send={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'External behaviors' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByLabelText('Sentence case')).toBeInTheDocument();
    expect(screen.queryByLabelText('Caps word')).toBeNull();
    expect(screen.queryByLabelText('Caps word continue list')).toBeNull();
  });

  it('lists the adaptive keys and alt repeats after sentence case, and no macro or morph', () => {
    const s = initialState(behaving, compileLayout(behaving));
    render(<FeaturesPanel state={s} send={vi.fn()} />);
    const items = within(screen.getByRole('list', { name: 'External behaviors' })).getAllByRole(
      'listitem',
    );
    expect(items[0]).toHaveTextContent('Sentence case');
    expect(items.slice(1).map((li) => li.textContent)).toEqual([
      expect.stringContaining('Adaptive key'),
      expect.stringContaining('Alt repeat'),
    ]);
  });

  it('shows a use on the board when it is picked, as Special Behaviors does', async () => {
    const send = vi.fn();
    const onShow = vi.fn();
    const s = initialState(behaving, compileLayout(behaving));
    render(<FeaturesPanel state={s} send={send} onShow={onShow} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Base · LHP/ }));
    expect(onShow).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ type: 'setPanel', panel: 'board' });
    expect(send).toHaveBeenCalledWith({ type: 'keyClick', keyId: 'LHP' });
  });
});

describe('the Special Behaviors carousel', () => {
  it('lists macros and mod morphs, and none of what needs a ZMK module', () => {
    const s = initialState(behaving, compileLayout(behaving));
    render(<BehaviorsPanel state={s} send={vi.fn()} />);
    const items = within(screen.getByRole('list', { name: 'Special behaviors' })).getAllByRole(
      'listitem',
    );
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Macro'),
      expect.stringContaining('Mod morph'),
    ]);
  });

  it('says so when there is neither', () => {
    render(<BehaviorsPanel state={state} send={vi.fn()} />);
    expect(screen.getByText('This layout has no macros or mod morphs.')).toBeInTheDocument();
  });

  it('splits the kinds of special feature between the two panels, as the firmware table splits them', () => {
    // Every kind in one panel and none in both; the external ones are the ones that need a module.
    expect([...EXTERNAL_KINDS, ...SPECIAL_KINDS].sort()).toEqual(
      ['adaptive', 'alt_repeat', 'macro', 'mod_morph'].sort(),
    );
    expect(bindingModule('adaptive')).not.toBeNull();
    expect(bindingModule('macro')).toBeNull();
    expect(bindingModule('mod_morph')).toBeNull();
  });
});

describe('the JSON carousel', () => {
  it('loads the text into the editor from its button, with no form for Enter to submit', async () => {
    const send = vi.fn();
    const { container } = render(<JsonPanel state={state} send={send} />);
    expect(container.querySelector('form')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load into editor' }));
    expect(send.mock.calls[0][0].edit.kind).toBe('replaceLayout');
    // Enter on a format choice is only a choice of format.
    send.mockClear();
    screen.getByRole('radio', { name: /keymap-drawer YAML/ }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(send).not.toHaveBeenCalled();
  });
});
