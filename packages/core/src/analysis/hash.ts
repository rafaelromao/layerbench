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

export interface HashOptions {
  caseMode?: string;
  textClass?: string;
  crossWord?: string;
  maxSymbols?: number | null;
  corpusId?: string | null;
}

/**
 * Identity of an analysis: everything that changes the simulation. Two layouts that differ only in
 * relabel-eligible symbols still hash differently here, which is deliberate — the cache stores full
 * reports, and relabeling is handled separately.
 */
export function structureHash(layout: Layout, opts: HashOptions = {}): string {
  return fnv1a(
    stableStringify({
      layout: toCanonicalJson(layout),
      case_mode: opts.caseMode ?? 'fold',
      text_class: opts.textClass ?? 'letters',
      cross_word: opts.crossWord ?? 'reset',
      max_symbols: opts.maxSymbols ?? 'infinity',
      corpus: opts.corpusId ?? null,
    }),
  );
}
