import { type Layout, safeParseLayout, stableStringify } from '@layerbench/core';
import { encodeInline } from '../url/inline.js';
import { inlineRef } from '../url/params.js';
import type { Conflict } from './composite.js';

/** How many lines say what differs before the rest are counted. */
const MAX_LINES = 8;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A value short enough for a line, as a person reads it. */
function short(value: unknown): string {
  if (value === undefined) return 'none';
  const text = typeof value === 'string' ? `“${value}”` : (JSON.stringify(value) ?? 'none');
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}

/** How many leaves of two values differ, where one has a leaf the other lacks counting as one. */
function leafDifferences(a: unknown, b: unknown): number {
  if (same(a, b)) return 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    let n = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) n += leafDifferences(a[i], b[i]);
    return n;
  }
  if (isObject(a) && isObject(b)) {
    let n = 0;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      n += leafDifferences(a[key], b[key]);
    }
    return n;
  }
  return 1;
}

interface Layer {
  id: string;
  name?: string;
  bindings?: Record<string, unknown>;
}

const isLayers = (v: unknown): v is Layer[] =>
  Array.isArray(v) && v.every((l) => isObject(l) && typeof l.id === 'string');

/** The layers of two versions of a layout, one line for each that differs. */
function layerLines(mine: Layer[], theirs: Layer[]): string[] {
  const lines: string[] = [];
  const ids = [...new Set([...mine.map((l) => l.id), ...theirs.map((l) => l.id)])];
  for (const id of ids) {
    const a = mine.find((l) => l.id === id);
    const b = theirs.find((l) => l.id === id);
    const label = `layer ${a?.name ?? b?.name ?? id}`;
    if (!b) lines.push(`${label}: only in this browser`);
    else if (!a) lines.push(`${label}: only in GitHub`);
    else if (!same(a, b)) {
      const keys = new Set([...Object.keys(a.bindings ?? {}), ...Object.keys(b.bindings ?? {})]);
      const changed = [...keys].filter((k) => !same(a.bindings?.[k], b.bindings?.[k])).length;
      lines.push(
        changed > 0
          ? `${label}: ${count(changed, 'key')} differ${changed === 1 ? 's' : ''}`
          : `${label}: its name or colour differs`,
      );
    }
  }
  return lines;
}

/** Items of two lists that the other lacks, compared whole. */
function listLine(key: string, a: unknown[], b: unknown[]): string {
  const left = new Set(b.map((x) => stableStringify(x)));
  const right = new Set(a.map((x) => stableStringify(x)));
  const onlyMine = a.filter((x) => !left.has(stableStringify(x))).length;
  const onlyTheirs = b.filter((x) => !right.has(stableStringify(x))).length;
  const parts = [
    onlyMine > 0 ? `${onlyMine} only in this browser` : '',
    onlyTheirs > 0 ? `${onlyTheirs} only in GitHub` : '',
  ].filter(Boolean);
  return `${key}: ${parts.join(', ') || 'in a different order'}`;
}

/**
 * What differs between this browser's version of a document and GitHub's, in a few lines a person
 * can weigh before choosing: a name or a note that changed is shown as it reads in each, a layer or
 * a list as how many of its parts differ.
 */
export function describeDifferences(mine: unknown, theirs: unknown): string[] {
  if (!isObject(mine) || !isObject(theirs)) return ['The two versions differ.'];
  const lines: string[] = [];
  const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])]
    .filter((k) => k !== 'format' && k !== 'id')
    .sort();
  for (const key of keys) {
    const a = mine[key];
    const b = theirs[key];
    if (same(a, b)) continue;
    if (key === 'layers' && isLayers(a) && isLayers(b)) lines.push(...layerLines(a, b));
    else if (Array.isArray(a) && Array.isArray(b)) lines.push(listLine(key, a, b));
    else if (isObject(a) || isObject(b) || Array.isArray(a) || Array.isArray(b)) {
      const n = leafDifferences(a, b);
      lines.push(`${key}: ${count(n, 'setting')} differ${n === 1 ? 's' : ''}`);
    } else lines.push(`${key}: ${short(a)} in this browser, ${short(b)} in GitHub`);
  }
  if (lines.length === 0) return ['The two versions differ.'];
  return lines.length > MAX_LINES
    ? [...lines.slice(0, MAX_LINES), `and ${lines.length - MAX_LINES} more`]
    : lines;
}

/**
 * A link that opens the two versions of a layout side by side in Compare, which says which is
 * which by name; null for anything but a layout that reads as one.
 */
export async function compareLink(conflict: Conflict): Promise<string | null> {
  // A layout the account deleted has no second version to open.
  if (conflict.collection !== 'layouts' || conflict.theirs === null) return null;
  const mine = safeParseLayout(conflict.mine.doc);
  const theirs = safeParseLayout(conflict.theirs.doc);
  if (!mine.ok || !theirs.ok) return null;
  // Each version is a view of the conflict, not the layout: with the layout's id inside, Analyze
  // would open it as the custom layout, and saving it under its new name would move that layout
  // there, the other version gone with it. Without the id, saving one makes a copy.
  const named = ({ id: _id, ...layout }: Layout, where: string): Layout => ({
    ...layout,
    name: `${layout.name} (${where})`,
  });
  const [a, b] = await Promise.all([
    encodeInline(named(mine.layout, 'this browser')),
    encodeInline(named(theirs.layout, 'GitHub')),
  ]);
  // After the `#`, where layouts that were never saved travel: too long for an address's query.
  const fragment = new URLSearchParams({ layout: inlineRef(a), b: inlineRef(b) });
  return `${import.meta.env.BASE_URL}compare#${fragment}`;
}
