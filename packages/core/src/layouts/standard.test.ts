import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { explain } from '../sim/resolver.js';
import { bundledLayout } from './index.js';
import { withStandardThumbs } from './standard.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

/** A base layer with a few letters and `/`, and `thumbs` on the thumbs. */
function layout(thumbs: Record<string, Binding>, preset = '3x5+2'): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'Test',
    hostLocale: 'symbols',
    geometry: { preset },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: { LHP: kp('a'), LHR: kp('b'), RBP: kp('/'), RBR: kp('.'), ...thumbs },
      },
    ],
  };
}

describe('the standard thumbs', () => {
  const geometry = getGeometryPreset('3x5+2');

  it('empty a base-layer symbol other than the four marks, and keep the letters and those', () => {
    const base = withStandardThumbs(layout({ L1: kp(' ') }), geometry, 'layerbench').layers[0];
    expect(base.bindings.RBP).toEqual({ kind: 'none' });
    expect(base.bindings.RBR).toEqual(kp('.'));
    expect(base.bindings.LHP).toEqual(kp('a'));
  });

  it('leave a thumb past the main four only when it types a letter', () => {
    const six = getGeometryPreset('3x6+3');
    const base = withStandardThumbs(
      layout({ L2: kp('x'), L0: kp(' '), R2: { kind: 'trans' } }, '3x6+3'),
      six,
      'author',
    ).layers[0].bindings;
    expect(base.L2).toEqual(kp('x'));
    expect(base.R2).toBeUndefined();
  });

  it('declare R1, held, the shift key, so Caps word has a key to go on', () => {
    const qwerty = bundledLayout('qwerty') as Layout;
    expect(qwerty.keys.shift).toEqual({ key: 'R1', kind: 'hold' });
    // Compiling throws on a feature with no key to go on.
    const compiled = compileLayout({ ...qwerty, features: { capsWord: {} } });
    const steps = explain(compiled, 'Ab', { caseMode: 'model', crossWord: 'reset' }).steps;
    expect(steps.map((s) => `${s.key}:${s.kind}`)).toEqual([
      'R1:hold_press',
      'LHP:tap',
      'R1:hold_release',
      'LBC:tap',
    ]);
  });

  it('refuse a board without the four main thumbs', () => {
    const l = layout({ L0: kp(' ') }, '13332+1');
    expect(() => withStandardThumbs(l, getGeometryPreset('13332+1'), 'layerbench')).toThrow(
      /no L1, L0, R0, R1 thumbs/,
    );
  });

  it('refuse a layout that already has a default layer', () => {
    const l = layout({ L0: kp(' ') });
    l.layers.push({ id: 'num', bindings: {} });
    expect(() => withStandardThumbs(l, geometry, 'layerbench')).toThrow(/already has/);
  });

  it('refuse more thumb letters than the main thumbs can take', () => {
    const l = layout({ L1: kp('x'), L0: kp('y'), R0: kp('z') });
    expect(() => withStandardThumbs(l, geometry, 'layerbench')).toThrow(/more thumb letters/);
  });

  it('refuse a second thumb letter with nowhere for Repeat to go', () => {
    const l = layout({ L0: kp('y'), R0: kp('z') });
    expect(() => withStandardThumbs(l, geometry, 'layerbench')).toThrow(/give Repeat a base key/);
  });

  it("refuse an author's space off the main thumbs, or none at all", () => {
    const six = getGeometryPreset('3x6+3');
    expect(() => withStandardThumbs(layout({ L2: kp(' ') }, '3x6+3'), six, 'author')).toThrow(
      /space is on L2/,
    );
    expect(() => withStandardThumbs(layout({}), geometry, 'author')).toThrow(/no main thumb/);
  });
});
