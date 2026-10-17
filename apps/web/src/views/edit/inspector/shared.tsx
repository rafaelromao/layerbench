import { type Binding, type CompiledLayout, type Layout, legend } from '@layerbench/core';
import { type Dispatch, useMemo, useState } from 'react';
import type { BindingTextContext } from '../binding-text.js';
import type { EditAction } from '../reducer.js';
import type { EditorScope } from './bodies.js';
import { chipLabel, usedBindings } from './layout-bindings.js';

/**
 * What the key editor and the combo editor both edit a binding against: the layout's behaviours,
 * edited where a binding refers to them, and the names the text line reads.
 */
export function useEditorScope(
  compiled: CompiledLayout,
  layout: Layout,
  send: Dispatch<EditAction>,
): EditorScope {
  const behaviours = useMemo(() => Object.keys(compiled.expanded.behaviors ?? {}), [compiled]);
  const text: BindingTextContext = useMemo(
    () => ({
      layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })),
      behaviors: behaviours,
      hostLocale: compiled.hostLocale,
    }),
    [compiled, behaviours],
  );
  return useMemo(
    () => ({
      compiled,
      behaviours,
      ownBehaviours: layout.behaviors ?? {},
      setBehaviour: (name, binding) => {
        // A behaviour given back as it was is no edit.
        if (binding === layout.behaviors?.[name]) return;
        send({ type: 'edit', edit: { kind: 'setBehavior', name, binding } });
      },
      text,
    }),
    [compiled, behaviours, layout.behaviors, send, text],
  );
}

/** How many reusable bindings are shown before the rest are asked for. */
const FIRST_CHIPS = 10;

/** The bindings the layout already uses, each a chip that puts it here. */
export function FromThisLayout({
  compiled,
  layout,
  onPick,
}: {
  compiled: CompiledLayout;
  layout: Layout;
  onPick: (b: Binding) => void;
}) {
  const [allChips, setAllChips] = useState(false);
  const used = useMemo(() => usedBindings(layout), [layout]);
  if (used.length === 0) return null;
  const chips = allChips ? used : used.slice(0, FIRST_CHIPS);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">From this layout</p>
      <ul className="flex flex-wrap gap-1 list-none p-0 m-0" aria-label="From this layout">
        {chips.map((u) => {
          const label = chipLabel(compiled, u.binding);
          return (
            <li key={`${label}\u0000${u.count}\u0000${JSON.stringify(u.binding)}`}>
              <button
                type="button"
                className="btn btn-xs btn-ghost border border-base-300 font-mono"
                aria-label={`Use ${label}`}
                title={`${legend(compiled, u.binding).detail} · on ${u.count} ${u.count === 1 ? 'key' : 'keys'}`}
                onClick={() => onPick(u.binding)}
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
  );
}
