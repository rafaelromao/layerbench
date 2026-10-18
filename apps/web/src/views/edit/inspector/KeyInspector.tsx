import {
  type Binding,
  describeReach,
  keyBinding,
  type LayoutFeatures,
  legend,
  reachKeys,
} from '@layerbench/core';
import { type Dispatch, useMemo } from 'react';
import { HelpLink } from '../../../components/HelpLink.js';
import { HELP } from '../../../guide/help.js';
import type { EditAction, EditState } from '../reducer.js';
import { BindingEditor } from './bodies.js';
import { Note } from './controls.js';
import { FeatureBody, featureTitle, withoutFeatureAt } from './features.js';
import { kindInfo, kindOf } from './kinds.js';
import { SelectionInspector } from './SelectionInspector.js';
import { FromThisLayout, useEditorScope } from './shared.js';
import { BindingTextLine } from './TextLine.js';

export interface KeyInspectorProps {
  state: EditState;
  send: Dispatch<EditAction>;
  /** Hand keyboard focus back to a key on the board. */
  focusKey: (keyId: string) => void;
}

/**
 * Everything about the selected key, in one place that is the same on a phone and at a desk: what
 * the key is, the controls for that kind of key, the keys the layout already has to reuse, the
 * binding as text for typing, and what can be done with the key as a whole.
 */
export function KeyInspector(props: KeyInspectorProps) {
  const { state } = props;
  // Several keys: what can be done to them together, rather than the editor of one.
  if (state.selected !== null && state.also.length > 0) {
    return <SelectionInspector state={state} send={props.send} focusKey={props.focusKey} />;
  }
  if (state.selected === null || !state.compiled.keyIndex.has(state.selected)) {
    return (
      <section className="lb-inspector lb-inspector-empty card bg-base-100 border border-base-300">
        <div className="card-body p-3 gap-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Key</h2>
            <HelpLink help={HELP.editKey} />
          </div>
          <p className="text-xs opacity-70">
            Tap or click a key on the board to edit it. Drag a key onto another to swap the two —
            hold Alt to copy instead. To send a key to another layer, select it and use Send to
            layer…. Shift-click keys, or rest a finger on them, to select several and send, copy or
            clear them together.
          </p>
          <p className="text-xs opacity-70 lb-pointer-hint">
            On a focused key, typing sets it — <span className="font-mono">ç</span>,{' '}
            <span className="font-mono">&amp;lt nav a</span> — Delete makes it do nothing, and the
            arrow keys move between keys.
          </p>
        </div>
      </section>
    );
  }
  // Remounts per key and layer, so a half-typed field never follows the selection to another key.
  const id = state.selected;
  return <Inspector key={`${state.layer}:${id}`} {...props} keyId={id} />;
}

