import {
  type AdaptiveTrigger,
  type Binding,
  type CompiledLayout,
  legend,
  legendText,
  type Mod,
} from '@layerbench/core';
import { useRef, useState } from 'react';
import { useDismiss } from '../../../components/use-dismiss.js';
import { bindingFromFields } from '../binding-form.js';
import { type BindingTextContext, parseBindingText } from '../binding-text.js';
import { LayerChips, ModChips, Note, Row, Segment, TextField, words } from './controls.js';
import {
  ARM_KINDS,
  convert,
  type InspectorKind,
  type KindInfo,
  kindInfo,
  kindOf,
  MORE_KINDS,
  PRIMARY_KINDS,
  TAP_KINDS,
} from './kinds.js';
import { MacroStepsEditor } from './macro-steps.js';

/** What every editor needs to know about the layout around the binding it edits. */
export interface EditorScope {
  compiled: CompiledLayout;
  /** Names a key can refer to: the document's behaviours. */
  behaviours: string[];
  /** The document's own behaviours, which are edited where a key refers to them. */
  ownBehaviours: Record<string, Binding>;
  setBehaviour: (name: string, b: Binding) => void;
  text: BindingTextContext;
}

type Of<K extends Binding['kind']> = Extract<Binding, { kind: K }>;

interface BodyProps<B extends Binding = Binding> {
  scope: EditorScope;
  binding: B;
  onChange: (b: Binding) => void;
  /** Prefix for the controls' accessible names, so the tap of a tap-hold is not its hold. */
  name: string;
  depth: number;
}

/** "Symbol" on its own, "Tap symbol" inside the tap arm of a bigger key. */
function named(prefix: string, what: string): string {
  return prefix ? `${prefix} ${what.charAt(0).toLowerCase()}${what.slice(1)}` : what;
}

/** Drop a field entirely rather than store it empty, so the document stays as it was written. */
function withOptional<B extends object>(b: B, key: string, value: string): B {
  const out = { ...b } as Record<string, unknown>;
  if (value === '') delete out[key];
  else out[key] = value;
  return out as B;
}

/** Nested arms stop being drawn as editors past this depth; they are still shown and kept. */
const MAX_DEPTH = 4;

// ---------------------------------------------------------------------------- the editor

/** The whole of what a key does: the kind of key it is, and the controls for that kind. */
export function BindingEditor({
  scope,
  value,
  onChange,
}: {
  scope: EditorScope;
  value: Binding | undefined;
  onChange: (b: Binding) => void;
}) {
  const kind = kindOf(value);
  return (
    <div className="space-y-3">
      <KindTiles
        kind={kind}
        canRefer={scope.behaviours.length > 0}
        onPick={(k) => onChange(convert(scope.compiled, value, k, scope.behaviours))}
      />
      <KindBody scope={scope} value={value} onChange={onChange} name="" depth={0} />
    </div>
  );
}

function KindTiles({
  kind,
  canRefer,
  onPick,
}: {
  kind: InspectorKind;
  canRefer: boolean;
  onPick: (k: InspectorKind) => void;
}) {
  // The rest of the kinds open like a menu, and close like one: on a pick, or a tap elsewhere.
  const [more, setMore] = useState(false);
  const tiles = useRef<HTMLDivElement>(null);
  useDismiss(tiles, () => setMore(false), { active: more, closeOnEscape: false });
  const tile = (k: KindInfo) => (
    <button
      key={k.kind}
      type="button"
      aria-pressed={kind === k.kind}
      title={k.hint}
      disabled={k.kind === 'behaviour' && !canRefer}
      className={`lb-kind-tile ${kind === k.kind ? 'lb-kind-tile-on' : ''}`}
      onClick={() => {
        setMore(false);
        if (kind !== k.kind) onPick(k.kind);
      }}
    >
      <span aria-hidden="true" className="lb-kind-glyph">
        {k.glyph}
      </span>
      <span className="lb-kind-label">{k.label}</span>
    </button>
  );
  // With the list closed, a kind picked from it stands in the More tile, so it is still shown.
  const chosen = MORE_KINDS.find((k) => k.kind === kind);
  const shown = !more && chosen;
  return (
    <div className="space-y-1" ref={tiles}>
      <fieldset className="lb-kind-tiles" aria-label="Kind of key">
        {PRIMARY_KINDS.map(tile)}
        <button
          type="button"
          className={`lb-kind-tile ${shown ? 'lb-kind-tile-on' : ''}`}
          aria-expanded={more}
          aria-label={shown ? `More kinds: ${chosen.label}` : undefined}
          title={shown ? chosen.hint : undefined}
          onClick={() => setMore((m) => !m)}
        >
          <span aria-hidden="true" className="lb-kind-glyph">
            {shown ? chosen.glyph : more ? '−' : '+'}
          </span>
          <span className="lb-kind-label">{shown ? chosen.label : 'More'}</span>
        </button>
      </fieldset>
      {more && (
        <fieldset className="lb-kind-tiles" aria-label="More kinds">
          {MORE_KINDS.map(tile)}
        </fieldset>
      )}
    </div>
  );
}

