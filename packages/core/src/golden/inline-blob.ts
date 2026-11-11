import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

/**
 * The share blob of `encoded`, a layout's JSON: deflated and base64url, as `?layout=inline:…`
 * carries it. `existing`, the file as it is, is kept when it holds the same text: zlib writes
 * other bytes for the same text from one Node to the next, so a dump on another Node than the one
 * that wrote the file would rewrite it for nothing, and put that in every pull request that runs
 * the dump, a proposal's among them. Text that changed, or a file that is missing or unreadable,
 * is written afresh.
 */
export function inlineBlob(existing: string | null, encoded: string): string {
  if (existing !== null) {
    try {
      const text = inflateSync(Buffer.from(existing.trim(), 'base64url')).toString('utf8');
      if (text === encoded) return existing;
    } catch {
      // Not a blob: written again below.
    }
  }
  return deflateSync(Buffer.from(encoded, 'utf8')).toString('base64url');
}

/** Writes the share blob of `encoded` to `path` unless the file holds it already; whether it did. */
export function writeInlineBlob(path: string, encoded: string): boolean {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const blob = inlineBlob(existing, encoded);
  if (blob === existing) return false;
  writeFileSync(path, blob);
  return true;
}
