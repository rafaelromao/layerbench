import { describe, expect, it } from 'vitest';
import { specialFeatures } from '../layout/categories.js';
import { compileLayout, LayoutCompileError, MAX_MACRO_NESTING } from '../layout/compile.js';
import { bindingModules } from '../layout/firmware.js';
import type { Binding, Layout } from '../layout/types.js';
import { Machine } from './machine.js';
import { staticOutputs } from './producers.js';
import { explain } from './resolver.js';

/**
 * A macro's steps can be any behaviour, as in ZMK: each runs in order, tapped once, through the
 * same machine a key's binding runs through. What a step arms is what the next one types with.
 */

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const macro = (...steps: Binding[]): Binding => ({ kind: 'macro', steps });

/** Letters on the left home row, a dot, a space bar, and the macro under test on `RHI`. */
function board(m: Binding, extra: Record<string, Binding> = {}): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'Macro steps',
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: {
          LHP: kp('a'),
          LHR: kp('b'),
          LHM: kp('c'),
          LHI: kp('.'),
          L0: kp(' '),
          RHI: m,
          ...extra,
        },
      },
      { id: 'other', bindings: { LHP: kp('x') } },
    ],
  };
}

function press(layout: Layout, ...keys: string[]) {
  const compiled = compileLayout(layout);
  const m = new Machine(compiled);
  const events = keys.map((k) => m.perform({ type: 'tap', pos: compiled.keyIndex.get(k)! })[0]);
  return { m, compiled, events, out: events.map((e) => e.symbols).join('') };
}

/** What the analysis reads the macro as typing: its producers' text. */
const reads = (m: Binding) => staticOutputs(m).map((o) => o.symbols);

