import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze.js';
import { structureHash } from '../analysis/hash.js';
import { analysisRun, DEFAULT_SETTINGS, loadText } from '../analysis/settings.js';
import { nodeCorpusLoader } from '../corpus/node-loader.js';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN, FIXTURE_PT } from '../fixtures/index.js';
import { corporaRoot } from '../golden/paths.js';
import { compileLayout } from '../layout/compile.js';
import { importTextLayout } from '../layout/text.js';
import type { Binding, Layout } from '../layout/types.js';
import { BUNDLED_LAYOUTS, bundledLayout, CLASSIC_LAYOUTS } from '../layouts/index.js';
import { SHAPES } from '../presses/press-log.js';
import { simulate } from '../sim/resolver.js';
import { classifyBand, humanBand } from './bands.js';
import {
  BANDS,
  CYANOPHAGE_BANDS,
  CYANOPHAGE_SFB_FULL_RED,
  catalogRules,
  HAND_EVEN_BOUND,
  HAND_LEANS_BOUND,
  sfbWhere,
} from './catalog.js';
import { evaluate, evaluateFocus } from './engine.js';
import { cyanophage, getPreset, layoutsDoc } from './presets.js';
import { parseRuleSet, ruleSetFromJson, ruleSetToJson } from './serialize.js';
import type { Rule, RuleSet } from './types.js';

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const text = `${FIXTURE_EN} ${FIXTURE_PT}`;

/**
 * A layout by id, a classic one as written: its letters on one layer, one press a character.
 */
const layoutOf = (id: string) => CLASSIC_LAYOUTS.find((l) => l.id === id) ?? bundledLayout(id)!;

function run(layoutId: string, ruleSet: RuleSet) {
  const compiled = compileLayout(layoutOf(layoutId));
  const sim = simulate(compiled, normalizeText(text, OPTS), OPTS);
  const { results, score } = evaluate(sim.tables, compiled, ruleSet);
  return { results, score, value: (id: string) => results.find((r) => r.id === id)?.value ?? null };
}

/**
 * A rule set with weights and scoring on. No shipped preset enables the composite score, so the
 * scoring path and the weighted JSON round-trip need a set of their own.
 */
function weightedSet(): RuleSet {
  const weights: Record<string, number> = { sfb: 3, sfs: 1, redirect: 1, alternation: 0.5 };
  return {
    id: 'weighted',
    name: 'Weighted',
    description: 'Doc rules with a few families weighted and the composite score enabled.',
    globals: {},
    rules: catalogRules().map((r) => ({ ...r, score: { weight: weights[r.id] ?? 0 } })),
    score_enabled: true,
  };
}