/**
 * One arm of a bigger key — the tap of a tap-hold, the output of a magic key's branch — with its
 * kind picked from a short list and its own controls under it. An arm can be anything a key can,
 * so a kind outside the list is offered too whenever the arm already is one.
 */
export function ArmEditor({
  scope,
  label,
  name,
  value,
  onChange,
  depth,
  kinds = ARM_KINDS,
}: {
  scope: EditorScope;
  label: string;
  /** Accessible prefix; defaults to the visible label. */
  name?: string;
  value: Binding | undefined;
  onChange: (b: Binding) => void;
  depth: number;
  kinds?: readonly InspectorKind[];
}) {
  const kind = kindOf(value);
  const prefix = name ?? label;
  const options = kinds.includes(kind) ? kinds : [...kinds, kind];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold w-16 shrink-0">{label}</span>
        <select
          aria-label={`${prefix} kind`}
          className="select select-xs select-bordered w-auto"
          value={kind}
          onChange={(e) =>
            onChange(
              convert(scope.compiled, value, e.target.value as InspectorKind, scope.behaviours),
            )
          }
        >
          {options.map((k) => (
            <option key={k} value={k}>
              {kindInfo(k).label}
            </option>
          ))}
        </select>
      </div>
      <div className="lb-arm">
        <KindBody scope={scope} value={value} onChange={onChange} name={prefix} depth={depth + 1} />
      </div>
    </div>
  );
}

function KindBody({
  scope,
  value,
  onChange,
  name,
  depth,
}: {
  scope: EditorScope;
  value: Binding | undefined;
  onChange: (b: Binding) => void;
  name: string;
  depth: number;
}) {
  if (!value || value.kind === 'none') return <Note>Does nothing when pressed.</Note>;
  if (depth > MAX_DEPTH) {
    return (
      <p className="text-xs font-mono opacity-70">
        {legendText(legend(scope.compiled, value)) || value.kind}
      </p>
    );
  }
  const common = { scope, onChange, name, depth };
  switch (value.kind) {
    case 'kp':
      return <SymbolBody {...common} binding={value} />;
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
      return <LayerBody {...common} binding={value} />;
    case 'mod':
    case 'sk':
      return <ModifierBody {...common} binding={value} />;
    case 'lt':
    case 'hold_tap':
      return <TapHoldBody {...common} binding={value} />;
    case 'key_repeat':
      return <RepeatBody {...common} binding={value} />;
    case 'adaptive':
      return value.ref ? (
        <BehaviourBody {...common} binding={value} />
      ) : (
        <MagicBody {...common} binding={value} />
      );
    case 'macro':
      return value.ref ? (
        <BehaviourBody {...common} binding={value} />
      ) : (
        <MacroBody {...common} binding={value} />
      );
    case 'tap_dance':
      return <TapDanceBody {...common} binding={value} />;
    case 'mod_morph':
    case 'layer_morph':
      return <MorphBody {...common} binding={value} />;
    case 'caps_word':
      return <CapsWordBody {...common} binding={value} />;
    case 'unicode':
      return <UnicodeBody {...common} binding={value} />;
    case 'dead_key':
      return <DeadKeyBody {...common} binding={value} />;
    case 'ref':
      return <BehaviourBody {...common} binding={value} />;
    case 'raw':
      return <ImportedBody {...common} binding={value} />;
    case 'trans':
      return <Note>Transparent: the key does what it does on the layer below.</Note>;
  }
}