describe('a macro step', () => {
  it('can be a sentence space, then a space: both typed, in order', () => {
    const m = macro({ kind: 'sentence_space' }, kp(' '));
    const r = press(board(m), 'LHI', 'RHI');
    expect(r.out).toBe('.  ');
    expect(r.events[1].leafKind).toBe('macro');
    // The space after the sentence space is a keycode: it takes the capital the sentence left.
    expect(r.m.state.sentencePending).toBe(false);
    expect(reads(m)).toEqual(['  ']);
  });

  it('can leave a capital for a letter later in the macro: a sentence space, then a letter', () => {
    const m = macro(kp('.'), { kind: 'sentence_space' }, kp('a'));
    expect(press(board(m), 'RHI').out).toBe('. A');
    expect(reads(m)).toEqual(['. A']);
  });

  it('can turn caps word on for the letters after it', () => {
    const m = macro(kp('a'), { kind: 'caps_word' }, kp('b'), kp('c'));
    const r = press(board(m), 'RHI', 'LHP');
    expect(r.out).toBe('aBCA');
    expect(reads(m)).toEqual(['aBC']);
  });

  it('can repeat what the macro typed before it', () => {
    const m = macro(kp('l'), { kind: 'key_repeat' });
    expect(press(board(m), 'RHI').out).toBe('ll');
    expect(reads(m)).toEqual(['ll']);
  });

  it('can repeat what came before the press, which the analysis does not read as text', () => {
    const m = macro({ kind: 'key_repeat' }, kp('b'));
    expect(press(board(m), 'LHP', 'RHI').out).toBe('aab');
    expect(reads(m)).toEqual([]);
  });

  it('can arm Shift for the next keycode only, in the macro or after it', () => {
    const inside = macro({ kind: 'sk', mod: 'LSHIFT' }, kp('a'), kp('b'));
    expect(press(board(inside), 'RHI').out).toBe('Ab');
    expect(reads(inside)).toEqual(['Ab']);
    const after = macro(kp('a'), { kind: 'sk', mod: 'LSHIFT' });
    expect(press(board(after), 'RHI', 'LHR', 'LHM').out).toBe('aBc');
  });

  it('uses up a Shift armed before the press on its first keycode', () => {
    const m = macro(kp('a'), kp('b'));
    const r = press(board(m, { LHR: { kind: 'sk', mod: 'LSHIFT' } }), 'LHR', 'RHI');
    expect(r.out).toBe('Ab');
  });

  it('can arm, toggle or switch a layer, and does nothing for a layer held', () => {
    const arms = press(board(macro(kp('a'), { kind: 'sl', layer: 'other' })), 'RHI', 'LHP', 'LHP');
    expect(arms.out).toBe('axa');
    const toggles = press(board(macro({ kind: 'tog', layer: 'other' })), 'RHI', 'LHP', 'LHP');
    expect(toggles.out).toBe('xx');
    const held = press(board(macro({ kind: 'mo', layer: 'other' }, kp('a'))), 'RHI', 'LHP');
    expect(held.out).toBe('aa');
  });

  it('can be a tap dance: tapped once, its first tap, whatever the press around it', () => {
    const dance: Binding = { kind: 'tap_dance', bindings: [kp('a'), kp('b')] };
    const m = macro(kp('c'), dance);
    expect(press(board(m), 'RHI').out).toBe('ca');
    expect(reads(m)).toEqual(['ca']);
    // The macro on a tap dance's second tap still taps its own tap dance once.
    const outer: Binding = { kind: 'tap_dance', bindings: [kp('x'), m] };
    const compiled = compileLayout(board(outer));
    const machine = new Machine(compiled);
    const ev = machine.perform({ type: 'tap', pos: compiled.keyIndex.get('RHI')!, taps: 2 });
    expect(ev.map((e) => e.symbols).join('')).toBe('ca');
  });

  it('can be a tap-hold: tapped', () => {
    const m = macro({ kind: 'hold_tap', tap: kp('a'), hold: { kind: 'mod', mod: 'LCTRL' } });
    expect(press(board(m), 'RHI').out).toBe('a');
    expect(reads(m)).toEqual(['a']);
  });

  it('can be an adaptive key: after the macro’s own text, the branch that text chooses', () => {
    const adaptive: Binding = {
      kind: 'adaptive',
      triggers: [{ afterAny: ['a'], binding: kp('h') }],
      default: kp('v'),
    };
    expect(press(board(macro(kp('a'), adaptive)), 'RHI').out).toBe('ah');
    expect(reads(macro(kp('a'), adaptive))).toEqual(['ah']);
    expect(reads(macro(kp('b'), adaptive))).toEqual(['bv']);
    // First, it follows what came before the press: each branch is a way on that.
    const first = staticOutputs(macro(adaptive, kp('b')));
    expect(first.map((o) => [o.symbols, o.afterAny])).toEqual([
      ['hb', ['a']],
      ['vb', undefined],
    ]);
    expect(press(board(macro(adaptive, kp('b'))), 'LHP', 'RHI').out).toBe('ahb');
  });

  it('can be a morph: a Shift the macro armed changes a Shift morph', () => {
    const morph: Binding = {
      kind: 'mod_morph',
      mods: ['LSHIFT'],
      default: kp(','),
      morphed: kp(';'),
    };
    const m = macro({ kind: 'sk', mod: 'LSHIFT' }, morph, kp('a'));
    expect(press(board(m), 'RHI').out).toBe(';a');
    expect(reads(m)).toEqual([';a']);
    expect(reads(macro(morph))).toEqual([',']);
  });

  it('can be a dead key, which accents the next character', () => {
    const m = macro({ kind: 'dead_key', diacritic: '´' }, kp('e'));
    expect(press(board(m), 'RHI').out).toBe('é');
    expect(reads(m)).toEqual(['é']);
  });

  it('can be a Unicode character', () => {
    const m = macro(kp('a'), { kind: 'unicode', symbol: '→' });
    expect(press(board(m), 'RHI').out).toBe('a→');
    expect(reads(m)).toEqual(['a→']);
  });

  it('can be another macro, nested, its steps run where it stands', () => {
    const m = macro(kp('a'), { kind: 'macro', symbols: 'bc' }, kp('d'));
    expect(press(board(m), 'RHI').out).toBe('abcd');
    expect(reads(m)).toEqual(['abcd']);
    const deeper = macro(kp('a'), macro(macro(kp('b')), { kind: 'sk', mod: 'LSHIFT' }), kp('c'));
    expect(press(board(deeper), 'RHI').out).toBe('abC');
    expect(reads(deeper)).toEqual(['abC']);
  });

  it('types nothing for a repeat after a Unicode character, which leaves nothing to repeat', () => {
    const m = macro(kp('b'), { kind: 'unicode', symbol: 'ç' }, { kind: 'key_repeat' });
    expect(press(board(m), 'RHI').out).toBe('bç');
    expect(reads(m)).toEqual(['bç']);
  });

  it('keeps a Shift armed through a Shift morph whose part types nothing', () => {
    const morph: Binding = {
      kind: 'mod_morph',
      mods: ['LSHIFT'],
      default: kp(','),
      morphed: { kind: 'sl', layer: 'other' },
    };
    const m = macro(kp('b'), { kind: 'sk', mod: 'LSHIFT' }, morph, {
      kind: 'unicode',
      symbol: 'ç',
      shiftedSymbol: 'Ç',
    });
    expect(press(board(m), 'RHI').out).toBe('bÇ');
    expect(reads(m)).toEqual(['bÇ']);
  });

  it('offers both parts of a sentence morph before any keycode, the capital’s depending on it', () => {
    const m = macro({ kind: 'sentence_morph', default: kp('x'), pending: kp('y') });
    expect(staticOutputs(m).map((o) => [o.symbols, o.dynamic])).toEqual([
      ['x', false],
      ['Y', true],
    ]);
    expect(press(board(m, { L0: { kind: 'sentence_space' } }), 'LHI', 'L0', 'RHI').out).toBe('. Y');
  });

  it('types nothing for a first adaptive step no branch follows, when it has no default', () => {
    const adaptive: Binding = {
      kind: 'adaptive',
      triggers: [{ afterAny: ['a'], binding: kp('h') }],
    };
    const m = macro(adaptive, kp('b'));
    expect(staticOutputs(m).map((o) => [o.symbols, o.afterAny])).toEqual([
      ['hb', ['a']],
      ['b', undefined],
    ]);
    expect(press(board(m), 'LHR', 'RHI').out).toBe('bb');
  });

  it('turns caps word on for what follows the press, judged step by step as ZMK sees them', () => {
    const after = macro(kp(','), { kind: 'caps_word' });
    expect(press(board(after), 'RHI', 'LHP').out).toBe(',A');
    const word = macro({ kind: 'caps_word' }, kp('a'), kp(' '), kp('b'));
    expect(press(board(word), 'RHI').out).toBe('A b');
    expect(reads(word)).toEqual(['A b']);
  });

  it('turns the auto layer on for what follows the press, judged step by step', () => {
    const m = macro(kp(','), { kind: 'auto_layer', layer: 'other' });
    expect(press(board(m), 'RHI', 'LHP').out).toBe(',x');
  });

  it('types a tap dance after the macro’s other steps, when its tapping term runs out', () => {
    const dance: Binding = { kind: 'tap_dance', bindings: [kp('a'), kp('b')] };
    const m = macro(dance, kp('c'));
    expect(press(board(m), 'RHI').out).toBe('ca');
    expect(reads(m)).toEqual(['ca']);
    // A nested macro's tap dances wait for the outermost macro.
    const nested = macro(macro(dance, kp('c')), kp('d'));
    expect(press(board(nested), 'RHI').out).toBe('cda');
    expect(reads(nested)).toEqual(['cda']);
  });

  it('runs a nested macro’s own `then` and tag', () => {
    const armed = macro(kp('a'), {
      kind: 'macro',
      symbols: 'b',
      then: [{ kind: 'sl', layer: 'other' }],
    });
    expect(press(board(armed), 'RHI', 'LHP').out).toBe('abx');
    const tagged = macro(
      { kind: 'macro', symbols: 'q', tag: 't' },
      { kind: 'adaptive', triggers: [{ afterTags: ['t'], binding: kp('h') }], default: kp('v') },
    );
    expect(press(board(tagged), 'RHI').out).toBe('qh');
    expect(reads(tagged)).toEqual(['qh']);
  });

  it('is typed by the analysis as the machine types it', () => {
    const m = macro(kp('l'), { kind: 'key_repeat' }, { kind: 'caps_word' }, kp('a'));
    const t = explain(compileLayout(board(m, { LHP: kp('l') })), 'llA', {
      caseMode: 'model',
      crossWord: 'reset',
    });
    expect(t.steps.map((s) => [s.key, s.symbols])).toEqual([['RHI', 'llA']]);
  });
});

