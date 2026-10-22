import {
  type Edit,
  exportKeymapDrawer,
  freeCondition,
  GEOMETRY_PRESET_IDS,
  LAYER_COLORS,
  type LayerColor,
  type LayoutFeatures,
  layerReachedFrom,
  reachKeys,
  type SpecialFeature,
  type SpecialFeatureKind,
  slug,
  specialFeatures,
  toCanonicalJson,
} from '@layerbench/core';
import { type Dispatch, type ReactNode, useId, useMemo, useState } from 'react';
import { layerColourOf } from '../../components/layer-colour.js';
import type { ProducerDTO } from '../../engine/protocol.js';
import { toast } from '../../state/toasts.js';
import {
  type BindingTextContext,
  bindingText,
  parseBindingText,
  roundTrips,
} from './binding-text.js';
import { LayerChips, Segment, TextField } from './inspector/controls.js';
import { type EditAction, type EditState, shownLayer } from './reducer.js';

type Send = Dispatch<EditAction>;

interface PanelProps {
  state: EditState;
  send: Send;
}

function FeatureRow({
  title,
  hint,
  on,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="rounded border border-base-300 p-3">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          aria-label={title}
          className="toggle toggle-sm mt-0.5"
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          <span className="font-medium text-sm">{title}</span>
          <span className="block text-[11px] opacity-70">{hint}</span>
        </span>
      </label>
      {on && children ? <div className="mt-2 pl-8">{children}</div> : null}
    </div>
  );
}

/**
 * Features: the typing behaviours a keymap would otherwise need extra layers for.
 *
 * Each wraps the key it belongs to — the space key, the shift key — in ordinary bindings, so the
 * layer list stays the set of layers a typist actually reaches. Adaptive keys and alt repeats are
 * not here: they are made on their keys, like any other kind of key.
 */
export function FeaturesPanel({ state, send }: PanelProps) {
  const f: LayoutFeatures = state.layout.features ?? {};
  const set = (next: LayoutFeatures) =>
    send({ type: 'edit', edit: { kind: 'setFeatures', features: next } });
  const enabled = (v: { enabled?: boolean } | undefined) => v !== undefined && v.enabled !== false;

  return (
    <div className="space-y-3">
      <p className="text-[11px] opacity-70">
        Firmware needs a pre-shifted copy of a layer to do these. Declared here they are what they
        are, and the layer list stays honest. Adaptive keys and alt repeats are made on the key,
        with its Adaptive or Alt repeat tile.
      </p>

      <FeatureRow
        title="Sentence case"
        hint="Capitalise the first letter after sentence-ending punctuation."
        on={enabled(f.sentenceCase)}
        onToggle={(on) => set({ ...f, sentenceCase: on ? {} : undefined })}
      >
        <label className="form-control">
          <span className="label-text text-xs">Ends a sentence</span>
          <input
            aria-label="Sentence-ending punctuation"
            className="input input-xs input-bordered w-40 font-mono"
            value={(f.sentenceCase?.after ?? ['.', '?', '!']).join(' ')}
            onChange={(e) =>
              set({
                ...f,
                sentenceCase: {
                  ...f.sentenceCase,
                  after: e.target.value.split(/\s+/).filter(Boolean),
                },
              })
            }
          />
        </label>
      </FeatureRow>

      <FeatureRow
        title="Caps word"
        hint="Capitals until the word ends, from pressing shift while shift is already on."
        on={enabled(f.capsWord)}
        onToggle={(on) => set({ ...f, capsWord: on ? {} : undefined })}
      >
        <label className="form-control">
          <span className="label-text text-xs">Does not end the word</span>
          <input
            aria-label="Caps word continue list"
            className="input input-xs input-bordered w-40 font-mono"
            value={(f.capsWord?.continueList ?? []).join(' ')}
            onChange={(e) =>
              set({
                ...f,
                capsWord: {
                  ...f.capsWord,
                  continueList: e.target.value.split(/\s+/).filter(Boolean),
                },
              })
            }
          />
        </label>
      </FeatureRow>
    </div>
  );
}

const COLOUR_NAMES: Record<LayerColor, string> = {
  blue: 'Blue',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  violet: 'Violet',
  teal: 'Teal',
  lime: 'Lime',
};

/**
 * The colour a layer is drawn in: Automatic, the one its place in the list gives it, or one of the
 * palette's, each tuned for both themes. The swatch shows the colour the layer has now.
 */