describe('rules engine', () => {
  const qwerty = run('qwerty', layoutsDoc());
  const magic = run('magic-romak', layoutsDoc());

  it('evaluates every catalog rule', () => {
    expect(qwerty.results.length).toBe(catalogRules().length);
    for (const r of qwerty.results) {
      expect(r.value === null || Number.isFinite(r.value), r.id).toBe(true);
    }
  });

  it('finds the well-known Qwerty same-finger bigrams', () => {
    const sfb = qwerty.results.find((r) => r.id === 'sfb')!;
    expect(sfb.value).toBeGreaterThan(3);
    expect(sfb.band.quality).toBe('bad');
    expect(sfb.items.some((i) => i.label === 'ed' || i.label === 'de')).toBe(true);
  });

  it('keeps trigram categories disjoint and rolls consistent', () => {
    const sum = ['alternation', 'roll_in', 'roll_out', 'onehand_in', 'onehand_out', 'redirect']
      .map((id) => qwerty.value(id) as number)
      .reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(60);
    expect(sum).toBeLessThanOrEqual(100);
    expect(
      Math.abs(
        (qwerty.value('rolls') as number) -
          ((qwerty.value('roll_in') as number) + (qwerty.value('roll_out') as number)),
      ),
    ).toBeLessThan(1e-6);
  });

  it('distributes usage to 100 percent', () => {
    const usage = qwerty.results.find((r) => r.id === 'finger_usage')!;
    const total = Object.values(usage.per_finger).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.01);
    const hands = qwerty.results.find((r) => r.id === 'hand_balance')!;
    expect(Math.abs(Object.values(hands.per_hand).reduce((a, b) => a + b, 0) - 100)).toBeLessThan(
      0.01,
    );
  });

  it('reports layer costs for a multi-layer alpha and none for a single-layer one', () => {
    expect(magic.value('sfb')).toBeLessThan(qwerty.value('sfb') as number);
    expect(magic.value('layer_taps_per_100')).toBeGreaterThan(0);
    expect(magic.value('extra_keystrokes')).toBeGreaterThan(0);
    expect(qwerty.value('layer_taps_per_100')).toBe(0);
    // One press per symbol, and the space bar's presses type spaces, which are not symbols.
    expect(qwerty.value('extra_keystrokes')).toBe(0);
    const dist = magic.results.find((r) => r.id === 'layer_distribution')!;
    expect(Object.keys(dist.breakdown).length).toBeGreaterThanOrEqual(2);
  });

  it("splits each key's share by the layer it typed from, adding up to the whole", () => {
    for (const id of ['sfb', 'finger_usage']) {
      const r = magic.results.find((x) => x.id === id)!;
      expect(Object.keys(r.per_layer_key).length, id).toBeGreaterThan(1);
      const sum: Record<string, number> = {};
      for (const keys of Object.values(r.per_layer_key)) {
        for (const [pos, v] of Object.entries(keys)) sum[pos] = (sum[pos] ?? 0) + v;
      }
      expect(Object.keys(sum).sort(), id).toEqual(Object.keys(r.per_key).sort());
      for (const [pos, v] of Object.entries(r.per_key)) expect(sum[pos], id).toBeCloseTo(v, 9);
    }
    // A single-layer layout presses everything on its base layer.
    expect(Object.keys(qwerty.results.find((x) => x.id === 'sfb')!.per_layer_key)).toEqual(['0']);
  });

  it('says what a pair that ends on a layer key was pressed for, adding up to the pair', () => {
    const ending = magic.results.flatMap((r) => r.items.filter((i) => i.then));
    expect(ending.length).toBeGreaterThan(0);
    for (const item of ending) {
      const then = item.then!;
      expect(
        then.reduce((a, t) => a + t.share, 0),
        item.label,
      ).toBeCloseTo(1, 9);
      expect(
        then.reduce((a, t) => a + t.percent, 0),
        item.label,
      ).toBeCloseTo(item.percent!, 9);
      const counts = then.map((t) => t.count);
      expect(counts, item.label).toEqual([...counts].sort((a, b) => b - a));
      // Only a pair whose last key brings a layer on has them.
      expect(item.keys, item.label).toHaveLength(2);
    }
    // Magic Romak's thumb that reaches Alpha 2 is pressed for a key on Alpha 2.
    const a2 = ending.find((i) => i.label.endsWith('→A2'));
    expect(a2, 'a pair ending on the A2 thumb').toBeDefined();
    expect(a2!.then![0].layer).toBe(1);
    // A pair that starts on it already names the key it was pressed for.
    const starting = magic.results.flatMap((r) => r.items.filter((i) => /^→A2./.test(i.label)));
    expect(starting.length).toBeGreaterThan(0);
    expect(starting.every((i) => i.then === undefined)).toBe(true);
  });

  it('computes the in:out ratio after the other rules', () => {
    const expected = (qwerty.value('roll_in') as number) / (qwerty.value('roll_out') as number);
    expect(Math.abs((qwerty.value('in_out_ratio') as number) - expected)).toBeLessThan(1e-6);
    expect(qwerty.results[qwerty.results.length - 1].id).toBe('in_out_ratio');
  });

  it('classifies bands per the Doc thresholds', () => {
    expect(classifyBand(0.5, BANDS.sfb).label).toBe('min');
    expect(classifyBand(1.2, BANDS.sfb).label).toBe('mid_high');
    expect(classifyBand(2.0, BANDS.sfb).quality).toBe('bad');
    expect(classifyBand(40.0, BANDS.alt).quality).toBe('good');
    expect(classifyBand(null, BANDS.sfb).quality).toBe('neutral');
  });

  it('bands hand balance as the Doc counts it: even to 52-48, leans to 55-45, heavy past it', () => {
    // The Doc's splits are shares per hand; the rule's value is their difference (ch. 13.4). It
    // prints whole percents and files a split under the one it prints, so 52-48 is even and 53-47
    // leans: a category runs to the half point above its larger share.
    const split = (larger: number) => classifyBand(larger - (100 - larger), BANDS.hand);
    const bound = (share: number) => 2 * (share + 0.5 - 50);
    expect(BANDS.hand.bounds).toEqual([bound(52), bound(55)]);
    expect(BANDS.hand.bounds).toEqual([HAND_EVEN_BOUND, HAND_LEANS_BOUND]);
    expect(split(50)).toMatchObject({ label: 'even', quality: 'good' });
    expect(split(51.5)).toMatchObject({ label: 'even', quality: 'good' });
    expect(split(52)).toMatchObject({ label: 'even', quality: 'good' });
    expect(split(52.4)).toMatchObject({ label: 'even', quality: 'good' });
    // A bound is inclusive: 52.5-47.5 is 5 points and 55.5-44.5 is 11, both exact.
    expect(split(52.5)).toMatchObject({ label: 'even', quality: 'good' });
    expect(split(52.6)).toMatchObject({ label: 'leans', quality: 'ok' });
    expect(split(53)).toMatchObject({ label: 'leans', quality: 'ok' });
    expect(split(55)).toMatchObject({ label: 'leans', quality: 'ok' });
    expect(split(55.4)).toMatchObject({ label: 'leans', quality: 'ok' });
    expect(split(55.5)).toMatchObject({ label: 'leans', quality: 'ok' });
    expect(split(55.6)).toMatchObject({ label: 'heavy', quality: 'bad' });
    expect(split(56)).toMatchObject({ label: 'heavy', quality: 'bad' });
    // The Doc names three categories and none above heavy, which is open-ended: a split as lopsided
    // as 100-0 is still heavy, and no band is called very heavy.
    expect(split(100)).toMatchObject({ label: 'heavy', quality: 'bad' });
    expect(BANDS.hand.labels).toEqual(['even', 'leans', 'heavy']);
    // The rule each preset ranks with carries them, and the engine bands its value by them.
    for (const preset of [layoutsDoc(), cyanophage()]) {
      expect(preset.rules.find((r) => r.id === 'hand_balance')?.bands, preset.id).toEqual(
        BANDS.hand,
      );
    }
    const hands = qwerty.results.find((r) => r.id === 'hand_balance')!;
    expect(hands.band).toEqual(classifyBand(hands.value, BANDS.hand));
    expect(hands.band.label).toBe('heavy');
  });

  it('rates SFB on the nine steps: the Doc’s first five, then its sequence carried on', () => {
    // The Doc's SFB row has six bounds, Min to Mid high, and dashes under High, Very high and Max
    // (ch. 13.4). The three dashes are filled by its sequence carried on (steps 0.10 · 0.11 · 0.14
    // · 0.20 · 0.30, then 0.45 · 0.66 · 0.94): 1.825, 2.485, 3.425, each the start of its name, so
    // Mid high runs past the Doc's own 1.375. No name of its own: the nine, by position.
    expect(BANDS.sfb.bounds).toEqual([0.525, 0.625, 0.735, 0.875, 1.075, 1.825, 2.485, 3.425]);
    expect(BANDS.sfb.labels).toBeUndefined();
    const steps = [
      [0.5, 'min', 'good'],
      [0.525, 'min', 'good'],
      [0.526, 'very_low', 'good'],
      [0.625, 'very_low', 'good'],
      [0.626, 'low', 'good'],
      [0.735, 'low', 'good'],
      [0.736, 'mid_low', 'ok'],
      [0.875, 'mid_low', 'ok'],
      [0.876, 'mid', 'ok'],
      [1.075, 'mid', 'ok'],
      [1.076, 'mid_high', 'ok'],
      [1.375, 'mid_high', 'ok'],
      [1.56, 'mid_high', 'ok'],
      [1.825, 'mid_high', 'ok'],
      [1.826, 'high', 'bad'],
      [2.485, 'high', 'bad'],
      [2.486, 'very_high', 'bad'],
      [3.425, 'very_high', 'bad'],
      [3.426, 'max', 'bad'],
      [6, 'max', 'bad'],
    ] as const;
    for (const [value, label, quality] of steps) {
      expect(classifyBand(value, BANDS.sfb), `SFB ${value}`).toMatchObject({ label, quality });
    }
    expect(humanBand(classifyBand(2.1, BANDS.sfb).label)).toBe('high');
    expect(humanBand(classifyBand(3, BANDS.sfb).label)).toBe('very high');
    // Every SFB the Doc's own rows give keeps its category: Noctum 0.550 and Isrt 0.599 Very low,
    // Mtgap 1.048 Mid, Colemak DH 1.177 and Engram 1.242 Mid high (§13.2, §14.2.1, §15.7.5).
    const docRows = [
      [0.55, 'very_low'],
      [0.599, 'very_low'],
      [1.048, 'mid'],
      [1.177, 'mid_high'],
      [1.242, 'mid_high'],
    ] as const;
    for (const [value, label] of docRows) {
      expect(classifyBand(value, BANDS.sfb).label, `SFB ${value}`).toBe(label);
    }
    // The Layouts Doc rule set carries this ruler, as a part of the set and not only of the catalog.
    expect(layoutsDoc().rules.find((r) => r.id === 'sfb')?.bands).toEqual(BANDS.sfb);
  });

  it('rates cyanophage-like SFB on the ramp cyanophage colours it by', () => {
    // His pages rate no layout; his finger bars are `red = 128 + 6000 * share` clamped to 255, so
    // full red at 127 / 6000 of the input. Nine equal steps over it, the ninth, max, from 1.881 on.
    expect(CYANOPHAGE_SFB_FULL_RED).toBeCloseTo(2.1167, 4);
    const { bounds } = CYANOPHAGE_BANDS.sfb;
    expect(bounds).toHaveLength(8);
    bounds.forEach((bound, i) => {
      expect(bound, `bound ${i + 1}`).toBeCloseTo(((i + 1) * CYANOPHAGE_SFB_FULL_RED) / 9, 3);
    });
    const ruler = cyanophage().rules.find((r) => r.id === 'sfb')?.bands;
    expect(ruler).toEqual(CYANOPHAGE_BANDS.sfb);
    expect(ruler).not.toEqual(layoutsDoc().rules.find((r) => r.id === 'sfb')?.bands);
    const steps = [
      [0.235, 'min', 'good'],
      [0.236, 'very_low', 'good'],
      [0.706, 'low', 'good'],
      [0.71, 'mid_low', 'ok'],
      [0.98, 'mid', 'ok'],
      [1.176, 'mid', 'ok'],
      [1.177, 'mid_high', 'ok'],
      [1.411, 'mid_high', 'ok'],
      [1.412, 'high', 'bad'],
      [1.87, 'very_high', 'bad'],
      [1.881, 'very_high', 'bad'],
      [1.882, 'max', 'bad'],
      [4.39, 'max', 'bad'],
    ] as const;
    for (const [value, label, quality] of steps) {
      expect(classifyBand(value, ruler), `SFB ${value}`).toMatchObject({ label, quality });
    }
    // The ruler travels with the set: saved to JSON and read back, it is the same.
    const back = ruleSetFromJson(ruleSetToJson(cyanophage()));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.ruleSet.rules.find((r) => r.id === 'sfb')?.bands).toEqual(CYANOPHAGE_BANDS.sfb);
    }
    // Only SFB has a ruler of his: every other rule's is the Doc set's.
    for (const rule of cyanophage().rules) {
      if (rule.id === 'sfb') continue;
      expect(rule.bands ?? null, rule.id).toEqual(
        layoutsDoc().rules.find((r) => r.id === rule.id)?.bands ?? null,
      );
    }
  });

  it('names what is past the last threshold of SFS, scissors, redirects and pinky off as the Doc does', () => {
    // The Doc's table stops SFS at six thresholds and scissors, redirects and pinky off at seven
    // (ch. 13.4), but its layout rows call a value past them the next word of the nine: SFS 7.483
    // (Colemak DH) is High, scissors 0.71 (Hands Down Neu) and 0.81, redirects 12.1 (Colemak DH)
    // and 13.6, pinky off 8.1 and 8.3 are Very high. So these four keep the positional names, and
    // only SFB, which no row of the Doc has past its last bound, is named otherwise. (The Doc calls
    // an SFS of 8.744 Very high; the table gives no bound for it, so none is made up.)
    const rows = [
      { id: 'sfs', bands: BANDS.sfs, values: [7.344, 7.483, 7.541], label: 'high' },
      { id: 'fsb', bands: BANDS.scissors, values: [0.71, 0.81], label: 'very_high' },
      { id: 'redirect', bands: BANDS.redir, values: [12.1, 13.6], label: 'very_high' },
      { id: 'pinky_off', bands: BANDS.pinky_off, values: [8.1, 8.3], label: 'very_high' },
    ];
    for (const { id, bands, values, label } of rows) {
      expect(bands.labels, `${id} has no names of its own`).toBeUndefined();
      for (const value of values) {
        expect(classifyBand(value, bands), `${id} ${value}`).toMatchObject({
          label,
          quality: 'bad',
        });
      }
    }
    // The presets rank with these, not only the table they come from.
    for (const preset of [layoutsDoc(), cyanophage()]) {
      for (const { id, bands } of rows) {
        expect(preset.rules.find((r) => r.id === id)?.bands, `${preset.id} ${id}`).toEqual(bands);
      }
    }
    // LSB's bands are LayerBench's own, not in the Doc's table: its names stay by position.
    expect(classifyBand(5, BANDS.lsb).label).toBe('very_high');
  });

  it('bands Effort on all nine steps, min to max, lower being better', () => {
    // Min up to 400 and max above 900, and between them the progression of the Doc's SFB bounds
    // (0.525 · 0.625 · 0.735 · 0.875 · 1.075 · 1.375, then 1.825 · 2.485 carried on), at the same
    // relative places: its steps, 0.10 · 0.11 · 0.14 · 0.20 · 0.30 · 0.45 · 0.66, each larger than the
    // one before, by a tenth at first and about half from the fourth.
    const docSfb = [0.525, 0.625, 0.735, 0.875, 1.075, 1.375, 1.825, 2.485];
    const at = (sfb: number) =>
      400 + ((sfb - docSfb[0]) * 500) / (docSfb[docSfb.length - 1] - docSfb[0]);
    expect(BANDS.effort.bounds).toEqual(docSfb.map((sfb) => Math.round(at(sfb))));
    expect(BANDS.effort.bounds.slice(1).map((b, i) => b - BANDS.effort.bounds[i])).toEqual([
      26, 28, 35, 51, 77, 115, 168,
    ]);
    expect(classifyBand(353, BANDS.effort)).toMatchObject({ label: 'min', quality: 'good' });
    expect(classifyBand(400, BANDS.effort).label).toBe('min');
    expect(classifyBand(401, BANDS.effort).label).toBe('very_low');
    expect(classifyBand(630, BANDS.effort)).toMatchObject({ label: 'high', quality: 'bad' });
    expect(classifyBand(900, BANDS.effort).label).toBe('very_high');
    expect(classifyBand(901, BANDS.effort).label).toBe('max');
    expect(classifyBand(1237, BANDS.effort)).toMatchObject({ label: 'max', quality: 'bad' });
    // Every preset scores Effort with the catalog's rule, so every one carries its bands, and the
    // names and colours of every step are the same in both: cyanophage's Effort has no ruler of his.
    const effortSteps = [
      [400, 'min', 'good'],
      [426, 'very_low', 'good'],
      [454, 'low', 'good'],
      [489, 'mid_low', 'ok'],
      [540, 'mid', 'ok'],
      [617, 'mid_high', 'ok'],
      [732, 'high', 'bad'],
      [900, 'very_high', 'bad'],
      [901, 'max', 'bad'],
    ] as const;
    expect(BANDS.effort.bounds).toEqual([400, 426, 454, 489, 540, 617, 732, 900]);
    for (const preset of [layoutsDoc(), cyanophage()]) {
      const bands = preset.rules.find((r) => r.id === 'effort')?.bands;
      expect(bands, preset.id).toEqual(BANDS.effort);
      for (const [value, label, quality] of effortSteps) {
        expect(classifyBand(value, bands), `${preset.id} Effort ${value}`).toMatchObject({
          label,
          quality,
        });
      }
    }
    expect(qwerty.results.find((r) => r.id === 'effort')?.band.label).toBe('max');
  });

  it('changes definitions and normalization per preset', () => {
    const cyan = run('qwerty', cyanophage());
    expect(cyan.value('sfb')).toBeLessThan(qwerty.value('sfb') as number);
    expect(getPreset('nope').id).toBe('layouts_doc');
  });

  it('counts each word’s space once in cyanophage’s keystrokes, whether space is counted or not', () => {
    const compiled = compileLayout(layoutOf('qwerty'));
    const sim = simulate(compiled, normalizeText(text, OPTS), OPTS);
    const st = sim.tables.stats;
    const sfbOf = (rs: RuleSet) =>
      evaluate(sim.tables, compiled, rs).results.find((r) => r.id === 'sfb')?.value as number;
    const universe = (rs: RuleSet, u: 'no_space' | 'with_space'): RuleSet => ({
      ...rs,
      globals: { ...rs.globals, universe: u },
    });
    // The same-finger bigrams themselves: the Doc's SFB is a share of the letters typed.
    const sfbs = (sfbOf(layoutsDoc()) / 100) * st.symbols;
    expect(sfbs).toBeGreaterThan(0);

    // What Qwerty cannot type (the fixture's Portuguese accents) is a keystroke too, as for him.
    const untyped = sum(st.unproducible) + sum(st.soft_dropped);
    expect(untyped).toBeGreaterThan(0);

    // Without space: every other keystroke, plus one space per word.
    const without = sfbOf(universe(cyanophage(), 'no_space'));
    expect(without).toBeCloseTo(
      (sfbs / (st.keystrokes - st.space_presses + st.words + untyped)) * 100,
      9,
    );

    // With space: the space presses are keystrokes already, and nothing is added.
    const withSfbs = (sfbOf(universe(layoutsDoc(), 'with_space')) / 100) * st.symbols;
    const withSpace = sfbOf(universe(cyanophage(), 'with_space'));
    expect(withSpace).toBeCloseTo((withSfbs / (st.keystrokes + untyped)) * 100, 9);
  });

  it('counts what the layout cannot type as keystrokes in cyanophage’s percentages and Effort, at no cost', () => {
    const compiled = compileLayout(layoutOf('qwerty'));
    const sim = simulate(compiled, normalizeText(text, OPTS), OPTS);
    const st = sim.tables.stats;
    const untyped = sum(st.unproducible) + sum(st.soft_dropped);
    expect(untyped).toBeGreaterThan(0);
    const ruleValue = (rs: RuleSet, id: string) =>
      evaluate(sim.tables, compiled, rs).results.find((r) => r.id === id)?.value as number;
    const counted = cyanophage();
    expect(counted.globals.untyped_in_keystrokes).toBe(true);
    const left: RuleSet = {
      ...counted,
      globals: { ...counted.globals, untyped_in_keystrokes: false },
    };
    // The same pairs and the same cost, over more keystrokes.
    const pairs = st.keystrokes - st.space_presses + st.words;
    expect(ruleValue(counted, 'sfb') * (pairs + untyped)).toBeCloseTo(
      ruleValue(left, 'sfb') * pairs,
      6,
    );
    const chars = sim.tables.presses.ngrams('with_space', 'unigram').textTotal;
    expect(ruleValue(counted, 'effort') * (chars + untyped)).toBeCloseTo(
      ruleValue(left, 'effort') * chars,
      6,
    );
    // The Layouts Doc set counts only what is typed.
    expect(layoutsDoc().globals.untyped_in_keystrokes).toBeUndefined();
  });

  it('counts no thumb in cyanophage’s scissors, a letter on a thumb included', () => {
    // On the 3x5+2 board the left thumb L1 is column 1, three rows below the ring finger's top key
    // (column 2): adjacent columns, two rows apart or more, two fingers. A letter there and that key
    // make the pair his scissors leave out, as his thumbs have none.
    const { layout } = importTextLayout(
      'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /\nç space',
      '3x5+2',
    );
    const compiled = compileLayout(layout);
    expect(compiled.keyIndex.has('L1')).toBe(true);
    const sim = simulate(compiled, normalizeText('çw çw çw', OPTS), OPTS);
    const fsbOf = (rs: RuleSet) =>
      evaluate(sim.tables, compiled, rs).results.find((r) => r.id === 'fsb')?.value as number;
    const preset = cyanophage();
    expect(fsbOf(preset)).toBe(0);
    // Without its thumb clause the same rule counts them: the clause is what keeps them out.
    const withThumbs: RuleSet = {
      ...preset,
      rules: preset.rules.map((r) =>
        r.id === 'fsb' && r.where && 'all' in r.where
          ? { ...r, where: { all: r.where.all.filter((p) => !('any_thumb' in p)) } }
          : r,
      ),
    };
    expect(fsbOf(withThumbs)).toBeGreaterThan(0);
  });

  it('counts cyanophage’s redirects with three different fingers, the weak ones without an index', () => {
    // Qwerty: `esd` is middle, ring, middle (two keys of one finger), `sfd` ring, index, middle, and
    // `sad` ring, pinky, middle: each changes direction.
    const compiled = compileLayout(layoutOf('qwerty'));
    const of = (words: string, rs: RuleSet, id: string) => {
      const sim = simulate(compiled, normalizeText(words, OPTS), OPTS);
      return evaluate(sim.tables, compiled, rs).results.find((r) => r.id === id)?.value as number;
    };
    // His redirects need three different fingers; the Layouts Doc's do not.
    expect(of('esd esd esd', cyanophage(), 'redirect')).toBe(0);
    expect(of('esd esd esd', cyanophage(), 'weak_redirect')).toBe(0);
    expect(of('esd esd esd', layoutsDoc(), 'redirect')).toBeGreaterThan(0);
    expect(of('esd esd esd', layoutsDoc(), 'weak_redirect')).toBeGreaterThan(0);
    // With an index finger it is a redirect and not a weak one; without, both.
    expect(of('sfd sfd sfd', cyanophage(), 'redirect')).toBeGreaterThan(0);
    expect(of('sfd sfd sfd', cyanophage(), 'weak_redirect')).toBe(0);
    expect(of('sad sad sad', cyanophage(), 'redirect')).toBeGreaterThan(0);
    expect(of('sad sad sad', cyanophage(), 'weak_redirect')).toBe(
      of('sad sad sad', cyanophage(), 'redirect'),
    );
  });

  it('counts cyanophage’s scissors on adjacent columns, not adjacent fingers', () => {
    // Qwerty's `c` is the left middle finger's bottom key and `t` the index finger's stretch
    // column two rows up: adjacent fingers, two columns apart, which he does not count. `r`, the
    // index finger's own column, is a scissor.
    const compiled = compileLayout(layoutOf('qwerty'));
    const fsbOf = (words: string) => {
      const sim = simulate(compiled, normalizeText(words, OPTS), OPTS);
      return evaluate(sim.tables, compiled, cyanophage()).results.find((r) => r.id === 'fsb')
        ?.value as number;
    };
    expect(fsbOf('ct ct ct')).toBe(0);
    expect(fsbOf('cr cr cr')).toBeGreaterThan(0);
    // The Layouts Doc's scissors still go by fingers.
    const sim = simulate(compiled, normalizeText('ct ct ct', OPTS), OPTS);
    expect(
      evaluate(sim.tables, compiled, layoutsDoc()).results.find((r) => r.id === 'fsb')?.value,
    ).toBeGreaterThan(0);
  });

  it('lists the Repeat key and the space after it as one same-thumb pair when space is counted', () => {
    // Magic Romak types a doubled letter as the letter and then its Repeat key (`L1`), and the space
    // bar is `L0` beside it: two keys of one thumb, so a pair the rule counts, as METRICS.md says of
    // thumbs. The Repeat press is named for the key, `⟳`, whatever letter it repeated, so every
    // doubled letter before a space is one row, however many different letters it repeated.
    const compiled = compileLayout(layoutOf('magic-romak'));
    const repeat = compiled.keyIndex.get('L1') as number;
    const space = compiled.keyIndex.get('L0') as number;
    expect(compiled.positions[repeat].fingers).toEqual(['LT']);
    expect(compiled.positions[space].fingers).toEqual(['LT']);
    const sim = simulate(compiled, normalizeText('all pass see me', OPTS), OPTS);
    const pairs = (universe: 'no_space' | 'with_space') => {
      const rules: RuleSet = { ...layoutsDoc(), globals: { ...layoutsDoc().globals, universe } };
      const sfb = evaluate(sim.tables, compiled, rules).results.find((r) => r.id === 'sfb');
      return (sfb?.items ?? []).filter((i) => i.keys[0] === repeat && i.keys[1] === space);
    };
    const counted = pairs('with_space');
    expect(counted).toHaveLength(1);
    expect(counted[0].label).toBe('⟳␣');
    // `all`, `pass` and `see`, each doubled letter before its space.
    expect(counted[0].count).toBe(3);
    expect(pairs('no_space')).toEqual([]);
  });

  it('divides pairs by the text’s own pairs, so extra presses do not thin them out', () => {
    const tablesOf = (id: string) => {
      const compiled = compileLayout(layoutOf(id));
      return simulate(compiled, normalizeText(text, OPTS), OPTS).tables;
    };
    // A layout typing each character with one press has exactly the text's totals: nothing it
    // reports moves.
    const q = tablesOf('qwerty');
    for (const universe of ['no_space', 'with_space'] as const) {
      for (const shape of SHAPES) {
        const g = q.presses.ngrams(universe, shape);
        expect(g.textTotal, `${universe} ${shape}`).toBe(g.total);
      }
    }

    // Magic Romak's layer taps and holds add pairs of its own, but the text has the pairs it has,
    // and that is what its same-finger bigrams are a share of.
    const m = tablesOf('magic-romak');
    const pairs = m.presses.ngrams('no_space', 'bigram');
    expect(pairs.total).toBeGreaterThan(pairs.textTotal);
    expect(m.presses.ngrams('no_space', 'unigram').textTotal).toBe(m.stats.symbols);
    // SFB itself is a share of the letters, below; this is the share of pairs a rule gets by default.
    const sfb = {
      ...catalogRules().find((r) => r.id === 'sfb')!,
      aggregate: 'percent_of_ngrams' as const,
    };
    const counting: RuleSet = {
      ...layoutsDoc(),
      rules: [sfb, { ...sfb, id: 'sfb_count', aggregate: 'count' }],
    };
    const compiled = compileLayout(bundledLayout('magic-romak')!);
    const [percent, count] = evaluate(m, compiled, counting).results.map((r) => r.value as number);
    expect(count).toBeGreaterThan(0);
    expect(percent).toBeCloseTo((count / pairs.textTotal) * 100, 9);
  });

  it('never counts a trigram with a thumb press as a roll or an alternation, but keeps it in the total', () => {
    const piano = compileLayout(bundledLayout('ben-vallack-piano')!);
    const ids = ['alternation', 'rolls', 'roll_in'];
    const asFingers: RuleSet = {
      ...layoutsDoc(),
      rules: [
        {
          id: 'in_with_thumbs',
          ngram: { n: 3 },
          where: { all: [{ hand_pattern: 'aab' }, { direction: 'inward', at: [0, 1] }] },
        },
      ],
    };
    const typed = (word: string) => {
      const tables = simulate(piano, normalizeText(word, OPTS), OPTS).tables;
      const ruleSet: RuleSet = {
        ...layoutsDoc(),
        rules: catalogRules().filter((r) => ids.includes(r.id)),
      };
      return {
        trigrams: tables.presses.ngrams('no_space', 'trigram').total,
        values: evaluate(tables, piano, ruleSet).results.map((r) => r.value),
        asFingers: evaluate(tables, piano, asFingers).results[0].value,
      };
    };
    // s, e, t: left, right, left.
    expect(typed('set').values).toEqual([100, 0, 0]);
    // e, the right outer thumb tapping Alpha 2, then v on the left hand. Were the thumb a finger,
    // middle finger to thumb would roll inward; it is one trigram, and neither.
    const ev = typed('ev');
    expect(ev.trigrams).toBe(1);
    expect(ev.asFingers).toBe(100);
    expect(ev.values).toEqual([0, 0, 0]);
  });

  it('computes a composite score when the set enables it', () => {
    const scored = run('qwerty', weightedSet());
    expect(scored.score.enabled).toBe(true);
    expect(typeof scored.score.value).toBe('number');
    // No preset ships with scoring on, so an unweighted set must leave it off.
    for (const preset of [layoutsDoc(), cyanophage()]) {
      expect(run('qwerty', preset).score.enabled).toBe(false);
    }
  });

  it('falls back to the Doc for the removed Keysolve preset', () => {
    expect(getPreset('keysolve')).toEqual(layoutsDoc());
  });

  it('round-trips rule sets through JSON', () => {
    const json = ruleSetToJson(weightedSet());
    const back = ruleSetFromJson(json);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.ruleSet.id).toBe('weighted');
    expect(back.ruleSet.score_enabled).toBe(true);
    expect(back.ruleSet.rules.find((r) => r.id === 'sfb')?.score?.weight).toBe(3);
    const sfb = back.ruleSet.rules.find((r) => r.id === 'sfb')!;
    expect(sfb.where).toEqual(sfbWhere());
    expect(sfb.ngram).toEqual({ n: 2, skip: 0 });
    expect(sfb.aggregate).toBe('percent_of_symbols');
    expect(sfb.bands?.direction).toBe('lower_is_better');
  });

  it('rejects malformed rule sets with a readable message', () => {
    expect(ruleSetFromJson('not json').ok).toBe(false);
    expect(ruleSetFromJson('[]').ok).toBe(false);
    const missing = ruleSetFromJson('{"name":"x"}');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('rules');
  });

  it('evaluates a rule composed by hand', () => {
    const custom: RuleSet = {
      ...layoutsDoc(),
      rules: [
        parseRuleSet({
          rules: [
            {
              id: 'ring_below_middle',
              label: 'Ring lower than middle, one row apart',
              family: 'bigram',
              source: 'ngram',
              ngram: { n: 2, skip: 0 },
              where: {
                all: [
                  { same_hand: true },
                  { finger_name_pair: ['ring', 'middle'] },
                  { row_delta: { abs: 1 } },
                ],
              },
              aggregate: 'percent_of_ngrams',
            },
          ],
        }).rules[0],
      ],
    };
    const r = run('qwerty', custom);
    expect(r.value('ring_below_middle')).toBeGreaterThan(0);
    expect(r.results[0].items.length).toBeGreaterThan(0);
  });

  it("hashes a layout's structure stably, and another layout apart", () => {
    const layout = bundledLayout('qwerty')!;
    expect(structureHash(bundledLayout('qwerty')!)).toBe(structureHash(layout));
    expect(structureHash(bundledLayout('romak')!)).not.toBe(structureHash(layout));
  });
});