describe('a macro that holds itself', () => {
  it('is refused with a clear error, not run forever', () => {
    const self: Binding = { kind: 'macro', steps: [kp('a')] };
    (self as { steps: Binding[] }).steps.push(self);
    expect(() => compileLayout(board(self))).toThrow(LayoutCompileError);
    expect(() => compileLayout(board(self))).toThrow(
      'Layer base, key RHI: a macro contains itself',
    );
  });

  it('is found through any part: a tap-hold’s tap, a combo', () => {
    const self: Binding = { kind: 'macro', steps: [] };
    (self as { steps: Binding[] }).steps.push({ kind: 'hold_tap', tap: self, hold: kp('a') });
    const layout = board(kp('a'));
    layout.combos = [{ id: 'loop', keys: ['LHP', 'LHR'], binding: self }];
    expect(() => compileLayout(layout)).toThrow('Combo loop: a macro contains itself');
  });

  it('is told apart from macros nested deep, which load and type as far as they go', () => {
    let deep: Binding = kp('a');
    for (let i = 0; i <= MAX_MACRO_NESTING + 2; i++) deep = macro(deep, kp('b'));
    expect(() => compileLayout(board(deep))).not.toThrow();
    expect(press(board(deep), 'RHI').out).toBe(`a${'b'.repeat(MAX_MACRO_NESTING + 3)}`);
  });

  it('may hold the same step twice: only a step inside itself is a loop', () => {
    const step = kp('a');
    expect(press(board(macro(step, step)), 'RHI').out).toBe('aa');
  });
});

