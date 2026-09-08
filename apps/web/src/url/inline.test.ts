import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundledLayout, toCanonicalJson } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { decodeInline, encodeInline } from './inline.js';

function blobFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), `../../packages/core/golden/${name}`), 'utf8').trim();
}

describe('inline layout links', () => {
  it('round-trips a layout', async () => {
    const layout = bundledLayout('colemak-dh')!;
    const blob = await encodeInline(layout);
    expect(blob).not.toContain('=');
    expect(blob).not.toMatch(/[+/]/);
    const decoded = await decodeInline(blob);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(toCanonicalJson(decoded.layout)).toEqual(toCanonicalJson(layout));
  });

  it('reads the blob this engine writes for Magic Romak', async () => {
    const decoded = await decodeInline(blobFixture('inline-magic-romak.txt'));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(toCanonicalJson(decoded.layout)).toEqual(toCanonicalJson(bundledLayout('magic-romak')!));
  });

  // Links shared from the Elixir implementation carry a document written by a different deflate and
  // an older Magic Romak. They must still open, whatever the shipped layout looks like now.
  it('still opens a link written by the Elixir implementation', async () => {
    const decoded = await decodeInline(blobFixture('inline-magic-romak-elixir.txt'));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.layout.name).toBe('Magic Romak');
    expect(decoded.layout.layers.length).toBeGreaterThan(0);
  });

  it('reports a corrupt blob instead of throwing', async () => {
    const decoded = await decodeInline('not-a-real-blob');
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error).toBe('invalid inline layout');
  });
});
