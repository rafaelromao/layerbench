import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { bundledLayout } from '../layouts/index.js';
import { Machine } from './machine.js';

const magicRomak = bundledLayout('magic-romak')!;

function mini(layers: Layout['layers'], extra: Partial<Layout> = {}): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'mini',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers,
    ...extra,
  };
}

function machineFor(layout: Layout) {
  const compiled = compileLayout(layout);
  const m = new Machine(compiled);
  const pos = (id: string) => compiled.keyIndex.get(id)!;
  const tap = (id: string) => m.perform({ type: 'tap', pos: pos(id) })[0];
  const hold = (id: string) => m.perform({ type: 'hold_press', pos: pos(id) })[0];
  const release = (id: string) => m.perform({ type: 'hold_release', pos: pos(id) })[0];
  return { compiled, m, pos, tap, hold, release };
}

describe('Machine — one-shot layers', () => {
  it('sticky layer is consumed by exactly one press', () => {
    const { m, tap, compiled } = machineFor(magicRomak);
    expect(tap('R0').leafKind).toBe('sl');
    expect(m.isLayerActive(compiled.layerIndex.get('alpha2')!)).toBe(true);
    const q = tap('LTR');
    expect(q.symbols).toBe('q');
    expect(q.layer).toBe(compiled.layerIndex.get('alpha2'));
    expect(m.isLayerActive(compiled.layerIndex.get('alpha2')!)).toBe(false);
    expect(tap('LHM').symbols).toBe('s');
  });

  it('sticky layer + modifier press consumes the one-shot without output (wasted)', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHR: { kind: 'sl', layer: 'one' },
          LHM: { kind: 'sk', mod: 'LSHIFT' },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
      { id: 'one', bindings: { LHP: { kind: 'kp', symbol: 'b' } } },
    ]);
    const { m, tap, compiled } = machineFor(layout);
    tap('LHR');
    const ev = tap('LHM'); // sticky shift: transparent on layer one → resolves on base as a modifier press
    expect(ev.symbols).toBe('');
    expect(ev.wastedOneShot).toBe(true);
    expect(m.isLayerActive(compiled.layerIndex.get('one')!)).toBe(false);
    // the sticky shift itself stays armed
    expect(tap('LHP').symbols).toBe('A');
  });

  it('a one-shot consumed by a transparent key falling to base is wasted', () => {
    const { tap } = machineFor(magicRomak);
    tap('R0');
    const ev = tap('L0'); // space: transparent on alpha2 → base
    expect(ev.symbols).toBe(' ');
    expect(ev.wastedOneShot).toBe(true);
  });

  it('macro arms a one-shot layer (ç → Ç extension) and the next press resolves there', () => {
    const { tap, compiled } = machineFor(magicRomak);
    tap('R0');
    const c = tap('LBM');
    expect(c.symbols).toBe('ç');
    const a = tap('RHI');
    expect(a.symbols).toBe('ã');
    expect(a.layer).toBe(compiled.layerIndex.get('ccedil'));
    expect(tap('RTM').symbols).toBe('o');
  });

  it('lastSymbol is not changed by layer taps and repeat re-sends it', () => {
    const { tap, m } = machineFor(magicRomak);
    tap('RHM'); // a
    expect(m.state.lastSymbol).toBe('a');
    tap('R0');
    expect(m.state.lastSymbol).toBe('a');
    tap('R0'); // consumes + re-arms
    tap('L0'); // space consumes one-shot (wasted); lastSymbol now ' '
    expect(m.state.lastSymbol).toBe(' ');
  });
});

