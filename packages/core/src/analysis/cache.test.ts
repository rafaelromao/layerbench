import { describe, expect, it } from 'vitest';
import type { Report } from './analyze.js';
import { ReportCache } from './cache.js';

const report = (n: number) => ({ n }) as unknown as Report;

describe('the report cache', () => {
  it('returns what was stored, and nothing for an unknown key', () => {
    const cache = new ReportCache();
    const r = report(1);
    cache.set('a', r);
    expect(cache.get('a')).toBe(r);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.size).toBe(1);
  });

  it('replaces a key set twice and empties on clear', () => {
    const cache = new ReportCache();
    cache.set('a', report(1));
    const second = report(2);
    cache.set('a', second);
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe(second);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('drops the least recently used entries once it passes its limit', () => {
    const cache = new ReportCache();
    for (let i = 0; i < 64; i++) cache.set(`k${i}`, report(i));
    // Reading k0 makes it the most recent, so it outlives the sweep.
    cache.get('k0');
    cache.set('k64', report(64));
    expect(cache.has('k0')).toBe(true);
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k16')).toBe(false);
    expect(cache.has('k17')).toBe(true);
    expect(cache.has('k64')).toBe(true);
    expect(cache.size).toBe(65 - 16);
  });
});
