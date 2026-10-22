import { type Binding, type Edit, legend } from '@layerbench/core';
import type { Dispatch } from 'react';
import { HelpLink } from '../../../components/HelpLink.js';
import { HELP } from '../../../guide/help.js';
import type { EditAction, EditState } from '../reducer.js';
import { BindingEditor } from './bodies.js';
import { kindInfo, kindOf } from './kinds.js';
import { FromThisLayout, useEditorScope } from './shared.js';
import { BindingTextLine } from './TextLine.js';

/** A combo has no layer below it to show through, so it is never Transparent. */
const NOT_ON_A_COMBO = ['transparent'] as const;

/**
 * The combo open in the editor, edited as a key is: any kind of key on the tiles, the bindings the
 * layout already has, the binding as text, and what only a combo has, its keys, layers and role.
 * Every change is one `updateCombo` edit, so one Undo takes it back.
 */
export function ComboInspector({
  state,
  send,
  combo,
}: {
  state: EditState;
  send: Dispatch<EditAction>;
  combo: number;
}) {
  const { compiled, layout } = state;
  const scope = useEditorScope(compiled);
  const c = layout.combos?.[combo];
  if (!c) return null;
  const name = c.keys.join('+');
  const shown = legend(compiled, c.binding);
  const layerIds = c.layers ?? layout.layers.map((l) => l.id);
  // A combo that names no role is a command, as the compiler reads it.
  const role = c.role ?? 'command';
  const repicking = state.comboPick !== null && state.comboPickFor === combo;
  const picked = state.comboPick ?? [];

  const update = (change: Omit<Extract<Edit, { kind: 'updateCombo' }>, 'kind' | 'combo'>) =>
    send({ type: 'edit', edit: { kind: 'updateCombo', combo, ...change } });
  const commit = (binding: Binding) => {
    // The binding given back as it was is no edit.
    if (binding === c.binding) return;
    update({ binding });
  };
  const close = () => send({ type: 'selectCombo', combo: null });

  return (
    <fieldset
      className="lb-inspector card bg-base-100 border border-base-300 min-w-0"
      aria-label={`Edit combo ${name}`}
    >
      <div className="card-body p-3 gap-3 min-w-0">
        <header className="flex items-start gap-3">
          <div className="lb-inspector-cap lb-inspector-cap-combo" aria-hidden="true">
            <span className="lb-inspector-cap-tap">{shown.tap || '·'}</span>
            {shown.hold && <span className="lb-inspector-cap-hold">{shown.hold}</span>}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="badge badge-primary badge-sm">Combo</span>
              <span className="badge badge-neutral badge-sm font-mono">{name}</span>
              <span className="opacity-70">{kindInfo(kindOf(c.binding)).label}</span>
            </p>
            <p className="text-xs opacity-80">{shown.detail}</p>
          </div>
          <HelpLink help={HELP.panels} className="mt-2" />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            aria-label="Close the combo editor"
            onClick={close}
          >
            ✕
          </button>
        </header>

        <BindingEditor scope={scope} value={c.binding} onChange={commit} without={NOT_ON_A_COMBO} />

        <FromThisLayout compiled={compiled} layout={layout} onPick={commit} />

        <BindingTextLine
          compiled={compiled}
          keyId={`combo-${combo}`}
          label={`Binding for combo ${name}`}
          binding={c.binding}
          ctx={scope.text}
          focusRequest={null}
          onCommit={commit}
          onClear={() => commit({ kind: 'none' })}
          onDone={() => {}}
        />

        <div className="space-y-2 border-t border-base-300 pt-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold w-16 shrink-0">Keys</span>
            {repicking ? (
              <>
                <output aria-label={`Keys picked for combo ${name}`} className="font-mono">
                  {picked.length > 0 ? picked.join('+') : 'click the keys'}
                </output>
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  onClick={() =>
                    // The keys it already has are nothing to change: the pick just ends.
                    picked.length === c.keys.length && picked.every((k) => c.keys.includes(k))
                      ? send({ type: 'comboPickCancel' })
                      : update({ keys: picked })
                  }
                >
                  Use these keys
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => send({ type: 'comboPickCancel' })}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="font-mono">{name}</span>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => send({ type: 'comboPickStart', combo })}
                >
                  Pick again on the board
                </button>
              </>
            )}
          </div>

          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="font-semibold w-16 shrink-0 float-left">Layers</legend>
            {layout.layers.map((l) => (
              <label key={l.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={layerIds.includes(l.id)}
                  onChange={(e) =>
                    update({
                      layers: e.target.checked
                        ? layout.layers
                            .map((x) => x.id)
                            .filter((id) => id === l.id || layerIds.includes(id))
                        : layerIds.filter((id) => id !== l.id),
                    })
                  }
                />
                {l.name ?? l.id}
              </label>
            ))}
          </fieldset>

          <label className="flex flex-wrap items-center gap-2">
            <span className="font-semibold w-16 shrink-0">Role</span>
            <select
              aria-label={`Role of combo ${name}`}
              className="select select-xs select-bordered w-auto"
              value={role}
              onChange={(e) => update({ role: e.target.value as 'typing' | 'command' })}
            >
              <option value="typing">typing</option>
              <option value="command">command</option>
            </select>
          </label>

          <label className="flex flex-wrap items-center gap-2">
            <span className="font-semibold w-16 shrink-0">Timeout</span>
            <input
              type="number"
              min={1}
              step={5}
              aria-label={`Timeout of combo ${name}, in milliseconds`}
              className="input input-xs input-bordered w-20"
              value={c.timeoutMs ?? ''}
              placeholder="50"
              onChange={(e) => {
                const ms = Number(e.target.value);
                if (Number.isFinite(ms) && ms > 0) update({ timeoutMs: ms });
              }}
            />
            <span className="opacity-60">ms for its keys to go down together</span>
          </label>
        </div>

        <div className="lb-key-actions border-t border-base-300 pt-2">
          <button
            type="button"
            className="btn btn-xs btn-ghost text-error"
            onClick={() => send({ type: 'edit', edit: { kind: 'removeCombo', combo } })}
          >
            Remove this combo
          </button>
        </div>
      </div>
    </fieldset>
  );
}