describe('Machine — adaptive keys', () => {
  it('adaptive key outputs h by default and v after vowels', () => {
    const { tap } = machineFor(magicRomak);
    tap('LBM'); // c
    expect(tap('RBI').symbols).toBe('h');
    tap('RHM'); // a
    expect(tap('RBI').symbols).toBe('v');
  });

  it('alt repeat: a branch for a tagged accent first, the plain ones after it', () => {
    const { tap } = machineFor(magicRomak);
    tap('RHM'); // a
    tap('R0');
    expect(tap('RHR').symbols).toBe('é'); // an accent, tagged alpha2
    // after the tagged é, the tagged branch → x
    expect(tap('L1').symbols).toBe('x');
    // x carries no tag; the plain branch after x → arms alpha2
    const ev = tap('L1');
    expect(ev.symbols).toBe('');
    expect(ev.leafKind).toBe('sl');
  });

  it('macro sets lastSymbol to its last emitted grapheme (qu → u → ê)', () => {
    const { tap } = machineFor(magicRomak);
    tap('R0');
    expect(tap('LTM').symbols).toBe('qu');
    expect(tap('L1').symbols).toBe('ê');
  });
});

describe('Machine — sentence case, as zmk-sentence-case', () => {
  const kp = (symbol: string) => ({ kind: 'kp' as const, symbol });
  const layout = mini([
    {
      id: 'base',
      bindings: {
        LHP: kp('a'),
        LHR: kp('b'),
        LHM: kp('.'),
        LHI: kp('?'),
        LHC: kp('!'),
        LTP: kp('1'),
        LTR: kp(','),
        LTM: { kind: 'dead_key', diacritic: '´' },
        LTI: {
          kind: 'sentence_morph',
          default: kp('1'),
          pending: kp('2'),
        },
        LBP: { kind: 'sk', mod: 'LSHIFT' },
        LBR: { kind: 'key_repeat' },
        LBM: { kind: 'mo', layer: 'other' },
        L0: { kind: 'sentence_space' },
        L1: kp(' '),
      },
    },
    { id: 'other', bindings: { LHP: kp('a') } },
  ]);
  /** What tapping these keys types, from a fresh machine. */
  const typed = (...keys: string[]) => {
    const { tap } = machineFor(layout);
    return keys.map((k) => tap(k).symbols).join('');
  };

  // The module's README, row by row, with `L0` its `&sentence_space`.
  it.each([
    [['LHP', 'LHM', 'L0', 'LHR', 'LHP'], 'a. Ba'],
    [['LHP', 'LHI', 'L0', 'LHR'], 'a? B'],
    [['LHP', 'LHC', 'L0', 'LHR'], 'a! B'],
    [['LHP', 'L0', 'LHR'], 'a b'],
    [['LHP', 'LHM', 'LHR'], 'a.b'],
    [['LHM', 'L0', 'LTP', 'LHP'], '. 1a'],
    [['LHM', 'L0', 'L0', 'LHP'], '.  a'],
    [['LHM', 'L0', 'LTR', 'LHP'], '. ,a'],
  ])('types %j as %j', (keys, text) => {
    expect(typed(...keys)).toBe(text);
  });

  it('leaves no capital after a plain space, or a sentence space not after a sentence end', () => {
    expect(typed('LHM', 'L1', 'LHP')).toBe('. a');
    expect(typed('LHP', 'L0', 'L0', 'LHP')).toBe('a  a');
  });

  it('keeps the capital past a layer key, which presses no keycode', () => {
    const { tap, hold, release } = machineFor(layout);
    tap('LHM');
    tap('L0');
    hold('LBM');
    expect(tap('LHP').symbols).toBe('A');
    release('LBM');
  });

  it('gives the capital to a dead key, which accents the letter after it lowercase', () => {
    expect(typed('LHM', 'L0', 'LTM', 'LHP')).toBe('. á');
  });

  it('gives the capital to a one-shot Shift, which shifts the letter itself', () => {
    expect(typed('LHM', 'L0', 'LBP', 'LHP', 'LHP')).toBe('. Aa');
  });

  it('repeats the capital it gave', () => {
    expect(typed('LHM', 'L0', 'LHR', 'LBR')).toBe('. BB');
  });

  it("chooses a sentence morph's pending part only while a capital is pending", () => {
    expect(typed('LTI')).toBe('1');
    expect(typed('LHM', 'L0', 'LTI', 'LTI')).toBe('. 21');
  });
});

