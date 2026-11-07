import {
  type AnalysisSettings,
  analysisKey,
  forRanking,
  getPreset,
  type Layout,
  toCanonicalJson,
} from '@layerbench/core';
import { useEffect, useMemo, useState } from 'react';
import { parseParams, settingsOf } from '../url/params.js';
import { useAnalysisClient } from './client-context.js';
import { type HeatSource, heatSourceOf } from './heat.js';
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

export interface SummaryEntry {
  key: string;
  layout: Layout | null;
}

/** Summaries this page computed itself: current by definition, so never computed twice. */
const cache = new Map<string, LayoutSummary>();

/**
 * What a heat map of each layout is drawn from, kept as the layout is scored, by the same key: the
 * report is in hand for that moment and the Library asks the worker for nothing more. `null` is a
 * layout that could not be analyzed. In memory only, and no more than `MAX_HEATS` of them, the oldest
 * let go first: each is a few kilobytes, and a score is a handful of numbers.
 */
const heats = new Map<string, HeatSource | null>();
const MAX_HEATS = 512;

function keepHeat(hash: string, heat: HeatSource | null): void {
  heats.delete(hash);
  heats.set(hash, heat);
  const oldest = heats.keys().next();
  if (heats.size > MAX_HEATS && !oldest.done) heats.delete(oldest.value);
}

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

/**
 * What the Library ranks on, with its rules read, for a link that names only `corpus`: what the
 * workflows' summaries score layouts on, as a reviewer opening the Library on that text sees them.
 */
export function libraryRanking(corpus: string): AnalysisSettings {
  const linked = forRanking(settingsOf(parseParams({ corpus }, corpus)));
  return { ...linked, rules: getPreset(linked.rules) };
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
  /**
   * What each layout's heat is drawn from, as it was analyzed on these settings: never what an
   * older layout of the same name had. A layout still to be analyzed has none yet.
   */
  heats: Map<string, HeatSource | null>;
}

