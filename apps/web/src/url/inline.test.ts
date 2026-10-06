import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundledLayout, toCanonicalJson } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { decodeInline, encodeInline, MAX_INLINE_BYTES } from './inline.js';

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

  // A link is small; what it unpacks into need not be. Reading stops at the cap.
  it('gives up on a blob that unpacks past the size any layout could have', async () => {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    const chunk = new Uint8Array(1_000_000).fill(0x20);
    const written = (async () => {
      for (let i = 0; i * chunk.length < MAX_INLINE_BYTES + chunk.length; i++) {
        await writer.write(chunk);
      }
      await writer.close();
    })();
    const parts: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    await written;
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      bytes.set(p, at);
      at += p.length;
    }
    expect(bytes.length).toBeLessThan(10_000);
    const blob = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const decoded = await decodeInline(blob);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error).toBe('invalid inline layout');
  });

  it('reports a corrupt blob instead of throwing', async () => {
    const decoded = await decodeInline('not-a-real-blob');
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error).toBe('invalid inline layout');
  });
});
