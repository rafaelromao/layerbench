import { bundledLayout, compileLayout } from '@layerbench/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { comboPillAt, drawnX, Keyboard, KeyLegend, reach } from './Keyboard.js';

const qwerty = compileLayout(bundledLayout('qwerty')!);
const romak = compileLayout(bundledLayout('magic-romak')!);

describe('Keyboard', () => {
  it('draws one group per physical key, labelled for a screen reader', () => {
    const { container } = render(<Keyboard compiled={qwerty} />);
    const keys = container.querySelectorAll('g[data-key]');
    expect(keys.length).toBe(qwerty.keys.length);
    expect(screen.getByRole('button', { name: 'Key LHM: d' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Keyboard layout' })).toBeInTheDocument();
  });

  it('reports hold legends in the accessible name', () => {
    render(<Keyboard compiled={romak} />);
    // The right inner thumb taps to a layer and holds for another.
    expect(screen.getByRole('button', { name: /^Key R0:/ })).toBeInTheDocument();
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    const onKeyClick = vi.fn();
    render(<Keyboard compiled={qwerty} onKeyClick={onKeyClick} />);

    const key = screen.getByRole('button', { name: 'Key LHM: d' });
    key.focus();
    await user.keyboard('{Enter}');
    expect(onKeyClick).toHaveBeenCalledWith('LHM', { add: false });

    await user.keyboard(' ');
    expect(onKeyClick).toHaveBeenCalledTimes(2);

    // Shift adds the key to the ones picked, from the keyboard as with a click.
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onKeyClick).toHaveBeenLastCalledWith('LHM', { add: true });
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Key LHI: f' }));
    expect(onKeyClick).toHaveBeenLastCalledWith('LHI', { add: true });
  });

  it('rings the selected key outside its cap, so an outline on the cap leaves it in sight', () => {
    const lhm = qwerty.keyIndex.get('LHM') as number;
    const lhi = qwerty.keyIndex.get('LHI') as number;
    const { container } = render(
      <Keyboard
        compiled={qwerty}
        selected="LHM"
        highlight={[lhm, lhi]}
        arcs={[[lhm, lhi]]}
        heat={{ [lhm]: 1 }}
      />,
    );
    const key = container.querySelector('g[data-key="LHM"]') as Element;
    expect(key).toHaveClass('lb-key-selected');
    expect(key.querySelector('.lb-key-cap.lb-key-highlight')).not.toBeNull();
    expect(container.querySelectorAll('.lb-key-selected').length).toBe(1);
    // The arrows sit in their own group, which the stylesheet keeps out of the pointer's way.
    expect(container.querySelector('g.lb-arc path')).not.toBeNull();
  });

  it('is inert and unlabelled as a control when not interactive', () => {
    render(<Keyboard compiled={qwerty} interactive={false} />);
    expect(screen.getByRole('img', { name: 'Keyboard layout' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('paints heat into the key fill', () => {
    const pos = qwerty.keyIndex.get('LHM') as number;
    const { container } = render(<Keyboard compiled={qwerty} heat={{ [pos]: 1 }} />);
    const cap = container.querySelector(`g[data-key="LHM"] .lb-key-cap`) as SVGRectElement;
    expect(cap.getAttribute('style')).toContain('var(--lb-heat) 100%');
  });

  describe('legends on a hot key', () => {
    // Magic Romak's right inner thumb taps into Alpha 2, so its legend is drawn in that layer's colour.
    const R0 = romak.keyIndex.get('R0') as number;
    const layerColoured = (container: HTMLElement) =>
      [...container.querySelectorAll('g[data-key="R0"] text')].filter((t) =>
        t.getAttribute('style')?.includes('var(--lb-layer-'),
      );
    const isHot = (container: HTMLElement) =>
      container.querySelector('g[data-key="R0"]')?.classList.contains('lb-key-hot');

    it('keeps the layer colour on a key below half heat', () => {
      const { container } = render(<Keyboard compiled={romak} heat={{ [R0]: 0.49 }} />);
      expect(isHot(container)).toBe(false);
      expect(layerColoured(container)).not.toHaveLength(0);
    });

    it('draws them in the key text colour from half heat on, where the layer colour fades', () => {
      for (const heat of [0.5, 1]) {
        const { container, unmount } = render(<Keyboard compiled={romak} heat={{ [R0]: heat }} />);
        expect(isHot(container), `heat ${heat}`).toBe(true);
        expect(layerColoured(container), `heat ${heat}`).toEqual([]);
        unmount();
      }
    });

    it('does the same for a key being pressed, whatever its heat', () => {
      const { container } = render(<Keyboard compiled={romak} pressed={[R0]} />);
      expect(isHot(container)).toBe(true);
      expect(layerColoured(container)).toEqual([]);
    });
  });

  describe('the keys that reach the layer shown', () => {
    const SYM = romak.layerIndex.get('sym') as number;
    const ALPHA2 = romak.layerIndex.get('alpha2') as number;
    const R0 = romak.keyIndex.get('R0') as number;
    const ringed = (container: HTMLElement) =>
      [...container.querySelectorAll('g[data-key]')]
        .filter((g) => g.querySelector('.lb-key-reach'))
        .map((g) => `${g.getAttribute('data-key')} ${g.getAttribute('data-reach')}`);

    it('marks none on the base layer', () => {
      const { container } = render(<Keyboard compiled={romak} />);
      expect(ringed(container)).toEqual([]);
    });

    it('rings the thumb held for Symbols, and says so', () => {
      const { container } = render(<Keyboard compiled={romak} layer={SYM} />);
      expect(ringed(container)).toEqual(['R0 held']);
      expect(
        screen.getByRole('button', { name: 'Key R0: empty, held to reach Symbols' }),
      ).toBeInTheDocument();
      const band = container.querySelector('g[data-key="R0"] .lb-key-reach-word');
      expect(band?.textContent).toBe('held');
      expect(container.querySelector('g[data-key="R0"] title')?.textContent).toContain(
        'held from Alpha 1 or Numbers to reach Symbols',
      );
    });

    it('rings the keys tapped for Alpha 2', () => {
      const { container } = render(<Keyboard compiled={romak} layer={ALPHA2} />);
      expect(ringed(container).sort()).toEqual(['L1 tapped', 'R0 tapped']);
    });

    it("draws the ring in the layer's colour below half heat, and in the text colour above", () => {
      const ring = (heat: number, pressed: number[] = []) => {
        const { container, unmount } = render(
          <Keyboard compiled={romak} layer={SYM} heat={{ [R0]: heat }} pressed={pressed} />,
        );
        const style = container
          .querySelector('g[data-key="R0"] .lb-key-reach')
          ?.getAttribute('style');
        unmount();
        return style ?? '';
      };
      expect(ring(0.49)).toContain(`var(--lb-layer-${SYM})`);
      expect(ring(0.5)).toBe('');
      expect(ring(1)).toBe('');
      expect(ring(0, [R0])).toBe('');
    });

    it('leaves the band to a hold of its own, and to no band at all without holds', () => {
      const { container } = render(<Keyboard compiled={romak} layer={SYM} showHold={false} />);
      expect(ringed(container)).toEqual(['R0 held']);
      expect(container.querySelector('.lb-key-reach-word')).toBeNull();
    });

    it('keeps one cap per key, so nothing measured by caps changes', () => {
      const { container } = render(<Keyboard compiled={romak} layer={SYM} />);
      expect(container.querySelectorAll('.lb-key-cap')).toHaveLength(romak.keys.length);
    });

    it('lists each way in under the board', () => {
      render(<Keyboard compiled={romak} layer={ALPHA2} legendList />);
      const list = screen.getByRole('list', { name: 'Key legend' });
      expect(list.textContent).toContain(
        'tapped from Ç extension, or from Alpha 1 after v, x or j, to reach Alpha 2',
      );
      expect(list.textContent).toContain('tapped from Alpha 1 to reach Alpha 2');
    });
  });

  it("draws a layer in the colour it chose: the keys that reach it, and its reach keys' ring", () => {
    const layout = bundledLayout('magic-romak')!;
    const teal = compileLayout({
      ...layout,
      layers: layout.layers.map((l) => (l.id === 'sym' ? { ...l, color: 'teal' as const } : l)),
    });
    const SYM = teal.layerIndex.get('sym') as number;
    // On Alpha 1, R0 holds for Symbols: its hold legend takes Symbols' colour.
    const { container, unmount } = render(<Keyboard compiled={teal} />);
    const legends = [...container.querySelectorAll('g[data-key="R0"] text')].map(
      (t) => t.getAttribute('style') ?? '',
    );
    expect(legends.some((s) => s.includes('var(--lb-layer-6)'))).toBe(true);
    unmount();
    const onSym = render(<Keyboard compiled={teal} layer={SYM} />);
    expect(
      onSym.container.querySelector('g[data-key="R0"] .lb-key-reach')?.getAttribute('style'),
    ).toContain('var(--lb-layer-6)');
  });

  it('marks every transparent key ▽, listed or by default, and leaves a key that does nothing empty', () => {
    const tapOf = (container: HTMLElement, key: string) =>
      container.querySelector(`g[data-key="${key}"] .lb-key-tap`)?.textContent ?? '';
    // Ç extension lists only a few keys and lets the rest show through.
    const ccedil = render(<Keyboard compiled={romak} layer={romak.layerIndex.get('ccedil')} />);
    expect(tapOf(ccedil.container, 'LHM')).toBe('▽');
    expect(tapOf(ccedil.container, 'RHI')).toBe('ã');
    ccedil.unmount();
    // Numbers leaves its unlisted keys doing nothing; L0, held to get there, shows through.
    const num = render(<Keyboard compiled={romak} layer={romak.layerIndex.get('num')} />);
    expect(tapOf(num.container, 'LTP')).toBe('');
    expect(tapOf(num.container, 'L0')).toBe('▽');
  });

  it('gives a key that does something but types nothing a legend, on a bare board too', () => {
    const sturdy = compileLayout(bundledLayout('magic-sturdy')!);
    for (const showHold of [true, false]) {
      const { container, unmount } = render(<Keyboard compiled={sturdy} showHold={showHold} />);
      const magic = container.querySelector('g[data-key="RTI"]') as SVGGElement;
      expect(magic.querySelector('.lb-key-tap')?.textContent).toBe('✦');
      // The centre says it; the corner does not say it again.
      expect(magic.querySelector('.lb-key-badge')).toBeNull();
      expect(screen.getByRole('button', { name: /^Key RTI: ✦/ })).toBeInTheDocument();
      unmount();
    }
  });

  it('gives each instance its own arrow marker', () => {
    const { container } = render(
      <>
        <Keyboard compiled={qwerty} id="kb-a" arcs={[[0, 1]]} />
        <Keyboard compiled={qwerty} id="kb-b" arcs={[[0, 1]]} />
      </>,
    );
    const ids = [...container.querySelectorAll('marker')].map((m) => m.id);
    expect(ids).toEqual(['lb-arrow-kb-a', 'lb-arrow-kb-b']);
    expect(new Set(ids).size).toBe(2);
  });

  it('draws the arrow tracing a selected pair in green, apart from the heat under it', () => {
    const { container } = render(<Keyboard compiled={qwerty} arcs={[[0, 1]]} heat={{ 0: 1 }} />);
    const arc = container.querySelector('.lb-arc path') as SVGPathElement;
    expect(arc.getAttribute('style')).toContain('var(--lb-arc)');
    expect(container.querySelector('marker path')?.getAttribute('style')).toContain(
      'var(--lb-arc)',
    );
  });

  it('marks highlighted keys', () => {
    const pos = qwerty.keyIndex.get('RHI') as number;
    const { container } = render(<Keyboard compiled={qwerty} highlight={[pos]} />);
    const cap = container.querySelector('g[data-key="RHI"] .lb-key-cap');
    expect(cap?.classList.contains('lb-key-highlight')).toBe(true);
  });
});

describe('the legend under the board', () => {
  it('says there is nothing to explain when every key fits its label', () => {
    render(<KeyLegend compiled={qwerty} />);
    expect(screen.queryByRole('list', { name: 'Key legend' })).toBeNull();
    expect(screen.getByText(/Every key on this layer fits its label/)).toBeInTheDocument();
  });

  it('lists the keys it numbers, and no hint, when there are some', () => {
    render(<KeyLegend compiled={romak} />);
    expect(screen.getByRole('list', { name: 'Key legend' })).toBeInTheDocument();
    expect(screen.queryByText(/Every key on this layer fits its label/)).toBeNull();
  });
});

describe('a dead key', () => {
  const doc = bundledLayout('qwerty')!;
  const accented = compileLayout({
    ...doc,
    layers: doc.layers.map((l, i) =>
      i === 0
        ? {
            ...l,
            bindings: { ...l.bindings, LHM: { kind: 'dead_key', diacritic: '´', shifted: '¨' } },
          }
        : l,
    ),
  });

  it('draws its spacing accent, styled as dead, with a mark where the letter will go', () => {
    const { container } = render(<Keyboard compiled={accented} />);
    const key = container.querySelector('g[data-key="LHM"]') as Element;
    const tap = key.querySelector('.lb-key-tap') as Element;
    expect(tap.textContent).toBe('´');
    expect(tap).toHaveClass('lb-key-dead');
    const shifted = key.querySelector('.lb-key-shifted') as Element;
    expect(shifted.textContent).toBe('¨');
    // What shift arms is an accent too, and drawn as one.
    expect(shifted).toHaveClass('lb-key-dead');
    expect(key.querySelector('.lb-key-dead-base')).not.toBeNull();
    // A key that types its letter is not marked.
    const lhi = container.querySelector('g[data-key="LHI"]') as Element;
    expect(lhi.querySelector('.lb-key-dead, .lb-key-dead-base')).toBeNull();
  });
});

describe('a click on the board between the keys', () => {
  const at = { clientX: 10, clientY: 10 };

  it('clears what is picked, and a click on a key does not', async () => {
    const user = userEvent.setup();
    const onEmptyClick = vi.fn();
    const onKeyClick = vi.fn();
    render(<Keyboard compiled={qwerty} onKeyClick={onKeyClick} onEmptyClick={onEmptyClick} />);
    await user.click(screen.getByRole('button', { name: 'Key LHM: d' }));
    expect(onKeyClick).toHaveBeenCalledTimes(1);
    expect(onEmptyClick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('group', { name: 'Keyboard layout' }));
    expect(onEmptyClick).toHaveBeenCalledTimes(1);
  });

  it('does nothing at the end of a drag or a swipe that ended between the keys', () => {
    const onEmptyClick = vi.fn();
    render(
      <Keyboard compiled={qwerty} draggable onDropKey={vi.fn()} onEmptyClick={onEmptyClick} />,
    );
    const board = screen.getByRole('group', { name: 'Keyboard layout' });
    const key = screen.getByRole('button', { name: 'Key LHM: d' });

    // A key dragged and let go between the keys.
    fireEvent.pointerDown(key, { ...at, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(board, { clientX: 60, clientY: 10, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(board, { clientX: 60, clientY: 10, pointerId: 1, pointerType: 'mouse' });
    fireEvent.click(board, { clientX: 60, clientY: 10 });
    expect(onEmptyClick).not.toHaveBeenCalled();

    // A finger swiped across the board, from between the keys.
    fireEvent.pointerDown(board, { ...at, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(board, { clientX: 120, clientY: 12, pointerId: 2, pointerType: 'touch' });
    fireEvent.click(board, { clientX: 120, clientY: 12 });
    expect(onEmptyClick).not.toHaveBeenCalled();

    // A finger's tap lands a few pixels from where it went down, and still clears.
    fireEvent.pointerDown(board, { ...at, pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerUp(board, { clientX: 18, clientY: 14, pointerId: 4, pointerType: 'touch' });
    fireEvent.click(board, { clientX: 18, clientY: 14 });
    expect(onEmptyClick).toHaveBeenCalledTimes(1);

    // A plain press and release there clears too.
    fireEvent.pointerDown(board, { ...at, pointerId: 3, pointerType: 'mouse' });
    fireEvent.pointerUp(board, { ...at, pointerId: 3, pointerType: 'mouse' });
    fireEvent.click(board, at);
    expect(onEmptyClick).toHaveBeenCalledTimes(2);
  });

  it('does nothing on the click that ends a drag brought back to where it began', () => {
    const onEmptyClick = vi.fn();
    const onKeyClick = vi.fn();
    render(
      <Keyboard
        compiled={qwerty}
        draggable
        onDropKey={vi.fn()}
        onKeyClick={onKeyClick}
        onEmptyClick={onEmptyClick}
      />,
    );
    const board = screen.getByRole('group', { name: 'Keyboard layout' });
    const key = screen.getByRole('button', { name: 'Key LHM: d' });
    const mouse = { pointerId: 1, pointerType: 'mouse' };
    fireEvent.pointerDown(key, { ...at, ...mouse });
    fireEvent.pointerMove(board, { clientX: 60, clientY: 10, ...mouse });
    fireEvent.pointerMove(board, { clientX: 11, clientY: 10, ...mouse });
    fireEvent.pointerUp(board, { clientX: 11, clientY: 10, ...mouse });
    // Under the pointer the board kept, the click lands on the board, where the press began.
    fireEvent.click(board, { clientX: 11, clientY: 10 });
    expect(onEmptyClick).not.toHaveBeenCalled();
    // And only that click is the drop's: the next one on a key picks it.
    fireEvent.click(key);
    expect(onKeyClick).toHaveBeenCalledTimes(1);
  });

  it('is not a click between the keys on a combo’s pill', async () => {
    const user = userEvent.setup();
    const onEmptyClick = vi.fn();
    const onComboClick = vi.fn();
    render(
      <Keyboard
        compiled={qwerty}
        combos={[{ id: 'c', index: 0, keys: [0, 1], label: 'x' }]}
        onComboClick={onComboClick}
        onEmptyClick={onEmptyClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Edit combo/ }));
    expect(onComboClick).toHaveBeenCalledWith(0);
    expect(onEmptyClick).not.toHaveBeenCalled();
  });
});

describe("a combo's pill", () => {
  const key = (cx: number) => ({ cx, cy: 50, w: 54, h: 54 });
  const row = [key(30), key(90), key(150)];

  it('sits halfway between two keys, on the gap', () => {
    expect(
      comboPillAt(
        [row[0], row[1]].map(({ cx, cy }) => ({ x: cx, y: cy })),
        row,
      ),
    ).toEqual({
      x: 60,
      y: 50,
    });
  });

  it('moves to the gap below the middle key of three in a row, off its legend', () => {
    expect(
      comboPillAt(
        row.map(({ cx, cy }) => ({ x: cx, y: cy })),
        row,
      ),
    ).toEqual({ x: 90, y: 80 });
  });
});

describe('drawing a split board', () => {
  const drawn = (id: string) => {
    const layout = bundledLayout(id);
    if (!layout) throw new Error(`no layout ${id}`);
    const keys = compileLayout(layout).keys;
    return { keys, xs: drawnX(keys) };
  };
  /** The room between the hands as drawn: the left hand's right edge to the right hand's left. */
  const between = ({ keys, xs }: ReturnType<typeof drawn>) => {
    // Turned thumbs reach further than their width, and it is the drawn reach that counts.
    const edge = (i: number, side: number) => xs[i] + side * reach(keys[i]).x;
    const left = Math.max(...keys.map((k, i) => (k.hand === 'L' ? edge(i, 1) : -Infinity)));
    const right = Math.min(...keys.map((k, i) => (k.hand === 'R' ? edge(i, -1) : Infinity)));
    return right - left;
  };

  it('draws the halves a third of a key apart, whatever room the geometry keeps between them', () => {
    // A 24-key board's presets place its halves as if it had inner columns; they are drawn close.
    expect(between(drawn('magic-romak'))).toBeCloseTo(0.3, 6);
    expect(between(drawn('qwerty'))).toBeCloseTo(0.3, 6);
  });

  it('moves a hand as one piece, so nothing within it changes', () => {
    const { keys, xs } = drawn('magic-romak');
    const right = keys.map((k, i) => [k, xs[i]] as const).filter(([k]) => k.hand === 'R');
    const shifts = new Set(right.map(([k, x]) => (k.x - x).toFixed(6)));
    expect(shifts.size).toBe(1);
    // And the left hand does not move at all.
    keys.forEach((k, i) => {
      if (k.hand === 'L') expect(xs[i]).toBe(k.x);
    });
  });
});
