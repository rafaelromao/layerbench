import { expect, it, describe as suite } from 'vitest';
import { bundledLayout } from '../layouts/index.js';
import { compileLayout } from './compile.js';
import { BADGE, describe, LAYER_MODE, legend, legendText, tapLabel } from './labels.js';
import type { Binding } from './types.js';

const c = compileLayout(bundledLayout('magic-romak')!);
const at = (keyId: string, layer = 0) => c.layers[layer].bindings[c.keyIndex.get(keyId)!];

suite('legends', () => {
  it('puts a layer key’s layer in the centre and how it comes on beneath', () => {
    const cases: [Binding, string][] = [
      [{ kind: 'mo', layer: 'num' }, LAYER_MODE.mo],
      [{ kind: 'sl', layer: 'num' }, LAYER_MODE.sl],
      [{ kind: 'tog', layer: 'num' }, LAYER_MODE.tog],
      [{ kind: 'to', layer: 'num' }, LAYER_MODE.to],
      [{ kind: 'auto_layer', layer: 'num' }, LAYER_MODE.auto_layer],
    ];
    for (const [b, mode] of cases) {
      const l = legend(c, b);
      expect(l.tap).toBe('Numb');
      expect(l.hold).toBe(mode);
      expect(l.holdIsMode).toBe(true);
      expect(l.layer).toBe('num');
      expect(l.layerIn).toBe('tap');
    }
  });

  it('draws a layer tap as its tap, with the layer as what a hold does', () => {
    const l = legend(c, { kind: 'lt', layer: 'num', tap: { kind: 'kp', symbol: 'a' } });
    expect([l.tap, l.hold, l.holdIsMode, l.layerIn]).toEqual(['a', 'Numb', false, 'hold']);
    expect(legendText(l)).toBe('a / Numb');
  });

  it('never reads a layer called like a mode as a mode', () => {
    // `holdIsMode` comes from the kind of key, not from the text drawn.
    const l = legend(c, { kind: 'lt', layer: 'num', tap: { kind: 'kp', symbol: 'a' } });
    expect(l.holdIsMode).toBe(false);
  });

  it('shows an adaptive key by its default, marked, rather than by every alternative', () => {
    const magic = legend(c, at('RBI'));
    expect(magic.tap).toBe('h');
    expect(magic.badge).toBe(BADGE.adaptive);
    expect(magic.detail).toMatch(/^adaptive: types h; after a e i/);
  });

  it('describes alt repeat once, its tagged branches included', () => {
    const d = legend(c, at('L1')).detail;
    expect(d.match(/adaptive:/g)).toHaveLength(1);
    expect(d).toContain('repeats the previous key');
    // A tag is a condition on the previous press, said as one rather than listed as a symbol.
    expect(d).toContain('a key tagged alpha2');
    expect(d).not.toContain('#');
  });

  it('spells a macro out step by step', () => {
    const b: Binding = {
      kind: 'macro',
      steps: [
        { kind: 'kp', symbol: ' ' },
        { kind: 'sk', mod: 'LSHIFT' },
      ],
    };
    expect(describe(c, b)).toBe('types a space, then left Shift for the next key (one-shot)');
  });

  it('reads the letters a macro types one by one as the text they make', () => {
    const b: Binding = {
      kind: 'macro',
      steps: [
        { kind: 'kp', symbol: 'ã' },
        { kind: 'kp', symbol: 'o' },
        { kind: 'sk', mod: 'LSHIFT' },
        { kind: 'kp', symbol: 'x' },
      ],
    };
    expect(describe(c, b)).toBe(
      'types ão, then left Shift for the next key (one-shot), then types x',
    );
  });

  it('shows what shift types only when it is not the capital', () => {
    expect(legend(c, { kind: 'kp', symbol: 'a', shifted: 'A' }).shifted).toBeNull();
    expect(legend(c, { kind: 'kp', symbol: ',', shifted: ';' }).shifted).toBe(';');
  });

  it('draws a dead key on a dotted circle', () => {
    expect(tapLabel(c, { kind: 'dead_key', diacritic: '´' })).toBe('◌́');
  });

  it('keeps an imported key’s own legend, and says it is not simulated', () => {
    const l = legend(c, { kind: 'raw', label: 'BT1', source: '&bt BT_SEL 1' });
    expect([l.tap, l.kind]).toEqual(['BT1', 'raw']);
    expect(l.detail).toContain('not simulated');
  });
});
