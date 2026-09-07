import { useEffect, useRef, useState } from 'react';
import { useAnalysisClient } from './client-context.js';
import type { AnalyzeRequest, Progress, ReportDTO } from './protocol.js';

export interface AnalysisState {
  report: ReportDTO | null;
  loading: boolean;
  progress: Progress | null;
  error: string | null;
}

/**
 * Runs one analysis and keeps it current. A cached result appears without a loading state; a fresh
 * one is cancelled the moment the request changes, and a late reply from a superseded run is
 * dropped rather than overwriting the newer one.
 */
export function useAnalysis(request: AnalyzeRequest | null): AnalysisState & {
  setReport: (r: ReportDTO) => void;
} {
  const client = useAnalysisClient();
  const [state, setState] = useState<AnalysisState>({
    report: null,
    loading: false,
    progress: null,
    error: null,
  });
  const generation = useRef(0);

  useEffect(() => {
    if (!request) {
      setState({ report: null, loading: false, progress: null, error: null });
      return;
    }
    const mine = ++generation.current;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const cached = await client.peek(request);
        if (cancelled || mine !== generation.current) return;
        if (cached) {
          setState({ report: cached, loading: false, progress: null, error: null });
          return;
        }
        setState((s) => ({ ...s, loading: true, error: null, progress: null }));
        const report = await client.analyze(request, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (!cancelled && mine === generation.current) {
              setState((s) => ({ ...s, progress }));
            }
          },
        });
        if (cancelled || mine !== generation.current) return;
        setState({ report, loading: false, progress: null, error: null });
      } catch (e) {
        if (cancelled || mine !== generation.current) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setState({
          report: null,
          loading: false,
          progress: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // The caller memoizes the request, so an identical analysis never restarts.
  }, [client, request]);

  return {
    ...state,
    setReport: (report: ReportDTO) => setState((s) => ({ ...s, report })),
  };
}
