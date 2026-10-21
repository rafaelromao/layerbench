import {
  applyEdit,
  type Binding,
  BUNDLED_LAYOUTS,
  bindingToJson,
  bundledLayout,
  type CompiledLayout,
  compileLayout,
  type Layout,
  stableStringify,
} from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import type { BindingTextContext } from '../binding-text.js';
import { type FieldsOf, freshRow, keyFields, macroRows } from './binding-changes.js';
import { HOLD_KINDS, type KindOfKey, kindOf, MORE_KINDS, PRIMARY_KINDS } from './kinds.js';

/** The context the key inspector builds for a layout. */
function contextOf(compiled: CompiledLayout): BindingTextContext {
  return {
    layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })),
    behaviors: Object.keys(compiled.expanded.behaviors ?? {}),
    hostLocale: compiled.hostLocale,
  };
}

const romak = compileLayout(bundledLayout('magic-romak') as never);
// Magic Romak's adaptive keys sit on its keys rather than in named behaviours, so none are offered.
const ctx: BindingTextContext = { ...contextOf(romak), behaviors: [] };
const to = (b: Binding | undefined, kind: KindOfKey) => keyFields(b, ctx).set.kind(kind);

/** The fields of a binding that is that kind of key. */
function fieldsOf<K extends KindOfKey>(kind: K, b: Binding, context = ctx): FieldsOf<K> {
  const fields = keyFields(b, context);
  expect(fields.kind).toBe(kind);
  return fields as FieldsOf<K>;
}

const adaptiveKey: Binding = {
  kind: 'adaptive',
  default: { kind: 'kp', symbol: 'h' },
  triggers: [{ afterAny: ['a'], binding: { kind: 'kp', symbol: 'v' } }],
};

describe('changing what a key is', () => {
  it("keeps the layer or modifier of a morph's plain part, past either kind of morph", () => {
    const morphs = (plain: Binding): Binding[] => [
      { kind: 'mod_morph', mods: ['LSHIFT', 'RSHIFT'], default: plain, morphed: { kind: 'none' } },
      { kind: 'layer_morph', layers: ['num'], inactive: plain, active: { kind: 'none' } },
    ];
    for (const key of morphs({ kind: 'sl', layer: 'sym' })) {
      expect(to(key, 'layer')).toEqual({ kind: 'mo', layer: 'sym' });
    }
    for (const key of morphs({ kind: 'sk', mod: 'LALT' })) {
      expect(to(key, 'modifier')).toEqual({ kind: 'mod', mod: 'LALT' });
    }
  });

  it('keeps an adaptive key as the tap when the key becomes a tap-hold', () => {
    const held = to(adaptiveKey, 'taphold');
    expect(held).toEqual({ kind: 'lt', layer: 'alpha2', tap: adaptiveKey });
    expect(kindOf(held)).toBe('taphold');
    expect(to({ kind: 'key_repeat' }, 'taphold')).toEqual({
      kind: 'lt',
      layer: 'alpha2',
      tap: { kind: 'key_repeat' },
    });
  });

  it("takes a tap-hold's adaptive tap out, branches and all, when the key becomes an adaptive key", () => {
    const held: Binding = {
      kind: 'hold_tap',
      tap: adaptiveKey,
      hold: { kind: 'mod', mod: 'LGUI' },
    };
    expect(to(held, 'adaptive')).toEqual(adaptiveKey);
    expect(to(held, 'altrepeat')).toEqual({ ...adaptiveKey, default: { kind: 'key_repeat' } });
    expect(to(held, 'symbol')).toEqual({ kind: 'kp', symbol: 'h' });
  });

  it('turns an alt repeat with tagged branches into an adaptive key and back, keeping them', () => {
    const alt: Binding = {
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [{ afterAny: ['e'], afterTags: ['alpha2'], binding: { kind: 'kp', symbol: 'x' } }],
    };
    expect(kindOf(alt)).toBe('altrepeat');
    const back = to(to(alt, 'adaptive'), 'altrepeat');
    expect(back).toEqual(alt);
  });

  it('makes a repeat key an alt repeat that repeats until it is given branches', () => {
    expect(to({ kind: 'key_repeat' }, 'altrepeat')).toEqual({
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [],
    });
  });

  it('gives the key back as it was when it is already that kind', () => {
    expect(to(adaptiveKey, 'adaptive')).toBe(adaptiveKey);
  });

  it('turns any key of a bundled layout into any kind of key, and the layout still compiles', () => {
    const offered = [...PRIMARY_KINDS, ...MORE_KINDS].map((k) => k.kind);
    for (const layout of BUNDLED_LAYOUTS) {
      const compiled = compileLayout(layout);
      const context = contextOf(compiled);
      const kinds = offered.filter((k) => k !== 'behaviour' || context.behaviors.length > 0);
      const made = new Map<string, { layer: string; key: string; binding: Binding }>();
      for (const { layer, key, binding } of keysOf(layout)) {
        for (const kind of kinds) {
          const next = keyFields(binding, context).set.kind(kind);
          expect(kindOf(next), `${layout.id} ${layer}/${key} as ${kind}`).toBe(kind);
          made.set(stableStringify(bindingToJson(next)), { layer, key, binding: next });
        }
      }
      for (const { layer, key, binding } of made.values()) {
        const outcome = applyEdit(layout, { kind: 'bind', layer, keys: [key], binding });
        expect(outcome.status, `${layout.id} ${layer}/${key}`).not.toBe('refused');
      }
    }
  });
});

