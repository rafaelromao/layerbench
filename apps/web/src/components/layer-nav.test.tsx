import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LayerDot } from './LayerDot.js';
import { LayerNav, type NavLayer, useLayerSwipe } from './LayerNav.js';

const LAYERS: NavLayer[] = [
  { idx: 0, id: 'base', name: 'Base' },
  { idx: 1, id: 'nav', name: 'Nav' },
  { idx: 2, id: 'sym', name: 'Symbols', color: 'teal' },
];

/** A navigator that keeps its own layer, and reports renames. */
function Harness({
  layers = LAYERS,
  onRename,
  start = 0,
}: {
  layers?: NavLayer[];
  onRename?: (id: string, name: string) => void;
  start?: number;
}) {
  const [active, setActive] = useState(start);
  return <LayerNav layers={layers} active={active} onSelect={setActive} onRename={onRename} />;
}

const nav = () => screen.getByRole('group', { name: 'Layers' });
const counter = () => within(nav()).getByText(/^\d+ \/ \d+$/);
const next = () => within(nav()).getByRole('button', { name: 'Next layer' });
const previous = () => within(nav()).getByRole('button', { name: 'Previous layer' });

describe('the layer navigator', () => {
  it('steps through the layers with its buttons, and says where it is', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(within(nav()).getByText('Base')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('1 / 3');
    // The counter is announced as it changes, politely.
    expect(counter()).toHaveAttribute('aria-live', 'polite');
    expect(previous()).toHaveAttribute('aria-disabled', 'true');

    await user.click(next());
    expect(within(nav()).getByText('Nav')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('2 / 3');
    await user.click(next());
    expect(counter()).toHaveTextContent('3 / 3');
    expect(next()).toHaveAttribute('aria-disabled', 'true');

    // There is nothing after the last layer, and the buttons that say so do nothing.
    await user.click(next());
    expect(counter()).toHaveTextContent('3 / 3');
    await user.click(previous());
    expect(within(nav()).getByText('Nav')).toBeInTheDocument();
  });

  it('writes the name in the layer colour, and the base layer in the text colour', () => {
    const { rerender } = render(<LayerNav layers={LAYERS} active={2} onSelect={() => {}} />);
    expect(within(nav()).getByText('Symbols').getAttribute('style')).toContain('var(--lb-layer-6)');
    rerender(<LayerNav layers={LAYERS} active={1} onSelect={() => {}} />);
    expect(within(nav()).getByText('Nav').getAttribute('style')).toContain('var(--lb-layer-1)');
    rerender(<LayerNav layers={LAYERS} active={0} onSelect={() => {}} />);
    expect(within(nav()).getByText('Base').style.color).toBe('');
  });

  it('shows nothing but the name when there is only one layer', () => {
    render(<LayerNav layers={[LAYERS[0]]} active={0} onSelect={() => {}} />);
    expect(within(nav()).getByText('Base')).toBeInTheDocument();
    expect(within(nav()).queryByRole('button')).toBeNull();
    expect(within(nav()).queryByText(/\//)).toBeNull();
  });

  it('shows the first layer for one that is not there, and nothing for a layout with none', () => {
    const { rerender } = render(<LayerNav layers={LAYERS} active={9} onSelect={() => {}} />);
    expect(counter()).toHaveTextContent('1 / 3');
    rerender(<LayerNav layers={[]} active={0} onSelect={() => {}} />);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('is named for the layout it belongs to where a page shows two', () => {
    render(<LayerNav layers={LAYERS} active={0} onSelect={() => {}} label="Layers of A" />);
    expect(screen.getByRole('group', { name: 'Layers of A' })).toBeInTheDocument();
  });

  it('steps with the arrow keys, without taking them from a field being typed in', async () => {
    const user = userEvent.setup();
    render(<Harness onRename={() => {}} />);
    next().focus();
    await user.keyboard('{ArrowRight}');
    expect(counter()).toHaveTextContent('2 / 3');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    // Stopped at the end, with the keyboard still where it was.
    expect(counter()).toHaveTextContent('3 / 3');
    expect(next()).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(counter()).toHaveTextContent('2 / 3');

    await user.dblClick(within(nav()).getByText('Nav'));
    const field = screen.getByLabelText('Rename Nav');
    await user.keyboard('{ArrowLeft}{ArrowRight}');
    expect(counter()).toHaveTextContent('2 / 3');
    expect(field).toHaveFocus();
  });

  describe('renaming', () => {
    it('renames a layer where its name stands: double-click, then Enter', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();
      render(<Harness onRename={onRename} start={1} />);
      await user.dblClick(within(nav()).getByText('Nav'));
      const field = screen.getByLabelText('Rename Nav');
      expect(field).toHaveFocus();
      await user.clear(field);
      await user.type(field, 'Arrows{Enter}');
      expect(onRename).toHaveBeenCalledTimes(1);
      expect(onRename).toHaveBeenCalledWith('nav', 'Arrows');
      // The name is back, and the keyboard with it.
      expect(screen.queryByLabelText('Rename Nav')).toBeNull();
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Nav' })).toHaveFocus());
    });

    it('renames from the keyboard: F2, or Enter on the name', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();
      render(<Harness onRename={onRename} />);
      within(nav()).getByRole('button', { name: 'Base' }).focus();
      await user.keyboard('{F2}');
      await user.keyboard('{Escape}');
      expect(screen.queryByLabelText('Rename Base')).toBeNull();
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Base' })).toHaveFocus());

      await user.keyboard('{Enter}');
      const field = screen.getByLabelText('Rename Base');
      await user.type(field, '!{Enter}');
      expect(onRename).toHaveBeenCalledTimes(1);
      expect(onRename).toHaveBeenCalledWith('base', 'Base!');
    });

    it('leaves the name alone on Escape, and settles once when the field loses focus', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();
      render(<Harness onRename={onRename} />);
      await user.dblClick(within(nav()).getByText('Base'));
      await user.type(screen.getByLabelText('Rename Base'), 'x{Escape}');
      expect(onRename).not.toHaveBeenCalled();

      await user.dblClick(within(nav()).getByText('Base'));
      await user.type(screen.getByLabelText('Rename Base'), 'y');
      await user.click(document.body);
      expect(onRename).toHaveBeenCalledTimes(1);
      expect(onRename).toHaveBeenCalledWith('base', 'Basey');
    });

    it('renames when a finger is held on the name, and not when it is lifted sooner', async () => {
      vi.useFakeTimers();
      try {
        render(<Harness onRename={() => {}} />);
        const name = within(nav()).getByRole('button', { name: 'Base' });
        const down = (pointerType: string) =>
          fireEvent.pointerDown(name, { pointerType, pointerId: 1 });

        down('touch');
        vi.advanceTimersByTime(300);
        fireEvent.pointerUp(name, { pointerType: 'touch', pointerId: 1 });
        vi.advanceTimersByTime(600);
        expect(screen.queryByLabelText('Rename Base')).toBeNull();

        // A mouse button held down is not a long press.
        down('mouse');
        vi.advanceTimersByTime(700);
        expect(screen.queryByLabelText('Rename Base')).toBeNull();

        down('touch');
        // The browser's own menu for a held finger is kept away.
        const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        fireEvent(name, menu);
        expect(menu.defaultPrevented).toBe(true);
        act(() => {
          vi.advanceTimersByTime(600);
        });
        expect(screen.getByLabelText('Rename Base')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('drops a rename when the board turns to another layer under it', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();
      const { rerender } = render(
        <LayerNav layers={LAYERS} active={0} onSelect={() => {}} onRename={onRename} />,
      );
      await user.dblClick(within(nav()).getByText('Base'));
      await user.type(screen.getByLabelText('Rename Base'), 'x');
      // A word playing turns the board; the field must not rename the layer it turns to.
      rerender(<LayerNav layers={LAYERS} active={1} onSelect={() => {}} onRename={onRename} />);
      expect(screen.queryByLabelText(/^Rename/)).toBeNull();
      expect(within(nav()).getByText('Nav')).toBeInTheDocument();
      rerender(<LayerNav layers={LAYERS} active={0} onSelect={() => {}} onRename={onRename} />);
      expect(screen.queryByLabelText(/^Rename/)).toBeNull();
      expect(onRename).not.toHaveBeenCalled();
    });

    it('leaves the name as plain text where nothing can rename it', async () => {
      const user = userEvent.setup();
      render(<LayerNav layers={LAYERS} active={0} onSelect={() => {}} />);
      expect(screen.queryByRole('button', { name: 'Base' })).toBeNull();
      await user.dblClick(within(nav()).getByText('Base'));
      expect(screen.queryByLabelText('Rename Base')).toBeNull();
    });
  });
});

/** A board with the swipe of a navigator on it, which keys are drawn on as they are on a board. */
function Board({
  onSelect,
  draggable = true,
}: {
  onSelect: (idx: number) => void;
  draggable?: boolean;
}) {
  const [active, setActive] = useState(1);
  const swipe = useLayerSwipe(
    LAYERS,
    active,
    (idx) => {
      setActive(idx);
      onSelect(idx);
    },
    draggable,
  );
  return (
    <div data-testid="board" {...swipe}>
      <div data-testid="box" style={{ overflowX: 'auto' }}>
        <svg role="img" aria-label="keys">
          <g data-key="K">
            <rect width="1" height="1" />
          </g>
        </svg>
      </div>
      <span>{active}</span>
    </div>
  );
}

/** The clock the swipe measures time by, which a test sets. */
let now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => now);

const finger = (x: number, y = 0) => ({ clientX: x, clientY: y });
function swipe(
  el: Element,
  from: [number, number],
  to: [number, number],
  options: { duration?: number; second?: boolean } = {},
) {
  const { duration = 100, second = false } = options;
  now = 1000;
  fireEvent.touchStart(el, {
    touches: second ? [finger(...from), finger(0, 0)] : [finger(...from)],
  });
  now += duration;
  fireEvent.touchEnd(el, { changedTouches: [finger(...to)] });
}

describe('a swipe on a board', () => {
  const setup = () => {
    const onSelect = vi.fn();
    render(<Board onSelect={onSelect} />);
    return { onSelect, board: screen.getByTestId('board') };
  };

  it('turns to the next layer on a quick swipe left, and the one before on a swipe right', () => {
    const { onSelect, board } = setup();
    swipe(board, [200, 10], [80, 12]);
    expect(onSelect).toHaveBeenLastCalledWith(2);
    swipe(board, [80, 10], [200, 10]);
    expect(onSelect).toHaveBeenLastCalledWith(1);
    swipe(board, [80, 10], [200, 10]);
    expect(onSelect).toHaveBeenLastCalledWith(0);
    // Nothing lies before the first layer, nor after the last.
    swipe(board, [80, 10], [200, 10]);
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('leaves a short move, a mostly vertical one and a slow one alone', () => {
    const { onSelect, board } = setup();
    swipe(board, [100, 10], [80, 10]);
    swipe(board, [200, 10], [120, 200]);
    swipe(board, [200, 10], [100, 10], { duration: 1500 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('leaves a finger resting on a key alone: that is a drag on its way, not a swipe', () => {
    const { onSelect, board } = setup();
    const key = board.querySelector('g[data-key]') as Element;
    swipe(key, [200, 10], [80, 10], { duration: 600 });
    expect(onSelect).not.toHaveBeenCalled();
    // A quick swipe that happens to start on a key is a swipe.
    swipe(key, [200, 10], [80, 10], { duration: 200 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('lets a swipe that starts on a key turn the layer when no key there can be dragged', () => {
    const onSelect = vi.fn();
    render(<Board onSelect={onSelect} draggable={false} />);
    const key = screen.getByTestId('board').querySelector('g[data-key]') as Element;
    swipe(key, [200, 10], [80, 10], { duration: 600 });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('leaves a board that panned under the finger, and turns the layer from its edge', () => {
    const { onSelect } = setup();
    const box = screen.getByTestId('box');
    Object.defineProperty(box, 'scrollWidth', { value: 500 });
    Object.defineProperty(box, 'clientWidth', { value: 100 });
    // The finger panned the board: its offset moved between the touch and its end.
    now = 1000;
    fireEvent.touchStart(box, { touches: [finger(200)] });
    box.scrollLeft = 60;
    now = 1100;
    fireEvent.touchEnd(box, { changedTouches: [finger(80)] });
    expect(onSelect).not.toHaveBeenCalled();

    // At the edge there is nothing left to pan, so the same swipe turns the layer.
    swipe(box, [200, 10], [80, 10]);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('leaves a pinch, a cancelled touch and a board that panned alone', () => {
    const { onSelect, board } = setup();
    swipe(board, [200, 10], [80, 10], { second: true });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.touchStart(board, { touches: [finger(200)] });
    fireEvent.touchCancel(board);
    fireEvent.touchEnd(board, { changedTouches: [finger(80)] });
    expect(onSelect).not.toHaveBeenCalled();

    // The board scrolled inside its own box during the gesture: the finger panned it.
    fireEvent.touchStart(board, { touches: [finger(200)] });
    fireEvent.scroll(board.querySelector('svg') as Element);
    fireEvent.touchEnd(board, { changedTouches: [finger(80)] });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('turns on a sideways trackpad swipe once, however long its inertia lasts', () => {
    const { onSelect, board } = setup();
    now = 1000;
    fireEvent.wheel(board, { deltaX: 80, deltaY: 2 });
    now = 1050;
    fireEvent.wheel(board, { deltaX: 60, deltaY: 0 });
    now = 1100;
    fireEvent.wheel(board, { deltaX: 40, deltaY: 0 });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(2);
    // A new swipe, after a pause, the other way.
    now = 2000;
    fireEvent.wheel(board, { deltaX: -80, deltaY: 0 });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    // Scrolling the page is never taken for a swipe.
    now = 3000;
    fireEvent.wheel(board, { deltaX: 5, deltaY: 120 });
    now = 4000;
    fireEvent.wheel(board, { deltaX: 40, deltaY: 90 });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('a layer dot', () => {
  it('is drawn in the colour of the layer, and not at all for a base layer that chose none', () => {
    const { container, rerender } = render(<LayerDot idx={2} />);
    expect(container.querySelector('span')?.getAttribute('style')).toContain('var(--lb-layer-2)');
    rerender(<LayerDot idx={0} />);
    expect(container.querySelector('span')).toBeNull();
    rerender(<LayerDot idx={0} color="teal" className="mr-1" />);
    expect(container.querySelector('span')?.getAttribute('style')).toContain('var(--lb-layer-6)');
  });
});
