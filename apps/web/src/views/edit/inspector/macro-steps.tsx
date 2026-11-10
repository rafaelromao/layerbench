import { type Binding, type CompiledLayout, legend, legendText } from '@layerbench/core';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { BindingTextContext } from '../binding-text.js';
import {
  copyRow,
  type FieldsOf,
  freshRow,
  type MacroRow,
  macroRows,
  type RowKind,
  rowAs,
  rowKind,
} from './binding-changes.js';
import { TextField } from './controls.js';
import { ALL_KINDS, type KindOfKey, kindInfo } from './kinds.js';

/** "Step 1 kind" on its own, "Step 2 step 1 kind" inside the macro that is step 2 of another. */
function named(prefix: string, what: string): string {
  return prefix ? `${prefix} ${what.charAt(0).toLowerCase()}${what.slice(1)}` : what;
}

/**
 * The kinds a step can be, after text: every kind of key but those that do nothing pressed. A step
 * already of one of those keeps it in its list.
 */
const STEP_KINDS: readonly KindOfKey[] = ALL_KINDS.map((k) => k.kind).filter(
  (k) => k !== 'transparent' && k !== 'nothing',
);

/** The controls of one step, of any kind: the key editor's own, for the step's binding. */
export type StepBody = (step: Binding, onChange: (b: Binding) => void, name: string) => ReactNode;

/**
 * The steps of a macro, in order: text to type, or any behaviour a key can be, edited with the same
 * controls a key has — a layer or a modifier armed for the next key, a sentence space, another
 * macro. The macro taps each step in turn, as ZMK's macro does.
 */
export function MacroStepsEditor({
  compiled,
  ctx,
  fields: { binding, set },
  onChange,
  body,
  name = '',
}: {
  compiled: CompiledLayout;
  ctx: BindingTextContext;
  fields: FieldsOf<'macro'>;
  onChange: (b: Binding) => void;
  body: StepBody;
  /** Prefix for the controls' accessible names, for a macro inside another. */
  name?: string;
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
  const step = (i: number) => named(name, `Step ${i + 1}`);

  return (
    <div className="space-y-1">
      {rows.length === 0 && <p className="text-[11px] opacity-60">No steps yet.</p>}
      <ol className="space-y-2 list-none p-0 m-0" aria-label={named(name, 'Macro steps')}>
        {rows.map((row, i) => {
          const kind = rowKind(row);
          const kinds: readonly RowKind[] =
            kind === 'text' || STEP_KINDS.includes(kind)
              ? ['text', ...STEP_KINDS]
              : ['text', ...STEP_KINDS, kind];
          return (
            <li key={row.id} className="lb-macro-step space-y-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs font-semibold tabular-nums w-5 shrink-0">{i + 1}.</span>
                <select
                  aria-label={`${step(i)} kind`}
                  className="select select-xs select-bordered w-auto"
                  value={kind}
                  onChange={(e) => replace(i, rowAs(row, e.target.value as RowKind, ctx))}
                >
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {k === 'text' ? 'Text' : kindInfo(k).label}
                    </option>
                  ))}
                </select>
                {row.kind === 'step' && (
                  <span className="text-xs font-mono opacity-70 truncate min-w-0 flex-1">
                    {legendText(legend(compiled, row.step))}
                  </span>
                )}
                {row.kind === 'text' && (
                  <TextField
                    label={`${step(i)} text`}
                    value={row.text}
                    className="input-xs flex-1 min-w-20"
                    onCommit={(text) => replace(i, { ...row, text })}
                  />
                )}
                <span className="flex items-center ml-auto">
                  <button
                    type="button"
                    aria-label={`Move ${step(i).toLowerCase()} up`}
                    className="btn btn-ghost btn-xs"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${step(i).toLowerCase()} down`}
                    className="btn btn-ghost btn-xs"
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate ${step(i).toLowerCase()}`}
                    className="btn btn-ghost btn-xs"
                    onClick={() =>
                      commit([...rows.slice(0, i + 1), copyRow(row), ...rows.slice(i + 1)])
                    }
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${step(i).toLowerCase()}`}
                    className="btn btn-ghost btn-xs"
                    onClick={() => commit(rows.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {row.kind === 'step' && (
                <div className="lb-part">
                  {body(row.step, (next) => replace(i, { ...row, step: next }), step(i))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn btn-xs"
        aria-label={name ? named(name, 'Add step') : undefined}
        onClick={() => commit([...rows, freshRow('text', ctx)])}
      >
        Add step
      </button>
    </div>
  );
}