function Inspector({ state, send, focusKey, keyId }: KeyInspectorProps & { keyId: string }) {
  const { compiled, layout, layer } = state;
  const activeLayer = compiled.layers[layer];
  const pos = compiled.keyIndex.get(keyId) as number;
  const drawn = activeLayer.bindings[pos];
  const shown = legend(compiled, drawn);
  const authored = keyBinding(layout, layer, keyId);
  // A key with nothing of its own takes the layer's default, which is what editing starts from.
  const fallback: Binding =
    layout.layers[layer]?.bindings['*'] ?? (layer === 0 ? { kind: 'none' } : { kind: 'trans' });
  const current = authored ?? fallback;
  // Sentence case and caps word wrap the tap of the key they belong to; such a key is edited as
  // its feature, since the next compile would wrap anything written on the key again.
  const owner = compiled.featureOwned.get(activeLayer.id)?.get(keyId);
  const scope = useEditorScope(compiled, layout, send);
  const text = scope.text;
  // How this key brings the layer on, said where a phone user can read it.
  const reach = useMemo(() => {
    const k = reachKeys(compiled, layer).find((x) => x.pos === pos);
    if (!k) return null;
    const text = describeReach(compiled, layer, k);
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  }, [compiled, layer, pos]);

  const commit = (binding: Binding) => {
    // A change that changes nothing gives the key's binding back, and is no edit: it would mark
    // the layout unsaved and leave a step to undo for nothing.
    if (binding === current) return;
    send({
      type: 'edit',
      edit: { kind: 'bind', layer: activeLayer.id, keys: [keyId], binding },
      say: `${keyId} set to ${legend(compiled, binding).tap || 'nothing'}`,
    });
  };
  const setFeatures = (features: LayoutFeatures, say?: string) =>
    send({ type: 'edit', edit: { kind: 'setFeatures', features }, say });
  // A cleared key does nothing: it does not fall back to the layer's default, which above the base
  // would let the key below show through.
  const clear = () =>
    send({
      type: 'edit',
      edit: { kind: 'bind', layer: activeLayer.id, keys: [keyId], binding: { kind: 'none' } },
      say: `${keyId} cleared`,
    });
  const otherLayers = compiled.layers.filter((l) => l.idx !== layer);

  return (
    <fieldset
      className="lb-inspector card bg-base-100 border border-base-300 min-w-0"
      aria-label={`Edit ${keyId}`}
    >
      <div className="card-body p-3 gap-3 min-w-0">
        <header className="flex items-start gap-3">
          <div className="lb-inspector-cap" aria-hidden="true">
            <span className="lb-inspector-cap-tap">{shown.tap || '·'}</span>
            {shown.hold && <span className="lb-inspector-cap-hold">{shown.hold}</span>}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="badge badge-neutral badge-sm font-mono">{keyId}</span>
              <span className="opacity-70">{activeLayer.name}</span>
              <span className="opacity-70">
                {owner ? featureTitle(owner) : kindInfo(kindOf(authored)).label}
                {authored === undefined && !owner ? ' · layer default' : ''}
              </span>
            </p>
            <p className="text-xs opacity-80">{shown.detail}</p>
            {reach && <p className="text-xs opacity-80">{reach}</p>}
          </div>
          <HelpLink help={owner ? HELP.features : HELP.editKey} className="mt-2" />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            aria-label="Close the key editor"
            onClick={() => {
              send({ type: 'deselect' });
              focusKey(keyId);
            }}
          >
            ✕
          </button>
        </header>

        {owner ? (
          <>
            <div className="rounded-box bg-base-200 p-2 text-xs">
              This key's tap is wrapped by <strong>{featureTitle(owner)}</strong> (
              <span className="font-mono">{owner}</span>), which the layout turns on in Features.
            </div>
            <FeatureBody layout={layout} feature={owner} setFeatures={setFeatures} />
            <details className="text-xs">
              <summary className="cursor-pointer opacity-70">The key under the feature</summary>
              <div className="pt-2 space-y-2">
                <Note>The feature wraps what this key taps; the rest of it is set here.</Note>
                <BindingEditor scope={scope} value={current} onChange={commit} />
              </div>
            </details>
          </>
        ) : (
          <>
            <BindingEditor scope={scope} value={current} onChange={commit} />

            <FromThisLayout compiled={compiled} layout={layout} onPick={commit} />

            <BindingTextLine
              compiled={compiled}
              keyId={keyId}
              binding={authored}
              ctx={text}
              focusRequest={state.focusRequest}
              onCommit={commit}
              onClear={clear}
              onDone={() => focusKey(keyId)}
            />
          </>
        )}

        <div className="lb-key-actions border-t border-base-300 pt-2">
          <button
            type="button"
            className={`btn btn-xs ${state.swapFrom === keyId && state.swapMode === 'swap' ? 'btn-primary' : ''}`}
            onClick={() => send({ type: 'startSwap', mode: 'swap' })}
          >
            Swap with…
          </button>
          <button
            type="button"
            className={`btn btn-xs ${state.swapFrom === keyId && state.swapMode === 'copy' ? 'btn-primary' : ''}`}
            onClick={() => send({ type: 'startSwap', mode: 'copy' })}
          >
            Copy to…
          </button>
          {otherLayers.length > 0 && (
            <select
              aria-label={`Send ${keyId} to another layer`}
              className="select select-xs select-bordered w-auto"
              value=""
              onChange={(e) => {
                const layerId = e.target.value;
                if (!layerId) return;
                send({
                  type: 'edit',
                  edit: {
                    kind: 'send',
                    layer: activeLayer.id,
                    toLayer: layerId,
                    keys: [keyId],
                    mode: 'move',
                  },
                  say: `${keyId} sent to ${layerId}`,
                });
              }}
            >
              <option value="">Send to layer…</option>
              {otherLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {owner ? (
            <button
              type="button"
              className="btn btn-xs btn-ghost text-error"
              onClick={() => {
                setFeatures(
                  withoutFeatureAt(layout, owner, activeLayer.id),
                  `${featureTitle(owner)} removed from ${keyId}`,
                );
              }}
            >
              Remove {featureTitle(owner)} from this key
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-ghost text-error"
              disabled={authored === undefined}
              onClick={clear}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </fieldset>
  );
}