function LayerColourPicker({
  layerId,
  index,
  value,
  onChange,
}: {
  layerId: string;
  index: number;
  value: LayerColor | undefined;
  onChange: (color: LayerColor | undefined) => void;
}) {
  const shown = layerColourOf(index, value);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        aria-hidden="true"
        className="lb-layer-swatch"
        style={shown ? { background: shown } : undefined}
      />
      <select
        aria-label={`Colour of layer ${layerId}`}
        className="select select-xs select-ghost w-auto min-w-0"
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as LayerColor | undefined)}
      >
        <option value="">Automatic</option>
        {LAYER_COLORS.map((c) => (
          <option key={c} value={c}>
            {COLOUR_NAMES[c]}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * Layers: their names and their order. Order matters for one thing — when two layers are on at
 * once, a key comes from the one further down — and the base layer, which every key falls back to,
 * stays first. Dragging a row moves it; the arrows do the same without a pointer.
 */
export function LayersPanel({ state, send }: PanelProps) {
  const [newLayer, setNewLayer] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const layers = state.layout.layers;
  const nameOf = (i: number) => layers[i].name ?? layers[i].id;

  return (
    <div className="space-y-2">
      <p className="text-[11px] opacity-60">
        When two layers are on at once, a key comes from the one further down this list. The first
        is the base layer: every key falls back to it, so it stays first.
      </p>
      <ol className="space-y-1 list-none p-0 m-0" aria-label="Layer order">
        {layers.map((layer, i) => (
          <li
            key={layer.id}
            draggable={i > 0}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(i));
              e.dataTransfer.effectAllowed = 'move';
              setDragging(i);
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => {
              if (dragging !== null && i > 0) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData('text/plain'));
              setDragging(null);
              const moved = layers[from]?.id;
              if (Number.isInteger(from) && moved) {
                send({ type: 'edit', edit: { kind: 'moveLayer', layer: moved, to: i } });
              }
            }}
            className={`lb-layer-row rounded px-1 border border-transparent ${
              i > 0 ? 'hover:border-base-300' : ''
            } ${dragging === i ? 'opacity-50' : ''}`}
          >
            <span aria-hidden="true" className={i > 0 ? 'cursor-grab opacity-40' : 'opacity-0'}>
              ⠿
            </span>
            <div className="min-w-0">
              <TextField
                label={`Name of layer ${layer.id}`}
                value={layer.name ?? layer.id}
                className="input-xs w-full"
                mono={false}
                onCommit={(name) =>
                  send({ type: 'edit', edit: { kind: 'renameLayer', layer: layer.id, name } })
                }
              />
              <div className="lb-layer-meta">
                <TextField
                  label={`Id of layer ${nameOf(i)}`}
                  value={layer.id}
                  className="input-xs w-20 text-[10px]"
                  onCommit={(id) =>
                    send({ type: 'edit', edit: { kind: 'setLayerId', layer: layer.id, id } })
                  }
                />
                <LayerColourPicker
                  layerId={layer.id}
                  index={i}
                  value={layer.color}
                  onChange={(color) =>
                    send({ type: 'edit', edit: { kind: 'colorLayer', layer: layer.id, color } })
                  }
                />
              </div>
            </div>
            {/* Four slots in every row, so the buttons line up down the list. */}
            <div className="lb-layer-actions">
              {i === 0 ? (
                <span className="lb-layer-base badge badge-ghost badge-sm">base</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label={`Move ${nameOf(i)} up`}
                    disabled={i <= 1}
                    onClick={() =>
                      send({
                        type: 'edit',
                        edit: { kind: 'moveLayer', layer: layer.id, to: i - 1 },
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label={`Move ${nameOf(i)} down`}
                    disabled={i === layers.length - 1}
                    onClick={() =>
                      send({
                        type: 'edit',
                        edit: { kind: 'moveLayer', layer: layer.id, to: i + 1 },
                      })
                    }
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label={`Duplicate ${nameOf(i)}`}
                title="Duplicate"
                onClick={() =>
                  send({ type: 'edit', edit: { kind: 'duplicateLayer', layer: layer.id } })
                }
              >
                ⧉
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label={`Remove ${nameOf(i)}`}
                title={i === 0 ? 'The base layer cannot be removed' : 'Remove'}
                disabled={i === 0}
                // A layer still in use is refused with the keys that use it.
                onClick={() =>
                  send({ type: 'edit', edit: { kind: 'removeLayer', layer: layer.id } })
                }
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: 'edit', edit: { kind: 'addLayer', name: newLayer } });
          setNewLayer('');
        }}
      >
        <input
          aria-label="New layer name"
          placeholder="new layer"
          className="input input-xs input-bordered flex-1"
          value={newLayer}
          onChange={(e) => setNewLayer(e.target.value)}
        />
        <button type="submit" className="btn btn-xs">
          + layer
        </button>
      </form>

      <ConditionalLayers state={state} send={send} />
    </div>
  );
}

/**
 * Layers that come on by themselves while others are on, as ZMK's conditional layers: Extras while
 * Numbers and Symbols are both held. Each condition lists the layers it waits for, and the one it
 * brings on.
 */
function ConditionalLayers({ state, send }: PanelProps) {
  const layers = state.layout.layers;
  const conditions = state.layout.conditionalLayers ?? [];
  const base = layers[0]?.id ?? '';
  const others = layers.slice(1);
  const nameOf = (id: string) => layers.find((l) => l.id === id)?.name ?? id;
  const placeOf = (id: string) => layers.findIndex((l) => l.id === id);
  const edit = (e: Edit) => send({ type: 'edit', edit: e });
  const toggle = (list: readonly string[], id: string) =>
    list.includes(id) ? list.filter((l) => l !== id) : [...list, id];
  const free = freeCondition(state.layout);
  const noneFree = useId();
  return (
    <section className="space-y-2 pt-2" aria-label="Conditional layers">
      <h3 className="text-xs font-semibold">Conditional layers</h3>
      <p className="text-xs opacity-70">
        A layer that comes on by itself while every layer it waits for is on, as ZMK's conditional
        layers: Extras while Numbers and Symbols are both held.
      </p>
      {conditions.length > 0 && (
        <ol className="space-y-2">
          {conditions.map((c, i) => {
            // A layer later in the list is drawn over an earlier one, so one brought on before a
            // layer it waits for shows only where that layer's keys let it through.
            const over = c.if.filter((id) => placeOf(id) > placeOf(c.then));
            // A layer a condition brings on comes on no other way: what reaches it stops doing so.
            const reaching = layerReachedFrom(state.layout, c.then, { tested: false });
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: the place is what a row edits, and a key of its layers would change with each edit, the row losing focus
              <li key={i} className="space-y-1">
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span>while</span>
                  <LayerChips
                    compiled={state.compiled}
                    label={`Layers ${nameOf(c.then)} waits for`}
                    value={c.if}
                    omit={[base, c.then]}
                    onChange={(id) =>
                      edit({ kind: 'updateConditionalLayer', condition: i, if: toggle(c.if, id) })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span>bring on</span>
                  <select
                    aria-label={`Layer condition ${i + 1} brings on`}
                    className="select select-xs w-auto min-w-0"
                    value={c.then}
                    onChange={(e) =>
                      edit({ kind: 'updateConditionalLayer', condition: i, then: e.target.value })
                    }
                  >
                    {others.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name ?? l.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square ml-auto"
                    aria-label={`Remove the condition for ${nameOf(c.then)}`}
                    onClick={() => edit({ kind: 'removeConditionalLayer', condition: i })}
                  >
                    ✕
                  </button>
                </div>
                {over.length > 0 && (
                  <p className="text-xs text-warning">
                    {nameOf(c.then)} is above {over.map(nameOf).join(' and ')} in the list, so their
                    keys cover it: move it below them.
                  </p>
                )}
                {reaching.length > 0 && (
                  <p className="text-xs text-warning">
                    {nameOf(c.then)} comes on only by this condition, so these no longer bring it
                    on: {reaching.join(', ')}.
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        className="btn btn-xs"
        disabled={!free}
        aria-describedby={free ? undefined : noneFree}
        onClick={() => free && edit({ kind: 'addConditionalLayer', ...free })}
      >
        + condition
      </button>
      {!free && (
        <p id={noneFree} className="text-xs opacity-70">
          {others.length < 2
            ? 'A condition needs two layers besides the base one.'
            : 'Every layer besides the base one comes on by a condition or is waited for by one.'}
        </p>
      )}
    </section>
  );
}

/**
 * How the layout's one-shot layers or keys release: as soon as the next key goes down, whether a
 * modifier held meanwhile is let through, and after how long unused. A one-shot key of its own may
 * still say otherwise; the values shown are what the analysis uses.
 */
function OneShotDefaults({
  which,
  title,
  state: { layout, compiled },
  send,
}: PanelProps & { which: 'sl' | 'sk'; title: string }) {
  const shown = compiled.behaviorDefaults[which];
  const set = (field: 'quickRelease' | 'ignoreModifiers' | 'releaseAfterMs', value: unknown) =>
    send({
      type: 'edit',
      edit: {
        kind: 'setBehaviorDefaults',
        defaults: {
          ...layout.behaviorDefaults,
          [which]: { ...layout.behaviorDefaults?.[which], [field]: value },
        },
      },
    });
  return (
    <fieldset className="space-y-1" aria-label={title}>
      <legend className="label-text text-xs">{title}</legend>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={shown.quickRelease}
          onChange={(e) => set('quickRelease', e.target.checked)}
        />
        Release as the next key goes down
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={shown.ignoreModifiers}
          onChange={(e) => set('ignoreModifiers', e.target.checked)}
        />
        Stay on while a modifier is pressed
      </label>
      <label className="flex items-center gap-2 text-xs">
        Release after
        <input
          type="number"
          min={0}
          step={50}
          aria-label={`${title}: release after, in milliseconds`}
          className="input input-xs input-bordered w-20"
          value={shown.releaseAfterMs}
          onChange={(e) => {
            const ms = Number(e.target.value);
            if (Number.isFinite(ms) && ms >= 0) set('releaseAfterMs', ms);
          }}
        />
        ms
      </label>
    </fieldset>
  );
}

/** Geometry and the keys with a special role. */
export function GeometryPanel({ state, send }: PanelProps) {
  const { layout, compiled } = state;
  const preset = 'preset' in layout.geometry ? layout.geometry.preset : 'custom';
  return (
    <div className="space-y-3">
      <label className="form-control">
        <span className="label-text text-xs">Preset</span>
        <select
          aria-label="Geometry preset"
          className="select select-sm select-bordered"
          value={preset}
          disabled
        >
          {GEOMETRY_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
          {preset === 'custom' && <option value="custom">custom</option>}
        </select>
        <span className="text-[11px] opacity-60">
          Changing geometry moves every key, so it is done from the import in the library.
        </span>
      </label>

      <label className="form-control">
        <span className="label-text text-xs">Space key</span>
        <select
          aria-label="Space key"
          className="select select-sm select-bordered"
          value={layout.keys.space}
          onChange={(e) => send({ type: 'edit', edit: { kind: 'setKeys', space: e.target.value } })}
        >
          {compiled.keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.id}
            </option>
          ))}
        </select>
      </label>

      <label className="form-control">
        <span className="label-text text-xs">Shift key</span>
        <select
          aria-label="Shift key"
          className="select select-sm select-bordered"
          value={layout.keys.shift?.key ?? ''}
          onChange={(e) =>
            send({ type: 'edit', edit: { kind: 'setKeys', shift: e.target.value || null } })
          }
        >
          <option value="">—</option>
          {compiled.keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.id}
            </option>
          ))}
        </select>
      </label>

      <label className="form-control">
        <span className="label-text text-xs">Shift kind</span>
        <select
          aria-label="Shift kind"
          className="select select-sm select-bordered"
          value={layout.keys.shift?.kind ?? 'sk'}
          onChange={(e) =>
            send({
              type: 'edit',
              edit: { kind: 'setKeys', shiftKind: e.target.value as 'sk' | 'hold' },
            })
          }
        >
          <option value="sk">sticky (one-shot)</option>
          <option value="hold">hold</option>
        </select>
      </label>

      <label className="form-control">
        <span className="label-text text-xs">Doubled letters</span>
        <select
          aria-label="Doubled letters"
          className="select select-sm select-bordered"
          value={layout.repeatPolicy?.doubledLetters ?? 'repeatKey'}
          onChange={(e) =>
            send({
              type: 'edit',
              edit: { kind: 'setKeys', repeat: e.target.value as 'repeatKey' | 'tapTwice' },
            })
          }
        >
          <option value="repeatKey">repeat key</option>
          <option value="tapTwice">tap twice</option>
        </select>
      </label>

      <OneShotDefaults which="sl" title="One-shot layers" state={state} send={send} />
      <OneShotDefaults which="sk" title="One-shot keys" state={state} send={send} />
    </div>
  );
}

/**
 * A combo's output as a field to type in. It keeps its place, and the keyboard focus with it, when
 * an edit lands and the output is another; what is half-typed is only replaced then.
 */
function ComboOutput({
  name,
  text,
  exact,
  why,
  onChange,
  onCommit,
}: {
  name: string;
  text: string;
  exact: boolean;
  why?: string;
  onChange: () => void;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(text);
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    setSeen(text);
    setDraft(text);
  }
  return (
    <input
      aria-label={`Output of ${name}`}
      title={why}
      readOnly={!exact}
      className="input input-xs input-bordered font-mono w-full min-w-24"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange();
      }}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft);
      }}
    />
  );
}

/** Combos: chords that produce a symbol or a command. */
export function CombosPanel({ state, send }: PanelProps) {
  const [keys, setKeys] = useState('');
  const [output, setOutput] = useState('');
  const [role, setRole] = useState<'typing' | 'command'>('typing');
  const [error, setError] = useState<string | null>(null);
  const combos = state.layout.combos ?? [];
  const layerName = state.compiled.layers[state.layer].name;
  // The keys picked on the board belong to the add form, or to the one row being re-picked.
  const picking = state.comboPick !== null && state.comboPickFor === null;
  // While picking, the keys come off the board; otherwise they are typed as ids.
  const chosen = state.comboPick ?? [];

  const context: BindingTextContext = {
    layers: state.compiled.layers.map((l) => ({ id: l.id, name: l.name })),
    hostLocale: state.compiled.hostLocale,
  };

  /** A row's output typed in: another output lands as one edit, one the syntax cannot read does not. */
  const commitOutput = (combo: number, text: string, was: string) => {
    if (text === was) return;
    const parsed = parseBindingText(text, context);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    send({ type: 'edit', edit: { kind: 'updateCombo', combo, binding: parsed.binding } });
  };

  return (
    <div className="space-y-3">
      <section
        className="overflow-x-auto"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
        tabIndex={0}
        aria-label="Combos"
      >
        <table className="table table-xs">
          <thead>
            <tr>
              <th>Keys</th>
              <th>Output</th>
              <th>Layers</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {combos.map((c, i) => {
              const name = c.keys.join('+');
              const repicking = state.comboPick !== null && state.comboPickFor === i;
              const layerIds = c.layers ?? state.layout.layers.map((l) => l.id);
              const written = bindingText(state.compiled, c.binding);
              // Text that reads back as another binding would change it by being kept.
              const exact = written.exact && roundTrips(written.text, c.binding, context);
              const out = {
                ...written,
                exact,
                why: written.why ?? (exact ? undefined : 'it has more than the text can say'),
              };
              return (
                // By place: a custom layout can hold two combos under one id.
                // biome-ignore lint/suspicious/noArrayIndexKey: the place is what a row edits
                <tr key={i}>
                  <td className="font-mono">
                    {repicking ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <output aria-label={`Keys picked for ${name}`} className="text-xs">
                          {chosen.length > 0 ? chosen.join('+') : 'click the keys'}
                        </output>
                        <button
                          type="button"
                          className="btn btn-xs btn-primary"
                          aria-label={`Use the picked keys for ${name}`}
                          onClick={() =>
                            // The keys it already has are nothing to change: the pick just ends.
                            chosen.length === c.keys.length &&
                            chosen.every((k) => c.keys.includes(k))
                              ? send({ type: 'comboPickCancel' })
                              : send({
                                  type: 'edit',
                                  edit: { kind: 'updateCombo', combo: i, keys: chosen },
                                })
                          }
                        >
                          Use
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={() => send({ type: 'comboPickCancel' })}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          className="link link-hover"
                          aria-label={`Show the keys of ${name}`}
                          onClick={() =>
                            send({
                              type: 'setBoardHighlight',
                              keys: state.boardHighlight.length > 0 ? [] : c.keys,
                            })
                          }
                        >
                          {name}
                        </button>
                        <button
                          type="button"
                          className={`btn btn-xs ${state.combo === i ? 'btn-primary' : 'btn-ghost'}`}
                          aria-label={`Edit ${name}`}
                          aria-pressed={state.combo === i}
                          onClick={() => send({ type: 'selectCombo', combo: i })}
                        >
                          edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          aria-label={`Pick the keys of ${name} again on the board`}
                          onClick={() => send({ type: 'comboPickStart', combo: i })}
                        >
                          pick again
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <ComboOutput
                      // Another combo come to this row, as when one above it is removed, is a new field.
                      key={JSON.stringify([c.id, c.keys, c.layers])}
                      name={name}
                      text={out.text}
                      exact={out.exact}
                      why={out.why}
                      onChange={() => setError(null)}
                      onCommit={(text) => commitOutput(i, text, out.text)}
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {state.layout.layers.map((l) => (
                        <label key={l.id} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs"
                            aria-label={`${name} on ${l.name ?? l.id}`}
                            checked={layerIds.includes(l.id)}
                            onChange={(e) =>
                              send({
                                type: 'edit',
                                edit: {
                                  kind: 'updateCombo',
                                  combo: i,
                                  layers: e.target.checked
                                    ? state.layout.layers
                                        .map((x) => x.id)
                                        .filter((id) => id === l.id || layerIds.includes(id))
                                    : layerIds.filter((id) => id !== l.id),
                                },
                              })
                            }
                          />
                          {l.name ?? l.id}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`badge badge-xs ${c.role === 'typing' ? 'badge-primary' : ''}`}
                      // A combo that names no role is a command, as the compiler reads it.
                      aria-label={`Role of ${name}: ${c.role ?? 'command'}. Switch it`}
                      onClick={() =>
                        send({ type: 'edit', edit: { kind: 'toggleComboRole', combo: i } })
                      }
                    >
                      {c.role ?? 'command'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      aria-label={`Remove ${name}`}
                      onClick={() =>
                        send({ type: 'edit', edit: { kind: 'removeCombo', combo: i } })
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <form
        className="lb-combo-form"
        onSubmit={(e) => {
          e.preventDefault();
          const chosenKeys = picking
            ? chosen
            : keys
                .split(/[\s,+]+/)
                .filter(Boolean)
                .map((k) => k.toUpperCase());
          // No output yet is a combo that does nothing, given its kind in the combo editor it opens in.
          const parsed: ReturnType<typeof parseBindingText> =
            output.trim() === ''
              ? { ok: true, binding: { kind: 'none' } }
              : parseBindingText(output, context);
          if (!parsed.ok) {
            setError(parsed.error);
            return;
          }
          setError(null);
          send({
            type: 'edit',
            edit: {
              kind: 'addCombo',
              layer: shownLayer(state),
              keys: chosenKeys,
              binding: parsed.binding,
              role,
            },
          });
          setKeys('');
          setOutput('');
        }}
      >
        {/* Keys and output each take the width left beside their small companion. */}
        {picking ? (
          <output className="font-mono text-xs" aria-label="Combo keys picked">
            {chosen.length > 0 ? chosen.join('+') : 'click the keys'}
          </output>
        ) : (
          <input
            aria-label="Combo keys"
            placeholder="Keys: LHR+LHM"
            className="input input-xs input-bordered font-mono w-full"
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
          />
        )}
        <button
          type="button"
          className={`btn btn-xs ${picking ? 'btn-primary' : ''}`}
          onClick={() => send({ type: picking ? 'comboPickCancel' : 'comboPickStart' })}
        >
          {picking ? 'picking on board…' : 'pick on board'}
        </button>
        <input
          aria-label="Combo output"
          placeholder="Output: q, &macro ão, or none yet"
          className="input input-xs input-bordered font-mono w-full"
          value={output}
          onChange={(e) => {
            setOutput(e.target.value);
            setError(null);
          }}
        />
        <select
          aria-label="Combo role"
          className="select select-xs select-bordered"
          value={role}
          onChange={(e) => setRole(e.target.value as 'typing' | 'command')}
        >
          <option value="typing">typing</option>
          <option value="command">command</option>
        </select>
        <button type="submit" className="lb-wide btn btn-xs btn-primary">
          Add combo on {layerName}
        </button>
      </form>
      {error && <p className="text-error text-xs">{error}</p>}
      <p className="text-[11px] opacity-60">
        Only combos with the typing role are offered to the simulator as a way to produce a symbol.
      </p>
    </div>
  );
}

/** Behaviors: the layout's special features. */
export function BehaviorsPanel({
  state,
  send,
  onShow,
}: PanelProps & {
  /** Before a feature is shown on the board: a word playing there would hide it. */
  onShow?: () => void;
}) {
  return <SpecialFeatureList state={state} send={send} onShow={onShow} />;
}

/** Each kind of special feature, in the order the panel lists them, and what its group is called. */
const FEATURE_GROUPS: [SpecialFeatureKind, string][] = [
  ['adaptive', 'Adaptive keys'],
  ['alt_repeat', 'Alt repeats'],
  ['macro', 'Macros'],
  ['mod_morph', 'Mod morphs'],
];

/**
 * The layout's special features, one group each: every use names its layer and key, or its combo,
 * and picking it shows it on the board — the key selected on its layer, or the combo's keys
 * outlined.
 */
function SpecialFeatureList({ state, send, onShow }: PanelProps & { onShow?: () => void }) {
  const features = useMemo(() => specialFeatures(state.layout), [state.layout]);
  const { compiled } = state;
  const show = (f: SpecialFeature) => {
    onShow?.();
    // Whatever the board is doing gives way: a pick of a combo's keys would keep its clicks, and an
    // armed swap or an open combo would add their keys to the outline.
    send({ type: 'comboPickCancel' });
    send({ type: 'cancelSwap' });
    if (f.combo !== undefined) {
      send({ type: 'selectCombo', combo: null });
      const combo = f.comboIndex === undefined ? undefined : state.layout.combos?.[f.comboIndex];
      send({ type: 'setBoardHighlight', keys: combo?.keys ?? [] });
      return;
    }
    const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
    if (layer === undefined || f.key === undefined) return;
    send({ type: 'setBoardHighlight', keys: [] });
    send({ type: 'selectLayer', layer });
    send({ type: 'keyClick', keyId: f.key });
  };
  const placeOf = (f: SpecialFeature) => {
    if (f.combo !== undefined) return `Combo ${f.combo}`;
    const layer = f.layer === undefined ? undefined : compiled.layerIndex.get(f.layer);
    return `${layer === undefined ? f.layer : compiled.layers[layer].name} · ${f.key}`;
  };

  if (features.length === 0) {
    return <p className="text-xs opacity-70">This layout has no special features.</p>;
  }
  return (
    <section className="space-y-3" aria-label="Special features">
      {FEATURE_GROUPS.map(([kind, title]) => {
        const group = features.filter((f) => f.feature === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind} className="space-y-1">
            <h3 className="text-xs font-semibold">
              {title} <span className="font-normal opacity-60">({group.length})</span>
            </h3>
            <ul className="flex flex-wrap gap-1" aria-label={title}>
              {group.map((f, i) => {
                const current =
                  f.combo === undefined &&
                  state.selected === f.key &&
                  compiled.layers[state.layer]?.id === f.layer;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: one key can hold a feature twice
                  <li key={`${f.layer}-${f.key}-${f.combo}-${f.label}-${i}`}>
                    <button
                      type="button"
                      className={`btn btn-xs gap-1 ${current ? 'btn-primary' : 'btn-ghost border-base-300'}`}
                      aria-current={current ? 'true' : undefined}
                      onClick={() => show(f)}
                    >
                      <span className="font-mono">{placeOf(f)}</span>
                      <span className="opacity-70">{f.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/** Typing paths: which producer wins when a symbol can be typed more than one way. */
export function PathsPanel({
  state,
  send,
  producers,
}: PanelProps & { producers: Record<string, ProducerDTO[]> }) {
  // Which chip is in flight, as `symbol:index`, so a drag cannot cross from one symbol to another.
  const [dragging, setDragging] = useState<string | null>(null);

  const multi = Object.entries(producers)
    .filter(([symbol, list]) => symbol !== '' && list.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  if (multi.length === 0) {
    return <p className="text-sm opacity-70">Every symbol has a single producer.</p>;
  }

  const pathsFor = (symbol: string) => {
    const declared = state.layout.typingPaths?.[symbol];
    if (declared && declared.length > 0) return declared;
    return (producers[symbol] ?? []).map((p) => ({ producer: p.id, enabled: true }));
  };

  /** Send the whole list back, with one entry moved from `from` to `to`. */
  const reorder = (symbol: string, from: number, to: number) => {
    const entries = [...pathsFor(symbol)];
    if (from === to || to < 0 || to >= entries.length) return;
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
    send({ type: 'edit', edit: { kind: 'setTypingPath', symbol, entries } });
  };

  const toggle = (symbol: string, producer: string) => {
    const entries = pathsFor(symbol).map((e) =>
      e.producer === producer ? { ...e, enabled: !(e.enabled ?? true) } : e,
    );
    send({ type: 'edit', edit: { kind: 'setTypingPath', symbol, entries } });
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] opacity-60">
        Left alone, a character is typed the cheapest way: the fewest presses, then the fewest
        same-finger pairs with the keys before it, then the least effort. Drag an alternative or use
        the arrows to set an order, and that order is tried instead.
      </p>
      {multi.map(([symbol]) => (
        <div key={symbol} className="space-y-1">
          <h3 className="font-mono text-sm">{symbol === ' ' ? '␣' : symbol}</h3>
          <ol className="space-y-1">
            {pathsFor(symbol).map((entry, i, all) => {
              const meta = producers[symbol]?.find((p) => p.id === entry.producer);
              const enabled = entry.enabled ?? true;
              return (
                <li
                  key={entry.producer}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(i));
                    e.dataTransfer.effectAllowed = 'move';
                    setDragging(`${symbol}:${i}`);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => {
                    if (dragging?.startsWith(`${symbol}:`)) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    setDragging(null);
                    if (Number.isInteger(from)) reorder(symbol, from, i);
                  }}
                  className={`flex items-center gap-2 text-xs rounded px-1 cursor-grab border border-transparent hover:border-base-300 ${
                    enabled ? '' : 'opacity-40'
                  } ${dragging === `${symbol}:${i}` ? 'opacity-50' : ''}`}
                >
                  <span aria-hidden="true" className="opacity-40">
                    ⠿
                  </span>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    aria-label={`Use ${entry.producer}`}
                    checked={enabled}
                    onChange={() => toggle(symbol, entry.producer)}
                  />
                  <span className="font-mono flex-1 truncate">
                    {meta
                      ? `${meta.kind} · ${entry.producer} · ${meta.cost} presses`
                      : entry.producer}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label={`Move ${entry.producer} up`}
                    disabled={i === 0}
                    onClick={() => reorder(symbol, i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label={`Move ${entry.producer} down`}
                    disabled={i === all.length - 1}
                    onClick={() => reorder(symbol, i, i + 1)}
                  >
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** JSON: the document itself, for reading and for pasting one in — or as keymap-drawer draws it. */
export function JsonPanel({ state, send }: PanelProps) {
  const [format, setFormat] = useState<'json' | 'yaml'>('json');
  const text = state.jsonText || JSON.stringify(toCanonicalJson(state.layout), null, 2);
  return (
    <div className="space-y-2">
      <Segment
        label="Format"
        options={[
          ['json', 'LayerBench JSON'],
          ['yaml', 'keymap-drawer YAML'],
        ]}
        value={format}
        onChange={setFormat}
      />
      {format === 'yaml' ? (
        <KeymapDrawerExport state={state} />
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: 'edit', edit: { kind: 'replaceLayout', json: text } });
          }}
        >
          <textarea
            wrap="off"
            aria-label="Layout JSON"
            rows={16}
            className="textarea textarea-bordered w-full font-mono text-xs"
            value={text}
            onChange={(e) => send({ type: 'jsonChange', text: e.target.value })}
          />
          {state.jsonError && <p className="text-error text-xs">{state.jsonError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => send({ type: 'jsonChange', text: '' })}
            >
              Refresh from editor
            </button>
            <button type="submit" className="btn btn-sm btn-primary">
              Load into editor
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * The layout as a keymap-drawer file, to draw it with keymap-drawer or to bring it back later. It
 * is a drawing: what a legend cannot say, such as an adaptive key's branches, is drawn and not
 * written.
 */
function KeymapDrawerExport({ state }: { state: EditState }) {
  const { compiled, layout } = state;
  const yaml = useMemo(() => {
    // The keys that reach each layer, which the file marks `held` there as keymap-drawer does. A
    // key on the layer itself that turns it on again is pressed there, not held to get there.
    const reach = compiled.layers.map(
      (l) =>
        new Set(
          reachKeys(compiled, l.idx)
            .filter((k) => k.routes.some((r) => r.via !== l.idx))
            .map((k) => compiled.keys[k.pos].id),
        ),
    );
    return exportKeymapDrawer(
      layout,
      { keys: compiled.keys, family: compiled.geometry.family },
      (li, id) => compiled.layers[li]?.bindings[compiled.keyIndex.get(id) ?? -1],
      (li, id) => reach[li]?.has(id) ?? false,
    );
  }, [layout, compiled]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([yaml], { type: 'application/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(layout.name) || 'layout'}.keymap.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-2">
      <textarea
        wrap="off"
        aria-label="keymap-drawer YAML"
        readOnly
        rows={16}
        className="textarea textarea-bordered w-full font-mono text-xs"
        value={yaml}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            navigator.clipboard
              ?.writeText(yaml)
              .then(() => toast.info('Copied the keymap-drawer YAML'))
              .catch(() => toast.error('The browser would not copy; select the text instead'))
          }
        >
          Copy
        </button>
        <button type="button" className="btn btn-sm" onClick={download}>
          Download .yaml
        </button>
      </div>
      <p className="text-[11px] opacity-60">
        Draw it with <span className="font-mono">keymap draw</span>. Keys whose legends cannot say
        everything they do come back from this file simpler: an adaptive key as a plain key typing
        its default, a macro as the text it types, without its other steps.
      </p>
    </div>
  );
}