describe('what each kind of key shows, and what its controls change', () => {
  it('reads a symbol as the text line does: one character as itself, a longer word as a keycode', () => {
    const accented = fieldsOf('symbol', { kind: 'kp', symbol: 'a', shifted: 'Á' });
    // Typed literally, it keeps the shifted symbol it had; a keycode brings its own.
    expect(accented.set.symbol('ç')).toEqual({ kind: 'kp', symbol: 'ç', shifted: 'Á' });
    expect(accented.set.symbol('ão')).toEqual({ kind: 'kp', symbol: 'ão', shifted: 'Á' });
    expect(accented.set.symbol('N1')).toEqual({ kind: 'kp', symbol: '1', shifted: '!' });
    expect(accented.view.shiftedByDefault).toBe('A');
  });

  it('changes nothing when a field is committed as it is shown', () => {
    const space: Binding = { kind: 'kp', symbol: ' ' };
    const shown = fieldsOf('symbol', space);
    expect(shown.view.symbol).toBe('SPACE');
    expect(shown.set.symbol('SPACE')).toBe(space);
    // Even where the host would keep `SPACE` as a keycode rather than read it as a space.
    expect(fieldsOf('symbol', space, { ...ctx, hostLocale: 'us' }).set.symbol('SPACE')).toBe(space);
    expect(shown.set.tag('')).toBe(space);
  });

  it('drops an optional field emptied, rather than store it empty', () => {
    const tagged = fieldsOf('symbol', { kind: 'kp', symbol: 'u', shifted: 'Ú', tag: 'qu' });
    expect(tagged.set.tag('')).toEqual({ kind: 'kp', symbol: 'u', shifted: 'Ú' });
    expect(tagged.set.shifted('')).toEqual({ kind: 'kp', symbol: 'u', tag: 'qu' });
    const arrow = fieldsOf('unicode', { kind: 'unicode', symbol: '→', shiftedSymbol: '⇒' });
    expect(arrow.set.shifted('')).toEqual({ kind: 'unicode', symbol: '→' });
  });

  it("keeps a layer key's options for another layer, and starts afresh another way of coming on", () => {
    const oneShot: Binding = { kind: 'sl', layer: 'alpha2', quickRelease: true };
    const layer = fieldsOf('layer', oneShot);
    expect(layer.view).toEqual({ layer: 'alpha2', mode: 'sl' });
    expect(layer.set.layer('ccedil')).toEqual({ kind: 'sl', layer: 'ccedil', quickRelease: true });
    expect(layer.set.mode('mo')).toEqual({ kind: 'mo', layer: 'alpha2' });
    expect(layer.set.mode('sl')).toBe(oneShot);
    const sticky: Binding = { kind: 'sk', mod: 'LSHIFT', quickRelease: true };
    const modifier = fieldsOf('modifier', sticky);
    expect(modifier.set.mod('LCTRL')).toEqual({ kind: 'sk', mod: 'LCTRL', quickRelease: true });
    expect(modifier.set.acts('mod')).toEqual({ kind: 'mod', mod: 'LSHIFT' });
    expect(modifier.set.acts('sk')).toBe(sticky);
  });

  it('makes an imported key: drawn by its label, kept by its source, typing nothing', () => {
    expect(MORE_KINDS.map((k) => k.kind)).toContain('imported');
    const made = to({ kind: 'kp', symbol: 'a' }, 'imported');
    expect(made).toEqual({ kind: 'raw', label: 'a' });
    const imported = fieldsOf('imported', made);
    const labelled = imported.set.label('FUN');
    expect(labelled).toEqual({ kind: 'raw', label: 'FUN' });
    expect(fieldsOf('imported', labelled).set.source('&mo FUN')).toEqual({
      kind: 'raw',
      label: 'FUN',
      source: '&mo FUN',
    });
    // An empty source is no source; an empty label keeps the one it had.
    const sourced: Binding = { kind: 'raw', label: 'FUN', source: '&mo FUN' };
    expect(fieldsOf('imported', sourced).set.source(' ')).toEqual({ kind: 'raw', label: 'FUN' });
    expect(fieldsOf('imported', sourced).set.label(' ')).toBe(sourced);
  });

  it('holds other modifiers with a held one, as ZMK holds Shift with Gui for LS(LGUI)', () => {
    const gui = fieldsOf('modifier', { kind: 'mod', mod: 'LGUI' });
    expect(gui.view.also).toEqual([]);
    const shifted = gui.set.also('LSHIFT');
    expect(shifted).toEqual({ kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] });
    const both = fieldsOf('modifier', shifted);
    expect(both.view.also).toEqual(['LSHIFT']);
    // Pressed again, it is held no more; the modifier itself is never held with itself.
    expect(both.set.also('LSHIFT')).toEqual({ kind: 'mod', mod: 'LGUI' });
    expect(both.set.also('LGUI')).toBe(shifted);
    // A one-shot modifier is one modifier.
    expect(both.set.acts('sk')).toEqual({ kind: 'sk', mod: 'LGUI' });
  });

  it("lists caps word's symbols that do not end the word, or none at all", () => {
    const caps = fieldsOf('capsword', { kind: 'caps_word' });
    expect(caps.set.continues('- _')).toEqual({ kind: 'caps_word', continueList: ['-', '_'] });
    const listed = fieldsOf('capsword', { kind: 'caps_word', continueList: ['-'] });
    expect(listed.view.continues).toBe('-');
    expect(listed.set.continues(' ')).toEqual({ kind: 'caps_word' });
  });

  it('gives a dead key the accent it was shifted to, and no shifted accent then', () => {
    const acute = fieldsOf('deadkey', { kind: 'dead_key', diacritic: '´', shifted: '¨' });
    expect(acute.set.accent('¨')).toEqual({ kind: 'dead_key', diacritic: '¨' });
    expect(acute.set.accent('`')).toEqual({ kind: 'dead_key', diacritic: '`', shifted: '¨' });
    expect(acute.set.shifted('')).toEqual({ kind: 'dead_key', diacritic: '´' });
  });

  it('runs another of the layout behaviours, and shows what an import kept', () => {
    const named = fieldsOf('behaviour', { kind: 'adaptive', ref: 'adaptiveHV' });
    expect(named.view.runs).toBe('adaptiveHV');
    expect(named.set.runs('altRepeat')).toEqual({ kind: 'ref', ref: 'altRepeat' });
    const kept = fieldsOf('imported', { kind: 'raw', label: 'BT1', source: '&bt BT_SEL 1' });
    expect(kept.view).toEqual({ label: 'BT1', source: '&bt BT_SEL 1' });
  });
});