describe('Machine — a macro that types nothing', () => {
  it('is pressed as the layer key it turns a layer on with, wherever in the macro that is', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: {
            kind: 'macro',
            steps: [
              { kind: 'sl', layer: 'other' },
              { kind: 'sk', mod: 'LSHIFT' },
            ],
          },
          LHR: { kind: 'macro', symbols: 'a', then: [{ kind: 'sl', layer: 'other' }] },
        },
      },
      { id: 'other', bindings: {} },
    ]);
    const armed = machineFor(layout).tap('LHP');
    expect([armed.leafKind, armed.keyKind]).toEqual(['sl', 'layer_tap']);
    // One that types is a macro, whatever it turns on after.
    expect(machineFor(layout).tap('LHR').leafKind).toBe('macro');
  });
});

describe('Machine — a Unicode key', () => {
  const kp = (symbol: string) => ({ kind: 'kp' as const, symbol });
  const layout = mini([
    {
      id: 'base',
      bindings: {
        LHP: kp('a'),
        LHM: kp('.'),
        LBI: { kind: 'unicode', symbol: 'é', shiftedSymbol: 'É' },
        LBR: { kind: 'key_repeat' },
        LBC: {
          kind: 'adaptive',
          default: kp('x'),
          triggers: [{ afterAny: ['é'], binding: kp('y') }],
        },
        LBM: {
          kind: 'adaptive',
          default: kp('x'),
          triggers: [{ afterTags: ['t'], binding: kp('y') }],
        },
        LTP: { kind: 'macro', symbols: 'a', tag: 't' },
        L0: { kind: 'sentence_space' },
      },
    },
  ]);
  const typed = (...keys: string[]) => {
    const { tap } = machineFor(layout);
    return keys.map((k) => tap(k).symbols).join('');
  };

  it('leaves nothing for a repeat to type, as zmk-unicode types a run of keys of its own', () => {
    expect(typed('LBI', 'LBR')).toBe('é');
    expect(typed('LHP', 'LBI', 'LBR')).toBe('aé');
  });

  it('leaves nothing for an adaptive key to follow, by symbol or by tag', () => {
    expect(typed('LBI', 'LBC')).toBe('éx');
    expect(typed('LTP', 'LBI', 'LBM')).toBe('aéx');
    expect(typed('LTP', 'LBM')).toBe('ay');
  });

  it('takes a pending capital and keeps its own case', () => {
    expect(typed('LHM', 'L0', 'LBI', 'LHP')).toBe('. éa');
  });
});

describe('Machine — layer morph', () => {
  it('types its changed binding while any of its layers is on, as zmk-layer-morph does', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: {
            kind: 'layer_morph',
            layers: ['x', 'y'],
            active: { kind: 'kp', symbol: 'b' },
            inactive: { kind: 'kp', symbol: 'a' },
          },
          LHI: { kind: 'mo', layer: 'x' },
          LHM: { kind: 'mo', layer: 'y' },
        },
      },
      { id: 'x', bindings: {} },
      { id: 'y', bindings: {} },
    ]);
    const { tap, hold, release } = machineFor(layout);
    expect(tap('LHP').symbols).toBe('a');
    hold('LHM'); // y only
    expect(tap('LHP').symbols).toBe('b');
    release('LHM');
    expect(tap('LHP').symbols).toBe('a');
  });
});