// ---------------------------------------------------------------------------- symbol

/** How a key press is written in a field. A space has no visible spelling, so it takes its name. */
function symbolField(b: Of<'kp'>): string {
  if (b.keycode) return b.keycode;
  return b.symbol === ' ' ? 'SPACE' : (b.symbol ?? '');
}

/**
 * Read a field back as a key press. One character is itself; a longer word is tried as a keycode
 * first, the way the text line reads it, so `SPACE` and `N1` resolve while `ão` stays itself.
 */
function symbolFields(text: string, scope: EditorScope): Partial<Of<'kp'>> {
  if ([...text].length <= 1 || text.startsWith('&')) return { symbol: text };
  const parsed = parseBindingText(text, scope.text);
  if (!parsed.ok || parsed.fields.kind !== 'kp') return { symbol: text };
  const b = bindingFromFields(parsed.fields) as Of<'kp'>;
  return { symbol: b.symbol, keycode: b.keycode, shifted: b.shifted };
}

function SymbolBody({ scope, binding, onChange, name }: BodyProps<Of<'kp'>>) {
  return (
    <div className="space-y-2">
      <Row label="Types">
        <TextField
          label={named(name, 'Symbol')}
          value={symbolField(binding)}
          placeholder="a"
          className="w-32"
          onCommit={(text) => {
            const { symbol: _s, keycode: _k, shifted: _sh, ...rest } = binding;
            const next: Of<'kp'> = { ...rest, ...symbolFields(text, scope) };
            // A resolved keycode brings its own shifted symbol; one typed literally keeps the old.
            if (next.shifted === undefined && binding.shifted !== undefined) {
              next.shifted = binding.shifted;
            }
            if (!next.keycode) delete next.keycode;
            if (!next.shifted) delete next.shifted;
            onChange(next);
          }}
        />
      </Row>
      <details
        className="text-xs"
        open={binding.shifted !== undefined || binding.tag !== undefined}
      >
        <summary className="cursor-pointer opacity-70">Shifted symbol, tag</summary>
        <div className="space-y-2 pt-2">
          <Row label="Shifted">
            <TextField
              label={named(name, 'Shifted symbol')}
              value={binding.shifted ?? ''}
              placeholder={(binding.symbol ?? '').toUpperCase() || 'A'}
              className="w-32"
              onCommit={(v) => onChange(withOptional(binding, 'shifted', v))}
            />
          </Row>
          <Row label="Tag">
            <TextField
              label={named(name, 'Binding tag')}
              value={binding.tag ?? ''}
              className="w-32"
              onCommit={(v) => onChange(withOptional(binding, 'tag', v))}
            />
            <Note>A magic key can branch on the tag of the key pressed before it.</Note>
          </Row>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------- layer

type LayerKind = 'mo' | 'sl' | 'tog' | 'to' | 'auto_layer';
const LAYER_MODES: readonly (readonly [LayerKind, string])[] = [
  ['mo', 'Hold'],
  ['sl', 'One-shot'],
  ['tog', 'Toggle'],
  ['to', 'Switch'],
  ['auto_layer', 'Auto'],
];
const LAYER_HINT: Record<LayerKind, string> = {
  mo: 'On while the key is held.',
  sl: 'On for the next key only.',
  tog: 'On until the key is pressed again.',
  to: 'Switches to it, and stays there.',
  auto_layer: 'On until the word ends.',
};

function LayerBody({ scope, binding, onChange, name }: BodyProps<Of<LayerKind>>) {
  return (
    <div className="space-y-2">
      <Row label="Layer">
        <LayerChips
          compiled={scope.compiled}
          label={named(name, 'Layer')}
          value={[binding.layer]}
          onChange={(layer) => onChange({ ...binding, layer } as Binding)}
        />
      </Row>
      <Row label="Comes on">
        <Segment
          label={named(name, 'How the layer comes on')}
          options={LAYER_MODES}
          value={binding.kind}
          // Options belong to one kind of layer key, so a change of kind starts afresh.
          onChange={(kind) => onChange({ kind, layer: binding.layer } as Binding)}
        />
        <Note>{LAYER_HINT[binding.kind]}</Note>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------- modifier

function ModifierBody({ binding, onChange, name }: BodyProps<Of<'mod' | 'sk'>>) {
  return (
    <div className="space-y-2">
      <Row label="Modifier">
        <ModChips
          label={named(name, 'Modifier')}
          value={[binding.mod]}
          onChange={(mod) => onChange({ ...binding, mod })}
        />
      </Row>
      <Row label="Acts">
        <Segment
          label={named(name, 'How the modifier acts')}
          options={[
            ['mod', 'Hold'],
            ['sk', 'One-shot'],
          ]}
          value={binding.kind}
          onChange={(kind) => onChange({ kind, mod: binding.mod })}
        />
        <Note>
          {binding.kind === 'sk' ? 'Applies to the next key only.' : 'Applies while held.'}
        </Note>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------- tap-hold

const FLAVORS = ['tap-preferred', 'balanced', 'hold-preferred', 'tap-unless-interrupted'];

function TapHoldBody({ scope, binding, onChange, name, depth }: BodyProps<Of<'lt' | 'hold_tap'>>) {
  const hold: Binding = binding.kind === 'lt' ? { kind: 'mo', layer: binding.layer } : binding.hold;
  const flavor = binding.kind === 'hold_tap' ? binding.flavor : undefined;
  const term = binding.kind === 'hold_tap' ? binding.tappingTermMs : undefined;

  /**
   * ZMK's `&lt` is a layer on hold over a tap, with no timing of its own. A key written as one stays
   * one while it can; anything more is a general hold-tap. A hold-tap is never quietly rewritten
   * into a layer tap, so the document keeps the shape it was written in.
   */
  const build = (tap: Binding, next: Binding, nextFlavor = flavor, nextTerm = term): Binding => {
    if (
      binding.kind === 'lt' &&
      next.kind === 'mo' &&
      nextFlavor === undefined &&
      nextTerm === undefined
    ) {
      return { kind: 'lt', layer: next.layer, tap };
    }
    const out: Of<'hold_tap'> = { kind: 'hold_tap', tap, hold: next };
    if (nextFlavor !== undefined) out.flavor = nextFlavor;
    if (nextTerm !== undefined) out.tappingTermMs = nextTerm;
    return out;
  };

  return (
    <div className="space-y-2">
      <ArmEditor
        scope={scope}
        label="Tap"
        name={named(name, 'Tap')}
        value={binding.tap}
        depth={depth}
        kinds={TAP_KINDS}
        onChange={(tap) => onChange(build(tap, hold))}
      />
      {/* The hold can be anything the tap can: a layer, a modifier, a symbol, a macro, a magic
          key — anything but another tap-hold. */}
      <ArmEditor
        scope={scope}
        label="Hold"
        name={named(name, 'Hold')}
        value={hold}
        depth={depth}
        kinds={TAP_KINDS}
        onChange={(next) => onChange(build(binding.tap, next))}
      />
      <details className="text-xs" open={flavor !== undefined || term !== undefined}>
        <summary className="cursor-pointer opacity-70">Timing</summary>
        <div className="space-y-2 pt-2">
          <Row label="Flavor">
            <select
              aria-label={named(name, 'Hold-tap flavor')}
              className="select select-xs select-bordered w-auto"
              value={flavor ?? ''}
              onChange={(e) => onChange(build(binding.tap, hold, e.target.value || undefined))}
            >
              <option value="">firmware default</option>
              {FLAVORS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Term">
            <TextField
              label={named(name, 'Tapping term in milliseconds')}
              value={term === undefined ? '' : String(term)}
              placeholder="200"
              className="w-20"
              onCommit={(text) => {
                const ms = Number.parseInt(text, 10);
                onChange(
                  build(binding.tap, hold, flavor, Number.isFinite(ms) && ms > 0 ? ms : undefined),
                );
              }}
            />
          </Row>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------- repeat

function RepeatBody({ onChange }: BodyProps<Of<'key_repeat'>>) {
  return (
    <div className="space-y-1">
      <Note>Types the previous key again.</Note>
      <button
        type="button"
        className="btn btn-xs"
        onClick={() =>
          onChange({ kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: [] })
        }
      >
        Make it an alt repeat
      </button>
      <Note>
        An alt repeat types something else after the keys you choose, and repeats otherwise.
      </Note>
    </div>
  );
}

// ---------------------------------------------------------------------------- magic

/**
 * Branches of an adaptive key: after these symbols (or a key with this tag), do this instead. They
 * are tried from the top and the first that matches wins, so a branch that needs a tag goes above a
 * plain one for the same symbol — which is how an alt repeat gets a second stage.
 */
export function TriggersEditor({
  scope,
  triggers,
  onChange,
  depth,
  name = '',
}: {
  scope: EditorScope;
  triggers: AdaptiveTrigger[];
  onChange: (triggers: AdaptiveTrigger[]) => void;
  depth: number;
  name?: string;
}) {
  const set = (i: number, t: AdaptiveTrigger) =>
    onChange(triggers.map((old, j) => (j === i ? t : old)));
  const move = (i: number, to: number) => {
    const next = [...triggers];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };
  const label = (i: number) => named(name, `Branch ${i + 1}`);

  return (
    <div className="space-y-2">
      {triggers.length > 1 && (
        <Note>Tried from the top; the first branch that matches the key before wins.</Note>
      )}
      <ol className="space-y-2 list-none p-0 m-0" aria-label={named(name, 'Branches')}>
        {triggers.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a branch is identified by its place
          <li key={i} className="rounded-box border border-base-300 p-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold w-16 shrink-0">After</span>
              <TextField
                label={`${label(i)} after`}
                value={(t.afterAny ?? []).join(' ')}
                placeholder="a e i o u"
                className="flex-1 min-w-24"
                onCommit={(text) => {
                  const next: AdaptiveTrigger = { ...t, afterAny: words(text) };
                  // With a tag to go on, no symbols means any symbol; without one, a branch with
                  // no symbols simply never fires — which the document can still hold.
                  if (next.afterAny?.length === 0 && t.afterTags?.length) delete next.afterAny;
                  set(i, next);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                aria-label={`Move ${label(i).toLowerCase()} up`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                aria-label={`Move ${label(i).toLowerCase()} down`}
                disabled={i === triggers.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                aria-label={`Remove ${label(i).toLowerCase()}`}
                onClick={() => onChange(triggers.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
            <details className="text-xs" open={(t.afterTags ?? []).length > 0}>
              <summary className="cursor-pointer opacity-70">Only after a tagged key</summary>
              <div className="pt-2">
                <TextField
                  label={`${label(i)} tags`}
                  value={(t.afterTags ?? []).join(' ')}
                  placeholder="alpha2"
                  className="w-40"
                  onCommit={(text) => {
                    const next: AdaptiveTrigger = { ...t };
                    if (words(text).length > 0) {
                      next.afterTags = words(text);
                      // With a tag to go on, no symbols means any symbol from a tagged key.
                      if (next.afterAny?.length === 0) delete next.afterAny;
                    } else {
                      delete next.afterTags;
                      next.afterAny = next.afterAny ?? [];
                    }
                    set(i, next);
                  }}
                />
              </div>
            </details>
            <ArmEditor
              scope={scope}
              label="Then"
              name={label(i)}
              value={t.binding}
              depth={depth}
              onChange={(binding) => set(i, { ...t, binding })}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-xs"
        onClick={() =>
          onChange([...triggers, { afterAny: [], binding: { kind: 'kp', symbol: '' } }])
        }
      >
        Add branch
      </button>
    </div>
  );
}

function MagicBody({ scope, binding, onChange, name, depth }: BodyProps<Of<'adaptive'>>) {
  const alt = binding.default?.kind === 'key_repeat';
  return (
    <div className="space-y-2">
      {alt ? (
        <Note>Repeats the previous key, unless a branch below matches it.</Note>
      ) : (
        <>
          <ArmEditor
            scope={scope}
            label="Default"
            name={named(name, 'Default')}
            value={binding.default}
            depth={depth}
            onChange={(d) => onChange({ ...binding, default: d })}
          />
          <Note>What it types when no branch matches the key before it.</Note>
        </>
      )}
      <TriggersEditor
        scope={scope}
        name={name}
        depth={depth}
        triggers={binding.triggers ?? []}
        onChange={(triggers) => onChange({ ...binding, triggers })}
      />
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={binding.strictModifiers ?? false}
          onChange={(e) => {
            const out = { ...binding };
            if (e.target.checked) out.strictModifiers = true;
            else delete out.strictModifiers;
            onChange(out);
          }}
        />
        Only when the key before had no modifier held
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------- macro

function MacroBody({ scope, binding, onChange, name }: BodyProps<Of<'macro'>>) {
  const steps = binding.steps !== undefined;
  const then =
    binding.then?.length === 1 && binding.then[0].kind === 'sl' ? binding.then[0].layer : '';
  const otherThen = (binding.then?.length ?? 0) > 0 && then === '';
  return (
    <div className="space-y-2">
      <Segment
        label={named(name, 'How the macro is written')}
        options={[
          ['text', 'Text'],
          ['steps', 'Steps'],
        ]}
        value={steps ? 'steps' : 'text'}
        onChange={(v) => {
          const tag = binding.tag === undefined ? {} : { tag: binding.tag };
          if (v === 'steps') {
            const typed: Binding[] = [...(binding.symbols ?? '')].map((g) => ({
              kind: 'kp',
              symbol: g,
            }));
            onChange({ kind: 'macro', steps: [...typed, ...(binding.then ?? [])], ...tag });
          } else {
            const symbols = (binding.steps ?? [])
              .map((s) => (s.kind === 'kp' ? (s.symbol ?? '') : ''))
              .join('');
            onChange({ kind: 'macro', symbols, ...tag });
          }
        }}
      />
      {steps ? (
        <MacroStepsEditor
          compiled={scope.compiled}
          behaviours={scope.behaviours}
          binding={binding}
          onChange={onChange}
        />
      ) : (
        <>
          <Row label="Types">
            <TextField
              label={named(name, 'Macro text')}
              value={binding.symbols ?? ''}
              placeholder="qu"
              className="w-40"
              onCommit={(symbols) => onChange({ ...binding, symbols })}
            />
          </Row>
          <Row label="Then">
            {otherThen ? (
              <Note>Runs more after the text; switch to Steps to see it.</Note>
            ) : (
              <select
                aria-label={named(name, 'Layer armed after the macro')}
                className="select select-xs select-bordered w-auto"
                value={then}
                onChange={(e) => {
                  const out = { ...binding };
                  if (e.target.value) out.then = [{ kind: 'sl', layer: e.target.value }];
                  else delete out.then;
                  onChange(out);
                }}
              >
                <option value="">nothing</option>
                {scope.compiled.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} for the next key
                  </option>
                ))}
              </select>
            )}
          </Row>
        </>
      )}
      <Row label="Tag">
        <TextField
          label={named(name, 'Binding tag')}
          value={binding.tag ?? ''}
          className="w-32"
          onCommit={(v) => onChange(withOptional(binding, 'tag', v))}
        />
        <Note>A magic key can branch on the tag of the key pressed before it.</Note>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------- tap dance

function TapDanceBody({ scope, binding, onChange, name, depth }: BodyProps<Of<'tap_dance'>>) {
  const set = (i: number, b: Binding) =>
    onChange({ ...binding, bindings: binding.bindings.map((old, j) => (j === i ? b : old)) });
  return (
    <div className="space-y-2">
      {binding.bindings.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a tap count is identified by its place
        <div key={i} className="flex items-start gap-1">
          <div className="flex-1 min-w-0">
            <ArmEditor
              scope={scope}
              label={`${i + 1}×`}
              name={named(name, `${i + 1} taps`)}
              value={b}
              depth={depth}
              onChange={(next) => set(i, next)}
            />
          </div>
          {binding.bindings.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              aria-label={`Remove ${i + 1} taps`}
              onClick={() =>
                onChange({ ...binding, bindings: binding.bindings.filter((_, j) => j !== i) })
              }
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-xs"
        onClick={() =>
          onChange({ ...binding, bindings: [...binding.bindings, { kind: 'kp', symbol: '' }] })
        }
      >
        Add a tap
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------- morph

const MORPH_MODS: readonly (readonly [string, string, Mod[]])[] = [
  ['shift', 'Shift', ['LSHIFT', 'RSHIFT']],
  ['ctrl', 'Control', ['LCTRL', 'RCTRL']],
  ['alt', 'Alt', ['LALT', 'RALT']],
  ['gui', 'Command', ['LGUI', 'RGUI']],
];

function MorphBody({
  scope,
  binding,
  onChange,
  name,
  depth,
}: BodyProps<Of<'mod_morph' | 'layer_morph'>>) {
  const plain = binding.kind === 'mod_morph' ? binding.default : binding.inactive;
  const morphed = binding.kind === 'mod_morph' ? binding.morphed : binding.active;
  const upper = scope.compiled.layers[1]?.id ?? scope.compiled.layers[0].id;
  return (
    <div className="space-y-2">
      <Row label="Changes">
        <Segment
          label={named(name, 'What changes it')}
          options={[
            ['mod_morph', 'With a modifier'],
            ['layer_morph', 'On a layer'],
          ]}
          value={binding.kind}
          onChange={(kind) =>
            onChange(
              kind === 'mod_morph'
                ? { kind, mods: ['LSHIFT', 'RSHIFT'], default: plain, morphed }
                : { kind, layers: [upper], inactive: plain, active: morphed },
            )
          }
        />
      </Row>
      {binding.kind === 'mod_morph' ? (
        <Row label="With">
          <Segment
            label={named(name, 'Modifier that changes it')}
            options={MORPH_MODS.map(([v, l]) => [v, l] as const)}
            value={
              MORPH_MODS.find(([, , mods]) => mods.some((m) => binding.mods.includes(m)))?.[0] ??
              null
            }
            onChange={(v) =>
              onChange({
                ...binding,
                mods: MORPH_MODS.find(([id]) => id === v)?.[2] ?? binding.mods,
              })
            }
          />
        </Row>
      ) : (
        <Row label="On">
          <LayerChips
            compiled={scope.compiled}
            label={named(name, 'Layers that change it')}
            value={binding.layers}
            onChange={(layer) => {
              const layers = binding.layers.includes(layer)
                ? binding.layers.filter((l) => l !== layer)
                : [...binding.layers, layer];
              // A layer morph on no layer at all would never morph; the last one stays.
              if (layers.length > 0) onChange({ ...binding, layers });
            }}
          />
        </Row>
      )}
      <ArmEditor
        scope={scope}
        label="Plain"
        name={named(name, 'Plain')}
        value={plain}
        depth={depth}
        kinds={TAP_KINDS}
        onChange={(b) =>
          onChange(
            binding.kind === 'mod_morph' ? { ...binding, default: b } : { ...binding, inactive: b },
          )
        }
      />
      <ArmEditor
        scope={scope}
        label="Becomes"
        name={named(name, 'Becomes')}
        value={morphed}
        depth={depth}
        onChange={(b) =>
          onChange(
            binding.kind === 'mod_morph' ? { ...binding, morphed: b } : { ...binding, active: b },
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------- the rest

function CapsWordBody({ binding, onChange, name }: BodyProps<Of<'caps_word'>>) {
  return (
    <Row label="Continues">
      <TextField
        label={named(name, 'Symbols that do not end the word')}
        value={(binding.continueList ?? []).join(' ')}
        placeholder="- _"
        className="w-40"
        onCommit={(text) => {
          const out = { ...binding };
          if (words(text).length > 0) out.continueList = words(text);
          else delete out.continueList;
          onChange(out);
        }}
      />
      <Note>Capitals until the word ends. Letters keep it going; so do these.</Note>
    </Row>
  );
}

function UnicodeBody({ binding, onChange, name }: BodyProps<Of<'unicode'>>) {
  return (
    <div className="space-y-2">
      <Row label="Types">
        <TextField
          label={named(name, 'Unicode character')}
          value={binding.symbol}
          placeholder="→"
          className="w-28"
          onCommit={(symbol) => onChange({ ...binding, symbol })}
        />
      </Row>
      <Row label="Shifted">
        <TextField
          label={named(name, 'Shifted unicode character')}
          value={binding.shiftedSymbol ?? ''}
          className="w-28"
          onCommit={(v) => onChange(withOptional(binding, 'shiftedSymbol', v))}
        />
      </Row>
      <Note>For a character the host keyboard has no key for; the firmware enters it by code.</Note>
    </div>
  );
}

const DIACRITICS = ['´', '`', '^', '~', '¨'];

function DeadKeyBody({ binding, onChange, name }: BodyProps<Of<'dead_key'>>) {
  return (
    <Row label="Accent">
      <Segment
        label={named(name, 'Accent the next letter takes')}
        options={DIACRITICS.map((d) => [d, d] as const)}
        value={DIACRITICS.includes(binding.diacritic) ? binding.diacritic : null}
        onChange={(diacritic) => onChange({ ...binding, diacritic })}
      />
      <Note>Types nothing itself; the next letter comes out accented.</Note>
    </Row>
  );
}

/**
 * A key that runs one of the layout's named behaviours — and, where the behaviour is the
 * document's own, the behaviour itself, since that is what a reader who picked the key wants to see.
 */
function BehaviourBody({ scope, binding, onChange, name, depth }: BodyProps) {
  const ref = 'ref' in binding && typeof binding.ref === 'string' ? binding.ref : '';
  const own = scope.ownBehaviours[ref];
  return (
    <div className="space-y-2">
      <Row label="Runs">
        <select
          aria-label={named(name, 'Behaviour')}
          className="select select-xs select-bordered w-auto"
          value={ref}
          onChange={(e) => onChange({ kind: 'ref', ref: e.target.value })}
        >
          {!scope.behaviours.includes(ref) && <option value={ref}>{ref || '—'}</option>}
          {scope.behaviours.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Row>
      {own ? (
        <details className="text-xs" open={depth === 0}>
          <summary className="cursor-pointer opacity-70">
            Edit <span className="font-mono">{ref}</span> — every key that runs it changes
          </summary>
          <div className="pt-2 lb-arm">
            <KindBody
              scope={scope}
              value={own}
              onChange={(b) => scope.setBehaviour(ref, b)}
              name={named(name, ref)}
              depth={depth + 1}
            />
          </div>
        </details>
      ) : (
        ref && <Note>The layout has no behaviour of that name; choose one above.</Note>
      )}
    </div>
  );
}

function ImportedBody({ binding }: BodyProps<Of<'raw'>>) {
  return (
    <div className="space-y-1 text-xs">
      <p>
        <span className="font-mono">{binding.label}</span>
        {binding.source && <span className="opacity-60"> — {binding.source}</span>}
      </p>
      <Note>
        Kept from the imported layout. LayerBench draws it and moves it with the rest, but it types
        nothing in the analysis. Pick a kind above to replace it.
      </Note>
    </div>
  );
}
