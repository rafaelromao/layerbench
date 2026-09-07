import { bundledLayout, compileLayout } from '@layoutmaster/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Keyboard } from './Keyboard.js';

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
