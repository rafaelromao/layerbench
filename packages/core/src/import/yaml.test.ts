import { describe, expect, it } from 'vitest';
import { MAX_EXPANDED, parseYaml, YamlError } from './yaml.js';

/**
 * A layer of `levels` lists, each of `fan` aliases of the one before it: `fan ** levels` nodes once
 * written out, in a few hundred bytes. keymap-drawer's reader took 7 s over nine levels of ten.
 */
export function aliasBomb(levels: number, fan = 10): string {
  const lines = ['layers:', '  Base:', '  - &a0 [Q, W, E]'];
  for (let n = 1; n < levels; n++) {
    lines.push(`  - &a${n} [${Array.from({ length: fan }, () => `*a${n - 1}`).join(', ')}]`);
  }
  return `${lines.join('\n')}\n`;
}

/** keymap-drawer's own Hummingbird example, as its repository ships it. */
export const HUMMINGBIRD = `# bootstrapped from https://github.com/jcmkk3/zmk-config/blob/main/config/hummingbird.keymap
layout:
  qmk_keyboard: rufous  # you can also try the values below
  #qmk_keyboard: hummingbird
  #ortho_layout: {split: true, rows: 3, columns: 5, thumbs: 2, drop_pinky: true, drop_inner: true}
  #cols_thumbs_notation: "23332+2> 2<+23332"
layers:
  Def:
  - [W, F, M, P, G, K, U, O, Y, SQT]
  - [R, S, N, T, B, J, A, E, I, H]
  -    [C, L, D,       X, ',', .]
  - {t: Nav, h: sticky}
  - SPACE
  - {t: LSHFT, h: sticky}
  - {t: Sym, h: sticky}
  Nav:
  - [F1, F2, F3, F4, F5, ESC, HOME, UARW, END, PG UP]
  - [{t: LGUI, h: sticky}, {t: LALT, h: sticky}, {t: LSHFT, h: sticky}, {t: LCTRL, h: sticky}, LC(Z), DEL, LARW, ENTER, RARW, PG DN]
  - [LC(X), LC(C), LC(V), BSPC, DARW, TAB]
  - [{type: held}, '', '', '']
  Sym:
  - ['!', '@', '#', $, '%', ^, '&', ':', '\`', '"']
  - ['?', '-', '=', '*', '|', '~', LCTRL, LSHFT, LALT, LGUI]
  - [+, _, /, \\, <, '>']
  - ['', '', '', {type: held}]
  Num:
  - ['', '', '', '', '', '', '', '', '', '']
  - ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  - ['', '', '', '', '', '']
  - [{type: held}, '', '', {type: held}]
combos:
  - p: [1, 2]
    k: V
    l: [Def]
  - p: [1, 3]
    k: Q
    l: [Def]
    a: top
  - p: [24, 25]
    k: ;
    l: [Def, Sym, Num]
  - p: [1, 11]
    k: '['
    l: [Def, Sym, Num]
  - p: [3, 4]
    k: ESC
`;