describe('every part a binding holds', () => {
  /** Each kind that holds bindings, built around one part, at each of its places. */
  const places: ((part: Binding) => Binding)[] = [
    (part) => ({ kind: 'lt', layer: 'other', tap: part }),
    (part) => ({ kind: 'hold_tap', tap: part, hold: kp('a') }),
    (part) => ({ kind: 'hold_tap', tap: kp('a'), hold: part }),
    (part) => ({ kind: 'mod_morph', mods: ['LSHIFT'], default: part, morphed: kp('a') }),
    (part) => ({ kind: 'mod_morph', mods: ['LSHIFT'], default: kp('a'), morphed: part }),
    (part) => ({ kind: 'layer_morph', layers: ['other'], active: part, inactive: kp('a') }),
    (part) => ({ kind: 'layer_morph', layers: ['other'], active: kp('a'), inactive: part }),
    (part) => ({ kind: 'sentence_morph', default: part, pending: kp('a') }),
    (part) => ({ kind: 'sentence_morph', default: kp('a'), pending: part }),
    (part) => ({ kind: 'tap_dance', bindings: [kp('a'), part] }),
    (part) => ({ kind: 'macro', steps: [kp('a'), part] }),
    (part) => ({ kind: 'macro', symbols: 'a', then: [part] }),
    (part) => ({ kind: 'adaptive', default: part }),
    (part) => ({ kind: 'adaptive', triggers: [{ afterAny: ['a'], binding: part }] }),
  ];

  it('is followed for the modules a key needs', () => {
    for (const [i, at] of places.entries())
      expect(bindingModules(at({ kind: 'sentence_space' })), String(i)).toContain('sentenceCase');
  });

  it('is followed for a macro that holds itself', () => {
    for (const [i, at] of places.entries()) {
      const self: Binding = { kind: 'macro', steps: [] };
      (self as { steps: Binding[] }).steps.push(at(self));
      expect(() => compileLayout(board(self)), String(i)).toThrow('a macro contains itself');
    }
  });
});

