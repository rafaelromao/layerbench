import type { Report } from './analyze.js';

const MAX_ENTRIES = 64;
const EVICT = 16;

/**
 * Reports keyed by analysis identity. Entries hold full n-gram tables, so this lives wherever the
 * engine runs (a worker in the browser) and never crosses a message boundary.
 */
export class ReportCache {
  private readonly entries = new Map<string, Report>();

  get(key: string): Report | undefined {
    const hit = this.entries.get(key);
    if (hit === undefined) return undefined;
    // Refresh recency: Map keeps insertion order, so re-inserting moves the entry to the end.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  set(key: string, report: Report): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, report);
    if (this.entries.size > MAX_ENTRIES) {
      const stale = [...this.entries.keys()].slice(0, EVICT);
      for (const k of stale) this.entries.delete(k);
    }
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface CacheKeyParts {
  structureHash: string;
  caseMode: string;
  crossWord: string;
  maxSymbols?: number;
}

export function cacheKey(p: CacheKeyParts): string {
  return `${p.structureHash}|${p.caseMode}|${p.crossWord}|${p.maxSymbols ?? 'all'}`;
}
