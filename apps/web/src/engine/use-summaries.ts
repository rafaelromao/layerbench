import {
  fnv1a,
  type Layout,
  type RuleSet,
  stableStringify,
  type TextClass,
  toCanonicalJson,
} from '@layerbench/core';
import { useEffect, useMemo, useState } from 'react';
import { useAnalysisClient } from './client-context.js';
import type { AnalyzeRequest, ReportDTO } from './protocol.js';
import { recall, rememberSummary } from './ranking-memory.js';

/** The two numbers layouts are ranked by. `null` when the rule set leaves the rule out. */
export interface LayoutSummary {
  effort: number | null;
  sfb: number | null;
  /** Share of the text's characters the layout could not type, in percent. */
  skipped: number;
  /** The characters it could not type, most frequent first. */
  missing: string[];
}

export interface SummaryOptions {
  corpusId: string;
  caseMode: AnalyzeRequest['caseMode'];
  textClass: TextClass;
  maxSymbols: number;
  ruleSet: RuleSet;
}

export interface SummaryEntry {
  key: string;
  layout: Layout | null;
}

/** Summaries this page computed itself: current by definition, so never computed twice. */
const cache = new Map<string, LayoutSummary>();

function sameSummary(a: LayoutSummary | undefined, b: LayoutSummary): boolean {
  return !!a && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * How long the list is left alone before scoring starts: long enough that a reader passing through
 * on the way to another view never pays for twenty-odd analyses they will not look at.
 */
const SETTLE_MS = 800;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A report as the Library shows it: its two numbers, and what of the text it could not type. */
export function summarize(report: ReportDTO): LayoutSummary {
  const value = (id: string) => {
    const v = report.results.find((r) => r.id === id)?.value;
    return typeof v === 'number' ? v : null;
  };
  // What the layout typed and what it had to leave out are both characters of the same text.
  const unproducible = report.coverage.unproducible;
  const left = unproducible.reduce((sum, [, count]) => sum + count, 0);
  const whole = report.stats.symbols + left;
  return {
    effort: value('effort'),
    sfb: value('sfb'),
    skipped: whole > 0 ? (left / whole) * 100 : 0,
    missing: unproducible.map(([symbol]) => symbol),
  };
}

/** What the Library asks the engine for, to score a layout. */
export function requestFor(layout: Layout, opts: SummaryOptions): AnalyzeRequest {
  return {
    layout: toCanonicalJson(layout),
    corpusId: opts.corpusId,
    caseMode: opts.caseMode,
    textClass: opts.textClass,
    crossWord: 'reset',
    maxSymbols: opts.maxSymbols,
    ruleSet: opts.ruleSet,
  };
}

/**
 * What a list opens with: what was shown already, where the list is the same ranking as before, and
 * otherwise what this page computed, then what the last visit left, for each layout.
 */
function opening(
  entries: SummaryEntry[],
  hashes: Map<string, string>,
  context: string,
  shown?: Map<string, LayoutSummary>,
): Map<string, LayoutSummary> {
  const remembered = recall(context).summaries;
  const out = new Map<string, LayoutSummary>();
  for (const { key } of entries) {
    const hash = hashes.get(key);
    const known =
      shown?.get(key) ?? (hash === undefined ? undefined : cache.get(hash)) ?? remembered.get(key);
    if (known) out.set(key, known);
  }
  return out;
}

interface Shown {
  /** What these summaries are of: the ranking, the layouts listed, and what each is scored on. */
  listing: string;
  context: string;
  summaries: Map<string, LayoutSummary>;
}

/**
 * Score a list of layouts in the background, one at a time. The list opens with the scores the last
 * visit left, kept by `context` (what is ranked on, as the link says it), so it is in the order it
 * was left from the first render, a layout whose document is still being read included. Every
 * layout is checked again here; one that had no score shows it as soon as it lands, and those whose
 * numbers changed are replaced together once all are checked, so a list that was right does not
 * move and one that was not moves once. The worker is shared with every other view, so the queue is
 * abandoned the moment the list is left rather than holding up an analysis the reader has since
 * asked for.
 */
export function useSummaries(
  entries: SummaryEntry[],
  opts: SummaryOptions,
  context: string,
): { summaries: Map<string, LayoutSummary>; pending: number } {
  const client = useAnalysisClient();
  const requests = useMemo(
    () =>
      entries
        .filter((e): e is SummaryEntry & { layout: Layout } => e.layout !== null)
        .map((e) => {
          const request = requestFor(e.layout, opts);
          return { key: e.key, request, hash: fnv1a(stableStringify(request)) };
        }),
    [entries, opts],
  );
  // A new array with the same content is the same list: what is ranked on, the layouts listed (one
  // still being read is listed by what was remembered of it), and the work to do for each.
  const listing = [
    context,
    entries.map((e) => e.key).join(','),
    requests.map((r) => r.hash).join(','),
  ].join('\n');

  const [state, setState] = useState<Shown>(() => ({
    listing,
    context,
    summaries: opening(entries, new Map(requests.map((r) => [r.key, r.hash])), context),
  }));
  // A different list is worked out while rendering, not after, so no frame shows the old one. The
  // same ranking keeps what it showed; a different one opens on what is known of it.
  let shown = state;
  if (state.listing !== listing) {
    const hashes = new Map(requests.map((r) => [r.key, r.hash]));
    const kept = state.context === context ? state.summaries : undefined;
    shown = { listing, context, summaries: opening(entries, hashes, context, kept) };
    setState(shown);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `listing` is the content of `requests` and `context`.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    /** A change to this list only: one the list has moved on from is dropped. */
    const change = (next: (prev: Map<string, LayoutSummary>) => Map<string, LayoutSummary>) =>
      setState((prev) => {
        if (prev.listing !== listing) return prev;
        const summaries = next(prev.summaries);
        return summaries === prev.summaries ? prev : { ...prev, summaries };
      });

    (async () => {
      // Scoring is background work and the list is useful without it, so the page renders and
      // settles first; a visit that moves on straight away costs nothing at all.
      await pause(SETTLE_MS);
      for (const r of requests) {
        if (cancelled) return;
        if (cache.has(r.hash)) continue;
        // Hand the thread back between layouts. Where the engine runs in-thread rather than in a
        // worker, an unbroken chain of analyses would otherwise starve every timer and click.
        await pause(0);
        if (cancelled) return;
        let summary: LayoutSummary;
        try {
          const report =
            (await client.peek(r.request)) ??
            (await client.analyze(r.request, { signal: controller.signal }));
          summary = summarize(report);
        } catch (e) {
          if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
          // A layout that cannot be analyzed ranks last rather than stopping the others.
          summary = { effort: null, sfb: null, skipped: 0, missing: [] };
        }
        cache.set(r.hash, summary);
        // Kept as it lands, so a visit left halfway still opens the next on what it found.
        rememberSummary(context, r.key, summary);
        if (cancelled) return;
        // A layout with no score yet shows it now; one already showing a score waits for the rest.
        change((prev) => (prev.has(r.key) ? prev : new Map(prev).set(r.key, summary)));
      }
      if (cancelled) return;
      // Every layout checked: those whose numbers changed move together, and only those.
      change((prev) => {
        let next: Map<string, LayoutSummary> | null = null;
        for (const r of requests) {
          const checked = cache.get(r.hash);
          if (!checked || sameSummary(prev.get(r.key), checked)) continue;
          next ??= new Map(prev);
          next.set(r.key, checked);
        }
        return next ?? prev;
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [listing, client]);

  const pending = requests.filter((r) => !shown.summaries.has(r.key)).length;
  return { summaries: shown.summaries, pending };
}

export type SortKey = 'effort' | 'sfb' | 'name';

/**
 * Lower is better for both metrics; a layout without a number, or not scored yet, goes last. Layouts
 * in `behind` — those missing letters the text's language cannot be written without — rank after
 * every other, each group in its own order: a layout skipping `ç` is spared what it costs to type.
 */
export function compareBy(
  key: SortKey,
  summaries: Map<string, LayoutSummary>,
  behind: ReadonlySet<string> = new Set(),
): (a: { key: string; name: string }, b: { key: string; name: string }) => number {
  return (a, b) => {
    if (key !== 'name') {
      const group = Number(behind.has(a.key)) - Number(behind.has(b.key));
      if (group !== 0) return group;
      const va = summaries.get(a.key)?.[key] ?? null;
      const vb = summaries.get(b.key)?.[key] ?? null;
      if (va !== vb) {
        if (va === null) return 1;
        if (vb === null) return -1;
        return va - vb;
      }
    }
    return a.name.localeCompare(b.name);
  };
}
