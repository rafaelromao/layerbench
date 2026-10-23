import {
  type Binding,
  bindingModule,
  type CompiledLayout,
  legend,
  legendText,
  type ModFamily,
} from '@layerbench/core';
import { useRef, useState } from 'react';
import { useDismiss } from '../../../components/use-dismiss.js';
import { useMediaQuery, WIDE } from '../../../components/use-media-query.js';
import type { BindingTextContext } from '../binding-text.js';
import {
  type BranchChanges,
  type BranchView,
  type FieldsOf,
  type KeyFields,
  keyFields,
  type LayerMode,
  type ListChanges,
} from './binding-changes.js';
import { LayerChips, ModChips, ModuleNote, Note, Row, Segment, TextField } from './controls.js';
import { SentenceSpaceNote } from './features.js';
import {
  type KindInfo,
  type KindOfKey,
  kindInfo,
  MORE_KINDS,
  PART_KINDS,
  PRIMARY_KINDS,
  TAP_KINDS,
  tileHint,
} from './kinds.js';
import { MacroStepsEditor } from './macro-steps.js';

/** What every editor needs to know about the layout around the binding it edits. */
export interface EditorScope {
  compiled: CompiledLayout;
  text: BindingTextContext;
}

interface BodyProps<K extends KindOfKey> {
  scope: EditorScope;
  fields: FieldsOf<K>;
  onChange: (b: Binding) => void;
  /** Prefix for the controls' accessible names, so the tap of a tap-hold is not its hold. */
  name: string;
  depth: number;
}

/** "Symbol" on its own, "Tap symbol" inside the tap part of a bigger key. */
function named(prefix: string, what: string): string {
  return prefix ? `${prefix} ${what.charAt(0).toLowerCase()}${what.slice(1)}` : what;
}

/** Nested parts stop being drawn as editors past this depth; they are still shown and kept. */
const MAX_DEPTH = 4;

// ---------------------------------------------------------------------------- the editor

/** The whole of what a key does: the kind of key it is, and the controls for that kind. */
export function BindingEditor({
  scope,
  value,
  onChange,
  without = [],
}: {
  scope: EditorScope;
  value: Binding | undefined;
  onChange: (b: Binding) => void;
  /** Kinds not offered, as Transparent on a combo, which has no layer below to show through. */
  without?: readonly KindOfKey[];
}) {
  const fields = keyFields(value, scope.text);
  return (
    <div className="space-y-3">
      <KindTiles
        kind={fields.kind}
        without={without}
        onPick={(k) => onChange(fields.set.kind(k))}
      />
      <KindBody scope={scope} fields={fields} onChange={onChange} name="" depth={0} />
    </div>
  );
}

function KindTiles({
  kind,
  without,
  onPick,
}: {
  kind: KindOfKey;
  without: readonly KindOfKey[];
  onPick: (k: KindOfKey) => void;
}) {
  const primary = PRIMARY_KINDS.filter((k) => !without.includes(k.kind));
  const others = MORE_KINDS.filter((k) => !without.includes(k.kind));
  // Wider than a phone, every kind is a tile: the rest fit in the room a More tile would take to
  // reveal them. On a phone they open like a menu, and close like one: on a pick, or a tap
  // elsewhere.
  const wide = useMediaQuery(WIDE);
  const [more, setMore] = useState(false);
  const tiles = useRef<HTMLDivElement>(null);
  const closeMore = () => setMore(false);
  useDismiss(tiles, closeMore, { active: more && !wide, closeOnEscape: false });
  const tile = (k: KindInfo) => (
    <button
      key={k.kind}
      type="button"
      aria-pressed={kind === k.kind}
      title={tileHint(k)}
      className={`lb-kind-tile ${kind === k.kind ? 'lb-kind-tile-on' : ''}`}
      onClick={() => {
        closeMore();
        if (kind !== k.kind) onPick(k.kind);
      }}
    >
      <span aria-hidden="true" className="lb-kind-glyph">
        {k.glyph}
      </span>
      <span className="lb-kind-label">{k.label}</span>
    </button>
  );
  if (wide) {
    return (
      <fieldset className="lb-kind-tiles" aria-label="Kind of key">
        {primary.map(tile)}
        {others.map(tile)}
      </fieldset>
    );
  }
  // With the list closed, a kind picked from it stands in the More tile, so it is still shown.
  const chosen = others.find((k) => k.kind === kind);
  const shown = !more && chosen;
  return (
    <div className="space-y-1" ref={tiles}>
      <fieldset className="lb-kind-tiles" aria-label="Kind of key">
        {primary.map(tile)}
        <button
          type="button"
          className={`lb-kind-tile ${shown ? 'lb-kind-tile-on' : ''}`}
          aria-expanded={more}
          aria-label={shown ? `More kinds: ${chosen.label}` : undefined}
          title={shown ? tileHint(chosen) : undefined}
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
          {others.map(tile)}
        </fieldset>
      )}
    </div>
  );
}

