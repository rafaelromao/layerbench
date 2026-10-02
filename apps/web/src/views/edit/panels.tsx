import {
  exportKeymapDrawer,
  GEOMETRY_PRESET_IDS,
  type LayoutFeatures,
  layerReachedFrom,
  slug,
  tapLabel,
  toCanonicalJson,
} from '@layoutmaster/core';
import { type Dispatch, type ReactNode, useMemo, useState } from 'react';
import type { ProducerDTO } from '../../engine/protocol.js';
import { toast } from '../../state/toasts.js';
import { bindingFromFields } from './binding-form.js';
import { type BindingTextContext, parseBindingText } from './binding-text.js';
import { Segment, TextField } from './inspector/controls.js';
import type { EditAction, EditState } from './reducer.js';

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
 * layer list stays the set of layers a typist actually reaches. Magic keys and alt repeats are not
 * here: they are made on their keys, like any other kind of key.
 */
export function FeaturesPanel({ state, send }: PanelProps) {
  const f: LayoutFeatures = state.layout.features ?? {};
  const set = (next: LayoutFeatures) => send({ type: 'setFeatures', features: next });
  const enabled = (v: { enabled?: boolean } | undefined) => v !== undefined && v.enabled !== false;

  return (
    <div className="space-y-3">
      <p className="text-[11px] opacity-70">
        Firmware needs a pre-shifted copy of a layer to do these. Declared here they are what they
        are, and the layer list stays honest. Magic keys and alt repeats are made on the key: Magic,
        or Alt repeat under More.
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
              if (Number.isInteger(from)) send({ type: 'moveLayer', from, to: i });
            }}
            className={`lm-layer-row rounded px-1 border border-transparent ${
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
                onCommit={(name) => send({ type: 'renameLayer', id: layer.id, name })}
              />
              <span className="block truncate font-mono text-[10px] opacity-60">{layer.id}</span>
            </div>
            {/* Four slots in every row, so the buttons line up down the list. */}
            <div className="lm-layer-actions">
              {i === 0 ? (
                <span className="lm-layer-base badge badge-ghost badge-sm">base</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label={`Move ${nameOf(i)} up`}
                    disabled={i <= 1}
                    onClick={() => send({ type: 'moveLayer', from: i, to: i - 1 })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label={`Move ${nameOf(i)} down`}
                    disabled={i === layers.length - 1}
                    onClick={() => send({ type: 'moveLayer', from: i, to: i + 1 })}
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
                onClick={() => send({ type: 'duplicateLayer', id: layer.id })}
              >
                ⧉
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label={`Remove ${nameOf(i)}`}
                title={i === 0 ? 'The base layer cannot be removed' : 'Remove'}
                disabled={i === 0}
                onClick={() => {
                  // A layer still in use is refused with the keys that use it; only a removal
                  // that lands is worth a message.
                  const blocked = layerReachedFrom(state.layout, layer.id).length > 0;
                  send({ type: 'removeLayer', id: layer.id });
                  if (!blocked) toast.info(`Removed ${nameOf(i)} — Undo brings it back`);
                }}
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
          send({ type: 'addLayer', name: newLayer });
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
    </div>
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
          onChange={(e) => send({ type: 'setKeys', space: e.target.value })}
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
          onChange={(e) => send({ type: 'setKeys', shift: e.target.value || null })}
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
          onChange={(e) => send({ type: 'setKeys', shiftKind: e.target.value as 'sk' | 'hold' })}
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
            send({ type: 'setKeys', repeat: e.target.value as 'repeatKey' | 'tapTwice' })
          }
        >
          <option value="repeatKey">repeat key</option>
          <option value="tapTwice">tap twice</option>
        </select>
      </label>
    </div>
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
  const picking = state.comboPick !== null;
  // While picking, the keys come off the board; otherwise they are typed as ids.
  const chosen = picking ? (state.comboPick ?? []) : [];

  const context: BindingTextContext = {
    layers: state.compiled.layers.map((l) => ({ id: l.id, name: l.name })),
    behaviors: Object.keys(state.layout.behaviors ?? {}),
    hostLocale: state.compiled.hostLocale,
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
            {combos.map((c) => (
              <tr key={c.id}>
                <td className="font-mono">
                  <button
                    type="button"
                    className="link link-hover"
                    aria-label={`Show the keys of ${c.keys.join('+')}`}
                    onClick={() =>
                      send({
                        type: 'setBoardHighlight',
                        keys: state.boardHighlight.length > 0 ? [] : c.keys,
                      })
                    }
                  >
                    {c.keys.join('+')}
                  </button>
                </td>
                <td className="font-mono">{tapLabel(state.compiled, c.binding)}</td>
                <td className="text-xs opacity-70">{(c.layers ?? []).join(', ') || 'all'}</td>
                <td>
                  <button
                    type="button"
                    className={`badge badge-xs ${c.role === 'typing' ? 'badge-primary' : ''}`}
                    onClick={() => send({ type: 'toggleComboRole', id: c.id as string })}
                  >
                    {c.role}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => send({ type: 'removeCombo', id: c.id as string })}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form
        className="lm-combo-form"
        onSubmit={(e) => {
          e.preventDefault();
          const chosenKeys = picking
            ? chosen
            : keys
                .split(/[\s,+]+/)
                .filter(Boolean)
                .map((k) => k.toUpperCase());
          const binding = parseBindingText(output, context);
          if (!binding.ok) {
            setError(binding.error);
            return;
          }
          setError(null);
          send({
            type: 'addCombo',
            keys: chosenKeys,
            binding: bindingFromFields(binding.fields),
            role,
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
          placeholder="Output: q, &macro ão"
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
        <button type="submit" className="lm-wide btn btn-xs btn-primary">
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

/** Behaviors: the named bindings that keys refer to. */
export function BehaviorsPanel({ state, send }: PanelProps) {
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        send({ type: 'behaviorsApply', json: state.behaviorsJson });
      }}
    >
      <p className="text-xs opacity-70">
        Named bindings such as adaptive keys and mod-morphs. Keys reach them with a reference.
      </p>
      <textarea
        aria-label="Behaviors"
        rows={14}
        className="textarea textarea-bordered w-full font-mono text-xs"
        value={state.behaviorsJson}
        onChange={(e) => send({ type: 'behaviorsChange', json: e.target.value })}
      />
      {state.behaviorsError && <p className="text-error text-xs">{state.behaviorsError}</p>}
      <button type="submit" className="btn btn-sm">
        Apply behaviors
      </button>
    </form>
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
    send({ type: 'pathSet', symbol, entries });
  };

  const toggle = (symbol: string, producer: string) => {
    send({
      type: 'pathSet',
      symbol,
      entries: pathsFor(symbol).map((e) =>
        e.producer === producer ? { ...e, enabled: !(e.enabled ?? true) } : e,
      ),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] opacity-60">
        The order is the order the simulator tries. Drag an alternative to move it, or use the
        arrows.
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
          ['json', 'LayoutMaster JSON'],
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
            send({ type: 'importJson', text });
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
 * is a drawing: what a legend cannot say, such as a magic key's branches, is drawn and not written.
 */
function KeymapDrawerExport({ state }: { state: EditState }) {
  const { compiled, layout } = state;
  const yaml = useMemo(
    () =>
      exportKeymapDrawer(
        layout,
        { keys: compiled.keys, family: compiled.geometry.family },
        (li, id) => compiled.layers[li]?.bindings[compiled.keyIndex.get(id) ?? -1],
        (li, id) => compiled.layers[li]?.explicit[compiled.keyIndex.get(id) ?? -1] ?? false,
      ),
    [layout, compiled],
  );
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
        everything they do — magic keys, macros built from steps — come back from this file as
        imported keys.
      </p>
    </div>
  );
}
