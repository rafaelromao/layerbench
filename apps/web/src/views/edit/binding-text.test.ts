import { type Binding, bundledLayout, compileLayout } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { bindingFromFields } from './binding-form.js';
import { type BindingTextContext, bindingText, parseBindingText, suggest } from './binding-text.js';

const compiled = compileLayout(bundledLayout('magic-romak') as never);

// Magic Romak declares its adaptive keys as features rather than behaviours, so the behaviour list
// is given here: what the parser needs is the set of names, whichever way a layout supplies them.
const ctx: BindingTextContext = {
  layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })),
  behaviors: ['magic', 'reversedMagic', 'altRepeat'],
  hostLocale: compiled.hostLocale,
};

/** Parse and build, the way the editor does. Throws the parse error so a failure names itself. */
function build(text: string, context: BindingTextContext = ctx): Binding {
  const r = parseBindingText(text, context);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return bindingFromFields(r.fields);
}

describe('binding text', () => {
  it('reads the ZMK spelling of every kind the editor can build', () => {
    expect(build('&kp a')).toMatchObject({ kind: 'kp', symbol: 'a' });
    expect(build('&trans')).toEqual({ kind: 'trans' });
    expect(build('&none')).toEqual({ kind: 'none' });
    expect(build('&key_repeat')).toEqual({ kind: 'key_repeat' });
    expect(build('&caps_word')).toEqual({ kind: 'caps_word' });
    expect(build('&mo alpha2')).toEqual({ kind: 'mo', layer: 'alpha2' });
    expect(build('&sl ccedil')).toEqual({ kind: 'sl', layer: 'ccedil' });
    expect(build('&to alpha1')).toEqual({ kind: 'to', layer: 'alpha1' });
    expect(build('&tog alpha2')).toEqual({ kind: 'tog', layer: 'alpha2' });
    expect(build('&auto_layer alpha2')).toEqual({ kind: 'auto_layer', layer: 'alpha2' });
    expect(build('&lt alpha2 a')).toMatchObject({ kind: 'lt', layer: 'alpha2' });
    expect(build('&sk LSHIFT')).toEqual({ kind: 'sk', mod: 'LSHIFT' });
    expect(build('&kp LSHIFT')).toEqual({ kind: 'mod', mod: 'LSHIFT' });
    expect(build('&dead ´')).toEqual({ kind: 'dead_key', diacritic: '´' });
    expect(build('&uni →')).toMatchObject({ kind: 'unicode', symbol: '→' });
    expect(build('&macro ão')).toMatchObject({ kind: 'macro', symbols: 'ão' });
  });

  it('accepts the aliases and shorthands a ZMK user would reach for', () => {
    expect(build('&repeat')).toEqual({ kind: 'key_repeat' });
    expect(build('&capsword')).toEqual({ kind: 'caps_word' });
    expect(build('&autolayer alpha2')).toEqual({ kind: 'auto_layer', layer: 'alpha2' });
    expect(build('&uni →')).toMatchObject({ kind: 'unicode' });
    expect(build('&sk LSFT')).toEqual({ kind: 'sk', mod: 'LSHIFT' });
    expect(build('&sk RALT')).toEqual({ kind: 'sk', mod: 'RALT' });
  });

  it('names a layer by id, by name, or by the index ZMK uses', () => {
    const byIndex = compiled.layers[1].id;
    expect(build('&mo alpha2')).toEqual({ kind: 'mo', layer: 'alpha2' });
    expect(build('&mo Alpha 2'.replace(' 2', '2'))).toEqual({ kind: 'mo', layer: 'alpha2' });
    expect(build('&mo 1')).toEqual({ kind: 'mo', layer: byIndex });
  });

  it('resolves a keycode to the symbol it types under the symbols host locale', () => {
    // Every bundled layout is `symbols`, where the simulator never reads `keycode` — a keycode
    // left unresolved here would be a key that silently types nothing.
    expect(compiled.hostLocale).toBe('symbols');
    expect(build('&kp A')).toMatchObject({ kind: 'kp', symbol: 'a' });
    expect(build('&kp N1')).toMatchObject({ kind: 'kp', symbol: '1', shifted: '!' });
    expect(build('&kp COMMA')).toMatchObject({ kind: 'kp', symbol: ',' });
    expect(build('&kp SPACE')).toMatchObject({ kind: 'kp', symbol: ' ' });
    // A symbol no keycode names stays itself.
    expect(build('&kp ç')).toMatchObject({ kind: 'kp', symbol: 'ç' });
    expect(build('&kp ão')).toMatchObject({ kind: 'kp', symbol: 'ão' });
  });

  it('keeps the keycode verbatim when the host locale resolves it', () => {
    const abnt2: BindingTextContext = { ...ctx, hostLocale: 'abnt2' };
    expect(build('&kp N1', abnt2)).toMatchObject({ kind: 'kp', keycode: 'N1' });
    expect(build('&kp LS(COMMA)', abnt2)).toMatchObject({ kind: 'kp', keycode: 'LS(COMMA)' });
  });

  it('treats a bare token as a tap, taking one grapheme literally', () => {
    expect(build('ç')).toMatchObject({ kind: 'kp', symbol: 'ç' });
    expect(build('.')).toMatchObject({ kind: 'kp', symbol: '.' });
    expect(build('1')).toMatchObject({ kind: 'kp', symbol: '1' });
    // Longer than one grapheme reads as a keycode name first, so `SPACE` and `N1` still work.
    expect(build('N1')).toMatchObject({ kind: 'kp', symbol: '1' });
    expect(build('ão')).toMatchObject({ kind: 'kp', symbol: 'ão' });
  });

  it('carries a tag, which adaptive branches match on', () => {
    expect(build('&kp ç tag:cedilla')).toMatchObject({ kind: 'kp', symbol: 'ç', tag: 'cedilla' });
    expect(build('&macro ão then alpha2 tag:a2')).toMatchObject({
      kind: 'macro',
      symbols: 'ão',
      tag: 'a2',
      then: [{ kind: 'sl', layer: 'alpha2' }],
    });
  });

  it('reads a bare name as a reference to one of the layout behaviours', () => {
    expect(build('&magic')).toEqual({ kind: 'ref', ref: 'magic' });
    expect(build('&ref altRepeat')).toEqual({ kind: 'ref', ref: 'altRepeat' });
  });

  it('explains what is wrong instead of building something else', () => {
    expect(parseBindingText('', ctx)).toMatchObject({ ok: false });
    expect(parseBindingText('&nonsuch', ctx)).toMatchObject({ ok: false });
    expect(parseBindingText('&mo nowhere', ctx)).toMatchObject({ ok: false });
    expect(parseBindingText('&mo', ctx)).toMatchObject({ ok: false });
    expect(parseBindingText('&lt alpha2', ctx)).toMatchObject({ ok: false });
    expect(parseBindingText('&sk NOPE', ctx)).toMatchObject({ ok: false });
    expect(parseBindingText('&kp', ctx)).toMatchObject({ ok: false });
    const e = parseBindingText('&mo nowhere', ctx);
    expect(e.ok === false && e.error).toContain('alpha2');
  });

  it('writes a binding back as the text that parses to it', () => {
    const roundTrips = [
      '&kp a',
      '&trans',
      '&none',
      '&key_repeat',
      '&caps_word',
      '&mo alpha2',
      '&sl ccedil',
      '&to alpha1',
      '&tog alpha2',
      '&auto_layer alpha2',
      '&lt alpha2 a',
      '&sk LSHIFT',
      '&kp LSHIFT',
      '&dead ´',
      '&uni →',
      '&macro ão',
      '&macro ão then alpha2',
      '&kp ç tag:cedilla',
      '&magic',
    ];
    for (const text of roundTrips) {
      expect(bindingText(compiled, build(text))).toEqual({ text, exact: true });
    }
  });

  it('writes a space as its keycode name, since it has no visible spelling', () => {
    expect(bindingText(compiled, { kind: 'kp', symbol: ' ' }).text).toBe('&kp SPACE');
    expect(build('&kp SPACE')).toMatchObject({ symbol: ' ' });
  });

  it('marks a binding it would have to truncate, rather than truncating it', () => {
    const cases: Binding[] = [
      { kind: 'adaptive', default: { kind: 'kp', symbol: 'h' } },
      { kind: 'hold_tap', tap: { kind: 'kp', symbol: 'a' }, hold: { kind: 'mo', layer: 'alpha2' } },
      {
        kind: 'mod_morph',
        mods: ['LSHIFT'],
        default: { kind: 'kp', symbol: 'a' },
        morphed: { kind: 'kp', symbol: 'b' },
      },
      { kind: 'tap_dance', bindings: [{ kind: 'kp', symbol: 'a' }] },
      { kind: 'caps_word', continueList: ['-'] },
      { kind: 'sl', layer: 'alpha2', quickRelease: true },
      { kind: 'macro', steps: [{ kind: 'kp', symbol: 'a' }] },
    ];
    for (const b of cases) {
      const written = bindingText(compiled, b);
      expect(written.exact).toBe(false);
      expect(written.why).toBeTruthy();
      // There is still something to show on screen: the legend the key draws.
      expect(written.text).not.toBe('');
    }
  });

  it('locks rather than flattens the bindings a bundled layout actually holds', () => {
    // The space key on Magic Romak is a hold-tap, and `fieldsFromBinding` flattens one to a bare
    // `{kind:'hold_tap'}` — with type-to-edit that is one keystroke from destroying it.
    const pos = compiled.keyIndex.get('L0') as number;
    const space = compiled.layers[0].bindings[pos];
    expect(space.kind).toBe('hold_tap');
    expect(bindingText(compiled, space).exact).toBe(false);
  });

  it('completes behaviour names, then that behaviour argument', () => {
    expect(suggest('&m', ctx).map((s) => s.insert)).toContain('&mo');
    expect(suggest('&m', ctx).map((s) => s.insert)).toContain('&macro');
    expect(suggest('&mag', ctx).map((s) => s.insert)).toContain('&magic');
    expect(suggest('&mo ', ctx).map((s) => s.label)).toContain('alpha2');
    expect(suggest('&mo alph', ctx).map((s) => s.insert)).toContain('&mo alpha2');
    expect(suggest('&sk L', ctx).map((s) => s.label)).toContain('LSHIFT');
    expect(suggest('&kp a b c', ctx)).toEqual([]);
  });
});