/**
 * One part of a bigger key — the tap of a tap-hold, the output of an adaptive key's branch — with
 * its kind picked from a short list and its own controls under it. A part can be anything a key
 * can, so a kind outside the list is offered too whenever the part already is one.
 */
export function PartEditor({
  scope,
  label,
  name,
  value,
  onChange,
  depth,
  kinds = PART_KINDS,
}: {
  scope: EditorScope;
  label: string;
  /** Accessible prefix; defaults to the visible label. */
  name?: string;
  value: Binding | undefined;
  onChange: (b: Binding) => void;
  depth: number;
  kinds?: readonly KindOfKey[];
}) {
  const fields = keyFields(value, scope.text);
  const kind = fields.kind;
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
          onChange={(e) => onChange(fields.set.kind(e.target.value as KindOfKey))}
        >
          {options.map((k) => (
            <option key={k} value={k}>
              {kindInfo(k).label}
            </option>
          ))}
        </select>
      </div>
      <div className="lb-part">
        <KindBody
          scope={scope}
          fields={fields}
          onChange={onChange}
          name={prefix}
          depth={depth + 1}
        />
      </div>
    </div>
  );
}

function KindBody({
  scope,
  fields,
  onChange,
  name,
  depth,
}: {
  scope: EditorScope;
  fields: KeyFields;
  onChange: (b: Binding) => void;
  name: string;
  depth: number;
}) {
  if (fields.kind === 'nothing') return <Note>Does nothing when pressed.</Note>;
  if (depth > MAX_DEPTH) {
    return (
      <p className="text-xs font-mono opacity-70">
        {legendText(legend(scope.compiled, fields.binding)) || fields.binding.kind}
      </p>
    );
  }
  const common = { scope, onChange, name, depth };
  switch (fields.kind) {
    case 'symbol':
      return <SymbolBody {...common} fields={fields} />;
    case 'layer':
      return <LayerBody {...common} fields={fields} />;
    case 'modifier':
      return <ModifierBody {...common} fields={fields} />;
    case 'taphold':
      return <TapHoldBody {...common} fields={fields} />;
    case 'repeat':
      return <RepeatBody {...common} fields={fields} />;
    case 'adaptive':
    case 'altrepeat':
      return <AdaptiveBody {...common} fields={fields} />;
    case 'macro':
      return <MacroBody {...common} fields={fields} />;
    case 'tapdance':
      return <TapDanceBody {...common} fields={fields} />;
    case 'morph':
      return <MorphBody {...common} fields={fields} />;
    case 'capsword':
      return <CapsWordBody {...common} fields={fields} />;
    case 'sentencespace':
      return (
        <div className="space-y-2">
          <SentenceSpaceNote />
          <ModuleNote module={bindingModule('sentence_space')} />
        </div>
      );
    case 'unicode':
      return <UnicodeBody {...common} fields={fields} />;
    case 'deadkey':
      return <DeadKeyBody {...common} fields={fields} />;
    case 'imported':
      return <ImportedBody {...common} fields={fields} />;
    case 'transparent':
      return <Note>Transparent: the key does what it does on the layer below.</Note>;
  }
}

// ---------------------------------------------------------------------------- symbol

