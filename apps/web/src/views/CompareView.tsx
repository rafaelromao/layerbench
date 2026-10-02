import { BUNDLED_LAYOUTS, type CorpusManifest, toCanonicalJson } from '@layoutmaster/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { featureList } from '../components/FeatureSwitches.js';
import { formatValue } from '../components/format.js';
import { Keyboard } from '../components/Keyboard.js';
import { BandBadge, SummaryStrip } from '../components/Metrics.js';
import { useAnalysisClient } from '../engine/client-context.js';
import { expandPositions, usageHeat } from '../engine/heat.js';
import type { AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { useAnalysis } from '../engine/use-analysis.js';
import { useRememberSelection } from '../state/selection.js';
import { type Params, parseParams, type RawSearch, toSearch } from '../url/params.js';
import { AnalysisSettings, SampleSelect } from './AnalysisSelects.js';
import { compareRows } from './compare-rows.js';
import { useLayout, useTypedLayout } from './useLayout.js';
import { useRuleSet } from './useRuleSet.js';

const DEFAULT_B = 'qwerty';

export function CompareView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const params = useMemo(() => parseParams(search), [search]);
  useRememberSelection(params);
  const refB = search.b ?? DEFAULT_B;

  const [corpora, setCorpora] = useState<CorpusManifest[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    client
      .listCorpora()
      .then(setCorpora)
      .catch(() => setCorpora([]));
  }, [client]);

  const a = useLayout(params.layoutRef);
  const b = useLayout(refB);
  // Both sides are typed without the same features, as the Library ranks them, and drawn that way
  // so each board's heat lands on the keys it was measured on.
  const typedA = useTypedLayout(a.layout, a.compiled, params.without);
  const typedB = useTypedLayout(b.layout, b.compiled, params.without);
  const ruleSet = useRuleSet(params.preset, params.universe);

  const requestFor = (layout: typeof a.layout): AnalyzeRequest | null =>
    layout
      ? {
          layout: toCanonicalJson(layout),
          corpusId: params.corpus,
          caseMode: params.caseMode,
          textClass: params.textClass,
          crossWord: ruleSet.globals.cross_word ?? 'reset',
          maxSymbols: params.sample,
          ruleSet,
        }
      : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the request is derived from these
  const requestA = useMemo(() => requestFor(typedA.layout), [typedA.layout, params, ruleSet]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the request is derived from these
  const requestB = useMemo(() => requestFor(typedB.layout), [typedB.layout, params, ruleSet]);

  const analysisA = useAnalysis(requestA);
  const analysisB = useAnalysis(requestB);
  const error = a.error ?? b.error ?? analysisA.error ?? analysisB.error;

  const setParams = useCallback(
    (overrides: Partial<Params> & { b?: string }) => {
      const { b: nextB, ...rest } = overrides;
      navigate({
        to: '/compare',
        search: { ...toSearch(params, rest), b: nextB ?? refB } as never,
        replace: true,
      });
    },
    [navigate, params, refB],
  );

  const rows = useMemo(
    () =>
      analysisA.report && analysisB.report
        ? compareRows(analysisA.report.results, analysisB.report.results)
        : [],
    [analysisA.report, analysisB.report],
  );

  /** Hovering a row shows where that metric lands on both boards. */
  const highlightFor = (report: ReportDTO | null): number[] => {
    if (!report || !hovered) return [];
    const rule = report.results.find((r) => r.id === hovered);
    const keys = rule?.items[0]?.keys ?? [];
    return expandPositions(report, keys);
  };

  const nameA = a.layout?.name ?? params.layoutRef;
  const nameB = b.layout?.name ?? refB;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Compare</h1>

      <form
        id="compare-toolbar"
        className="lm-toolbar card bg-base-100 border border-base-300 p-3 flex flex-row flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="form-control">
          <span className="label-text text-xs">Layout A</span>
          <select
            aria-label="Layout A"
            className="select select-sm select-bordered min-w-44"
            value={params.layoutRef}
            onChange={(e) => setParams({ layoutRef: e.target.value })}
          >
            {BUNDLED_LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            {!BUNDLED_LAYOUTS.some((l) => l.id === params.layoutRef) && (
              <option value={params.layoutRef}>{nameA}</option>
            )}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Layout B</span>
          <select
            aria-label="Layout B"
            className="select select-sm select-bordered min-w-44"
            value={refB}
            onChange={(e) => setParams({ b: e.target.value })}
          >
            {BUNDLED_LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            {!BUNDLED_LAYOUTS.some((l) => l.id === refB) && <option value={refB}>{nameB}</option>}
          </select>
        </label>

        <AnalysisSettings
          params={params}
          onChange={setParams}
          corpora={corpora}
          ruleSetName={ruleSet.name}
          verb="Compare"
          afterCounts={
            <label className="form-control">
              <span className="label-text text-xs">Sample</span>
              <SampleSelect value={params.sample} onChange={(sample) => setParams({ sample })} />
            </label>
          }
          actions={
            <Link
              to="/analyze"
              search={toSearch(params) as never}
              className="btn btn-sm btn-outline max-sm:flex-1"
            >
              Analyze A
            </Link>
          }
        />
      </form>

      {params.without.length > 0 && (
        <div className="alert text-sm py-2" role="status">
          <span>Both layouts typed without {featureList(params.without)}.</span>
          <button
            type="button"
            className="btn btn-xs whitespace-nowrap"
            onClick={() => setParams({ without: [] })}
          >
            Use every feature
          </button>
        </div>
      )}

      {error && <div className="alert alert-error text-sm">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {(
          [
            ['A', nameA, typedA.compiled, analysisA.report],
            ['B', nameB, typedB.compiled, analysisB.report],
          ] as const
        ).map(([side, name, compiled, report]) => (
          <section key={side} className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3 p-4">
              <h2 className="font-semibold text-sm">
                {side}: {name}
              </h2>
              {compiled && (
                <Keyboard
                  id={`kb-${side}`}
                  compiled={compiled}
                  layer={0}
                  interactive={false}
                  showHold={false}
                  heat={report ? usageHeat(report) : {}}
                  highlight={highlightFor(report)}
                />
              )}
              {report ? (
                <SummaryStrip results={report.results} />
              ) : (
                <div className="flex items-center gap-2 py-4">
                  <span className="loading loading-dots loading-xs" />
                  <span className="text-sm opacity-70">analyzing…</span>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {rows.length > 0 && (
        <section
          className="card bg-base-100 border border-base-300 overflow-x-auto"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
          tabIndex={0}
          aria-label="Metric comparison"
        >
          <table className="table table-sm table-zebra">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="text-right">{nameA}</th>
                <th className="text-right">{nameB}</th>
                <th className="text-right">Δ (B − A)</th>
                <th>Better</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onMouseEnter={() => setHovered(row.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(row.id)}
                  onBlur={() => setHovered(null)}
                >
                  <td>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-[10px] uppercase tracking-wide opacity-50">
                      {row.family}
                    </div>
                  </td>
                  <td className="text-right font-mono tabular-nums">
                    {formatValue(row.a.value, row.unit)} <BandBadge band={row.a.band} />
                  </td>
                  <td className="text-right font-mono tabular-nums">
                    {row.b ? formatValue(row.b.value, row.unit) : '–'}{' '}
                    {row.b && <BandBadge band={row.b.band} />}
                  </td>
                  <td
                    className={`text-right font-mono tabular-nums ${
                      row.winner === 'b' ? 'text-success' : row.winner === 'a' ? 'text-error' : ''
                    }`}
                  >
                    {row.delta === null
                      ? '–'
                      : `${row.delta > 0 ? '+' : ''}${row.delta.toFixed(2)}`}
                  </td>
                  <td>
                    {row.winner === 'tie' ? (
                      <span className="opacity-40">–</span>
                    ) : (
                      <span
                        // A badge is one line tall; a name that wrapped would spill out of it.
                        className={`badge badge-sm whitespace-nowrap ${row.winner === 'b' ? 'badge-primary' : ''}`}
                      >
                        {row.winner === 'a' ? nameA : nameB}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
