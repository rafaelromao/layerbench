import type { Binding, Mod } from '@layerbench/core';

type Macro = Extract<Binding, { kind: 'macro' }>;

/**
 * One row of the macro builder. Rows compile to `steps[]` in order, which is what lets a macro
 * type some text *and* arm a layer or a modifier — the shape the accent and `qu` keys need.
 */
export type MacroStep = { id: string } & (
  | { kind: 'text'; text: string }
  | { kind: 'sl'; layer: string }
  | { kind: 'sk'; mod: Mod }
  | { kind: 'ref'; ref: string }
);

export const MACRO_STEP_KINDS = ['text', 'sl', 'sk', 'ref'] as const;

/** Rows are reordered and can be identical, so each carries an identity of its own for React. */
let nextStepId = 0;
function stepId(): string {
  nextStepId += 1;
  return `step-${nextStepId}`;
}

export function emptyMacroStep(kind: MacroStep['kind']): MacroStep {
  const id = stepId();
  switch (kind) {
    case 'text':
      return { id, kind: 'text', text: '' };
    case 'sl':
      return { id, kind: 'sl', layer: '' };
    case 'sk':
      return { id, kind: 'sk', mod: 'LSHIFT' };
    default:
      return { id, kind: 'ref', ref: '' };
  }
}

function stepToBindings(s: MacroStep): Binding[] {
  switch (s.kind) {
    case 'text':
      return [...s.text].map((g) => ({ kind: 'kp', symbol: g }));
    case 'sl':
      return [{ kind: 'sl', layer: s.layer }];
    case 'sk':
      return [{ kind: 'sk', mod: s.mod }];
    default:
      return [{ kind: 'macro', ref: s.ref }];
  }
}

/** Read a macro's steps back into rows, coalescing consecutive single keys into one text row. */
export function macroRows(macro: Macro): MacroStep[] {
  const rows: MacroStep[] = [];
  for (const b of macro.steps ?? []) {
    if (b.kind === 'kp' && b.symbol) {
      const last = rows[rows.length - 1];
      if (last?.kind === 'text') last.text += b.symbol;
      else rows.push({ id: stepId(), kind: 'text', text: b.symbol });
    } else if (b.kind === 'sl') rows.push({ id: stepId(), kind: 'sl', layer: b.layer });
    else if (b.kind === 'sk') rows.push({ id: stepId(), kind: 'sk', mod: b.mod });
    else if (b.kind === 'macro' && b.ref) rows.push({ id: stepId(), kind: 'ref', ref: b.ref });
  }
  return rows;
}

/** The macro its rows make. With no rows left it types nothing, written as text. */
export function macroOfRows(rows: MacroStep[], tag: string | undefined): Macro {
  const tagged = tag ? { tag } : {};
  return rows.length > 0
    ? { kind: 'macro', steps: rows.flatMap(stepToBindings), ...tagged }
    : { kind: 'macro', symbols: '', ...tagged };
}
