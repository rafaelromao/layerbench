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
    // Scrollable by keyboard, and every item of it a card.
    expect(strips[0]).toHaveAttribute('tabindex', '0');
    const items = [...strips[0].children];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item).toHaveClass('lb-card');
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
  it('draws each character on a key at the left of its card', () => {
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
