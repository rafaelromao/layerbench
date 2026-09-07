import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundledLayout, toCanonicalJson } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { decodeInline, encodeInline } from './inline.js';

/** A blob produced by the reference implementation, kept as a compatibility fixture. */
function referenceBlob(): string {
  return readFileSync(
    resolve(process.cwd(), '../../packages/core/golden/inline-magic-romak.txt'),
    'utf8',
  ).trim();
}

describe('inline layout links', () => {
  it('round-trips a layout', async () => {
    const layout = bundledLayout('romak-24')!;
    const blob = await encodeInline(layout);
    expect(blob).not.toContain('=');
    expect(blob).not.toMatch(/[+/]/);
    const decoded = await decodeInline(blob);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(toCanonicalJson(decoded.layout)).toEqual(toCanonicalJson(layout));
  });

  it('reads a link written by the reference implementation', async () => {
    const decoded = await decodeInline(referenceBlob());
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.layout.name).toBe('Magic Romak');
    expect(toCanonicalJson(decoded.layout)).toEqual(toCanonicalJson(bundledLayout('magic-romak')!));
  });

  it('reports a corrupt blob instead of throwing', async () => {
    const decoded = await decodeInline('not-a-real-blob');
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error).toBe('invalid inline layout');
  });
});
