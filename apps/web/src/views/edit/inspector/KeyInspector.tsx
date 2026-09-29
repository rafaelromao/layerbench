import {
  type Binding,
  keyBinding,
  type LayoutFeatures,
  legend,
  SECOND_STAGE_SUFFIX,
} from '@layoutmaster/core';
import { type Dispatch, useMemo, useState } from 'react';
import { HelpLink } from '../../../components/HelpLink.js';
import { HELP } from '../../../guide/help.js';
import type { BindingTextContext } from '../binding-text.js';
import type { EditAction, EditState } from '../reducer.js';
import { BindingEditor, type EditorScope } from './bodies.js';
import { Note } from './controls.js';
import {
  FeatureBody,
  featureTitle,
  type OwningFeature,
  owningFeature,
  withFeatureAt,
  withoutFeatureAt,
} from './features.js';
import { kindInfo, kindOf } from './kinds.js';
import { chipLabel, usedBindings } from './layout-bindings.js';
import { BindingTextLine } from './TextLine.js';

export interface KeyInspectorProps {
  state: EditState;
  send: Dispatch<EditAction>;
  /** Hand keyboard focus back to a key on the board. */
  focusKey: (keyId: string) => void;
  /** Say what happened, for a screen reader: a changed key legend is not announced on its own. */
  announce: (message: string) => void;
}

/**
 * Everything about the selected key, in one place that is the same on a phone and at a desk: what
 * the key is, the controls for that kind of key, the keys the layout already has to reuse, the
 * binding as text for typing, and what can be done with the key as a whole.
 */
export function KeyInspector(props: KeyInspectorProps) {
  const { state } = props;
  if (state.selected === null || !state.compiled.keyIndex.has(state.selected)) {
    return (
      <section className="lm-inspector lm-inspector-empty card bg-base-100 border border-base-300">
        <div className="card-body p-3 gap-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Key</h2>
            <HelpLink help={HELP.editKey} />
          </div>
          <p className="text-xs opacity-70">
            Tap or click a key on the board to edit it. Drag a key onto another to swap the two —
            hold Alt to copy instead — or onto a layer tab to send it there.
          </p>
          <p className="text-xs opacity-70 lm-pointer-hint">
            On a focused key, typing sets it — <span className="font-mono">ç</span>,{' '}
            <span className="font-mono">&amp;lt nav a</span> — Delete clears it, and the arrow keys
            move between keys.
          </p>
        </div>
      </section>
    );
  }
  // Remounts per key and layer, so a half-typed field never follows the selection to another key.
  const id = state.selected;
  return <Inspector key={`${state.layer}:${id}`} {...props} keyId={id} />;
}

/** How many reusable bindings are shown before the rest are asked for. */
const FIRST_CHIPS = 10;

