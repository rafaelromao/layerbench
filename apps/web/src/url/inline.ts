import type { Layout } from '@layoutmaster/core';
import { safeParseLayout, toCanonicalJson } from '@layoutmaster/core';

/**
 * A whole layout carried in a link. The blob is the canonical document, deflate-compressed and
 * base64url-encoded without padding — the same framing the reference implementation uses, so links
 * pass in both directions.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(blob: string): Uint8Array {
  const padded = blob.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * More than any layout document comes to. Deflate reaches a thousand to one, so a link of a few
 * kilobytes could otherwise unpack into hundreds of megabytes before the JSON is even looked at.
 */
export const MAX_INLINE_BYTES = 2_000_000;

async function collect(stream: ReadableStream<Uint8Array>, max = Infinity): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new Error('inline layout too large');
    }
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function pipe(data: Uint8Array, transform: 'deflate' | 'inflate'): Promise<Uint8Array> {
  const cs =
    transform === 'deflate' ? new CompressionStream('deflate') : new DecompressionStream('deflate');
  const writer = cs.writable.getWriter();
  // Corrupt input rejects on both ends of the stream; the read side is where it is reported, so the
  // write side is swallowed rather than surfacing as an unhandled rejection.
  const written = writer
    .write(data as unknown as BufferSource)
    .then(() => writer.close())
    .catch(() => {});
  const out = await collect(cs.readable, transform === 'inflate' ? MAX_INLINE_BYTES : Infinity);
  await written;
  return out;
}

/** Compress a layout into the blob used by `?layout=inline:…`. */
export async function encodeInline(layout: Layout): Promise<string> {
  const json = JSON.stringify(toCanonicalJson(layout));
  const deflated = await pipe(new TextEncoder().encode(json), 'deflate');
  return bytesToBase64Url(deflated);
}

/** Read a layout back out of an inline blob. */
export async function decodeInline(
  blob: string,
): Promise<{ ok: true; layout: Layout } | { ok: false; error: string }> {
  try {
    const inflated = await pipe(base64UrlToBytes(blob), 'inflate');
    const parsed = safeParseLayout(JSON.parse(new TextDecoder().decode(inflated)));
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, layout: parsed.layout };
  } catch {
    return { ok: false, error: 'invalid inline layout' };
  }
}