describe('the parts of a bigger key, and lists of them', () => {
  const a: Binding = { kind: 'kp', symbol: 'a' };
  const v: Binding = { kind: 'kp', symbol: 'v' };

  it("holds Shift with Gui, or an imported key, on a tap-hold's hold, as Magic Romak does", () => {
    const held = fieldsOf('taphold', {
      kind: 'hold_tap',
      tap: a,
      hold: { kind: 'mod', mod: 'LGUI' },
    });
    const gui = fieldsOf('modifier', held.view.hold);
    expect(held.set.hold(gui.set.also('LSHIFT'))).toEqual({
      kind: 'hold_tap',
      tap: a,
      hold: { kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] },
    });
    expect(HOLD_KINDS).toContain('imported');
    const imported = fieldsOf('imported', to(held.view.hold, 'imported'));
    expect(held.set.hold(imported.set.label('SHORTS'))).toEqual({
      kind: 'hold_tap',
      tap: a,
      hold: { kind: 'raw', label: 'SHORTS' },
    });
  });

  it('keeps a layer tap while its hold is a plain layer key, and makes it a hold-tap for timing', () => {
    const layerTap: Binding = { kind: 'lt', layer: 'alpha2', tap: a };
    const held = fieldsOf('taphold', layerTap);
    expect(held.view.hold).toEqual({ kind: 'mo', layer: 'alpha2' });
    expect(held.set.hold({ kind: 'mo', layer: 'ccedil' })).toEqual({
      kind: 'lt',
      layer: 'ccedil',
      tap: a,
    });
    expect(held.set.hold({ kind: 'mod', mod: 'LCTRL' })).toEqual({
      kind: 'hold_tap',
      tap: a,
      hold: { kind: 'mod', mod: 'LCTRL' },
    });
    expect(held.set.flavor('balanced')).toEqual({
      kind: 'hold_tap',
      tap: a,
      hold: { kind: 'mo', layer: 'alpha2' },
      flavor: 'balanced',
    });
    const timed = held.set.term('180');
    expect(timed).toEqual({
      kind: 'hold_tap',
      tap: a,
      hold: { kind: 'mo', layer: 'alpha2' },
      tappingTermMs: 180,
    });
    // Without its timing it stays a hold-tap: it is never quietly made a layer tap again.
    expect(fieldsOf('taphold', timed).set.term('')).toEqual({
      kind: 'hold_tap',
      tap: a,
      hold: { kind: 'mo', layer: 'alpha2' },
    });
    expect(held.set.term('soon')).toBe(layerTap);
  });

  it('switches a macro inside a part to steps even with nothing in it yet', () => {
    // A custom layout writes a macro with no text and one with no steps alike; the key holding it
    // still changes, as the part did.
    const bare: Binding = { kind: 'macro' };
    const layerTap: Binding = { kind: 'lt', layer: 'alpha2', tap: bare };
    const outer = fieldsOf('taphold', layerTap);
    const held = outer.set.tap(fieldsOf('macro', outer.view.tap).set.form('steps'));
    expect(held).toEqual({ kind: 'lt', layer: 'alpha2', tap: { kind: 'macro', steps: [] } });
    const branch: Binding = { kind: 'adaptive', triggers: [{ afterAny: ['a'], binding: bare }] };
    const then = fieldsOf('adaptive', branch).set.branches.at(0);
    const stepped = then.then(fieldsOf('macro', bare).set.form('steps'));
    expect(stepped).toEqual({
      kind: 'adaptive',
      triggers: [{ afterAny: ['a'], binding: { kind: 'macro', steps: [] } }],
    });
  });

  it('carries a change made inside a part up through the key it belongs to', () => {
    const layerTap: Binding = { kind: 'lt', layer: 'alpha2', tap: adaptiveKey };
    const outer = fieldsOf('taphold', layerTap);
    const inner = fieldsOf('adaptive', outer.view.tap);
    expect(outer.set.tap(inner.set.branches.at(0).tags('qu'))).toEqual({
      kind: 'lt',
      layer: 'alpha2',
      tap: { ...adaptiveKey, triggers: [{ afterAny: ['a'], afterTags: ['qu'], binding: v }] },
    });
    // Nothing changed inside is nothing changed outside.
    expect(outer.set.tap(inner.set.branches.at(0).tags(''))).toBe(layerTap);
  });

  it("reads a branch's symbols and tags, where no symbols with a tag means any symbol", () => {
    const key = fieldsOf('adaptive', adaptiveKey);
    expect(key.view.branches).toEqual([{ after: 'a', tags: '', then: v }]);
    const tagged = key.set.branches.at(0).tags('qu');
    expect(tagged).toEqual({
      ...adaptiveKey,
      triggers: [{ afterAny: ['a'], afterTags: ['qu'], binding: v }],
    });
    const anySymbol = fieldsOf('adaptive', tagged).set.branches.at(0).after('');
    expect(anySymbol).toEqual({ ...adaptiveKey, triggers: [{ afterTags: ['qu'], binding: v }] });
    // Without a tag, a branch with no symbols is kept as it is written, and never fires.
    expect(fieldsOf('adaptive', anySymbol).set.branches.at(0).tags('')).toEqual({
      ...adaptiveKey,
      triggers: [{ afterAny: [], binding: v }],
    });
  });

  it('adds, moves and removes branches, and leaves the key as it was for a move past either end', () => {
    const second = { afterAny: ['e'], binding: a };
    const twoBranches: Binding = {
      kind: 'adaptive',
      default: { kind: 'kp', symbol: 'h' },
      triggers: [{ afterAny: ['a'], binding: v }, second],
    };
    const branches = fieldsOf('adaptive', twoBranches).set.branches;
    expect(branches.add()).toMatchObject({
      triggers: [
        { afterAny: ['a'] },
        second,
        { afterAny: [], binding: { kind: 'kp', symbol: '' } },
      ],
    });
    expect(branches.move(1, 0)).toMatchObject({ triggers: [second, { afterAny: ['a'] }] });
    expect(branches.move(0, -1)).toBe(twoBranches);
    expect(branches.move(1, 2)).toBe(twoBranches);
    expect(branches.remove(0)).toEqual({ ...twoBranches, triggers: [second] });
  });

  it('gives the key back for a move between two branches that are alike', () => {
    const blank: Binding = { kind: 'kp', symbol: '' };
    const alike: Binding = {
      kind: 'adaptive',
      triggers: [
        { afterAny: [], binding: blank },
        { afterAny: [], binding: blank },
      ],
    };
    expect(fieldsOf('adaptive', alike).set.branches.move(1, 0)).toBe(alike);
  });

  it('holds an adaptive key to keys typed with no modifier, or not', () => {
    const alt: Binding = { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: [] };
    const strict = fieldsOf('altrepeat', alt).set.strict(true);
    expect(strict).toEqual({ ...alt, strictModifiers: true });
    expect(fieldsOf('altrepeat', strict).view.strict).toBe(true);
    expect(fieldsOf('altrepeat', strict).set.strict(false)).toEqual(alt);
  });

  it('keeps a tap dance to at least one tap', () => {
    const dance: Binding = { kind: 'tap_dance', bindings: [a] };
    const taps = fieldsOf('tapdance', dance).set.taps;
    expect(taps.remove(0)).toBe(dance);
    const two = taps.add();
    expect(two).toEqual({ kind: 'tap_dance', bindings: [a, { kind: 'kp', symbol: '' }] });
    expect(fieldsOf('tapdance', two).set.taps.at(1)(v)).toEqual({
      kind: 'tap_dance',
      bindings: [a, v],
    });
    expect(fieldsOf('tapdance', two).set.taps.remove(0)).toEqual({
      kind: 'tap_dance',
      bindings: [{ kind: 'kp', symbol: '' }],
    });
  });

  it('changes a morph with a modifier or on a layer, keeping what it types and its last layer', () => {
    const comma: Binding = { kind: 'kp', symbol: ',' };
    const semicolon: Binding = { kind: 'kp', symbol: ';' };
    const morph: Binding = {
      kind: 'mod_morph',
      mods: ['LSHIFT', 'RSHIFT'],
      default: comma,
      morphed: semicolon,
    };
    const shifted = fieldsOf('morph', morph);
    expect(shifted.view).toMatchObject({ by: 'mod_morph', family: 'shift', layers: [] });
    expect(shifted.set.family('ctrl')).toEqual({ ...morph, mods: ['LCTRL', 'RCTRL'] });
    const onLayer = shifted.set.by('layer_morph');
    expect(onLayer).toEqual({
      kind: 'layer_morph',
      layers: ['alpha2'],
      inactive: comma,
      active: semicolon,
    });
    const layered = fieldsOf('morph', onLayer);
    expect(layered.view).toMatchObject({ by: 'layer_morph', family: null, layers: ['alpha2'] });
    expect(layered.set.toggleLayer('alpha2')).toBe(onLayer);
    expect(layered.set.toggleLayer('ccedil')).toEqual({ ...onLayer, layers: ['alpha2', 'ccedil'] });
    expect(layered.set.becomes(a)).toEqual({ ...onLayer, active: a });
    expect(layered.set.family('alt')).toBe(onLayer);
  });
});