describe('Machine — toggles, to-layer, locking, conditional layers', () => {
  const layout = mini(
    [
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHR: { kind: 'tog', layer: 'one' },
          LHM: { kind: 'to', layer: 'two' },
          LHI: { kind: 'mo', layer: 'one' },
          LHC: { kind: 'mo', layer: 'two' },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
      { id: 'one', bindings: { LHP: { kind: 'kp', symbol: 'b' } } },
      { id: 'two', bindings: { LHP: { kind: 'kp', symbol: 'c' } } },
      { id: 'three', bindings: { LHP: { kind: 'kp', symbol: 'd' } } },
    ],
    { conditionalLayers: [{ if: ['one', 'two'], then: 'three' }] },
  );

  it('tog flips and locks; a mo release cannot deactivate a locked layer', () => {
    const { tap, hold, release, m, compiled } = machineFor(layout);
    hold('LHI'); // mo one
    tap('LHR'); // tog one → locked
    release('LHI');
    expect(m.isLayerActive(compiled.layerIndex.get('one')!)).toBe(true);
    expect(tap('LHP').symbols).toBe('b');
    tap('LHR'); // tog off
    expect(tap('LHP').symbols).toBe('a');
  });

  it('to-layer deactivates every other layer except base', () => {
    const { tap, m, compiled } = machineFor(layout);
    tap('LHR'); // one on
    tap('LHM'); // to two
    expect(m.isLayerActive(compiled.layerIndex.get('one')!)).toBe(false);
    expect(m.isLayerActive(compiled.layerIndex.get('two')!)).toBe(true);
    expect(tap('LHP').symbols).toBe('c');
  });

  it('conditional layer is forced on when both if-layers are active and off otherwise', () => {
    const { hold, release, tap, m, compiled } = machineFor(layout);
    hold('LHI');
    expect(m.isLayerActive(compiled.layerIndex.get('three')!)).toBe(false);
    hold('LHC');
    expect(m.isLayerActive(compiled.layerIndex.get('three')!)).toBe(true);
    expect(tap('LHP').symbols).toBe('d');
    release('LHC');
    expect(m.isLayerActive(compiled.layerIndex.get('three')!)).toBe(false);
  });
});

describe('Machine — complex combos', () => {
  const kp = (symbol: string) => ({ kind: 'kp' as const, symbol });
  function board() {
    return machineFor(
      mini(
        [
          {
            id: 'base',
            bindings: { LTR: kp('a'), LTM: kp('b'), L0: kp(' ') },
          },
        ],
        {
          combos: [
            {
              id: 'dance',
              keys: ['RHP', 'RHR'],
              binding: { kind: 'tap_dance', bindings: [kp('1'), kp('2')] },
            },
            {
              id: 'adaptive',
              keys: ['RHM', 'RHI'],
              binding: {
                kind: 'adaptive',
                default: kp('x'),
                triggers: [{ afterAny: ['a'], binding: kp('y') }],
              },
            },
            {
              id: 'tap-hold',
              keys: ['RTP', 'RTR'],
              binding: { kind: 'hold_tap', tap: kp('t'), hold: kp('h') },
            },
          ],
        },
      ),
    );
  }
  const idx = (b: ReturnType<typeof board>, id: string) =>
    b.compiled.combos.findIndex((c) => c.id === id);

  it("types a tap dance's second branch when the combo is tapped twice", () => {
    const b = board();
    const evs = b.m.perform({ type: 'chord', combo: idx(b, 'dance'), taps: 2 });
    expect(evs.map((e) => e.symbols)).toEqual(['', '2']);
    expect(evs.every((e) => e.kind === 'chord')).toBe(true);
    expect(b.m.perform({ type: 'chord', combo: idx(b, 'dance') })[0].symbols).toBe('1');
  });

  it('types an adaptive key on a combo after its trigger, and its default otherwise', () => {
    const b = board();
    expect(b.m.perform({ type: 'chord', combo: idx(b, 'adaptive') })[0].symbols).toBe('x');
    b.tap('LTR');
    expect(b.m.perform({ type: 'chord', combo: idx(b, 'adaptive') })[0].symbols).toBe('y');
  });

  it("types a tap-hold on a combo's tap when tapped and its hold when held", () => {
    const b = board();
    expect(b.m.perform({ type: 'chord', combo: idx(b, 'tap-hold') })[0].symbols).toBe('t');
    expect(b.m.perform({ type: 'chord', combo: idx(b, 'tap-hold'), hold: true })[0].symbols).toBe(
      'h',
    );
  });
});

