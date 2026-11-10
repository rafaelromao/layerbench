import type { Collection } from '@layerbench/core';

/** Where the marks are kept between visits; tests keep them in memory. */
export interface MarksBacking {
  read(): string | null;
  write(text: string): void;
}

const KEY = 'layerbench:unsynced';

/** The browser's site data; without it the marks last as long as the page does. */
function browserBacking(): MarksBacking {
  let memory: string | null = null;
  // Once the browser refuses a write (no site data, or no room), what it holds is out of date: the
  // marks are the page's own from then on, rather than going missing.
  let refused = false;
  return {
    read() {
      if (refused) return memory;
      try {
        return localStorage.getItem(KEY);
      } catch {
        return memory;
      }
    },
    write(text) {
      memory = text;
      try {
        localStorage.setItem(KEY, text);
      } catch {
        refused = true;
      }
    },
  };
}

/** What is kept: the unsent documents, and the version of each last known to be in both stores. */
interface Kept {
  unsent: string[];
  base: Record<string, string>;
  /** Who this browser's documents were last sent to: the login of a GitHub account. */
  account?: string;
  /** When this browser's documents were last looked at against the gists', in epoch milliseconds. */
  audited?: number;
}

interface Read {
  unsent: Set<string>;
  base: Map<string, string>;
  account: string | null;
  audited: number;
}

/**
 * The documents saved in this browser that the gists may not have: one that was saved while nobody
 * was signed in, or whose write to the gists failed. A save that reached both stores leaves no
 * mark. Dates alone cannot tell a copy that has fallen behind from an edit made here and never
 * sent, so each such edit is marked, and the mark goes once the gists hold it, or the user has
 * chosen between it and what the gists hold instead.
 *
 * Each document also has the version both stores last held the same of, its base: a mark whose
 * base is still what the gists hold is an edit nobody else has touched, which goes up; one whose
 * base is not has been changed in both places, which is a conflict for the user to settle.
 */
export class Unsynced {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly backing: MarksBacking = browserBacking()) {}

  private read(): Read {
    try {
      const parsed = JSON.parse(this.backing.read() ?? '{}') as Partial<Kept> | null;
      const unsent = Array.isArray(parsed?.unsent)
        ? parsed.unsent.filter((k) => typeof k === 'string')
        : [];
      const base = Object.entries(parsed?.base ?? {}).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      );
      const account = typeof parsed?.account === 'string' ? parsed.account : null;
      const audited = typeof parsed?.audited === 'number' ? parsed.audited : 0;
      return { unsent: new Set(unsent), base: new Map(base), account, audited };
    } catch {
      return { unsent: new Set(), base: new Map(), account: null, audited: 0 };
    }
  }

  private write(kept: Read): void {
    const text = JSON.stringify({
      unsent: [...kept.unsent].sort(),
      base: Object.fromEntries([...kept.base].sort(([a], [b]) => a.localeCompare(b))),
      ...(kept.account !== null && { account: kept.account }),
      ...(kept.audited > 0 && { audited: kept.audited }),
    } satisfies Kept);
    this.backing.write(text);
    this.notify();
  }

  /** Tell everything listening that the marks may have changed, e.g. by another tab. */
  notify(): void {
    for (const listener of this.listeners) listener();
  }

  has(collection: Collection, id: string): boolean {
    return this.read().unsent.has(`${collection}/${id}`);
  }

  mark(collection: Collection, id: string): void {
    const kept = this.read();
    if (kept.unsent.has(`${collection}/${id}`)) return;
    kept.unsent.add(`${collection}/${id}`);
    this.write(kept);
  }

  clear(collection: Collection, id: string): void {
    const kept = this.read();
    if (kept.unsent.delete(`${collection}/${id}`)) this.write(kept);
  }

  /** The version of a document both stores last held the same of; null when never known. */
  base(collection: Collection, id: string): string | null {
    return this.read().base.get(`${collection}/${id}`) ?? null;
  }

  setBase(collection: Collection, id: string, sha: string): void {
    const kept = this.read();
    if (kept.base.get(`${collection}/${id}`) === sha) return;
    kept.base.set(`${collection}/${id}`, sha);
    this.write(kept);
  }

  /** The ids of the documents of `collection` that are marked. */
  marked(collection: Collection): string[] {
    const prefix = `${collection}/`;
    return [...this.read().unsent]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  /** Forget everything known of a document: it is gone from this browser. */
  forget(collection: Collection, id: string): void {
    const kept = this.read();
    const key = `${collection}/${id}`;
    const had = kept.unsent.delete(key);
    if (kept.base.delete(key) || had) this.write(kept);
  }

  /** Who this browser's documents were last sent to, if anyone. */
  account(): string | null {
    return this.read().account;
  }

  setAccount(login: string): void {
    const kept = this.read();
    if (kept.account === login) return;
    kept.account = login;
    this.write(kept);
  }

  /** When this browser's documents were last looked at against the gists': 0 if never. */
  audited(): number {
    return this.read().audited;
  }

  setAudited(at: number): void {
    const kept = this.read();
    kept.audited = at;
    this.write(kept);
  }

  /** How many documents are marked: the ones saved here and not sent. */
  readonly count = (): number => this.read().unsent.size;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/** The marks of this browser, which every storage the app builds shares. */
export const unsynced = new Unsynced();

// Another tab saving here, or sending, changes them: this one hears it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) unsynced.notify();
  });
}