function SymbolBody({ fields: { view, set }, onChange, name }: BodyProps<'symbol'>) {
  return (
    <div className="space-y-2">
      <Row label="Types">
        <TextField
          label={named(name, 'Symbol')}
          value={view.symbol}
          placeholder="a"
          className="w-32"
          onCommit={(text) => onChange(set.symbol(text))}
        />
      </Row>
      <details className="text-xs" open={view.shifted !== '' || view.tag !== ''}>
        <summary className="cursor-pointer opacity-70">Shifted symbol, tag</summary>
        <div className="space-y-2 pt-2">
          <Row label="Shifted">
            <TextField
              label={named(name, 'Shifted symbol')}
              value={view.shifted}
              placeholder={view.shiftedByDefault || 'A'}
              className="w-32"
              onCommit={(v) => onChange(set.shifted(v))}
            />
          </Row>
          <Row label="Tag">
            <TextField
              label={named(name, 'Binding tag')}
              value={view.tag}
              className="w-32"
              onCommit={(v) => onChange(set.tag(v))}
            />
            <Note>An adaptive key can branch on the tag of the key pressed before it.</Note>
          </Row>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------- layer

/** Named as ZMK and QMK name them: momentary (`&mo`, `MO`), to layer (`&to`, `TO`) and so on. */
const LAYER_MODES: readonly (readonly [LayerMode, string])[] = [
  ['mo', 'Momentary'],
  ['sl', 'One-shot'],
  ['tog', 'Toggle'],
  ['to', 'To layer'],
  ['auto_layer', 'Auto'],
];
const LAYER_HINT: Record<LayerMode, string> = {
  mo: 'On while the key is held.',
  sl: 'On for the next key only.',
  tog: 'On until the key is pressed again.',
  to: 'Turns it on, and every other layer off but the base.',
  auto_layer: 'On until the word ends.',
};

function LayerBody({ scope, fields: { view, set }, onChange, name }: BodyProps<'layer'>) {
  return (
    <div className="space-y-2">
      <Row label="Layer">
        <LayerChips
          compiled={scope.compiled}
          label={named(name, 'Layer')}
          value={[view.layer]}
          onChange={(layer) => onChange(set.layer(layer))}
        />
      </Row>
      <Row label="Comes on">
        <Segment
          label={named(name, 'How the layer comes on')}
          options={LAYER_MODES}
          value={view.mode}
          onChange={(mode) => onChange(set.mode(mode))}
        />
        <Note>{LAYER_HINT[view.mode]}</Note>
        <ModuleNote module={bindingModule(view.mode)} />
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------- modifier

function ModifierBody({ fields: { view, set }, onChange, name }: BodyProps<'modifier'>) {
  return (
    <div className="space-y-2">
      <Row label="Modifier">
        <ModChips
          label={named(name, 'Modifier')}
          value={[view.mod]}
          onChange={(mod) => onChange(set.mod(mod))}
        />
      </Row>
      <Row label="Acts">
        <Segment
          label={named(name, 'How the modifier acts')}
          options={[
            ['mod', 'Hold'],
            ['sk', 'One-shot'],
          ]}
          value={view.acts}
          onChange={(acts) => onChange(set.acts(acts))}
        />
        <Note>{view.acts === 'sk' ? 'Applies to the next key only.' : 'Applies while held.'}</Note>
      </Row>
      {view.acts === 'mod' && (
        <Row label="Held with">
          <ModChips
            label={named(name, 'Modifiers held with it')}
            value={view.also}
            onChange={(mod) => onChange(set.also(mod))}
          />
          <Note>Held together, as ZMK's LS(LGUI) holds Shift with Gui.</Note>
        </Row>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- tap-hold

const FLAVORS = ['tap-preferred', 'balanced', 'hold-preferred', 'tap-unless-interrupted'];

function TapHoldBody({
  scope,
  fields: { view, set },
  onChange,
  name,
  depth,
}: BodyProps<'taphold'>) {
  return (
    <div className="space-y-2">
      <PartEditor
        scope={scope}
        label="Tap"
        name={named(name, 'Tap')}
        value={view.tap}
        depth={depth}
        kinds={TAP_KINDS}
        onChange={(tap) => onChange(set.tap(tap))}
      />
      {/* The hold can be anything the tap can: a layer, a modifier, a symbol, a macro, an
          adaptive key — anything but another tap-hold. */}
      <PartEditor
        scope={scope}
        label="Hold"
        name={named(name, 'Hold')}
        value={view.hold}
        depth={depth}
        kinds={TAP_KINDS}
        onChange={(hold) => onChange(set.hold(hold))}
      />
      <details className="text-xs" open={view.flavor !== '' || view.term !== ''}>
        <summary className="cursor-pointer opacity-70">Timing</summary>
        <div className="space-y-2 pt-2">
          <Row label="Flavor">
            <select
              aria-label={named(name, 'Hold-tap flavor')}
              className="select select-xs select-bordered w-auto"
              value={view.flavor}
              onChange={(e) => onChange(set.flavor(e.target.value))}
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
              value={view.term}
              placeholder="200"
              className="w-20"
              onCommit={(text) => onChange(set.term(text))}
            />
          </Row>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------- repeat

function RepeatBody({ fields: { set }, onChange }: BodyProps<'repeat'>) {
  return (
    <div className="space-y-1">
      <Note>Types the previous key again.</Note>
      <button type="button" className="btn btn-xs" onClick={() => onChange(set.kind('altrepeat'))}>
        Make it an alt repeat
      </button>
      <Note>
        An alt repeat types something else after the keys you choose, and repeats otherwise.
      </Note>
    </div>
  );
}

// ---------------------------------------------------------------------------- adaptive

/**
 * Branches of an adaptive key, tried from the top: the first that matches the key before wins, so
 * a branch that needs a tag goes above a plain one for the same symbol.
 */
function TriggersEditor({
  scope,
  branches,
  set,
  onChange,
  depth,
  name = '',
}: {
  scope: EditorScope;
  branches: BranchView[];
  set: ListChanges<BranchChanges>;
  onChange: (b: Binding) => void;
  depth: number;
  name?: string;
}) {
  const label = (i: number) => named(name, `Branch ${i + 1}`);

  return (
    <div className="space-y-2">
      {branches.length > 1 && (
        <Note>Tried from the top; the first branch that matches the key before wins.</Note>
      )}
      <ol className="space-y-2 list-none p-0 m-0" aria-label={named(name, 'Branches')}>
        {branches.map((t, i) => {
          const branch = set.at(i);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a branch is identified by its place
            <li key={i} className="rounded-box border border-base-300 p-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold w-16 shrink-0">After</span>
                <TextField
                  label={`${label(i)} after`}
                  value={t.after}
                  placeholder="a e i o u"
                  className="flex-1 min-w-24"
                  onCommit={(text) => onChange(branch.after(text))}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label={`Move ${label(i).toLowerCase()} up`}
                  disabled={i === 0}
                  onClick={() => onChange(set.move(i, i - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label={`Move ${label(i).toLowerCase()} down`}
                  disabled={i === branches.length - 1}
                  onClick={() => onChange(set.move(i, i + 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label={`Remove ${label(i).toLowerCase()}`}
                  onClick={() => onChange(set.remove(i))}
                >
                  ✕
                </button>
              </div>
              <details className="text-xs" open={t.tags !== ''}>
                <summary className="cursor-pointer opacity-70">Only after a tagged key</summary>
                <div className="pt-2">
                  <TextField
                    label={`${label(i)} tags`}
                    value={t.tags}
                    placeholder="alpha2"
                    className="w-40"
                    onCommit={(text) => onChange(branch.tags(text))}
                  />
                </div>
              </details>
              <PartEditor
                scope={scope}
                label="Then"
                name={label(i)}
                value={t.then}
                depth={depth}
                onChange={(binding) => onChange(branch.then(binding))}
              />
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn btn-xs" onClick={() => onChange(set.add())}>
        Add branch
      </button>
    </div>
  );
}

function AdaptiveBody({
  scope,
  fields: { kind, view, set },
  onChange,
  name,
  depth,
}: BodyProps<'adaptive' | 'altrepeat'>) {
  return (
    <div className="space-y-2">
      {kind === 'altrepeat' ? (
        <Note>Repeats the previous key, unless a branch below matches it.</Note>
      ) : (
        <>
          <PartEditor
            scope={scope}
            label="Default"
            name={named(name, 'Default')}
            value={view.default}
            depth={depth}
            onChange={(d) => onChange(set.default(d))}
          />
          <Note>What it types when no branch matches the key before it.</Note>
        </>
      )}
      <ModuleNote module={bindingModule('adaptive')} />
      <TriggersEditor
        scope={scope}
        name={name}
        depth={depth}
        branches={view.branches}
        set={set.branches}
        onChange={onChange}
      />
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={view.strict}
          onChange={(e) => onChange(set.strict(e.target.checked))}
        />
        Only when the key before had no modifier held
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------- macro

function MacroBody({ scope, fields, onChange, name }: BodyProps<'macro'>) {
  const { view, set } = fields;
  return (
    <div className="space-y-2">
      <Segment
        label={named(name, 'How the macro is written')}
        options={[
          ['text', 'Text'],
          ['steps', 'Steps'],
        ]}
        value={view.form}
        onChange={(form) => onChange(set.form(form))}
      />
      {view.form === 'steps' ? (
        <MacroStepsEditor
          compiled={scope.compiled}
          ctx={scope.text}
          fields={fields}
          onChange={onChange}
        />
      ) : (
        <>
          <Row label="Types">
            <TextField
              label={named(name, 'Macro text')}
              value={view.symbols}
              placeholder="qu"
              className="w-40"
              onCommit={(symbols) => onChange(set.symbols(symbols))}
            />
          </Row>
          <Row label="Then">
            {view.thenIsMore ? (
              <Note>Runs more after the text; switch to Steps to see it.</Note>
            ) : (
              <select
                aria-label={named(name, 'Layer armed after the macro')}
                className="select select-xs select-bordered w-auto"
                value={view.then}
                onChange={(e) => onChange(set.then(e.target.value))}
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
          value={view.tag}
          className="w-32"
          onCommit={(v) => onChange(set.tag(v))}
        />
        <Note>An adaptive key can branch on the tag of the key pressed before it.</Note>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------- tap dance

function TapDanceBody({
  scope,
  fields: { view, set },
  onChange,
  name,
  depth,
}: BodyProps<'tapdance'>) {
  return (
    <div className="space-y-2">
      {view.taps.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a tap count is identified by its place
        <div key={i} className="flex items-start gap-1">
          <div className="flex-1 min-w-0">
            <PartEditor
              scope={scope}
              label={`${i + 1}×`}
              name={named(name, `${i + 1} taps`)}
              value={b}
              depth={depth}
              onChange={(next) => onChange(set.taps.at(i)(next))}
            />
          </div>
          {view.taps.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              aria-label={`Remove ${i + 1} taps`}
              onClick={() => onChange(set.taps.remove(i))}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-xs" onClick={() => onChange(set.taps.add())}>
        Add a tap
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------- morph

const MORPH_FAMILIES: readonly (readonly [ModFamily, string])[] = [
  ['shift', 'Shift'],
  ['ctrl', 'Control'],
  ['alt', 'Alt'],
  ['gui', 'Command'],
];

function MorphBody({ scope, fields: { view, set }, onChange, name, depth }: BodyProps<'morph'>) {
  return (
    <div className="space-y-2">
      <Row label="Changes">
        <Segment
          label={named(name, 'What changes it')}
          options={[
            ['mod_morph', 'With a modifier'],
            ['layer_morph', 'On a layer'],
            ['sentence_morph', 'After a sentence'],
          ]}
          value={view.by}
          onChange={(by) => onChange(set.by(by))}
        />
        <ModuleNote module={bindingModule(view.by)} />
      </Row>
      {view.by === 'sentence_morph' ? (
        <Note>
          Changes after a sentence space has left a capital, until a key other than a layer key is
          pressed.
        </Note>
      ) : view.by === 'mod_morph' ? (
        <Row label="With">
          <Segment
            label={named(name, 'Modifier that changes it')}
            options={MORPH_FAMILIES}
            value={view.family}
            onChange={(family) => onChange(set.family(family))}
          />
        </Row>
      ) : (
        <Row label="On">
          <LayerChips
            compiled={scope.compiled}
            label={named(name, 'Layers that change it')}
            value={view.layers}
            onChange={(layer) => onChange(set.toggleLayer(layer))}
          />
          <Note>Changes while any of these is on.</Note>
        </Row>
      )}
      <PartEditor
        scope={scope}
        label="Plain"
        name={named(name, 'Plain')}
        value={view.plain}
        depth={depth}
        kinds={TAP_KINDS}
        onChange={(b) => onChange(set.plain(b))}
      />
      <PartEditor
        scope={scope}
        label="Becomes"
        name={named(name, 'Becomes')}
        value={view.becomes}
        depth={depth}
        onChange={(b) => onChange(set.becomes(b))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------- the rest

function CapsWordBody({ fields: { view, set }, onChange, name }: BodyProps<'capsword'>) {
  return (
    <Row label="Continues">
      <TextField
        label={named(name, 'Symbols that do not end the word')}
        value={view.continues}
        placeholder="- _"
        className="w-40"
        onCommit={(text) => onChange(set.continues(text))}
      />
      <Note>Capitals until the word ends. Letters keep it going; so do these.</Note>
    </Row>
  );
}

function UnicodeBody({ fields: { view, set }, onChange, name }: BodyProps<'unicode'>) {
  return (
    <div className="space-y-2">
      <Row label="Types">
        <TextField
          label={named(name, 'Unicode character')}
          value={view.symbol}
          placeholder="→"
          className="w-28"
          onCommit={(symbol) => onChange(set.symbol(symbol))}
        />
      </Row>
      <Row label="Shifted">
        <TextField
          label={named(name, 'Shifted unicode character')}
          value={view.shifted}
          className="w-28"
          onCommit={(v) => onChange(set.shifted(v))}
        />
      </Row>
      <Note>For a character the host keyboard has no key for; the firmware enters it by code.</Note>
      <ModuleNote module={bindingModule('unicode')} />
    </div>
  );
}

const DIACRITICS = ['´', '`', '^', '~', '¨'];

/** The shifted accent's choices: none, or any accent but the key's own. */
const NO_SHIFTED = 'none';

function DeadKeyBody({ fields: { view, set }, onChange, name }: BodyProps<'deadkey'>) {
  const shifted = DIACRITICS.filter((d) => d !== view.accent);
  return (
    <div className="space-y-2">
      <Row label="Accent">
        <Segment
          label={named(name, 'Accent the next letter takes')}
          options={DIACRITICS.map((d) => [d, d] as const)}
          value={DIACRITICS.includes(view.accent) ? view.accent : null}
          onChange={(accent) => onChange(set.accent(accent))}
        />
      </Row>
      <Row label="Shifted">
        <Segment
          label={named(name, 'Accent with shift')}
          options={[[NO_SHIFTED, 'None'] as const, ...shifted.map((d) => [d, d] as const)]}
          value={
            view.shifted === '' ? NO_SHIFTED : shifted.includes(view.shifted) ? view.shifted : null
          }
          onChange={(v) => onChange(set.shifted(v === NO_SHIFTED ? '' : v))}
        />
      </Row>
      <Note>
        Types nothing itself; the next letter comes out accented, with the shifted accent when shift
        is on.
      </Note>
    </div>
  );
}

function ImportedBody({ fields: { view } }: BodyProps<'imported'>) {
  return (
    <div className="space-y-1 text-xs">
      <p>
        <span className="font-mono">{view.label}</span>
        {view.source && <span className="opacity-60"> — {view.source}</span>}
      </p>
      <Note>
        Kept from the imported layout. LayerBench draws it and moves it with the rest, but it types
        nothing in the analysis. Pick a kind above to replace it.
      </Note>
    </div>
  );
}