describe('Machine — a tap dance under a one-shot layer', () => {
  const kp = (symbol: string) => ({ kind: 'kp' as const, symbol });
  const dance = { kind: 'tap_dance' as const, bindings: [kp('1'), kp('2')] };
  const board = () =>
    machineFor(
      mini(
        [
          { id: 'base', bindings: { LTR: { kind: 'sl', layer: 'up' }, L0: kp(' ') } },
          { id: 'up', bindings: { '*': { kind: 'trans' }, LHI: dance } },
        ],
        { combos: [{ id: 'dance', keys: ['RHP', 'RHR'], binding: dance, layers: ['up'] }] },
      ),
    );

  it('keeps the layer on until the last tap of a key, which types its second branch', () => {
    const b = board();
    b.tap('LTR');
    const evs = b.m.perform({ type: 'tap', pos: b.pos('LHI'), taps: 2 });
    expect(evs.map((e) => e.symbols)).toEqual(['', '2']);
    expect(b.m.isLayerActive(b.compiled.layerIndex.get('up')!)).toBe(false);
  });

  it('keeps the layer a combo fires on until its last chord', () => {
    const b = board();
    b.tap('LTR');
    const combo = b.compiled.combos.findIndex((c) => c.id === 'dance');
    expect(b.m.perform({ type: 'chord', combo, taps: 2 }).map((e) => e.symbols)).toEqual(['', '2']);
  });
});

describe('Machine — combos, caps word, holds', () => {
  it('combo fires only when the highest active layer is in its layer list', () => {
    const { m, tap, compiled } = machineFor(magicRomak);
    const colon = compiled.combos.findIndex((c) => c.id === 'colon');
    // The colon combo is Alpha 2's: on Alpha 1 it does not fire.
    expect(m.comboAvailable(colon)).toBe(false);
    expect(m.perform({ type: 'chord', combo: colon })[0].symbols).toBe('');
    tap('R0'); // alpha2 armed → highest layer is alpha2
    expect(m.comboAvailable(colon)).toBe(true);
    expect(m.perform({ type: 'chord', combo: colon })[0].symbols).toBe(':');
  });

  it('caps word carries on through digits and underscore, as ZMK does, and ends on anything else', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHR: { kind: 'kp', symbol: ',' },
          LHM: { kind: 'caps_word' },
          LTP: { kind: 'kp', symbol: '1' },
          LTR: { kind: 'kp', symbol: '_' },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
    ]);
    const { tap } = machineFor(layout);
    tap('LHM');
    expect(tap('LHP').symbols).toBe('A');
    expect(tap('LTP').symbols).toBe('1');
    expect(tap('LTR').symbols).toBe('_');
    expect(tap('LHP').symbols).toBe('A');
    expect(tap('LHR').symbols).toBe(',');
    expect(tap('LHP').symbols).toBe('a');
  });

  it('hold press activates the layer until release', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHI: { kind: 'lt', layer: 'one', tap: { kind: 'kp', symbol: 't' } },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
      { id: 'one', bindings: { LHP: { kind: 'kp', symbol: 'b' } } },
    ]);
    const { tap, hold, release } = machineFor(layout);
    expect(tap('LHI').symbols).toBe('t');
    const h = hold('LHI');
    expect(h.kind).toBe('hold_press');
    expect(h.symbols).toBe('');
    expect(tap('LHP').symbols).toBe('b');
    const r = release('LHI');
    expect(r.kind).toBe('hold_release');
    expect(tap('LHP').symbols).toBe('a');
  });

  it('sticky shift capitalizes exactly one key', () => {
    const { tap } = machineFor(magicRomak);
    tap('R1');
    expect(tap('RHM').symbols).toBe('A');
    expect(tap('RHM').symbols).toBe('a');
  });
});

