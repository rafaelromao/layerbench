import { describe, expect, it } from 'vitest';
import { BUNDLED_LAYOUTS, bundledLayout } from '../layouts/index.js';
import { compileLayout } from './compile.js';
import { toCanonicalJson } from './json.js';
import {
  DOUBLED_WAYS,
  declaredWays,
  defaultRules,
  rulesOf,
  SHIFT_WAYS,
  wholeRule,
} from './rules.js';
import { parseLayout } from './schema.js';
import type { Layout } from './types.js';

const qwerty = () => structuredClone(bundledLayout('qwerty') as Layout);

describe('a rule made whole', () => {
  it('has each way once, at its first mention, and a way it leaves out after the rest, on', () => {
    expect(
      wholeRule(
        [{ way: 'hold', enabled: false }, { way: 'hold' }, { way: 'sk', enabled: true }],
        SHIFT_WAYS,
      ),
    ).toEqual([
      { way: 'hold', enabled: false },
      { way: 'sk', enabled: true },
    ]);
    expect(wholeRule([{ way: 'tapTwice' }], DOUBLED_WAYS)).toEqual([
      { way: 'tapTwice', enabled: true },
      { way: 'repeatKey', enabled: true },
    ]);
  });

  it('is nothing for a rule not declared, an empty list included', () => {
    expect(wholeRule(undefined, SHIFT_WAYS)).toBeUndefined();
    expect(wholeRule([], SHIFT_WAYS)).toBeUndefined();
    expect(declaredWays(undefined, SHIFT_WAYS)).toBeNull();
    expect(declaredWays([], SHIFT_WAYS)).toBeNull();
  });

  it('lists the ways that are on, in order, and none when every way is off', () => {
    expect(declaredWays([{ way: 'hold' }, { way: 'sk', enabled: false }], SHIFT_WAYS)).toEqual([
      'hold',
    ]);
    expect(
      declaredWays(
        [
          { way: 'sk', enabled: false },
          { way: 'hold', enabled: false },
        ],
        SHIFT_WAYS,
      ),
    ).toEqual([]);
  });
});

describe('a layout that declares no rules', () => {
  const keys = (kind: 'sk' | 'hold' | undefined) => ({
    space: 'L0',
    ...(kind ? { shift: { key: 'R1', kind } } : {}),
  });

  it("reads its shift rule from its shift key's kind: that way first, the other after it", () => {
    expect(defaultRules({ keys: keys('sk') }).shift).toEqual([
      { way: 'sk', enabled: true },
      { way: 'hold', enabled: true },
    ]);
    expect(defaultRules({ keys: keys('hold') }).shift.map((e) => e.way)).toEqual(['hold', 'sk']);
    expect(defaultRules({ keys: keys(undefined) }).shift.map((e) => e.way)).toEqual(['sk', 'hold']);
  });

  it('reads its doubled letters from its repeat policy: tapping twice alone is the one without the repeat key', () => {
    expect(defaultRules({ keys: keys('sk') }).doubledLetters).toEqual([
      { way: 'repeatKey', enabled: true },
      { way: 'tapTwice', enabled: true },
    ]);
    expect(
      defaultRules({ keys: keys('sk'), repeatPolicy: { doubledLetters: 'tapTwice' } })
        .doubledLetters,
    ).toEqual([
      { way: 'tapTwice', enabled: true },
      { way: 'repeatKey', enabled: false },
    ]);
  });

  it('takes a declared rule over what it reads, one rule at a time', () => {
    const l = {
      ...qwerty(),
      typingRules: { shift: [{ way: 'hold' as const }] },
    };
    const rules = rulesOf(l);
    expect(rules.shift.map((e) => [e.way, e.enabled])).toEqual([
      ['hold', true],
      ['sk', true],
    ]);
    expect(rules.doubledLetters).toEqual(defaultRules(l).doubledLetters);
  });

  it('is typed by the engine’s own ways: every bundled layout declares nothing, and compiles to no declared ways', () => {
    for (const l of BUNDLED_LAYOUTS) {
      expect(l.typingRules, l.id).toBeUndefined();
      const compiled = compileLayout(l);
      expect(compiled.shiftWays, l.id).toBeNull();
      expect(compiled.doubledWays, l.id).toBeNull();
      expect(toCanonicalJson(l), l.id).not.toHaveProperty('typingRules');
    }
  });
});

describe('the rules in the document', () => {
  it('are written whole when declared, and read back as they were written', () => {
    const l: Layout = {
      ...qwerty(),
      typingRules: {
        shift: [{ way: 'hold' }, { way: 'sk', enabled: false }],
        doubledLetters: [{ way: 'tapTwice' }],
      },
    };
    const doc = toCanonicalJson(l);
    expect(doc.typingRules).toEqual({
      shift: [
        { way: 'hold', enabled: true },
        { way: 'sk', enabled: false },
      ],
      doubledLetters: [
        { way: 'tapTwice', enabled: true },
        { way: 'repeatKey', enabled: true },
      ],
    });
    const back = parseLayout(JSON.parse(JSON.stringify(doc)));
    expect(toCanonicalJson(back)).toEqual(doc);
    expect(compileLayout(back).shiftWays).toEqual(['hold']);
    expect(compileLayout(back).doubledWays).toEqual(['tapTwice', 'repeatKey']);
  });

  it('are refused when every way of a rule is off, as the editor refuses it', () => {
    const doc = JSON.parse(JSON.stringify(toCanonicalJson(qwerty())));
    doc.typingRules = {
      doubledLetters: [
        { way: 'repeatKey', enabled: false },
        { way: 'tapTwice', enabled: false },
      ],
    };
    expect(() => parseLayout(doc)).toThrow(/needs a way that is on/);
    doc.typingRules.doubledLetters[1].enabled = true;
    expect(() => parseLayout(doc)).not.toThrow();
  });

  it('are refused when a way is not one the rule has', () => {
    const doc = JSON.parse(JSON.stringify(toCanonicalJson(qwerty())));
    doc.typingRules = { shift: [{ way: 'toggle' }] };
    expect(() => parseLayout(doc)).toThrow();
  });
});
