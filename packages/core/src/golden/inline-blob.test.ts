import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inlineBlob, writeInlineBlob } from './inline-blob.js';

const TEXT = JSON.stringify({
  name: 'Layout',
  keys: Array.from({ length: 200 }, (_, i) => `k${i}`),
});
const blob = (text: string, level?: number) =>
  deflateSync(Buffer.from(text, 'utf8'), { level }).toString('base64url');
const decoded = (b: string) => inflateSync(Buffer.from(b, 'base64url')).toString('utf8');

describe('the share blob of a golden dump', () => {
  it('keeps the file as it is when it holds the same text, whatever bytes zlib wrote it as', () => {
    // The same text, deflated another way, as another Node's zlib does.
    const other = blob(TEXT, 1);
    expect(other).not.toBe(blob(TEXT, 9));
    expect(inlineBlob(other, TEXT)).toBe(other);
    expect(inlineBlob(blob(TEXT, 9), TEXT)).toBe(blob(TEXT, 9));
    // As written to a file: a trailing newline is the file's, not the blob's.
    expect(inlineBlob(`${other}\n`, TEXT)).toBe(`${other}\n`);
  });

  it('writes the new text when it changed', () => {
    const changed = `${TEXT} `;
    const written = inlineBlob(blob(TEXT), changed);
    expect(decoded(written)).toBe(changed);
  });

  it('writes the text when there is no file, or what it holds is no blob', () => {
    expect(decoded(inlineBlob(null, TEXT))).toBe(TEXT);
    expect(decoded(inlineBlob('not a blob at all', TEXT))).toBe(TEXT);
    expect(decoded(inlineBlob('', TEXT))).toBe(TEXT);
  });

  it('writes the file only when it has to', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inline-blob-'));
    try {
      const path = join(dir, 'inline.txt');
      // None yet: written. The same text in other bytes: left alone. Other text: written.
      expect(writeInlineBlob(path, TEXT)).toBe(true);
      const other = blob(TEXT, 1);
      writeFileSync(path, other);
      expect(writeInlineBlob(path, TEXT)).toBe(false);
      expect(readFileSync(path, 'utf8')).toBe(other);
      expect(writeInlineBlob(path, `${TEXT} `)).toBe(true);
      expect(decoded(readFileSync(path, 'utf8'))).toBe(`${TEXT} `);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