describe('SFB as a share of the letters typed', () => {
  const countOf = (rule: Rule): Rule => ({ ...rule, id: 'sfb_count', aggregate: 'count' });
  const sfbRule = catalogRules().find((r) => r.id === 'sfb')!;
  const universeOf = (rs: RuleSet, universe: 'no_space' | 'with_space'): RuleSet => ({
    ...rs,
    globals: { ...rs.globals, universe },
  });

  /** The Doc's SFB and its count, on a text typed on a bundled layout, in one universe. */
  function sfbOn(
    layoutId: string,
    universe: 'no_space' | 'with_space',
    opts: { caseMode: 'fold' | 'model'; crossWord: 'reset' } = OPTS,
    from = text,
  ) {
    const compiled = compileLayout(bundledLayout(layoutId)!);
    const sim = simulate(compiled, normalizeText(from, opts), opts);
    const rules: RuleSet = {
      ...layoutsDoc(),
      rules: [
        sfbRule,
        countOf(sfbRule),
        { ...sfbRule, id: 'sfb_pairs', aggregate: 'percent_of_ngrams' },
      ],
    };
    const { results } = evaluate(sim.tables, compiled, universeOf(rules, universe));
    const value = (id: string) => results.find((r) => r.id === id)!.value as number;
    return {
      sim,
      results,
      share: value('sfb'),
      count: value('sfb_count'),
      pairs: value('sfb_pairs'),
    };
  }

  it('is a share of symbols in the Layouts Doc preset, and of keystrokes in the cyanophage-like one', () => {
    expect(layoutsDoc().rules.find((r) => r.id === 'sfb')?.aggregate).toBe('percent_of_symbols');
    // The cyanophage-like preset keeps dividing by keystrokes, with a space per word.
    expect(cyanophage().rules.find((r) => r.id === 'sfb')?.aggregate).toBe('percent_of_keystrokes');
  });

  it('gives SFB ≥ 2 rows the same letters, so it reads as a part of SFB', () => {
    const part = catalogRules().find((r) => r.id === 'sfb_2u')!;
    expect(part.aggregate).toBe('percent_of_symbols');
    expect(cyanophage().rules.find((r) => r.id === 'sfb_2u')?.aggregate).toBe(
      'percent_of_keystrokes',
    );
    const compiled = compileLayout(bundledLayout('qwerty')!);
    const sim = simulate(compiled, normalizeText(text, OPTS), OPTS);
    const set: RuleSet = {
      ...layoutsDoc(),
      rules: [sfbRule, part, countOf(sfbRule), { ...countOf(part), id: 'sfb_2u_count' }],
    };
    const [share, partShare, count, partCount] = evaluate(sim.tables, compiled, set).results.map(
      (r) => r.value as number,
    );
    expect(partShare).toBeGreaterThan(0);
    expect(partShare).toBeLessThan(share);
    // Over the same letters, the two shares are in the ratio of their counts.
    expect(partShare / share).toBeCloseTo(partCount / count, 9);
  });

  it('divides by the text’s symbols, without the space, whether space is counted or not', () => {
    for (const id of ['qwerty', 'magic-romak']) {
      const without = sfbOn(id, 'no_space');
      const withSpace = sfbOn(id, 'with_space');
      const symbols = without.sim.tables.stats.symbols;
      expect(symbols).toBeGreaterThan(0);
      expect(without.share, id).toBeCloseTo((without.count / symbols) * 100, 9);
      // Counting the space bar adds same-finger pairs to the count; what they are a share of is
      // the letters still, not the letters and the spaces.
      expect(withSpace.share, id).toBeCloseTo((withSpace.count / symbols) * 100, 9);
      expect(withSpace.count, id).toBeGreaterThanOrEqual(without.count);
    }
  });

  it('divides by the same symbols when capitals go through Shift', () => {
    const capitals =
      'The Quick Brown Fox Jumps Over The Lazy Dog. Pack My Box With Five Dozen Jugs.';
    const modelled = sfbOn(
      'magic-romak',
      'no_space',
      { caseMode: 'model', crossWord: 'reset' },
      capitals,
    );
    const folded = sfbOn('magic-romak', 'no_space', OPTS, capitals);
    const symbols = modelled.sim.tables.stats.symbols;
    expect(symbols).toBe(folded.sim.tables.stats.symbols);
    expect(modelled.share).toBeCloseTo((modelled.count / symbols) * 100, 9);
    // The Shift presses are in the stream: they make some pairs and break others, so the count may
    // go either way. The letters it is a share of do not.
    expect(modelled.count).not.toBe(folded.count);
  });

  it('is the share of pairs times the pairs the text has per letter, on every bundled layout', () => {
    const sample = 5_000;
    const opts = { ...OPTS };
    const stream = normalizeText(`${FIXTURE_EN} ${FIXTURE_PT}`, opts);
    for (const layout of BUNDLED_LAYOUTS) {
      const compiled = compileLayout(layout);
      const sim = simulate(compiled, stream, { ...opts, maxSymbols: sample });
      const rules: RuleSet = {
        ...layoutsDoc(),
        rules: [sfbRule, { ...sfbRule, id: 'sfb_pairs', aggregate: 'percent_of_ngrams' }],
      };
      const { results } = evaluate(sim.tables, compiled, rules);
      const [share, pairs] = results.map((r) => r.value as number);
      const perLetter =
        sim.tables.presses.ngrams('no_space', 'bigram').textTotal /
        sim.tables.presses.ngrams('no_space', 'unigram').textTotal;
      expect(share, layout.id).toBeCloseTo(pairs * perLetter, 9);
    }
  });

  it('lists items and splits the keys’ parts over the same letters as its value', () => {
    for (const id of ['qwerty', 'magic-romak']) {
      for (const universe of ['no_space', 'with_space'] as const) {
        const { results, sim, share } = sfbOn(id, universe);
        const symbols = sim.tables.stats.symbols;
        const sfb = results.find((r) => r.id === 'sfb')!;
        const where = `${id}, ${universe}`;
        expect(sfb.value, where).toBeCloseTo(share, 9);
        expect(sfb.items.length, where).toBeGreaterThan(0);
        // Each item is its count over the letters, the way the value is, and what was listed can
        // only add up to the value.
        for (const item of sfb.items) {
          expect(item.percent, `${where} ${item.label}`).toBeCloseTo(
            ((item.count as number) / symbols) * 100,
            9,
          );
          // What was pressed after a pair that ends on a layer key adds up to the pair.
          if (item.then) {
            const then = item.then.reduce((a, n) => a + n.percent, 0);
            expect(then, `${where} ${item.label}`).toBeCloseTo(item.percent as number, 9);
          }
        }
        const listed = sfb.items.reduce((a, i) => a + (i.percent ?? 0), 0);
        expect(listed, where).toBeLessThanOrEqual((sfb.value as number) + 1e-9);
        // The keys' parts add up to the value through the scale the rule gives them.
        const parts = Object.values(sfb.per_key).reduce((a, b) => a + b, 0);
        expect(parts * (sfb.key_scale as number), where).toBeCloseTo(sfb.value as number, 9);
        expect(sfb.key_scale, where).toBeCloseTo(100 / symbols, 12);
      }
    }
  });

  it('is what a closer look at a key lists, in the same percents', () => {
    const compiled = compileLayout(bundledLayout('qwerty')!);
    const sim = simulate(compiled, normalizeText(text, OPTS), OPTS);
    const symbols = sim.tables.stats.symbols;
    const set = { ...layoutsDoc(), rules: [sfbRule] };
    const sfb = evaluate(sim.tables, compiled, set).results[0];
    const top = sfb.items[0];
    const focus = evaluateFocus(sim.tables, compiled, set, {
      key: top.keys[0] as number,
      layer: top.layers?.[0] ?? 0,
    });
    const listed = focus.rules
      .find((r) => r.id === 'sfb')!
      .items.find((i) => i.label === top.label)!;
    expect(listed.percent).toBeCloseTo(top.percent as number, 9);
    // Not only the same as the card: the share of the letters the count is.
    expect(listed.percent).toBeCloseTo(((listed.count as number) / symbols) * 100, 9);
  });

  it('gives an empty text no share at all', () => {
    const compiled = compileLayout(bundledLayout('qwerty')!);
    const sim = simulate(compiled, normalizeText('', OPTS), OPTS);
    const sfb = evaluate(sim.tables, compiled, layoutsDoc()).results.find((r) => r.id === 'sfb')!;
    expect(sfb.value).toBe(0);
  });
});

