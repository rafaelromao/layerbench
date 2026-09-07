import { GEOMETRY_PRESET_IDS, type Layout, tapLabel, toCanonicalJson } from '@layoutmaster/core';
import { type Dispatch, useEffect, useState } from 'react';
import type { ProducerDTO } from '../../engine/protocol.js';
import {
  type BindingFields,
  bindingFromFields,
  EDITABLE_KINDS,
  fieldsFromBinding,
} from './binding-form.js';
import type { EditAction, EditState } from './reducer.js';
import { MODS } from './reducer.js';

type Send = Dispatch<EditAction>;

interface PanelProps {
  state: EditState;
  send: Send;
}

/** Key: what the selected key does, and how to change it. */
export function BindingPanel({ state, send }: PanelProps) {
  const { compiled, selected, layer } = state;
  const pos = selected ? compiled.keyIndex.get(selected) : undefined;
  const current = pos === undefined ? undefined : compiled.layers[layer].bindings[pos];
  const [fields, setFields] = useState<BindingFields>(() => fieldsFromBinding(current));

  // Selecting another key starts the form from that key's binding.
  useEffect(() => {
    setFields(fieldsFromBinding(current));
  }, [current]);

  if (!selected) return <p className="text-sm opacity-70">Select a key on the keyboard.</p>;

  const set = (patch: Partial<BindingFields>) => setFields((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-neutral font-mono">{selected}</span>
        <span className="text-xs opacity-70">
          layer {compiled.layers[layer].name} · current{' '}
          {current ? tapLabel(compiled, current) || '·' : '·'}
        </span>
        <button
          type="button"
          className="btn btn-xs"
          onClick={() => send({ type: state.swapFrom ? 'cancelSwap' : 'startSwap' })}
        >
          {state.swapFrom ? 'click target key…' : 'swap with…'}
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          onClick={() => send({ type: 'clearBinding' })}
        >
          clear
        </button>
      </div>

      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: 'setBinding', binding: bindingFromFields(fields) });
        }}
      >
        <label className="form-control">
          <span className="label-text text-xs">Kind</span>
          <select
            aria-label="Binding kind"
            className="select select-sm select-bordered"
            value={fields.kind}
            onChange={(e) => set({ kind: e.target.value as BindingFields['kind'] })}
          >
            {EDITABLE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Symbol / macro text</span>
          <input
            aria-label="Symbol"
            className="input input-sm input-bordered font-mono"
            value={fields.symbol}
            onChange={(e) => set({ symbol: e.target.value })}
          />
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Shifted symbol</span>
          <input
            aria-label="Shifted symbol"
            className="input input-sm input-bordered font-mono"
            value={fields.shifted}
            onChange={(e) => set({ shifted: e.target.value })}
          />
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Layer</span>
          <select
            aria-label="Layer for this binding"
            className="select select-sm select-bordered"
            value={fields.layer}
            onChange={(e) => set({ layer: e.target.value })}
          >
            <option value="">—</option>
            {compiled.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Arm layer after macro</span>
          <select
            aria-label="Layer armed after the macro"
            className="select select-sm select-bordered"
            value={fields.thenLayer}
            onChange={(e) => set({ thenLayer: e.target.value })}
          >
            <option value="">—</option>
            {compiled.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Modifier</span>
          <select
            aria-label="Modifier"
            className="select select-sm select-bordered"
            value={fields.mod}
            onChange={(e) => set({ mod: e.target.value as BindingFields['mod'] })}
          >
            {MODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control col-span-2">
          <span className="label-text text-xs">Behavior reference</span>
          <select
            aria-label="Behavior"
            className="select select-sm select-bordered"
            value={fields.ref}
            onChange={(e) => set({ ref: e.target.value })}
          >
            <option value="">—</option>
            {Object.keys(state.layout.behaviors ?? {}).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="btn btn-sm btn-primary col-span-2">
          Apply to {selected}
        </button>
      </form>
    </div>
  );
}

/** Layers: rename, pair with a shifted twin, add and remove. */
export function LayersPanel({ state, send }: PanelProps) {
  const [newLayer, setNewLayer] = useState('');
  return (
    <div className="space-y-2">
      {state.layout.layers.map((layer) => (
        <div key={layer.id} className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`Name of layer ${layer.id}`}
            className="input input-xs input-bordered w-32"
            value={layer.name}
            onChange={(e) => send({ type: 'renameLayer', id: layer.id, name: e.target.value })}
          />
          <select
            aria-label={`Shifted twin of ${layer.name}`}
            className="select select-xs select-bordered"
            value={layer.shiftedTwin ?? ''}
            onChange={(e) => send({ type: 'setTwin', id: layer.id, twin: e.target.value || null })}
          >
            <option value="">—</option>
            {state.layout.layers
              .filter((l) => l.id !== layer.id)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
          <span className="font-mono text-xs opacity-60 w-20 truncate">{layer.id}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              if (window.confirm('Remove this layer?')) send({ type: 'removeLayer', id: layer.id });
            }}
          >
            ✕
          </button>
        </div>
      ))}

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
  const [symbol, setSymbol] = useState('');
  const [role, setRole] = useState<'typing' | 'command'>('typing');
  const combos = state.layout.combos ?? [];
  const layerName = state.compiled.layers[state.layer].name;

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
                <td className="font-mono">{c.keys.join('+')}</td>
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
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send({
            type: 'addCombo',
            keys: keys
              .split(/[\s,+]+/)
              .filter(Boolean)
              .map((k) => k.toUpperCase()),
            symbol,
            role,
          });
          setKeys('');
          setSymbol('');
        }}
      >
        <input
          aria-label="Combo keys"
          placeholder="Keys (e.g. LHR+LHM)"
          className="input input-xs input-bordered font-mono"
          value={keys}
          onChange={(e) => setKeys(e.target.value)}
        />
        <input
          aria-label="Combo output"
          placeholder="Output"
          className="input input-xs input-bordered font-mono w-20"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
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
        <button type="submit" className="btn btn-xs">
          Add combo on {layerName}
        </button>
      </form>
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

  return (
    <div className="space-y-3">
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
                  className={`flex items-center gap-2 text-xs ${enabled ? '' : 'opacity-40'}`}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    aria-label={`Use ${entry.producer}`}
                    checked={enabled}
                    onChange={() => send({ type: 'pathToggle', symbol, producer: entry.producer })}
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
                    onClick={() =>
                      send({ type: 'pathMove', symbol, producer: entry.producer, direction: 'up' })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label={`Move ${entry.producer} down`}
                    disabled={i === all.length - 1}
                    onClick={() =>
                      send({
                        type: 'pathMove',
                        symbol,
                        producer: entry.producer,
                        direction: 'down',
                      })
                    }
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

/** JSON: the document itself, for reading and for pasting one in. */
export function JsonPanel({ state, send }: PanelProps) {
  const text = state.jsonText || JSON.stringify(toCanonicalJson(state.layout), null, 2);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        send({ type: 'importJson', text });
      }}
    >
      <textarea
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
  );
}

/** Save: name the layout and store it. */
export function SavePanel({ layout, onSave }: { layout: Layout; onSave: (name: string) => void }) {
  const [name, setName] = useState(layout.name);
  useEffect(() => setName(layout.name), [layout.name]);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <label className="form-control">
        <span className="label-text text-xs">Name</span>
        <input
          aria-label="Layout name"
          className="input input-sm input-bordered"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-sm btn-primary">
        Save to library
      </button>
      <p className="text-[11px] opacity-60">
        Saved layouts appear in the library and are referenced in links as saved:&lt;id&gt;.
      </p>
    </form>
  );
}
