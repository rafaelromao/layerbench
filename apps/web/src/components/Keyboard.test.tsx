import { bundledLayout, compileLayout } from '@layoutmaster/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { drawnX, Keyboard, reach } from './Keyboard.js';

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
    expect(onKeyClick).toHaveBeenCalledWith('LHM');

    await user.keyboard(' ');
    expect(onKeyClick).toHaveBeenCalledTimes(2);
  });

  it('is inert and unlabelled as a control when not interactive', () => {
    render(<Keyboard compiled={qwerty} interactive={false} />);
    expect(screen.getByRole('img', { name: 'Keyboard layout' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('paints heat into the key fill', () => {
    const pos = qwerty.keyIndex.get('LHM') as number;
    const { container } = render(<Keyboard compiled={qwerty} heat={{ [pos]: 1 }} />);
    const cap = container.querySelector(`g[data-key="LHM"] .lm-key-cap`) as SVGRectElement;
    expect(cap.getAttribute('style')).toContain('var(--lm-heat) 100%');
  });

  describe('legends on a hot key', () => {
    // Magic Romak's right inner thumb taps into Alpha 2, so its legend is drawn in that layer's colour.
    const R0 = romak.keyIndex.get('R0') as number;
    const layerColoured = (container: HTMLElement) =>
      [...container.querySelectorAll('g[data-key="R0"] text')].filter((t) =>
        t.getAttribute('style')?.includes('var(--lm-layer-'),
      );
    const isHot = (container: HTMLElement) =>
      container.querySelector('g[data-key="R0"]')?.classList.contains('lm-key-hot');

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
        .filter((g) => g.querySelector('.lm-key-reach'))
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
      const band = container.querySelector('g[data-key="R0"] .lm-key-reach-word');
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
          .querySelector('g[data-key="R0"] .lm-key-reach')
          ?.getAttribute('style');
        unmount();
        return style ?? '';
      };
      expect(ring(0.49)).toContain(`var(--lm-layer-${SYM})`);
      expect(ring(0.5)).toBe('');
      expect(ring(1)).toBe('');
      expect(ring(0, [R0])).toBe('');
    });

    it('leaves the band to a hold of its own, and to no band at all without holds', () => {
      const { container } = render(<Keyboard compiled={romak} layer={SYM} showHold={false} />);
      expect(ringed(container)).toEqual(['R0 held']);
      expect(container.querySelector('.lm-key-reach-word')).toBeNull();
    });

    it('keeps one cap per key, so nothing measured by caps changes', () => {
      const { container } = render(<Keyboard compiled={romak} layer={SYM} />);
      expect(container.querySelectorAll('.lm-key-cap')).toHaveLength(romak.keys.length);
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

  it('gives each instance its own arrow marker', () => {
    const { container } = render(
      <>
        <Keyboard compiled={qwerty} id="kb-a" arcs={[[0, 1]]} />
        <Keyboard compiled={qwerty} id="kb-b" arcs={[[0, 1]]} />
      </>,
    );
    const ids = [...container.querySelectorAll('marker')].map((m) => m.id);
    expect(ids).toEqual(['lm-arrow-kb-a', 'lm-arrow-kb-b']);
    expect(new Set(ids).size).toBe(2);
  });

  it('marks highlighted keys', () => {
    const pos = qwerty.keyIndex.get('RHI') as number;
    const { container } = render(<Keyboard compiled={qwerty} highlight={[pos]} />);
    const cap = container.querySelector('g[data-key="RHI"] .lm-key-cap');
    expect(cap?.classList.contains('lm-key-highlight')).toBe(true);
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
