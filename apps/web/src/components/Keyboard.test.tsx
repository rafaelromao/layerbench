import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  type CompiledLayout,
  compileLayout,
} from '@layerbench/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CombosApart, worksOn } from './CombosApart.js';
import { type PlacedKey, placeCombos } from './combo-layout.js';
import { combosApart, drawnX, Keyboard, KeyLegend, reach, typingCombos } from './Keyboard.js';

const qwerty = compileLayout(bundledLayout('qwerty')!);
const romak = compileLayout(bundledLayout('magic-romak')!);

describe('Keyboard', () => {
  it('draws one group per physical key, labelled for a screen reader', () => {
    const { container } = render(<Keyboard compiled={qwerty} />);
    const keys = container.querySelectorAll('g[data-key]');
    expect(keys.length).toBe(qwerty.keys.length);
    expect(screen.getByRole('button', { name: 'Key LHM: d, hold ⌥' })).toBeInTheDocument();
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

    const key = screen.getByRole('button', { name: 'Key LHM: d, hold ⌥' });
    key.focus();
    await user.keyboard('{Enter}');
    expect(onKeyClick).toHaveBeenCalledWith('LHM', { add: false });

    await user.keyboard(' ');
    expect(onKeyClick).toHaveBeenCalledTimes(2);

    // Shift adds the key to the ones picked, from the keyboard as with a click.
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onKeyClick).toHaveBeenLastCalledWith('LHM', { add: true });
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Key LHI: f, hold ⇧' }));
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
      expect(list.textContent).toContain(
        'tapped from Alpha 1, or from Alpha 1 after a sentence ends, by its macro, to reach Alpha 2',
      );
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

  it('draws a key that only holds as a tap-hold with nothing to tap, and names it by its hold', () => {
    const base = bundledLayout('qwerty')!;
    const [first, ...rest] = base.layers;
    const held = compileLayout({
      ...base,
      layers: [
        {
          ...first,
          bindings: {
            ...first.bindings,
            LHM: { kind: 'mo', layer: 'num' },
            LHI: { kind: 'mod', mod: 'LSHIFT' },
          },
        },
        ...rest,
      ],
    });
    const { container } = render(<Keyboard compiled={held} />);
    for (const [key, hold] of [
      ['LHM', 'Numb'],
      ['LHI', '⇧'],
    ]) {
      const g = container.querySelector(`g[data-key="${key}"]`) as SVGGElement;
      expect(g.querySelector('.lb-key-tap')?.textContent ?? '').toBe('');
      expect(g.querySelector('.lb-key-hold')?.textContent).toBe(hold);
      expect(screen.getByRole('button', { name: `Key ${key}: hold ${hold}` })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Key LHM: d, hold ⌥' }));
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
    const key = screen.getByRole('button', { name: 'Key LHM: d, hold ⌥' });

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
    const key = screen.getByRole('button', { name: 'Key LHM: d, hold ⌥' });
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

  it('is not a click between the keys on a combo’s box', async () => {
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

describe("a combo's box", () => {
  /** Two rows of keys a key apart, as the board draws them: caps of 58 on a pitch of 64. */
  const key = (cx: number, cy = 100): PlacedKey => ({ cx, cy, w: 58, h: 58, rx: 29, ry: 29 });
  const row = [32, 96, 160, 224, 288].map((x) => key(x));
  const board = [...row, ...row.map((k) => key(k.cx, 164))];
  const place = (keys: number[], w = 27, h = 20) => placeCombos(board, [{ keys, w, h }])[0];

  it('sits on the gap between two neighbours', () => {
    expect(place([0, 1])).toEqual({ x: 64, y: 100, w: 27, h: 20 });
    // One above the other, and diagonal, too.
    expect(place([1, 6])).toMatchObject({ x: 96, y: 132 });
    expect(place([1, 7])).toMatchObject({ x: 128, y: 132 });
  });

  it('is not drawn on the board for keys apart, or three or more', () => {
    // A key between them, three in a row, and three in no one row.
    expect(place([0, 2])).toBeNull();
    expect(place([5, 6, 7])).toBeNull();
    expect(place([0, 1, 6])).toBeNull();
  });

  it('narrows, its legend smaller, to fit its gap clear of the legends either side', () => {
    // Wider than the gap leaves room for, but narrow enough at its smallest size.
    const c = placeCombos(board, [{ keys: [0, 1], w: 36, minW: 28, h: 20 }])[0];
    expect(c).toMatchObject({ x: 64 });
    expect(c?.w).toBeLessThanOrEqual(32);
    // Too wide even at its narrowest, it is drawn apart.
    expect(placeCombos(board, [{ keys: [0, 1], w: 40, minW: 36, h: 20 }])[0]).toBeNull();
  });

  it('is not drawn where it would cover another box', () => {
    const [first, second] = placeCombos(board, [
      { keys: [0, 1], w: 27, h: 20 },
      { keys: [0, 1], w: 27, h: 20 },
    ]);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

/** Each drawn key's centre and cap, and each combo's box, from a board as rendered. */
function drawn(compiled: CompiledLayout, layer: number) {
  const { container, unmount } = render(
    <Keyboard
      compiled={compiled}
      layer={layer}
      combos={typingCombos(compiled, layer)}
      onComboClick={() => {}}
    />,
  );
  const at = (g: Element) => {
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
    return { x: Number(m?.[1]), y: Number(m?.[2]) };
  };
  const keys = new Map(
    [...container.querySelectorAll('g[data-key]')].map((g) => {
      const rect = g.querySelector('rect');
      const w = Number(rect?.getAttribute('width'));
      const h = Number(rect?.getAttribute('height'));
      const { x, y } = at(g);
      return [g.getAttribute('data-key'), { cx: x, cy: y, w, h }];
    }),
  );
  const boxes = [...container.querySelectorAll('g.lb-combo')].map((g) => {
    const rect = g.querySelector('rect');
    return {
      ...at(g),
      w: Number(rect?.getAttribute('width')),
      h: Number(rect?.getAttribute('height')),
      name: g.getAttribute('aria-label') ?? '',
      combo: g.getAttribute('data-combo'),
    };
  });
  const viewBox = (container.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ');
  return { container, unmount, keys, boxes, width: Number(viewBox[2]) };
}

/**
 * How far from a key's centre its legend reaches: a tap legend at its largest, 22, is about 13
 * across and 16 down, and the band and the shifted legend sit further out, along the edges.
 */
const LEGEND = 15;

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };

function onLegend(box: Rect, k: Point): boolean {
  const dx = Math.max(0, Math.abs(box.x - k.x) - box.w / 2);
  const dy = Math.max(0, Math.abs(box.y - k.y) - box.h / 2);
  return Math.hypot(dx, dy) < LEGEND;
}

/** What crowds a board: a box on another, on a key's legend, or off the drawing. */
function crowded({ boxes, keys, width }: ReturnType<typeof drawn>): string[] {
  const faults: string[] = [];
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) {
        faults.push(`${a.name} on ${b.name}`);
      }
    }
    for (const [id, k] of keys) {
      if (onLegend(a, { x: k.cx, y: k.cy })) faults.push(`${a.name} on key ${id}`);
    }
    if (a.x - a.w / 2 < 0 || a.x + a.w / 2 > width) faults.push(`${a.name} off the drawing`);
  });
  return faults;
}

describe("T-34's combos, as Keymap Drawer draws them", () => {
  const t34 = compileLayout(bundledLayout('t-34')!);
  const combos = typingCombos(t34, 0);

  it('draws those on two neighbouring keys on the board, named as before', () => {
    const { boxes, keys } = drawn(t34, 0);
    const names = boxes.map((b) => b.name);
    expect(names).toContain('Edit combo LHM + LHI: Esc / Symb');
    // A thumb just under its bottom-row key is its neighbour.
    expect(names).toContain('Edit combo L0 + LBI: %');
    const q = boxes.find((b) => b.name === 'Edit combo LTP + LTR: q');
    expect(q?.x).toBeCloseTo(((keys.get('LTP')?.cx ?? 0) + (keys.get('LTR')?.cx ?? 0)) / 2, 6);
    expect(screen.getByRole('button', { name: 'Edit combo LTP + LTR: q' })).toBeInTheDocument();
  });

  it('leaves the combos on keys apart off the board, for the list beside it', () => {
    const apart = combosApart(t34, combos);
    const { boxes } = drawn(t34, 0);
    expect(apart.length + boxes.length).toBe(combos.length);
    expect(apart.map((c) => c.label)).toEqual(
      expect.arrayContaining(['|', '~', 'https://', 'Numb', '"', 'Swed']),
    );
    // Not one of them is drawn among the keys.
    const drawnNames = new Set(boxes.map((b) => b.name));
    for (const c of apart) {
      const names = c.keys.map((p) => t34.keys[p].id).join(' + ');
      expect(drawnNames.has(`Edit combo ${names}: ${c.label}`)).toBe(false);
    }
  });

  it("outlines a box's keys while it is pointed at or focused, and not once it has gone", () => {
    const outlined = (container: HTMLElement) =>
      [...container.querySelectorAll('g[data-key]')]
        .filter((g) => g.querySelector('.lb-key-highlight'))
        .map((g) => g.getAttribute('data-key'));
    const board = (layer: number) => (
      <Keyboard
        compiled={t34}
        layer={layer}
        combos={typingCombos(t34, layer)}
        onComboClick={() => {}}
      />
    );
    const { container, rerender } = render(board(0));
    const q = screen.getByRole('button', { name: 'Edit combo LTP + LTR: q' });
    fireEvent.pointerEnter(q);
    expect(outlined(container)).toEqual(['LTP', 'LTR']);
    fireEvent.pointerLeave(q);
    expect(outlined(container)).toEqual([]);
    fireEvent.focus(screen.getByRole('button', { name: 'Edit combo LHM + LHI: Esc / Symb' }));
    expect(outlined(container)).toEqual(['LHM', 'LHI']);
    // `q` types on Base only: pointed at, then gone with its layer, it hears no leave, and comes
    // back unlit.
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Edit combo LTP + LTR: q' }));
    rerender(board(3));
    rerender(board(0));
    expect(outlined(container)).not.toContain('LTP');
    expect(
      screen.getByRole('button', { name: 'Edit combo LTP + LTR: q' }).getAttribute('class'),
    ).not.toContain('lb-combo-lit');
  });

  it('lets no box overlap another or a legend', () => {
    expect(crowded(drawn(t34, 0))).toEqual([]);
  });
});

describe('every bundled layout with combos', () => {
  it('draws them with nothing crowding the board, on every layer', () => {
    const faults = BUNDLED_LAYOUTS.flatMap((layout) => {
      const compiled = compileLayout(layout);
      return compiled.layers.flatMap((_, layer) => {
        if (typingCombos(compiled, layer).length === 0) return [];
        const board = drawn(compiled, layer);
        const found = crowded(board).map((f) => `${layout.id} ${layer}: ${f}`);
        board.unmount();
        return found;
      });
    });
    expect(faults).toEqual([]);
  });
});

describe('the combos on keys apart', () => {
  const t34 = compileLayout(bundledLayout('t-34')!);
  const apart = combosApart(t34, typingCombos(t34, 0));

  it('are a button beside the board, which opens them each on a board of its own', async () => {
    const user = userEvent.setup();
    const onComboClick = vi.fn();
    render(<CombosApart compiled={t34} layer={0} combos={apart} onComboClick={onComboClick} />);
    await user.click(screen.getByRole('button', { name: `${apart.length} more combos on Base` }));
    const dialog = screen.getByRole('dialog', { name: 'Combos on Base' });
    const list = within(dialog).getByRole('list', { name: 'Combos on Base' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(apart.length);
    // Each with its keys filled on a small board, and the layers it works on.
    const pipe = within(dialog).getByRole('button', { name: 'Edit combo L0 + LHP: |' });
    expect(within(pipe).getByRole('img', { name: 'Keys L0 + LHP' })).toBeInTheDocument();
    expect(pipe.querySelectorAll('.lb-combo-apart-key-on')).toHaveLength(2);
    expect(pipe).toHaveAccessibleDescription('Every layer');
    // Picked, it opens in the editor.
    await user.click(pipe);
    const picked = apart.find((c) => c.label === '|');
    expect(onComboClick).toHaveBeenCalledWith(picked?.index);
  });

  it('keep the dialog as the board was when it opened, while the board turns on', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { rerender } = render(
      <CombosApart compiled={t34} layer={0} combos={apart} onOpen={onOpen} />,
    );
    await user.click(screen.getByRole('button', { name: /more combos/ }));
    // The view stops what would turn the board: a word being played.
    expect(onOpen).toHaveBeenCalledTimes(1);
    // The board turns to a layer with none apart, as a word playing would: the button goes, the
    // dialog stays as it was, and is not opened again when the board comes back.
    rerender(<CombosApart compiled={t34} layer={3} combos={[]} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: /more combos/ })).toBeNull();
    const dialog = screen.getByRole('dialog', { name: 'Combos on Base' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(apart.length);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    rerender(<CombosApart compiled={t34} layer={0} combos={apart} onOpen={onOpen} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('close the dialog when the layout changes under it, as an Undo does', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CombosApart compiled={t34} layer={0} combos={apart} />);
    await user.click(screen.getByRole('button', { name: /more combos/ }));
    expect(screen.getByRole('dialog', { name: 'Combos on Base' })).toBeInTheDocument();
    // What it lists may be gone, or renumbered: a pick would open another combo.
    const edited = compileLayout(bundledLayout('t-34')!);
    rerender(
      <CombosApart
        compiled={edited}
        layer={0}
        combos={combosApart(edited, typingCombos(edited, 0))}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('light the button while one of them is the press being played', () => {
    const played = apart.map((c) => (c.label === 'é' ? { ...c, active: true } : c));
    render(<CombosApart compiled={t34} layer={0} combos={played} />);
    const button = screen.getByRole('button', {
      name: `${apart.length} more combos on Base, one being played: é`,
    });
    expect(button).toHaveClass('btn-primary');
  });

  it('are only drawn where nothing picks them, and are no button when there are none', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CombosApart compiled={t34} layer={0} combos={apart} />);
    await user.click(screen.getByRole('button', { name: /more combos/ }));
    expect(screen.queryByRole('button', { name: /^Edit combo/ })).toBeNull();
    expect(screen.getByRole('figure', { name: 'Combo L0 + LHP: |' })).toBeInTheDocument();
    rerender(<CombosApart compiled={t34} layer={0} combos={[]} />);
    expect(screen.queryByRole('button', { name: /more combos/ })).toBeNull();
  });

  it('say which layers each works on, by name when not every one', () => {
    // T-34's letter combos type only on its base layer.
    const q = typingCombos(t34, 0).find((c) => c.label === 'q');
    expect(worksOn(t34, q?.index ?? -1)).toBe('Base');
    const pipe = apart.find((c) => c.label === '|');
    expect(worksOn(t34, pipe?.index ?? -1)).toBe('Every layer');
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