describe('Machine — what kind of key a press is', () => {
  const adaptive = {
    kind: 'adaptive' as const,
    default: { kind: 'kp' as const, symbol: 'h' },
    triggers: [{ afterAny: ['a'], binding: { kind: 'kp' as const, symbol: 'v' } }],
  };
  const board = () =>
    machineFor(
      mini([
        {
          id: 'base',
          bindings: {
            LHP: { kind: 'kp', symbol: 'a' },
            // An adaptive key on the tap of a tap-hold, of a layer-tap, and of a morph's plain part.
            LHR: { kind: 'hold_tap', tap: adaptive, hold: { kind: 'mod', mod: 'LGUI' } },
            LHM: { kind: 'lt', layer: 'num', tap: adaptive },
            LHI: {
              kind: 'mod_morph',
              mods: ['LSHIFT', 'RSHIFT'],
              default: adaptive,
              morphed: { kind: 'kp', symbol: 'x' },
            },
            LTI: {
              kind: 'hold_tap',
              tap: { kind: 'key_repeat' },
              hold: { kind: 'mo', layer: 'num' },
            },
            LTM: { kind: 'tap_dance', bindings: [{ kind: 'kp', symbol: 'b' }, adaptive] },
            RHI: { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: adaptive.triggers },
            R1: { kind: 'mod', mod: 'LSHIFT' },
            L0: {
              kind: 'hold_tap',
              tap: {
                kind: 'adaptive',
                default: { kind: 'kp', symbol: ' ' },
                triggers: [
                  {
                    afterAny: ['.'],
                    binding: {
                      kind: 'macro',
                      steps: [
                        { kind: 'kp', symbol: ' ' },
                        { kind: 'sk', mod: 'LSHIFT' },
                      ],
                    },
                  },
                ],
              },
              hold: { kind: 'mo', layer: 'num' },
            },
          },
        },
        { id: 'num', bindings: { '*': { kind: 'trans' } } },
      ]),
    );

  it('is an adaptive key when the adaptive key is the tap of a tap-hold or a layer-tap, as its legend says', () => {
    const { tap, hold } = board();
    for (const key of ['LHR', 'LHM']) {
      const t = tap(key);
      expect(t.symbols, key).toBe('h');
      expect(t.keyKind, key).toBe('adaptive');
    }
    tap('LHP'); // a
    expect(tap('LHR')).toMatchObject({ symbols: 'v', keyKind: 'adaptive' });
    // Held, it is the hold, whatever the tap is.
    expect(hold('LHR').keyKind).toBe('hold');
    expect(hold('LHM').keyKind).toBe('hold');
  });

  it('is what the part a morph or a tap dance runs is', () => {
    const { tap, hold, m, pos } = board();
    expect(tap('LHI').keyKind).toBe('adaptive');
    hold('R1');
    // The shift that chose the part is not applied to it, as in ZMK's mod-morph.
    expect(tap('LHI')).toMatchObject({ symbols: 'x', keyKind: 'alpha' });
    const twice = m.perform({ type: 'tap', pos: pos('LTM'), taps: 2 });
    expect(twice.at(-1)?.keyKind).toBe('adaptive');
  });

  it('is a repeat key when a tap-hold taps the repeat key', () => {
    const { tap } = board();
    tap('LHP');
    expect(tap('LTI')).toMatchObject({ symbols: 'a', keyKind: 'repeat' });
  });

  it('is an adaptive key when it is an alt repeat, repeating or not, as its legend says', () => {
    const { tap } = board();
    tap('LHP'); // a: the branch types v
    expect(tap('RHI')).toMatchObject({ symbols: 'v', keyKind: 'adaptive' });
    // after v nothing matches, so it repeats
    expect(tap('RHI')).toMatchObject({ symbols: 'v', keyKind: 'adaptive' });
  });

  it('stays a space key when sentence case wraps the space on a tap-hold', () => {
    const { tap } = board();
    expect(tap('L0').keyKind).toBe('space');
  });
});

