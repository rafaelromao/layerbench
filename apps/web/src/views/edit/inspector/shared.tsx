import { type Binding, type CompiledLayout, type Layout, legend } from '@layerbench/core';
import { useMemo, useState } from 'react';
import type { BindingTextContext } from '../binding-text.js';
import type { EditorScope } from './bodies.js';
import { chipLabel, usedBindings } from './layout-bindings.js';

/**
 * What the key editor and the combo editor both edit a binding against: the compiled layout, and
 * the layers and host locale the text line reads.
 */
export function useEditorScope(compiled: CompiledLayout): EditorScope {
  return useMemo(() => {
    const text: BindingTextContext = {
      layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })),
      hostLocale: compiled.hostLocale,
    };
    return { compiled, text };
  }, [compiled]);
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
