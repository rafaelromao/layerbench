import type { Dispatch } from 'react';
import { HelpLink } from '../../../components/HelpLink.js';
import { HELP } from '../../../guide/help.js';
import { type EditAction, type EditState, selectionOf } from '../reducer.js';

/**
 * What can be done with several keys at once, in place of the editor of one: send them to another
 * layer or copy them there, at the same places, make them do nothing, or let the layer below show
 * through. Each is one edit, so one Undo takes it back.
 */
export function SelectionInspector({
  state,
  send,
  announce,
  focusKey,
}: {
  state: EditState;
  send: Dispatch<EditAction>;
  announce: (message: string) => void;
  focusKey: (keyId: string) => void;
}) {
  const keys = selectionOf(state);
  const layer = state.compiled.layers[state.layer];
  const otherLayers = state.compiled.layers.filter((l) => l.idx !== state.layer);

  const toLayer = (mode: 'move' | 'copy') => (layerId: string) => {
    if (!layerId) return;
    send({ type: 'sendSelection', layerId, mode });
    const name = otherLayers.find((l) => l.id === layerId)?.name ?? layerId;
    announce(`${keys.length} keys ${mode === 'copy' ? 'copied' : 'sent'} to ${name}`);
  };

  return (
    <fieldset
      className="lb-inspector card bg-base-100 border border-base-300 min-w-0"
      aria-label={`Edit ${keys.length} keys`}
    >
      <div className="card-body p-3 gap-3 min-w-0">
        <header className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-semibold">
              {keys.length} keys on {layer?.name}
            </p>
            <p className="flex flex-wrap gap-1">
              {keys.map((k) => (
                <span key={k} className="badge badge-neutral badge-sm font-mono">
                  {k}
                </span>
              ))}
            </p>
            <p className="text-xs opacity-70">
              Shift-click a key, or rest a finger on it, to add it or take it out.
            </p>
          </div>
          <HelpLink help={HELP.severalKeys} className="mt-1" />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            aria-label="Clear the selection"
            onClick={() => {
              const first = keys[0];
              send({ type: 'deselect' });
              if (first) focusKey(first);
            }}
          >
            ✕
          </button>
        </header>

        <div className="lb-key-actions border-t border-base-300 pt-2">
          {otherLayers.length > 0 && (
            <>
              <select
                aria-label="Send the selected keys to another layer"
                className="select select-xs select-bordered w-auto"
                value=""
                onChange={(e) => toLayer('move')(e.target.value)}
              >
                <option value="">Send to layer…</option>
                {otherLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Copy the selected keys to another layer"
                className="select select-xs select-bordered w-auto"
                value=""
                onChange={(e) => toLayer('copy')(e.target.value)}
              >
                <option value="">Copy to layer…</option>
                {otherLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => {
              send({ type: 'transparentSelection' });
              announce(`${keys.length} keys let the layer below show through`);
            }}
          >
            Make transparent
          </button>
          <button
            type="button"
            className="btn btn-xs btn-ghost text-error"
            onClick={() => {
              send({ type: 'clearSelection' });
              announce(`${keys.length} keys do nothing`);
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </fieldset>
  );
}
