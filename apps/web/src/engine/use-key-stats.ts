import { useEffect, useState } from 'react';
import { useAnalysisClient } from './client-context.js';
import type { KeyStatsDTO, ReportDTO } from './protocol.js';

/** Answers already had, by report, key, layer and length; the oldest go first. */
const cache = new Map<string, KeyStatsDTO>();
const CACHE_SIZE = 64;

function remember(id: string, stats: KeyStatsDTO): void {
  cache.delete(id);
  cache.set(id, stats);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
}

/**
 * A key's own n-grams and what it was pressed for, from the worker. Asked only of a report the
 * worker keeps — an estimate after a swap it never does — and a moment after the key or report
 * settles. Until the answer for the report shown arrives, the last one stays, marked updating.
 */
export function useKeyStats(
  report: ReportDTO | null,
  key: number | null,
  layer: number,
  limit = 12,
): { stats: KeyStatsDTO | null; updating: boolean } {
  const client = useAnalysisClient();
  const [stats, setStats] = useState<KeyStatsDTO | null>(null);
  const reportKey = report && !report.provisional ? report.key : null;

  useEffect(() => {
    if (reportKey === null || key === null) return;
    const id = `${reportKey}|${key}|${layer}|${limit}`;
    const hit = cache.get(id);
    if (hit) {
      setStats(hit);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .keyStats({ reportKey, key, layer, limit })
        .then((answer) => {
          if (cancelled || !answer) return;
          remember(id, answer);
          setStats(answer);
        })
        .catch(() => {});
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, reportKey, key, layer, limit]);

  const mine = stats !== null && stats.key === key && stats.layer === layer ? stats : null;
  return { stats: mine, updating: mine === null || mine.reportKey !== report?.key };
}