describe('MachineState.matches — two presses that leave the board alike', () => {
  const layout = mini([
    {
      id: 'base',
      bindings: {
        L0: { kind: 'kp', symbol: ' ' },
        LHP: { kind: 'kp', symbol: 'a' },
        LHR: { kind: 'sl', layer: 'one' },
        LHM: { kind: 'sl', layer: 'one' },
        LHI: { kind: 'sl', layer: 'one', quickRelease: false },
        LBI: { kind: 'mo', layer: 'one' },
      },
    },
    { id: 'one', bindings: { '*': { kind: 'trans' }, LHP: { kind: 'kp', symbol: 'b' } } },
  ]);

  /** The state after a press from a fresh board, as a snapshot. */
  function after(press: (t: ReturnType<typeof machineFor>) => void) {
    const t = machineFor(layout);
    press(t);
    return t.m.state.snapshot();
  }

  it('holds for one-shots of the same layer tapped on different keys', () => {
    const t = machineFor(layout);
    t.tap('LHM');
    expect(t.m.state.matches(after((u) => u.tap('LHR')))).toBe(true);
  });

  it('fails when the one-shot ends differently, a letter was typed, or a key is held', () => {
    const t = machineFor(layout);
    t.tap('LHI');
    expect(t.m.state.matches(after((u) => u.tap('LHR')))).toBe(false);
    const typed = machineFor(layout);
    typed.tap('LHP');
    expect(typed.m.state.matches(after(() => {}))).toBe(false);
    const held = machineFor(layout);
    held.hold('LBI');
    expect(held.m.state.matches(after(() => {}))).toBe(false);
    expect(held.m.state.matches(after((u) => u.hold('LBI')))).toBe(true);
  });
});

describe('Machine — adaptive keys', () => {
  it('takes the first trigger that matches, in the order they are written', () => {
    const afterA = { afterAny: ['a'], binding: { kind: 'kp' as const, symbol: 'v' } };
    const afterAOrB = { afterAny: ['a', 'b'], binding: { kind: 'kp' as const, symbol: 'w' } };
    const adaptive = (triggers: (typeof afterA)[]) => ({
      kind: 'adaptive' as const,
      default: { kind: 'kp' as const, symbol: 'h' },
      triggers,
    });
    const { tap } = machineFor(
      mini([
        {
          id: 'base',
          bindings: {
            LHP: { kind: 'kp', symbol: 'a' },
            LHR: { kind: 'kp', symbol: 'b' },
            LHM: adaptive([afterA, afterAOrB]),
            LHI: adaptive([afterAOrB, afterA]),
            L0: { kind: 'kp', symbol: ' ' },
          },
        },
      ]),
    );
    // After a both triggers match: the one written first wins, either way round.
    tap('LHP');
    expect(tap('LHM').symbols).toBe('v');
    tap('LHP');
    expect(tap('LHI').symbols).toBe('w');
    // After b only the second matches.
    tap('LHR');
    expect(tap('LHM').symbols).toBe('w');
  });
});

