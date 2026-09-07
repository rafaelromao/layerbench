import { getGeometryPreset } from '../geometry/presets.js';
import type { Geometry } from '../geometry/types.js';
import type { Binding, Layout } from './types.js';

export interface TextImportResult {
  layout: Layout;
  /** Symbols that did not fit on the geometry. */
  overflow: string[];
  warnings: string[];
}

/**
 * Parse a classic text layout. Accepted forms:
 * - rows separated by newlines or `/`, tokens separated by spaces (multi-character tokens allowed);
 * - a 30-character string (cmini 3×10);
 * - cyanophage 33/34/35-character strings (11+11+10 + `\` + thumb).
 * The optional 4th row holds thumb keys.
 */
export function parseTextLayout(text: string): {
  rows: string[][];
  thumbs: string[];
  extras: string[];
} {
  const trimmed = text.trim();
  const lines = trimmed.includes('\n')
    ? trimmed.split(/\n+/)
    : trimmed.includes('/') && trimmed.length > 34
      ? trimmed.split('/')
      : null;
  if (lines && lines.length >= 3) {
    const rows = lines.slice(0, 3).map((l) => l.trim().split(/\s+/).filter(Boolean));
    const thumbs = lines.length > 3 ? lines[3].trim().split(/\s+/).filter(Boolean) : [];
    return { rows, thumbs, extras: [] };
  }
  const compact = trimmed.replace(/\s+/g, '');
  const chars = Array.from(compact);
  if (chars.length === 30)
    return {
      rows: [chars.slice(0, 10), chars.slice(10, 20), chars.slice(20, 30)],
      thumbs: [],
      extras: [],
    };
  if (chars.length >= 33 && chars.length <= 35) {
    // cyanophage: row0 = 10 + right outer, row1 = 10 + right outer, row2 = 10, then `\` (left outer bottom), then thumb key(s)
    const rows = [chars.slice(0, 10), chars.slice(11, 21), chars.slice(22, 32)];
    const extras = [chars[10], chars[21]];
    const rest = chars.slice(32).filter((c) => c !== '\\');
    return { rows, thumbs: rest.filter((c) => c !== '^'), extras };
  }
  // Fallback: split on whitespace into 3 equal rows.
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const per = Math.ceil(tokens.length / 3);
  return {
    rows: [tokens.slice(0, per), tokens.slice(per, 2 * per), tokens.slice(2 * per)],
    thumbs: [],
    extras: [],
  };
}

/**
 * Map a 3-row text layout onto a geometry preset's base layer.
 * Row tokens are laid out left→right using the geometry's text row order; extra tokens overflow.
 */
export function importTextLayout(
  text: string,
  presetId = '3x5+2',
  name = 'Imported layout',
): TextImportResult {
  const geometry = getGeometryPreset(presetId);
  const { rows, thumbs, extras } = parseTextLayout(text);
  const bindings: Record<string, Binding> = {};
  const overflow: string[] = [];
  const warnings: string[] = [];
  // Extra right-outer symbols (cyanophage `-` and `'`) go to outer keys when the geometry has them.
  extras.forEach((tok, r) => {
    const id = geometry.textRows[r]?.find((k) => k.startsWith('R') && k.endsWith('O'));
    if (id) bindings[id] = { kind: 'kp', symbol: tok };
    else overflow.push(tok);
  });
  rows.forEach((tokens, r) => {
    const ids = geometry.textRows[r] ?? [];
    const placement = placeRow(tokens, ids);
    for (const [id, tok] of placement.placed) bindings[id] = { kind: 'kp', symbol: tok };
    overflow.push(...placement.overflow);
  });
  const thumbIds = geometry.textThumbs;
  let spaceKey = thumbIds[Math.floor(thumbIds.length / 2)] ?? thumbIds[0];
  thumbs.forEach((tok, i) => {
    const id = thumbIds[i];
    if (!id) {
      overflow.push(tok);
      return;
    }
    if (tok === 'space' || tok === '␣' || tok === '_') spaceKey = id;
    else bindings[id] = { kind: 'kp', symbol: tok };
  });
  if (!bindings[spaceKey]) bindings[spaceKey] = { kind: 'kp', symbol: ' ' };
  else {
    // The chosen space key already carries a letter: pick another thumb.
    const free = thumbIds.find((id) => !bindings[id]);
    if (free) {
      spaceKey = free;
      bindings[free] = { kind: 'kp', symbol: ' ' };
    } else warnings.push('No free thumb key for space; space shares a key');
  }
  const layout: Layout = {
    format: 'layoutmaster/layout@1',
    name,
    hostLocale: 'symbols',
    geometry: { preset: presetId },
    keys: { space: spaceKey },
    layers: [{ id: 'base', name: 'Base', bindings }],
  };
  return { layout, overflow, warnings };
}

function placeRow(
  tokens: string[],
  ids: string[],
): { placed: [string, string][]; overflow: string[] } {
  const placed: [string, string][] = [];
  const overflow: string[] = [];
  // Standard case: token count equals key count.
  if (tokens.length === ids.length) {
    tokens.forEach((t, i) => {
      placed.push([ids[i], t]);
    });
    return { placed, overflow };
  }
  // 10 tokens onto an 11/12-key row (rowstagger with outer keys): fill from the pinky columns inward.
  // Strategy: split tokens into left/right halves and place them inner-most first from each hand's inner column.
  const half = Math.ceil(tokens.length / 2);
  const left = tokens.slice(0, half);
  const right = tokens.slice(half);
  const leftIds = ids.filter((id) => id.startsWith('L'));
  const rightIds = ids.filter((id) => id.startsWith('R'));
  // Left hand: align to the innermost keys (drop outer positions first).
  const leftStart = Math.max(0, leftIds.length - left.length);
  left.forEach((t, i) => {
    const id = leftIds[leftStart + i];
    if (id) placed.push([id, t]);
    else overflow.push(t);
  });
  right.forEach((t, i) => {
    const id = rightIds[i];
    if (id) placed.push([id, t]);
    else overflow.push(t);
  });
  return { placed, overflow };
}

/** Render a layer as text rows (spaces between keys, `·` for empty positions). */
export function exportLayerText(geometry: Geometry, bindings: Record<string, Binding>): string {
  const label = (b: Binding | undefined): string => {
    if (!b) return '·';
    switch (b.kind) {
      case 'kp':
        return b.symbol === ' ' ? '␣' : (b.symbol ?? b.keycode ?? '·');
      case 'macro':
        return b.symbols ?? '⋯';
      case 'trans':
        return '_';
      case 'none':
        return '·';
      case 'sl':
        return `→${b.layer}`;
      case 'sk':
        return '⇧';
      default:
        return b.kind;
    }
  };
  const lines = geometry.textRows.map((ids) => ids.map((id) => label(bindings[id])).join(' '));
  if (geometry.textThumbs.length)
    lines.push(geometry.textThumbs.map((id) => label(bindings[id])).join(' '));
  return lines.join('\n');
}