describe('the Layouts Doc’s SFB on English news, as Genkey would divide it', () => {
  // The first 100,000 symbols of `en-general`, the Library's settings: fold, no space. The research
  // note (docs/research/sfb-bands.md) has the measurement. The numbers are the Doc's definition of
  // SFB, of the layouts as the Library has them: Colemak-DH and Qwerty with the keys their authors
  // place on the 34 keys, and so without the apostrophe, which they leave to a key past them.
  const loader = nodeCorpusLoader(corporaRoot());
  const LIBRARY = { ...DEFAULT_SETTINGS, corpus: 'en-general', caseMode: 'fold' } as const;

  async function onLibrary(layoutId: string, rules: RuleSet, universe: 'no_space' | 'with_space') {
    const settings = { ...LIBRARY, rules, universe };
    const run = analysisRun(settings, await loadText(settings, (id) => loader.load(id)));
    return analyze(bundledLayout(layoutId)!, run.stream, run.options);
  }

  it.each([
    ['magic-romak', 1.348, 1.6935, 'mid_high', 0.796],
    ['colemak-dh', 1.133, 1.4346, 'mid_high', 0.7898],
    ['qwerty', 5.412, 6.8517, 'max', 0.7898],
  ] as const)(
    '%s reads %s, and %s as a share of bigrams',
    async (id, letters, bigrams, band, ratio) => {
      const doc = await onLibrary(id, layoutsDoc(), 'no_space');
      const sfb = doc.results.find((r) => r.id === 'sfb')!;
      expect(sfb.value as number).toBeCloseTo(letters, 3);
      expect(sfb.band.label).toBe(band);
      // The share of bigrams the preset gave before: the Doc's share over the bigrams the text has
      // for the keys the layout types, so more of them for a layout that types the whole text.
      const old = {
        ...layoutsDoc(),
        rules: layoutsDoc().rules.map((r) =>
          r.id === 'sfb' ? { ...r, aggregate: 'percent_of_ngrams' as const } : r,
        ),
      };
      const before = (await onLibrary(id, old, 'no_space')).results.find((r) => r.id === 'sfb')!;
      expect(before.value as number).toBeCloseTo(bigrams, 3);
      expect((sfb.value as number) / (before.value as number)).toBeCloseTo(ratio, 3);
    },
    60_000,
  );
});