describe('a macro, written as text or as steps', () => {
  const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
  const toAlpha2: Binding = { kind: 'sl', layer: 'alpha2' };

  it('writes its steps as text and back, without changing what it does', () => {
    const stepped: Binding = {
      kind: 'macro',
      tag: 'qu',
      steps: [kp('q'), kp('u'), toAlpha2, { kind: 'kp', keycode: 'N1' }],
    };
    const text = fieldsOf('macro', stepped).set.form('text');
    expect(text).toEqual({
      kind: 'macro',
      symbols: 'qu',
      then: [toAlpha2, { kind: 'kp', keycode: 'N1' }],
      tag: 'qu',
    });
    expect(fieldsOf('macro', text).view).toMatchObject({
      form: 'text',
      then: '',
      thenIsMore: true,
    });
    expect(fieldsOf('macro', text).set.form('steps')).toEqual(stepped);
  });

  it('keeps the layer a text macro arms when it is written as steps and back', () => {
    const cedilla: Binding = {
      kind: 'macro',
      symbols: 'ç',
      then: [{ kind: 'sl', layer: 'ccedil' }],
    };
    const shown = fieldsOf('macro', cedilla);
    expect(shown.view).toMatchObject({
      form: 'text',
      symbols: 'ç',
      then: 'ccedil',
      thenIsMore: false,
    });
    const steps = shown.set.form('steps');
    expect(steps).toEqual({ kind: 'macro', steps: [kp('ç'), { kind: 'sl', layer: 'ccedil' }] });
    expect(fieldsOf('macro', steps).set.form('text')).toEqual(cedilla);
    expect(shown.set.then('')).toEqual({ kind: 'macro', symbols: 'ç' });
  });

  it('does what it did, written either way, for every macro of the bundled layouts', () => {
    const typed = (m: Binding) => {
      if (m.kind !== 'macro') throw new Error(m.kind);
      const letters = m.steps ?? Array.from((m.symbols ?? '').normalize('NFC')).map(kp);
      return [...letters, ...(m.then ?? [])].map((s) => stableStringify(bindingToJson(s)));
    };
    let macros = 0;
    for (const layout of BUNDLED_LAYOUTS) {
      for (const macro of macrosIn(layout)) {
        macros += 1;
        const fields = fieldsOf('macro', macro);
        expect(typed(fields.set.form('text'))).toEqual(typed(macro));
        expect(typed(fields.set.form('steps'))).toEqual(typed(macro));
        // Its rows, as it is written or once written as steps, make the same macro again.
        const stepped = fields.set.form('steps');
        for (const m of [macro, stepped]) {
          if (m.kind === 'macro' && m.steps) {
            expect(fieldsOf('macro', m).set.rows(macroRows(m))).toBe(m);
          }
        }
      }
    }
    expect(macros).toBeGreaterThan(0);
  });

  it('keeps a step its rows cannot edit, to be moved or removed', () => {
    const quick: Binding = { kind: 'sl', layer: 'alpha2', quickRelease: true };
    const toggle: Binding = { kind: 'tog', layer: 'alpha2' };
    const odd: Extract<Binding, { kind: 'macro' }> = {
      kind: 'macro',
      steps: [kp('a'), toggle, kp('b'), quick],
    };
    const rows = macroRows(odd);
    expect(rows.map((r) => r.kind)).toEqual(['text', 'fixed', 'text', 'fixed']);
    const set = fieldsOf('macro', odd).set;
    expect(set.rows(rows)).toBe(odd);
    expect(set.rows([rows[1], rows[0], rows[2], rows[3]])).toEqual({
      kind: 'macro',
      steps: [toggle, kp('a'), kp('b'), quick],
    });
    expect(set.rows([rows[0], rows[2]])).toEqual({ kind: 'macro', steps: [kp('a'), kp('b')] });
  });

  it('switches a macro with no text to steps, and one with no steps to text', () => {
    // A custom layout writes both as a bare macro; the switch still goes the way it is asked.
    const bare: Binding = { kind: 'macro' };
    const steps = fieldsOf('macro', bare).set.form('steps');
    expect(steps).toEqual({ kind: 'macro', steps: [] });
    expect(fieldsOf('macro', steps).view.form).toBe('steps');
    expect(fieldsOf('macro', steps).set.form('text')).toEqual({ kind: 'macro', symbols: '' });
    expect(fieldsOf('macro', steps).set.form('steps')).toBe(steps);
  });

  it('keeps apart characters that would combine, as the presses they are', () => {
    // An `e` and a combining accent are two presses; as one text they would read back as `é`.
    const accent = '\u0301';
    const apart: Extract<Binding, { kind: 'macro' }> = {
      kind: 'macro',
      steps: [kp('e'), kp(accent)],
    };
    const rows = macroRows(apart);
    expect(rows).toMatchObject([
      { kind: 'text', text: 'e' },
      { kind: 'text', text: accent },
    ]);
    expect(fieldsOf('macro', apart).set.rows(rows)).toBe(apart);
    const text = fieldsOf('macro', apart).set.form('text');
    expect(text).toEqual({ kind: 'macro', symbols: 'e', then: [kp(accent)] });
    expect(fieldsOf('macro', text).set.form('steps')).toEqual(apart);
  });

  it('gives a macro back for rows that make the same presses, however it was written', () => {
    const both: Extract<Binding, { kind: 'macro' }> = {
      kind: 'macro',
      steps: [toAlpha2],
      then: [toAlpha2],
    };
    const rows = macroRows(both);
    const set = fieldsOf('macro', both).set;
    expect(set.rows(rows)).toBe(both);
    expect(set.rows([rows[1], rows[0]])).toBe(both);
  });

  it('shows what a macro runs after its steps as rows of its own', () => {
    const both: Extract<Binding, { kind: 'macro' }> = {
      kind: 'macro',
      steps: [kp('a')],
      then: [toAlpha2],
    };
    const rows = macroRows(both);
    expect(rows.map((r) => r.kind)).toEqual(['text', 'sl']);
    expect(fieldsOf('macro', both).set.rows([rows[1], rows[0]])).toEqual({
      kind: 'macro',
      steps: [toAlpha2, kp('a')],
    });
  });

  it('starts a new row doing something, and becomes text again with no rows left', () => {
    const withBehaviours = { ...ctx, behaviors: ['altRepeat'] };
    expect(freshRow('sl', ctx)).toMatchObject({ kind: 'sl', layer: 'alpha2' });
    expect(freshRow('ref', withBehaviours)).toMatchObject({ kind: 'ref', ref: 'altRepeat' });
    expect(freshRow('text', ctx, 'kept')).toEqual({ id: 'kept', kind: 'text', text: '' });
    const stepped: Binding = { kind: 'macro', steps: [kp('a')], tag: 'x' };
    expect(fieldsOf('macro', stepped).set.rows([])).toEqual({
      kind: 'macro',
      symbols: '',
      tag: 'x',
    });
  });
});

