import { toCanonicalJson } from '../layout/json.js';
import type { Layout } from '../layout/types.js';

/** JSON with object keys in a stable order, so the same document always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as object).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
  );
  return `{${parts.join(',')}}`;
}

/** 64-bit FNV-1a, base36. Synchronous, which matters: this runs on every parameter change. */
export function fnv1a(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    h = ((h ^ BigInt(text.charCodeAt(i))) * prime) & mask;
  }
  return h.toString(36).padStart(13, '0');
}

/**
 * Identity of a layout's structure: everything in it that changes what is typed. Two layouts that
 * differ only in relabel-eligible symbols still hash differently here, which is deliberate — the
 * cache stores full reports, and relabeling is handled separately. The colour a layer is drawn in
 * types nothing, so it is left out, and choosing one does not run the analysis again. What the
 * layout is typed on is the analysis settings' to add (`analysisKey`).
 */
export function structureHash(layout: Layout): string {
  const uncoloured = layout.layers.some((l) => l.color !== undefined)
    ? { ...layout, layers: layout.layers.map(({ color: _color, ...l }) => l) }
    : layout;
  return fnv1a(stableStringify(toCanonicalJson(uncoloured)));
}