describe('what a key that reaches a layer was pressed for', () => {
  const kp = (symbol: string) => ({ kind: 'kp', symbol }) as const;
  /**
   * Letters on the base layer, `q` on Up, and one key that reaches Up as `reach` does. An
   * auto-layer is left out: the simulator never types through one.
   */
  const board = (reach: Binding): Layout => ({
    format: 'layerbench/layout@1',
    name: 'reach',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: { LHP: kp('a'), LHR: kp('b'), LHC: reach, L0: kp(' ') },
      },
      { id: 'up', name: 'Up', bindings: { RHP: kp('q') } },
    ],
  });
  const pairs: RuleSet = {
    ...layoutsDoc(),
    rules: [
      {
        id: 'pairs',
        family: 'bigram',
        source: 'ngram',
        ngram: { n: 2, skip: 0 },
        where: { all: [] },
        aggregate: 'percent_of_ngrams',
      },
    ],
  };

  function typed(reach: Binding, word: string) {
    const compiled = compileLayout(board(reach));
    const sim = simulate(compiled, word, OPTS);
    const items = evaluate(sim.tables, compiled, pairs).results[0].items;
    const at = compiled.keyIndex.get('LHC')!;
    const focus = evaluateFocus(sim.tables, compiled, pairs, { key: at, layer: 0 });
    return { items, focus, up: compiled.layerIndex.get('up')! };
  }

  for (const [name, reach] of [
    ['a one-shot held', { kind: 'hold_tap', tap: kp('x'), hold: { kind: 'sl', layer: 'up' } }],
    ['a toggle held', { kind: 'hold_tap', tap: kp('x'), hold: { kind: 'tog', layer: 'up' } }],
    ['a to-layer held', { kind: 'hold_tap', tap: kp('x'), hold: { kind: 'to', layer: 'up' } }],
    ['a layer key held', { kind: 'mo', layer: 'up' }],
  ] as const) {
    it(`is the key pressed after it, for ${name}`, () => {
      const { items, focus, up } = typed(reach, 'aqa');
      const ending = items.find((i) => i.keys.length === 2 && i.label.startsWith('a') && i.then);
      expect(ending, 'a pair ending on the key').toBeDefined();
      expect(ending!.then!.map((t) => [t.label, t.layer])).toEqual([['q', up]]);
      expect(focus.next.map((n) => [n.label, n.layer])).toEqual([['q', up]]);
    });
  }
  it('is the key pressed after a combo that reaches the layer', () => {
    const layout: Layout = {
      ...board(kp('x')),
      combos: [{ id: 'up', keys: ['LHM', 'LHI'], binding: { kind: 'sl', layer: 'up' } }],
    };
    const compiled = compileLayout(layout);
    const sim = simulate(compiled, 'aqa', OPTS);
    const items = evaluate(sim.tables, compiled, pairs).results[0].items;
    const ending = items.find((i) => i.label.startsWith('a') && i.then);
    expect(ending?.then?.map((t) => t.label)).toEqual(['q']);
  });
});