describe('the machine and the analysis', () => {
  it('agree on what random macros of every kind of step type', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    const step = (depth: number): Binding => {
      const ways: (() => Binding)[] = [
        () => kp(pick(['a', 'b', 'e', '.', ' ', '?', ','])),
        () => ({ kind: 'sentence_space' }),
        () => ({ kind: 'caps_word' }),
        () => ({ kind: 'sk', mod: 'LSHIFT' }),
        () => ({ kind: 'key_repeat' }),
        () => ({ kind: 'dead_key', diacritic: '´' }),
        () => ({ kind: 'unicode', symbol: 'ç', shiftedSymbol: 'Ç' }),
        () => ({
          kind: 'mod_morph',
          mods: ['LSHIFT'],
          default: kp(','),
          morphed: pick<Binding>([kp(';'), { kind: 'caps_word' }, { kind: 'sl', layer: 'other' }]),
        }),
        () => ({ kind: 'sentence_morph', default: kp('x'), pending: kp('y') }),
        () => ({ kind: 'tap_dance', bindings: [step(depth + 1), kp('z')] }),
        () => ({ kind: 'hold_tap', tap: step(depth + 1), hold: { kind: 'mod', mod: 'LCTRL' } }),
        () => ({
          kind: 'adaptive',
          triggers: [{ afterAny: ['a'], binding: kp('h') }],
          default: kp('v'),
        }),
        () => ({ kind: 'sl', layer: 'other' }),
      ];
      if (depth < 2)
        ways.push(() =>
          macro(...Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => step(depth + 1))),
        );
      return pick(ways)();
    };
    const misses: string[] = [];
    for (let i = 0; i < 400; i++) {
      const m = macro(kp('b'), ...Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => step(1)));
      const out = press(board(m), 'RHI').out;
      const read = reads(m);
      if (!(read.length === 1 ? read[0] === out : read.length === 0 && out === ''))
        misses.push(`${JSON.stringify(m)}: ${out} / ${read}`);
    }
    expect(misses).toEqual([]);
  });
});

describe('the ZMK modules a macro needs', () => {
  it('are none for steps stock ZMK runs', () => {
    expect(bindingModules(macro(kp('a'), { kind: 'sl', layer: 'other' }))).toEqual([]);
  });

  it('are those its steps need: zmk-sentence-case for a sentence space', () => {
    expect(bindingModules(macro({ kind: 'sentence_space' }, kp(' ')))).toEqual(['sentenceCase']);
  });

  it('are found through every part, each once, in the order the modules are listed', () => {
    const b: Binding = {
      kind: 'hold_tap',
      tap: macro(
        { kind: 'unicode', symbol: '→' },
        macro({ kind: 'sentence_space' }, { kind: 'sentence_space' }),
        { kind: 'adaptive', default: kp('a') },
      ),
      hold: { kind: 'auto_layer', layer: 'other' },
    };
    expect(bindingModules(b)).toEqual(['adaptiveKey', 'autoLayer', 'sentenceCase', 'unicode']);
  });
});

describe('a macro’s card in Special Behaviors', () => {
  it('is named by what its steps type, a space drawn', () => {
    const label = (m: Binding) =>
      specialFeatures(board(m)).find((f) => f.feature === 'macro')?.label;
    expect(label(macro(kp(','), kp(' ')))).toBe('Macro “,␣”');
    expect(label(macro(kp('.'), { kind: 'sentence_space' }))).toBe('Macro “.␣”');
    expect(label({ kind: 'macro', symbols: 'qu' })).toBe('Macro “qu”');
    expect(label(macro({ kind: 'caps_word' }))).toBe('Macro');
  });

  it('is one for a macro and the macros among its steps', () => {
    const nested = macro(kp('a'), macro(kp('b'), macro(kp('c'))));
    const macros = specialFeatures(board(nested)).filter((f) => f.feature === 'macro');
    expect(macros.map((f) => f.label)).toEqual(['Macro “a”']);
  });
});