/** Every macro a layout holds, on its keys, its combos and its behaviours, however deep. */
function macrosIn(layout: Layout): Binding[] {
  const found: Binding[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const b = value as Binding;
      if (b.kind === 'macro' && !b.ref) found.push(b);
      Object.values(value).forEach(walk);
    }
  };
  walk(layout);
  return found;
}

/**
 * Every binding a layout holds, on its keys, its combos and its behaviours, once each, with a key to
 * put it on: its own, or the first key of the base layer for a combo's or a behaviour's.
 */
function keysOf(layout: Layout): { layer: string; key: string; binding: Binding }[] {
  const base = layout.layers[0];
  const first = Object.keys(base.bindings).find((k) => k !== '*') ?? '';
  const all = [
    ...layout.layers.flatMap((layer) =>
      Object.entries(layer.bindings)
        .filter(([key]) => key !== '*')
        .map(([key, binding]) => ({ layer: layer.id, key, binding })),
    ),
    ...(layout.combos ?? []).map((c) => ({ layer: base.id, key: first, binding: c.binding })),
    ...Object.values(layout.behaviors ?? {}).map((binding) => ({
      layer: base.id,
      key: first,
      binding,
    })),
  ];
  const seen = new Set<string>();
  return all.filter(({ binding }) => {
    const written = stableStringify(bindingToJson(binding));
    if (seen.has(written)) return false;
    seen.add(written);
    return true;
  });
}
