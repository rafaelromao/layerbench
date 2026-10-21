import { keyById } from '../geometry/types.js';
import type { CompiledLayout } from './compile.js';
import { partOf } from './parts.js';
import type { Binding } from './types.js';

/** The letter a key's Plain part types by itself, lower-cased, or null for anything else. */
function letterOf(b: Binding): string | null {
  const part = partOf(b);
  const s =
    part.kind === 'kp'
      ? (part.symbol ?? part.keycode)
      : part.kind === 'unicode'
        ? part.symbol
        : undefined;
  return s !== undefined && /^\p{L}$/u.test(s) ? s.toLowerCase() : null;
}

/**
 * The letters the base layer types on the home row, left to right as the board draws them: what
 * the Library sorts by when it sorts by home row. A key counts by its Plain part, so a home-row mod
 * counts by its tap; a key typing no letter, a `;`, Repeat or nothing, is left out.
 */
export function homeRowLetters(c: CompiledLayout): string {
  const base = c.layers[0];
  if (!base) return '';
  let out = '';
  for (const id of c.geometry.textRows.flat()) {
    if (!keyById(c.geometry, id)?.home) continue;
    const idx = c.keyIndex.get(id);
    const binding = idx === undefined ? undefined : base.bindings[idx];
    const letter = binding ? letterOf(binding) : null;
    if (letter) out += letter;
  }
  return out;
}
