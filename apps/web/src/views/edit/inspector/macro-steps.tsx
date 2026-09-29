import { type Binding, type CompiledLayout, MODS, type Mod } from '@layoutmaster/core';
import { useEffect, useRef, useState } from 'react';
import {
  bindingFromFields,
  EMPTY_FIELDS,
  emptyMacroStep,
  fieldsFromBinding,
  MACRO_STEP_KINDS,
  type MacroStep,
} from '../binding-form.js';
import { TextField } from './controls.js';

type Macro = Extract<Binding, { kind: 'macro' }>;

const STEP_LABEL: Record<MacroStep['kind'], string> = {
  text: 'type text',
  sl: 'arm layer',
  sk: 'arm modifier',
  ref: 'run behaviour',
};

/**
 * The steps of a macro, in order: text to type, a layer or a modifier to arm for the next key, a
 * behaviour to run. Steps are what let one key type text *and* arm something — the shape an accent
 * key that hands over to a follow-up needs.
 */
export function MacroStepsEditor({
  compiled,
  behaviours,
  binding,
  onChange,
}: {
  compiled: CompiledLayout;
  behaviours: string[];
  binding: Macro;
  onChange: (b: Binding) => void;
}) {
  const [rows, setRows] = useState<MacroStep[]>(() => fieldsFromBinding(binding).macroSteps);
  const produced = useRef<Binding>(binding);
  useEffect(() => {
    // An edit made elsewhere — an undo, the text line — starts the rows afresh. One made here does
    // not: re-reading the rows gives each a new identity, which would remount the row being typed in.
    if (binding === produced.current) return;
    produced.current = binding;
    setRows(fieldsFromBinding(binding).macroSteps);
  }, [binding]);

  const commit = (next: MacroStep[]) => {
    setRows(next);
    const b = bindingFromFields({
      ...EMPTY_FIELDS,
      kind: 'macro',
      macroSteps: next,
      tag: binding.tag ?? '',
    });
    produced.current = b;
    onChange(b);
  };
  const replace = (i: number, step: MacroStep) => commit(rows.map((s, j) => (j === i ? step : s)));
  const move = (i: number, by: number) => {
    const target = i + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[i], next[target]] = [next[target], next[i]];
    commit(next);
  };
  /** A new step that already compiles: a layer or a behaviour step never starts out naming none. */
  const fresh = (kind: MacroStep['kind'], id?: string): MacroStep => {
    const step = emptyMacroStep(kind);
    const withId = id ? { ...step, id } : step;
    if (withId.kind === 'sl') withId.layer = compiled.layers[1]?.id ?? compiled.layers[0].id;
    if (withId.kind === 'ref') withId.ref = behaviours[0] ?? '';
    return withId;
  };

  return (
    <div className="space-y-1">
      {rows.length === 0 && <p className="text-[11px] opacity-60">No steps yet.</p>}
      <ol className="space-y-1 list-none p-0 m-0" aria-label="Macro steps">
        {rows.map((step, i) => (
          <li key={step.id} className="flex flex-wrap items-center gap-1">
            <select
              aria-label={`Step ${i + 1} kind`}
              className="select select-xs select-bordered w-auto"
              value={step.kind}
              onChange={(e) => replace(i, fresh(e.target.value as MacroStep['kind'], step.id))}
            >
              {MACRO_STEP_KINDS.filter((k) => k !== 'ref' || behaviours.length > 0).map((k) => (
                <option key={k} value={k}>
                  {STEP_LABEL[k]}
                </option>
              ))}
            </select>
            {step.kind === 'text' && (
              <TextField
                label={`Step ${i + 1} text`}
                value={step.text}
                className="input-xs flex-1 min-w-20"
                onCommit={(text) => replace(i, { ...step, text })}
              />
            )}
            {step.kind === 'sl' && (
              <select
                aria-label={`Step ${i + 1} layer`}
                className="select select-xs select-bordered flex-1 min-w-20"
                value={step.layer}
                onChange={(e) => replace(i, { ...step, layer: e.target.value })}
              >
                {compiled.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            {step.kind === 'sk' && (
              <select
                aria-label={`Step ${i + 1} modifier`}
                className="select select-xs select-bordered flex-1 min-w-20"
                value={step.mod}
                onChange={(e) => replace(i, { ...step, mod: e.target.value as Mod })}
              >
                {MODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            {step.kind === 'ref' && (
              <select
                aria-label={`Step ${i + 1} behaviour`}
                className="select select-xs select-bordered flex-1 min-w-20"
                value={step.ref}
                onChange={(e) => replace(i, { ...step, ref: e.target.value })}
              >
                {behaviours.map((name) => (
                  <option key={name} value={name}>
                    {name}
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
      <button type="button" className="btn btn-xs" onClick={() => commit([...rows, fresh('text')])}>
        Add step
      </button>
    </div>
  );
}
