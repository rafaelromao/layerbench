import type { CompiledLayout, Mod } from '@layerbench/core';
import { type KeyboardEvent, type ReactNode, type Ref, useEffect, useId, useState } from 'react';
import { layerColourOf } from '../../../components/layer-colour.js';

/**
 * A choice of one among a few, drawn as joined buttons. Real radio inputs underneath, so the
 * group is one tab stop moved through with the arrow keys, and each option is announced as such.
 */
export function Segment<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="join flex-wrap" aria-label={label}>
      {options.map(([v, text]) => (
        // daisyUI draws a radio styled as a button from its accessible name.
        <input
          key={v}
          type="radio"
          name={name}
          aria-label={text}
          className="join-item btn btn-xs"
          checked={value === v}
          onChange={() => onChange(v)}
        />
      ))}
    </fieldset>
  );
}

/** Every layer, as buttons in its own colour. */
export function LayerChips({
  compiled,
  label,
  value,
  onChange,
}: {
  compiled: CompiledLayout;
  label: string;
  value: readonly string[];
  onChange: (layerId: string) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-1" aria-label={label}>
      {compiled.layers.map((l) => {
        const on = value.includes(l.id);
        const colour = layerColourOf(l.idx, l.color);
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            className={`btn btn-xs ${on ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
            onClick={() => onChange(l.id)}
          >
            {colour && (
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-full"
                style={{ background: colour }}
              />
            )}
            {l.name}
          </button>
        );
      })}
    </fieldset>
  );
}

const MOD_KEYS: readonly (readonly [string, string, Mod, Mod])[] = [
  ['⇧', 'Shift', 'LSHIFT', 'RSHIFT'],
  ['⌃', 'Control', 'LCTRL', 'RCTRL'],
  ['⌥', 'Alt', 'LALT', 'RALT'],
  ['⌘', 'Command', 'LGUI', 'RGUI'],
];

/** A modifier, picked as the four glyphs plus which hand's key it is. */
export function ModChips({
  label,
  value,
  onChange,
}: {
  label: string;
  value: readonly Mod[];
  onChange: (mod: Mod) => void;
}) {
  const right = value.some((m) => m.startsWith('R'));
  return (
    <fieldset className="flex flex-wrap items-center gap-1" aria-label={label}>
      {MOD_KEYS.map(([glyph, name, left, rightMod]) => {
        const on = value.includes(left) || value.includes(rightMod);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            aria-label={name}
            title={name}
            className={`btn btn-xs ${on ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
            onClick={() => onChange(right ? rightMod : left)}
          >
            {glyph} <span className="text-[10px] opacity-70">{name}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="btn btn-xs btn-ghost"
        aria-label={right ? 'Right-hand modifier' : 'Left-hand modifier'}
        onClick={() => {
          const current = value[0];
          if (!current) return;
          const pair = MOD_KEYS.find(([, , l, r]) => l === current || r === current);
          if (pair) onChange(right ? pair[2] : pair[3]);
        }}
      >
        {right ? 'right' : 'left'}
      </button>
    </fieldset>
  );
}

/**
 * A text field that commits when it is left or Enter is pressed, and puts its text back on Escape.
 * Committing on every keystroke would re-analyze the layout and add an undo step per character.
 */
export function TextField({
  label,
  value,
  onCommit,
  placeholder,
  inputRef,
  onKeyDown,
  className = '',
  mono = true,
}: {
  label: string;
  value: string;
  onCommit: (text: string) => void;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  /** Bindings are code and read best in a fixed width; names are words. */
  mono?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      ref={inputRef}
      aria-label={label}
      className={`input input-sm input-bordered ${mono ? 'font-mono' : ''} ${className}`}
      value={text}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (text !== value) onCommit(text);
        } else if (e.key === 'Escape') {
          // The field's own Escape; the editor around it should not also close.
          if (text !== value) e.stopPropagation();
          setText(value);
        }
      }}
    />
  );
}

/**
 * Words over several lines, such as a description, kept like a `TextField`: when the field is left,
 * and put back as it was on Escape. Enter starts a new line.
 */
export function TextAreaField({
  label,
  value,
  onCommit,
  rows = 3,
  className = '',
}: {
  label: string;
  value: string;
  onCommit: (text: string) => void;
  rows?: number;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <textarea
      aria-label={label}
      rows={rows}
      className={`textarea textarea-bordered text-sm ${className}`}
      value={text}
      autoComplete="off"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && text !== value) {
          // The field's own Escape; the dialog around it should not also close.
          e.preventDefault();
          e.stopPropagation();
          setText(value);
        }
      }}
    />
  );
}

/** A labelled row: the role on the left, its control on the right. */
/**
 * A label and its controls on one line. The label sits on the baseline of the first control, so it
 * lines up with a field, a row of chips or a segment alike, at a desk's size and a finger's.
 */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-xs font-semibold w-16 shrink-0">{label}</span>
      <div className="flex-1 min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] opacity-60">{children}</p>;
}

export const words = (text: string) => text.split(/\s+/).filter(Boolean);