describe('parseYaml', () => {
  it("reads keymap-drawer's own example", () => {
    const doc = parseYaml(HUMMINGBIRD) as {
      layout: Record<string, unknown>;
      layers: Record<string, unknown[]>;
      combos: Record<string, unknown>[];
    };
    expect(doc.layout).toEqual({ qmk_keyboard: 'rufous' });
    expect(Object.keys(doc.layers)).toEqual(['Def', 'Nav', 'Sym', 'Num']);
    expect(doc.layers.Def[0]).toEqual(['W', 'F', 'M', 'P', 'G', 'K', 'U', 'O', 'Y', 'SQT']);
    expect(doc.layers.Def[2]).toEqual(['C', 'L', 'D', 'X', ',', '.']);
    expect(doc.layers.Def[3]).toEqual({ t: 'Nav', h: 'sticky' });
    expect(doc.layers.Def[4]).toBe('SPACE');
    expect(doc.layers.Nav[0]).toContain('PG UP');
    expect(doc.layers.Nav[1]).toContain('LC(Z)');
    expect(doc.layers.Sym[0]).toEqual(['!', '@', '#', '$', '%', '^', '&', ':', '`', '"']);
    expect(doc.layers.Sym[2]).toEqual(['+', '_', '/', '\\', '<', '>']);
    expect(doc.layers.Num[1]).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    expect(doc.layers.Num[3]).toEqual([{ type: 'held' }, '', '', { type: 'held' }]);
    expect(doc.combos[0]).toEqual({ p: [1, 2], k: 'V', l: ['Def'] });
    expect(doc.combos[1].a).toBe('top');
    expect(doc.combos[2].k).toBe(';');
    expect(doc.combos[3].k).toBe('[');
  });

  it('reads a flow collection that runs over several lines, with comments in it', () => {
    expect(
      parseYaml(`row: [a, b,   # first two
  c,
  {t: d, h: e}]
next: 1`),
    ).toEqual({ row: ['a', 'b', 'c', { t: 'd', h: 'e' }], next: 1 });
  });

  it('reads nested block sequences written compactly, and mappings inside them', () => {
    expect(
      parseYaml(`- - a
  - b
- key: 1
  other: two
-
  - c`),
    ).toEqual([['a', 'b'], { key: 1, other: 'two' }, ['c']]);
  });

  it('resolves scalars by the core schema, so a legend such as on or yes stays text', () => {
    expect(
      parseYaml('[on, yes, no, true, false, null, ~, 12, -3, 1.5, 0x1F, .inf, "1", a b]'),
    ).toEqual([
      'on',
      'yes',
      'no',
      true,
      false,
      null,
      null,
      12,
      -3,
      1.5,
      31,
      Number.POSITIVE_INFINITY,
      '1',
      'a b',
    ]);
  });

  it('unescapes quoted scalars', () => {
    expect(
      parseYaml(String.raw`["a\tb", "\u00e7\"", 'it''s', "\x41", "line\
  joined"]`),
    ).toEqual(['a\tb', 'ç"', "it's", 'A', 'linejoined']);
  });

  it('keeps anchors and follows aliases', () => {
    expect(
      parseYaml(`trans: &t {t: ▽, type: trans}
layer: [*t, a, *t]`),
    ).toEqual({
      trans: { t: '▽', type: 'trans' },
      layer: [{ t: '▽', type: 'trans' }, 'a', { t: '▽', type: 'trans' }],
    });
  });

  it('reads literal and folded block scalars', () => {
    expect(
      parseYaml(`draw_config:
  svg_extra_style: |
    rect { fill: red; }
    text { fill: blue; }
  note: >
    folded
    text
  last: 1`),
    ).toEqual({
      draw_config: {
        svg_extra_style: 'rect { fill: red; }\ntext { fill: blue; }\n',
        note: 'folded text\n',
        last: 1,
      },
    });
  });

  it('keeps a hash that does not start a comment, and a colon inside a value', () => {
    expect(parseYaml("a: C#  # the language\nb: 'x: y'\nc: http://example.com")).toEqual({
      a: 'C#',
      b: 'x: y',
      c: 'http://example.com',
    });
  });

  it('refuses a key that would change the mapping itself', () => {
    expect(() => parseYaml('__proto__:\n  polluted: true\n')).toThrow(YamlError);
    expect(() => parseYaml('{ __proto__: { polluted: true } }')).toThrow(YamlError);
    const parsed = parseYaml('a: 1\n') as Record<string, unknown>;
    expect(parsed.polluted).toBeUndefined();
  });

  it('stops before nesting takes the stack down', () => {
    const deepBlock = Array.from({ length: 200 }, (_, i) => `${' '.repeat(i)}k:`).join('\n');
    expect(() => parseYaml(`${deepBlock} v\n`)).toThrow(/nested deeper/);
    expect(() => parseYaml(`${'['.repeat(200)}${']'.repeat(200)}`)).toThrow(/nested deeper/);
    // Real files are nowhere near the limit.
    const shallow = Array.from({ length: 20 }, (_, i) => `${' '.repeat(i)}k:`).join('\n');
    expect(parseYaml(`${shallow} v\n`)).toBeTruthy();
  });

  it('refuses aliases that nest into more nodes than any file needs, naming the line', () => {
    expect(() => parseYaml(aliasBomb(9))).toThrow(YamlError);
    expect(() => parseYaml(aliasBomb(9))).toThrow(
      new RegExp(`^line 9: aliases expand to more than ${MAX_EXPANDED} nodes`),
    );
    // Mappings fan out the same way as lists.
    const mappings = ['m0: &m0 {k: v}'];
    for (let n = 1; n < 9; n++) {
      const fields = Array.from({ length: 10 }, (_, k) => `k${k}: *m${n - 1}`).join(', ');
      mappings.push(`m${n}: &m${n} {${fields}}`);
    }
    expect(() => parseYaml(mappings.join('\n'))).toThrow(/^line \d+: aliases expand to more than/);
  });

  it('reads the same shape at a size no one would notice', () => {
    const { layers } = parseYaml(aliasBomb(4)) as { layers: { Base: unknown[][] } };
    expect(layers.Base).toHaveLength(4);
    expect(layers.Base[1]).toEqual(Array.from({ length: 10 }, () => ['Q', 'W', 'E']));
    expect(layers.Base[3].flat(Number.POSITIVE_INFINITY)).toHaveLength(3000);
    // An alias is the anchored node itself, not a copy of it.
    expect(layers.Base[2][0]).toBe(layers.Base[1]);
  });

  it('keeps the aliases real files use: a shared row, a repeated legend, a block collection', () => {
    expect(
      parseYaml(`row: &r [a, b, c]
trans: &t {t: ▽, type: trans}
layers:
  Base:
  - *r
  - *r
  - [*t, *t, *t]
  Held: &held
  - [*t, *r]
  Copy: *held
  Chain: [*held, *held]
`),
    ).toEqual({
      row: ['a', 'b', 'c'],
      trans: { t: '▽', type: 'trans' },
      layers: {
        Base: [
          ['a', 'b', 'c'],
          ['a', 'b', 'c'],
          [
            { t: '▽', type: 'trans' },
            { t: '▽', type: 'trans' },
            { t: '▽', type: 'trans' },
          ],
        ],
        Held: [[{ t: '▽', type: 'trans' }, ['a', 'b', 'c']]],
        Copy: [[{ t: '▽', type: 'trans' }, ['a', 'b', 'c']]],
        Chain: [
          [[{ t: '▽', type: 'trans' }, ['a', 'b', 'c']]],
          [[{ t: '▽', type: 'trans' }, ['a', 'b', 'c']]],
        ],
      },
    });
  });

  it('counts the nodes the aliases stand for, up to MAX_EXPANDED and no further', () => {
    const row = `row: &r [${Array.from({ length: 99 }, () => 'a').join(', ')}]`; // 100 nodes
    const layer = (aliases: number) =>
      `${row}\nlayer: [${Array.from({ length: aliases }, () => '*r').join(', ')}]`;
    const atLimit = MAX_EXPANDED / 100;
    const { layer: read } = parseYaml(layer(atLimit)) as { layer: unknown[] };
    expect(read).toHaveLength(atLimit);
    expect(() => parseYaml(layer(atLimit + 1))).toThrow(/aliases expand to more than/);
  });

  it('weighs a long string by its length, since a walk over the aliases builds text from it', () => {
    // A 100 KB file of this shape was a 300 MB string through readKeymapDrawer.
    const long = `s: &s "${'x'.repeat(100_000)}"`;
    const list = `l: &l [${Array.from({ length: 50 }, () => '*s').join(', ')}]`; // 312 551 nodes
    const lists = (copies: number) =>
      `${long}\n${list}\nm: [${Array.from({ length: copies }, () => '*l').join(', ')}]`;
    expect(parseYaml(lists(2))).toBeTruthy();
    expect(() => parseYaml(lists(3))).toThrow(/aliases expand to more than/);
  });

  it('says where the text stops making sense', () => {
    expect(() => parseYaml('a: [1, 2')).toThrow(YamlError);
    expect(() => parseYaml('a: [1, 2')).toThrow(/line 1: unclosed \[/);
    expect(() => parseYaml('a: {b: 1')).toThrow(/line 1: unclosed \{/);
    expect(() => parseYaml('a:\n\tb: 1')).toThrow(/line 2: a tab/);
    expect(() => parseYaml('a: *nowhere')).toThrow(/unknown alias/);
    expect(() => parseYaml('a: 1\n---\nb: 2')).toThrow(/more than one YAML document/);
  });
});
