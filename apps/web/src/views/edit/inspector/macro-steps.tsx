import {
  type Binding,
  type CompiledLayout,
  legend,
  legendText,
  MODS,
  type Mod,
} from '@layerbench/core';
import { useEffect, useRef, useState } from 'react';
import type { BindingTextContext } from '../binding-text.js';
import {
  type FieldsOf,
  freshRow,
  type MacroRow,
  macroRows,
  ROW_KINDS,
  type RowKind,
} from './binding-changes.js';
import { TextField } from './controls.js';

const ROW_LABEL: Record<RowKind, string> = {
  text: 'type text',
  sl: 'arm layer',
  sk: 'arm modifier',
};

/**
 * The steps of a macro, in order: text to type, or a layer or a modifier to arm for the next key.
 * Steps are what let one key type text *and* arm something — the shape an accent key that hands
 * over to a follow-up needs. A step no row can edit is shown as it is, and can still be moved or
 * removed.
 */
export function MacroStepsEditor({
  compiled,
  ctx,
  fields: { binding, set },
  onChange,
}: {
  compiled: CompiledLayout;
  ctx: BindingTextContext;
  fields: FieldsOf<'macro'>;
  onChange: (b: Binding) => void;
}) {
  const [rows, setRows] = useState<MacroRow[]>(() => macroRows(binding));
  const produced = useRef<Binding>(binding);
  useEffect(() => {
    // An edit made elsewhere — an undo, the text line — starts the rows afresh. One made here does
    // not: re-reading the rows gives each a new identity, which would remount the row being typed in.
    if (binding === produced.current) return;
    produced.current = binding;
    setRows(macroRows(binding));
  }, [binding]);

  const commit = (next: MacroRow[]) => {
    setRows(next);
    const b = set.rows(next);
    produced.current = b;
    onChange(b);
  };
  const replace = (i: number, row: MacroRow) => commit(rows.map((r, j) => (j === i ? row : r)));
  const move = (i: number, by: number) => {
    const target = i + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[i], next[target]] = [next[target], next[i]];
    commit(next);
  };

  return (
    <div className="space-y-1">
      {rows.length === 0 && <p className="text-[11px] opacity-60">No steps yet.</p>}
      <ol className="space-y-1 list-none p-0 m-0" aria-label="Macro steps">
        {rows.map((row, i) => (
          <li key={row.id} className="flex flex-wrap items-center gap-1">
            {row.kind === 'fixed' ? (
              <span className="text-xs flex-1 min-w-20">
                <span className="font-mono">
                  {legendText(legend(compiled, row.step)) || row.step.kind}
                </span>
                <span className="opacity-60"> — kept as it is</span>
              </span>
            ) : (
              <select
                aria-label={`Step ${i + 1} kind`}
                className="select select-xs select-bordered w-auto"
                value={row.kind}
                onChange={(e) => replace(i, freshRow(e.target.value as RowKind, ctx, row.id))}
              >
                {ROW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ROW_LABEL[k]}
                  </option>
                ))}
              </select>
            )}
            {row.kind === 'text' && (
              <TextField
                label={`Step ${i + 1} text`}
                value={row.text}
                className="input-xs flex-1 min-w-20"
                onCommit={(text) => replace(i, { ...row, text })}
              />
            )}
            {row.kind === 'sl' && (
              <select
                aria-label={`Step ${i + 1} layer`}
                className="select select-xs select-bordered flex-1 min-w-20"
                value={row.layer}
                onChange={(e) => replace(i, { ...row, layer: e.target.value })}
              >
                {compiled.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            {row.kind === 'sk' && (
              <select
                aria-label={`Step ${i + 1} modifier`}
                className="select select-xs select-bordered flex-1 min-w-20"
                value={row.mod}
                onChange={(e) => replace(i, { ...row, mod: e.target.value as Mod })}
              >
                {MODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              aria-label={`Move step ${i + 1} up`}
              className="btn btn-ghost btn-xs"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Remove step ${i + 1}`}
              className="btn btn-ghost btn-xs"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-xs"
        onClick={() => commit([...rows, freshRow('text', ctx)])}
      >
        Add step
      </button>
    </div>
  );
}