/** The heat already worked out for each of these requests, whatever the list showed before. */
function openingHeats(requests: { key: string; hash: string }[]): Map<string, HeatSource | null> {
  const out = new Map<string, HeatSource | null>();
  for (const { key, hash } of requests) {
    const known = heats.get(hash);
    if (known !== undefined) out.set(key, known);
  }
  return out;
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
  settings: AnalysisSettings | null,
  context: string,
  /**
   * Whether the list wants each layout's heat as well as its score. A heat is kept whenever a
   * layout is analyzed, but one let go (see `MAX_HEATS`) is analyzed again only for a list that
   * wants it: a score alone is never worth it.
   */
  withHeat = false,
): {
  summaries: Map<string, LayoutSummary>;
  /** What each layout's heat map is drawn from, as it lands with its score; `null` if it failed. */
  heats: Map<string, HeatSource | null>;
  pending: number;
} {
  const client = useAnalysisClient();
  const requests = useMemo(
    () =>
      // Settings not yet known score nothing, and nothing is remembered of them.
      settings === null
        ? []
        : entries
            .filter((e): e is SummaryEntry & { layout: Layout } => e.layout !== null)
            .map((e) => {
              const request: AnalyzeRequest = { layout: toCanonicalJson(e.layout), settings };
              return { key: e.key, request, hash: analysisKey(e.layout, settings).key };
            }),
    [entries, settings],
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
    heats: openingHeats(requests),
  }));
  // A different list is worked out while rendering, not after, so no frame shows the old one. The
  // same ranking keeps what it showed; a different one opens on what is known of it.
  let shown = state;
  if (state.listing !== listing) {
    const hashes = new Map(requests.map((r) => [r.key, r.hash]));
    const kept = state.context === context ? state.summaries : undefined;
    // A heat is of the layout as analyzed, so it is found by the analysis it came from, never kept
    // from the list before: a layout edited since would be drawn on keys it no longer has.
    shown = {
      listing,
      context,
      summaries: opening(entries, hashes, context, kept),
      heats: openingHeats(requests),
    };
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
    /** A heat shows as soon as it lands: nothing is ordered by it, so there is nothing to hold back. */
    const landHeat = (key: string, heat: HeatSource | null) =>
      setState((prev) =>
        prev.listing !== listing || (prev.heats.has(key) && prev.heats.get(key) === heat)
          ? prev
          : { ...prev, heats: new Map(prev.heats).set(key, heat) },
      );

    (async () => {
      // Scoring is background work and the list is useful without it, so the page renders and
      // settles first; a visit that moves on straight away costs nothing at all.
      await pause(SETTLE_MS);
      for (const r of requests) {
        if (cancelled) return;
        if (cache.has(r.hash)) {
          // Another layout of the same analysis may have landed it since this list was opened.
          if (heats.has(r.hash)) {
            landHeat(r.key, heats.get(r.hash) as HeatSource | null);
            continue;
          }
          if (!withHeat) continue;
        }
        // Hand the thread back between layouts. Where the engine runs in-thread rather than in a
        // worker, an unbroken chain of analyses would otherwise starve every timer and click.
        await pause(0);
        if (cancelled) return;
        let summary: LayoutSummary;
        let heat: HeatSource | null;
        try {
          const report =
            (await client.peek(r.request)) ??
            (await client.analyze(r.request, { signal: controller.signal }));
          summary = summarize(report);
          heat = heatSourceOf(report);
        } catch (e) {
          if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
          // A layout that cannot be analyzed ranks last rather than stopping the others.
          summary = { effort: null, sfb: null, skipped: 0, missing: [] };
          heat = null;
        }
        cache.set(r.hash, summary);
        keepHeat(r.hash, heat);
        // Kept as it lands, so a visit left halfway still opens the next on what it found.
        rememberSummary(context, r.key, summary);
        if (cancelled) return;
        landHeat(r.key, heat);
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
  }, [listing, client, withHeat]);

  const pending = requests.filter((r) => !shown.summaries.has(r.key)).length;
  return { summaries: shown.summaries, heats: shown.heats, pending };
}

export type SortKey = 'effort' | 'sfb' | 'name' | 'home_row';

/** Whether a sort goes by a number, as Effort and SFB do, rather than by letters. */
export function sortsByMetric(key: SortKey): key is 'effort' | 'sfb' {
  return key === 'effort' || key === 'sfb';
}

/** A layout as it is sorted: its score's key, its name, and the letters on its home row. */
export interface Sortable {
  key: string;
  name: string;
  /** Missing while the layout is still being read. */
  homeRow?: string;
}

/**
 * Lower is better for both metrics; a layout without a number, or not scored yet, goes last. Layouts
 * in `behind` — those missing letters the text's language cannot be written without — rank after
 * every other, each group in its own order: a layout skipping `ç` is spared what it costs to type.
 * By home row, the letters there go in alphabetical order, as names do, and `behind` is not held
 * back; a layout with no letter there, or not read yet, goes last. Ties go by name.
 */
export function compareBy(
  key: SortKey,
  summaries: Map<string, LayoutSummary>,
  behind: ReadonlySet<string> = new Set(),
): (a: Sortable, b: Sortable) => number {
  return (a, b) => {
    if (sortsByMetric(key)) {
      const group = Number(behind.has(a.key)) - Number(behind.has(b.key));
      if (group !== 0) return group;
      const va = summaries.get(a.key)?.[key] ?? null;
      const vb = summaries.get(b.key)?.[key] ?? null;
      if (va !== vb) {
        if (va === null) return 1;
        if (vb === null) return -1;
        return va - vb;
      }
    } else if (key === 'home_row') {
      const ra = a.homeRow || null;
      const rb = b.homeRow || null;
      if (ra !== rb) {
        if (ra === null) return 1;
        if (rb === null) return -1;
        const order = ra.localeCompare(rb);
        if (order !== 0) return order;
      }
    }
    return a.name.localeCompare(b.name);
  };
}
