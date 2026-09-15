import { type CompiledLayout, MODS } from '@layoutmaster/core';
import { useMemo } from 'react';

export interface PaletteItem {
  /** The binding as text, in the same syntax the key editor takes. */
  text: string;
  label: string;
}

export interface BindingPaletteProps {
  compiled: CompiledLayout;
  /** The binding currently being carried, if the user armed one by clicking it. */
  carried: string | null;
  onCarry: (text: string | null) => void;
}

/** The bindings worth reaching for without typing them, in the order they are usually wanted. */
function items(compiled: CompiledLayout): PaletteItem[] {
  const out: PaletteItem[] = [
    { text: '&trans', label: '▽' },
    { text: '&none', label: '✕' },
    { text: '&key_repeat', label: '⟳' },
    { text: '&caps_word', label: '⇪' },
  ];
  for (const layer of compiled.layers) {
    out.push({ text: `&mo ${layer.id}`, label: `⇩${layer.name}` });
    out.push({ text: `&sl ${layer.id}`, label: `→${layer.name}` });
  }
  for (const mod of MODS) out.push({ text: `&sk ${mod}`, label: mod });
  return out;
}

/**
 * Bindings to drag onto a key, or to click and then click a key — which is the same gesture a
 * touch screen and a keyboard can both make, and the one that needs no pointer at all.
 */
export function BindingPalette({ compiled, carried, onCarry }: BindingPaletteProps) {
  const chips = useMemo(() => items(compiled), [compiled]);

  return (
    <div className="space-y-1">
      <fieldset className="flex flex-wrap gap-1" aria-label="Bindings to place">
        {chips.map((chip) => {
          const armed = carried === chip.text;
          return (
            <button
              key={chip.text}
              type="button"
              draggable
              aria-pressed={armed}
              title={chip.text}
              className={`btn btn-xs font-mono ${armed ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', chip.text);
                e.dataTransfer.effectAllowed = 'copy';
                onCarry(chip.text);
              }}
              onDragEnd={() => onCarry(null)}
              onClick={() => onCarry(armed ? null : chip.text)}
            >
              {chip.label}
            </button>
          );
        })}
      </fieldset>
      <p className="text-[11px] opacity-60">
        {carried ? (
          <>
            Carrying <span className="font-mono">{carried}</span> — click a key to place it, or
            press Escape.
          </>
        ) : (
          'Drag one onto a key, or click it and then click a key.'
        )}
      </p>
    </div>
  );
}
