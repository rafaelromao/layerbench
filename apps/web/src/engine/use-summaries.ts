import {
  fnv1a,
  type Layout,
  type RuleSet,
  stableStringify,
  type TextClass,
  toCanonicalJson,
} from '@layoutmaster/core';
import { useEffect, useMemo, useState } from 'react';
import { useAnalysisClient } from './client-context.js';
import type { AnalyzeRequest, ReportDTO } from './protocol.js';

/** The two numbers layouts are ranked by. `null` when the rule set leaves the rule out. */
export interface LayoutSummary {
  effort: number | null;
  sfb: number | null;
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

/**
 * Kept for the session, never persisted: a stored summary would outlive the engine that computed
 * it, and a change to a rule's definition would go on being ranked by the old number.
 */
const cache = new Map<string, LayoutSummary>();

/**
 * How long the list is left alone before scoring starts: long enough that a reader passing through
 * on the way to another view never pays for twenty-odd analyses they will not look at.
 */
const SETTLE_MS = 800;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(report: ReportDTO): LayoutSummary {
  const value = (id: string) => {
    const v = report.results.find((r) => r.id === id)?.value;
    return typeof v === 'number' ? v : null;
  };
  return { effort: value('effort'), sfb: value('sfb') };
}

function requestFor(layout: Layout, opts: SummaryOptions): AnalyzeRequest {
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
 * Score a list of layouts in the background, one at a time. The worker is shared with every other
 * view, so the queue is abandoned the moment the list is left rather than holding up an analysis
 * the reader has since asked for.
 */
export function useSummaries(
  entries: SummaryEntry[],
  opts: SummaryOptions,
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
  // The work to do is the set of hashes; a new array with the same content is the same work.
  const identity = requests.map((r) => r.hash).join(',');

  const [summaries, setSummaries] = useState<Map<string, LayoutSummary>>(() => new Map());

  // biome-ignore lint/correctness/useExhaustiveDependencies: `identity` is the content of `requests`.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const known = new Map<string, LayoutSummary>();
    for (const r of requests) {
      const hit = cache.get(r.hash);
      if (hit) known.set(r.key, hit);
    }
    setSummaries(known);

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
          summary = { effort: null, sfb: null };
        }
        cache.set(r.hash, summary);
        if (!cancelled) setSummaries((prev) => new Map(prev).set(r.key, summary));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [identity, client]);

  const pending = requests.filter((r) => !summaries.has(r.key)).length;
  return { summaries, pending };
}

export type SortKey = 'effort' | 'sfb' | 'name';

/** Lower is better for both metrics; a layout without a number goes last. */
export function compareBy(
  key: SortKey,
  summaries: Map<string, LayoutSummary>,
): (a: { key: string; name: string }, b: { key: string; name: string }) => number {
  return (a, b) => {
    if (key !== 'name') {
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
