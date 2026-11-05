import { type Binding, compileLayout, type Layout } from '@layerbench/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BehaviorsPanel,
  CombosPanel,
  FeaturesPanel,
  GeometryPanel,
  JsonPanel,
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
    ['Features', () => <FeaturesPanel state={state} send={send} />],
    ['Geometry', () => <GeometryPanel state={state} send={send} />],
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

describe('a combo opened from the board', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const open = (combo: number | null) => ({ ...state, combo });

  it('is brought into view in the strip and takes focus there', () => {
    const { rerender } = render(<CombosPanel state={open(null)} send={vi.fn()} />);
    const strip = screen.getByRole('list', { name: 'Combo boards' });
    const scrollTo = vi.fn();
    strip.scrollTo = scrollTo;
    // The second card lies past the strip's edge.
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('lb-carousel') ? 300 : 0;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('lb-carousel')) return { left: 0, width: 300 } as DOMRect;
      if ((this as HTMLElement).dataset.combo === '1') return { left: 900, width: 176 } as DOMRect;
      return { left: 0, width: 0 } as DOMRect;
    });

    rerender(<CombosPanel state={open(1)} send={vi.fn()} />);
    expect(scrollTo).toHaveBeenCalledWith({ left: 900 - (300 - 176) / 2, behavior: 'smooth' });
    expect(screen.getByRole('button', { name: 'Edit RHM+RHI' })).toHaveFocus();
  });

  it('is shown, without taking focus, when the tab comes up with one already open', () => {
    render(<CombosPanel state={open(1)} send={vi.fn()} />);
    expect(document.body).toHaveFocus();
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

describe('the Features carousel', () => {
  it('lights the band of a feature that is on', () => {
    // The panel reads the features as written; it does not need them compiled.
    const on = { ...state, layout: { ...layout, features: { capsWord: {} } } };
    render(<FeaturesPanel state={on} send={vi.fn()} />);
    const capsWord = screen.getByLabelText('Caps word').closest('li') as HTMLElement;
    const sentence = screen.getByLabelText('Sentence case').closest('li') as HTMLElement;
    expect(capsWord.style.getPropertyValue('--lb-accent')).toBe('var(--color-primary)');
    expect(sentence.style.getPropertyValue('--lb-accent')).toBe('');
  });
});