describe('Machine — the layer a press reaches', () => {
  function board() {
    return machineFor(
      mini(
        [
          {
            id: 'base',
            bindings: {
              LTP: { kind: 'mo', layer: 'up' },
              LTR: { kind: 'lt', layer: 'up', tap: { kind: 'kp', symbol: 'a' } },
              LTM: { kind: 'sl', layer: 'up' },
              LTI: { kind: 'tog', layer: 'up' },
              LTC: { kind: 'to', layer: 'up' },
              LHP: { kind: 'auto_layer', layer: 'up' },
              LHR: {
                kind: 'hold_tap',
                tap: { kind: 'kp', symbol: 'b' },
                hold: { kind: 'sl', layer: 'up' },
              },
              LHM: {
                kind: 'hold_tap',
                tap: { kind: 'kp', symbol: 'c' },
                hold: { kind: 'tog', layer: 'up' },
              },
              LHI: {
                kind: 'hold_tap',
                tap: { kind: 'kp', symbol: 'd' },
                hold: { kind: 'to', layer: 'up' },
              },
              LHC: {
                kind: 'hold_tap',
                tap: { kind: 'kp', symbol: 'e' },
                hold: { kind: 'mod', mod: 'LSHIFT' },
              },
              LBP: { kind: 'macro', symbols: 'q', then: [{ kind: 'sl', layer: 'up' }] },
              LBR: { kind: 'sk', mod: 'LSHIFT' },
              L0: { kind: 'kp', symbol: ' ' },
            },
          },
          { id: 'up', bindings: {} },
        ],
        {
          combos: [
            { id: 'one-shot', keys: ['RHP', 'RHR'], binding: { kind: 'sl', layer: 'up' } },
            { id: 'held', keys: ['RHM', 'RHI'], binding: { kind: 'mo', layer: 'up' } },
          ],
        },
      ),
    );
  }

  it('is the layer a layer key held, a one-shot, a toggle, a to-layer or an auto-layer turns on', () => {
    const { compiled, tap, hold, release } = board();
    const upIdx = compiled.layerIndex.get('up')!;
    for (const id of ['LTP', 'LTR']) {
      expect(hold(id).reaches).toBe(upIdx);
      expect(release(id).reaches).toBeNull();
    }
    const fresh = () => board();
    expect(fresh().tap('LTM').reaches).toBe(upIdx);
    expect(fresh().tap('LTI').reaches).toBe(upIdx);
    expect(fresh().tap('LTC').reaches).toBe(upIdx);
    expect(fresh().tap('LHP').reaches).toBe(upIdx);
    expect(tap('L0').reaches).toBeNull();
  });

  it('is the layer a tap-hold holds for, whatever turns it on', () => {
    const { compiled } = board();
    const upIdx = compiled.layerIndex.get('up')!;
    for (const id of ['LHR', 'LHM', 'LHI']) {
      const ev = board().hold(id);
      expect(ev.keyKind).toBe('hold');
      expect(ev.reaches).toBe(upIdx);
    }
  });

  it('is the layer a combo turns on, tapped or held', () => {
    const { compiled, m } = board();
    const upIdx = compiled.layerIndex.get('up')!;
    const combo = (id: string) => compiled.combos.findIndex((c) => c.id === id);
    expect(m.perform({ type: 'chord', combo: combo('one-shot') })[0].reaches).toBe(upIdx);
    const other = board();
    expect(other.m.perform({ type: 'chord', combo: combo('held'), hold: true })[0].reaches).toBe(
      upIdx,
    );
  });

  it('is none for a key that types, a modifier, a layer key tapped, or one that types and then arms a layer', () => {
    const { tap, hold } = board();
    expect(tap('LTR').reaches).toBeNull(); // a layer-tap tapped types a
    expect(board().tap('LTP').reaches).toBeNull(); // a momentary layer key tapped turns nothing on
    expect(hold('LHC').reaches).toBeNull();
    expect(board().tap('LBR').reaches).toBeNull();
    const macro = board().tap('LBP');
    expect(macro.symbols).toBe('q');
    expect(macro.reaches).toBeNull();
  });
});

describe('Machine — a hold of several modifiers', () => {
  const layout = mini([
    {
      id: 'base',
      bindings: {
        LBR: {
          kind: 'hold_tap',
          tap: { kind: 'kp', symbol: 'f' },
          hold: { kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] },
        },
        LHP: { kind: 'kp', symbol: 'a' },
        L0: { kind: 'kp', symbol: ' ' },
      },
    },
  ]);

  it('holds every one of them while the key is down, and none once it is let go', () => {
    const { m, hold, tap, release } = machineFor(layout);
    hold('LBR');
    expect([...m.activeMods()].sort()).toEqual(['LGUI', 'LSHIFT']);
    expect(tap('LHP').symbols).toBe('A');
    release('LBR');
    expect([...m.activeMods()]).toEqual([]);
    expect(tap('LHP').symbols).toBe('a');
  });
});
