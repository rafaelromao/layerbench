import type { LayoutSummary } from './use-summaries.js';

/**
 * The last ranking seen on each set of choices, kept in this browser so the Library opens in the
 * order it was left: each layout's numbers, and which layouts went behind for the text's language.
 * They are kept by layout rather than by what was analyzed, so a saved layout takes its place before
 * its document is read. They may have been computed by an older engine, rule definition or version
 * of the layout, so they are only shown until the same work is done again in the background.
 */
const STORE_KEY = 'layerbench:ranking';
/** Enough for a few texts and rule sets; the one written longest ago goes first. */
const CONTEXT_LIMIT = 10;

// Scores used to be kept by a hash of what was analyzed; nothing reads them any more.
try {
  localStorage.removeItem('layerbench:summaries');
} catch {
  // Without site data there is nothing to drop.
}

export interface RememberedRanking {
  /** Each layout's numbers, by its key in the list. */
  summaries: Map<string, LayoutSummary>;
  /** The layouts ranked behind, for lacking letters the text's language needs. */
  behind: Set<string>;
}

interface Stored {
  summaries: Record<string, LayoutSummary>;
  behind: string[];
}

export function isSummary(value: unknown): value is LayoutSummary {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  const num = (v: unknown) => v === null || typeof v === 'number';
  return num(o.effort) && num(o.sfb) && typeof o.skipped === 'number' && Array.isArray(o.missing);
}

/** Every ranking kept, oldest first, with whatever does not read as one left out. */
function readAll(): Map<string, Stored> {
  const out = new Map<string, Stored>();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return out;
    for (const [context, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const { summaries, behind } = value as Record<string, unknown>;
      const kept: Stored = { summaries: {}, behind: [] };
      if (summaries && typeof summaries === 'object') {
        for (const [key, summary] of Object.entries(summaries)) {
          if (isSummary(summary)) kept.summaries[key] = summary;
        }
      }
      if (Array.isArray(behind)) kept.behind = behind.filter((k) => typeof k === 'string');
      out.set(context, kept);
    }
  } catch {
    // Unreadable, so nothing is remembered.
  }
  return out;
}

/** Change one ranking and keep it as the newest. */
function update(context: string, change: (ranking: Stored) => void): void {
  try {
    const all = readAll();
    const ranking = all.get(context) ?? { summaries: {}, behind: [] };
    all.delete(context);
    change(ranking);
    all.set(context, ranking);
    const kept = [...all].slice(-CONTEXT_LIMIT);
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Without site data the list is simply ranked afresh on each visit.
  }
}

/** What the last visit found on these choices; empty when there was none. */
export function recall(context: string): RememberedRanking {
  const ranking = readAll().get(context);
  return {
    summaries: new Map(Object.entries(ranking?.summaries ?? {})),
    behind: new Set(ranking?.behind ?? []),
  };
}

export function rememberSummary(context: string, key: string, summary: LayoutSummary): void {
  update(context, (ranking) => {
    ranking.summaries[key] = summary;
  });
}

/** Whether each layout decided went behind; the others keep what was remembered of them. */
export function rememberBehind(context: string, decided: ReadonlyMap<string, boolean>): void {
  update(context, (ranking) => {
    const behind = new Set(ranking.behind);
    for (const [key, isBehind] of decided) {
      if (isBehind) behind.add(key);
      else behind.delete(key);
    }
    ranking.behind = [...behind];
  });
}