function Inspector({
  state,
  send,
  focusKey,
  announce,
  keyId,
}: KeyInspectorProps & { keyId: string }) {
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
  const owner = compiled.featureOwned.get(activeLayer.id)?.get(keyId);
  const owning = owner ? owningFeature(layout, owner) : null;
  const [allChips, setAllChips] = useState(false);

  const behaviours = useMemo(
    () =>
      Object.keys(compiled.expanded.behaviors ?? {}).filter(
        (name) => !name.includes(SECOND_STAGE_SUFFIX),
      ),
    [compiled],
  );
  const text: BindingTextContext = useMemo(
    () => ({
      layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })),
      behaviors: behaviours,
      hostLocale: compiled.hostLocale,
    }),
    [compiled, behaviours],
  );
  const scope: EditorScope = useMemo(
    () => ({
      compiled,
      behaviours,
      ownBehaviours: layout.behaviors ?? {},
      setBehaviour: (name, binding) => send({ type: 'setBehavior', name, binding }),
      text,
    }),
    [compiled, behaviours, layout.behaviors, send, text],
  );

  const used = useMemo(() => usedBindings(layout), [layout]);
  const placeable = useMemo(() => {
    const out: Extract<OwningFeature, { kind: 'adaptive' | 'altRepeat' }>[] = [];
    (layout.features?.adaptiveKeys ?? []).forEach((feature, index) => {
      if (feature.id !== owner) out.push({ kind: 'adaptive', index, feature });
    });
    const alt = layout.features?.altRepeat;
    if (alt && (alt.id ?? 'altRepeat') !== owner) out.push({ kind: 'altRepeat', feature: alt });
    return out;
  }, [layout.features, owner]);

  const commit = (binding: Binding) => {
    send({ type: 'commitBinding', keyId, binding });
    announce(`${keyId} set to ${legend(compiled, binding).tap || 'nothing'}`);
  };
  const setFeatures = (features: LayoutFeatures) => send({ type: 'setFeatures', features });
  const otherLayers = compiled.layers.filter((l) => l.idx !== layer);
  const chips = allChips ? used : used.slice(0, FIRST_CHIPS);

  return (
    <fieldset
      className="lm-inspector card bg-base-100 border border-base-300 min-w-0"
      aria-label={`Edit ${keyId}`}
    >
      <div className="card-body p-3 gap-3 min-w-0">
        <header className="flex items-start gap-3">
          <div className="lm-inspector-cap" aria-hidden="true">
            <span className="lm-inspector-cap-tap">{shown.tap || '·'}</span>
            {shown.hold && <span className="lm-inspector-cap-hold">{shown.hold}</span>}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="badge badge-neutral badge-sm font-mono">{keyId}</span>
              <span className="opacity-70">{activeLayer.name}</span>
              <span className="opacity-70">
                {owning ? featureTitle(owning) : kindInfo(kindOf(authored)).label}
                {authored === undefined && !owning ? ' · layer default' : ''}
              </span>
            </p>
            <p className="text-xs opacity-80">{shown.detail}</p>
          </div>
          <HelpLink help={owning ? HELP.features : HELP.editKey} className="mt-2" />
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

        {owning ? (
          <>
            <div className="rounded-box bg-base-200 p-2 text-xs">
              This key is the <strong>{featureTitle(owning)}</strong> feature (
              <span className="font-mono">{owner}</span>), which the layout declares once and places
              here.
            </div>
            <FeatureBody
              scope={scope}
              layout={layout}
              owning={owning}
              layerId={activeLayer.id}
              keyId={keyId}
              setFeatures={setFeatures}
            />
            <details className="text-xs">
              <summary className="cursor-pointer opacity-70">The key under the feature</summary>
              <div className="pt-2 space-y-2">
                <Note>
                  {owning.kind === 'sentenceCase' || owning.kind === 'capsWord'
                    ? 'The feature wraps what this key taps; the rest of it is set here.'
                    : 'The feature takes over the tap. A hold set here still works, and the key goes back to this without the feature.'}
                </Note>
                <BindingEditor scope={scope} value={current} onChange={commit} />
              </div>
            </details>
          </>
        ) : owner ? (
          <Note>
            Generated by <span className="font-mono">{owner}</span>, which this editor does not know
            how to change; edit it in JSON.
          </Note>
        ) : (
          <>
            <BindingEditor scope={scope} value={current} onChange={commit} />

            {(used.length > 0 || placeable.length > 0) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold">From this layout</p>
                <ul
                  className="flex flex-wrap gap-1 list-none p-0 m-0"
                  aria-label="From this layout"
                >
                  {placeable.map((f) => (
                    <li key={f.kind === 'adaptive' ? f.feature.id : 'altRepeat'}>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline btn-primary"
                        title={`Place ${featureTitle(f)} on ${keyId} too`}
                        onClick={() => {
                          setFeatures(withFeatureAt(layout, f, activeLayer.id, keyId));
                          announce(`${featureTitle(f)} placed on ${keyId}`);
                        }}
                      >
                        {f.kind === 'adaptive' ? '✦' : '⟳✦'} {featureTitle(f)}
                      </button>
                    </li>
                  ))}
                  {chips.map((u) => {
                    const label = chipLabel(compiled, u.binding);
                    return (
                      <li key={`${label}\u0000${u.count}\u0000${JSON.stringify(u.binding)}`}>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost border border-base-300 font-mono"
                          aria-label={`Use ${label}`}
                          title={`${legend(compiled, u.binding).detail} · on ${u.count} ${u.count === 1 ? 'key' : 'keys'}`}
                          onClick={() => commit(u.binding)}
                        >
                          {label}
                        </button>
                      </li>
                    );
                  })}
                  {used.length > FIRST_CHIPS && (
                    <li>
                      <button
                        type="button"
                        className="btn btn-xs btn-link"
                        aria-expanded={allChips}
                        onClick={() => setAllChips((a) => !a)}
                      >
                        {allChips ? 'Fewer' : `All ${used.length}`}
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}

            <BindingTextLine
              compiled={compiled}
              keyId={keyId}
              binding={authored}
              ctx={text}
              focusRequest={state.focusRequest}
              onCommit={commit}
              onClear={() => {
                send({ type: 'clearKey', keyId });
                announce(`${keyId} cleared`);
              }}
              onDone={() => focusKey(keyId)}
            />
          </>
        )}

        <div className="flex flex-wrap items-center gap-1 border-t border-base-300 pt-2">
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
                  type: 'dropKey',
                  from: keyId,
                  to: { kind: 'layer', layerId },
                  mode: 'swap',
                });
                announce(`${keyId} sent to ${layerId}`);
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
          {owning ? (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => {
                setFeatures(withoutFeatureAt(layout, owning, activeLayer.id, keyId));
                announce(`${featureTitle(owning)} removed from ${keyId}`);
              }}
            >
              Remove {featureTitle(owning)} from this key
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              disabled={authored === undefined}
              onClick={() => {
                send({ type: 'clearKey', keyId });
                announce(`${keyId} cleared`);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </fieldset>
  );
}
