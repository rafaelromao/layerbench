import { type CorpusManifest, toCanonicalJson } from '@layerbench/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Collapsible } from '../components/Collapsible.js';
import { ErrorAlert } from '../components/ErrorAlert.js';
import { FamilyFilter, useFamilyShown } from '../components/FamilyFilter.js';
import { featureList } from '../components/FeatureSwitches.js';
import { formatValue } from '../components/format.js';
import { Keyboard, typingCombos } from '../components/Keyboard.js';
import { LayerTabs } from '../components/LayerTabs.js';
import { BandBadge, SummaryStrip } from '../components/Metrics.js';
import { useAnalysisClient } from '../engine/client-context.js';
import { expandPositions, heatMap } from '../engine/heat.js';
import type { AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { useAnalysis } from '../engine/use-analysis.js';
import { useRememberSelection } from '../state/selection.js';
import { useCollection } from '../storage/use-storage.js';
import { type Params, parseParams, type RawSearch, settingsOf, toSearch } from '../url/params.js';
import { SampleSelect, SettingsFields } from './AnalysisSelects.js';
import { compareRows } from './compare-rows.js';
import { LayoutOptions } from './LayoutOptions.js';
import { SettingsDialog, settingsSummary } from './SettingsDialog.js';
import { useAnalysisSettings } from './useAnalysisSettings.js';
import { useLayout, useTypedLayout } from './useLayout.js';

const DEFAULT_B = 'qwerty';

export function CompareView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const params = useMemo(() => parseParams(search), [search]);
  const shown = useFamilyShown();
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

  const saved = useCollection('layouts');
  const a = useLayout(params.layoutRef);
  const b = useLayout(refB);
  // Both sides are typed without the same features, as the Library ranks them, and drawn that way
  // so each board's heat lands on the keys it was measured on.
  const typedA = useTypedLayout(a.compiled, params.without);
  const typedB = useTypedLayout(b.compiled, params.without);
  const settings = useAnalysisSettings(settingsOf(params));
  const ruleSet = settings.rules;

  // Each side as written, on the same settings: the engine types both without the same features.
  const requestA: AnalyzeRequest | null = useMemo(
    () => (a.layout ? { layout: toCanonicalJson(a.layout), settings } : null),
    [a.layout, settings],
  );
  const requestB: AnalyzeRequest | null = useMemo(
    () => (b.layout ? { layout: toCanonicalJson(b.layout), settings } : null),
    [b.layout, settings],
  );

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
        // The same view, written again: the page stays where it was scrolled to.
        resetScroll: false,
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

  // Each board shows one layer at a time, chosen on its own; another layout starts on its base.
  const [layerA, setLayerA] = useState(0);
  const [layerB, setLayerB] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the layout is the trigger, not an input.
  useEffect(() => setLayerA(0), [params.layoutRef]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the layout is the trigger, not an input.
  useEffect(() => setLayerB(0), [refB]);

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Compare</h1>

      <div
        id="compare-toolbar"
        className="lb-toolbar card bg-base-100 border border-base-300 p-3 flex flex-row flex-wrap items-end gap-3"
      >
        <label className="form-control">
          <span className="label-text text-xs">Layout A</span>
          <select
            aria-label="Layout A"
            className="select select-sm select-bordered min-w-44"
            value={params.layoutRef}
            onChange={(e) => setParams({ layoutRef: e.target.value })}
          >
            <LayoutOptions saved={saved.entries} current={params.layoutRef} currentName={nameA} />
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
            <LayoutOptions saved={saved.entries} current={refB} currentName={nameB} />
          </select>
        </label>

        <div className="lb-wide min-w-0 flex-1">
          <SettingsDialog summary={settingsSummary(params, corpora, ruleSet.name)}>
            <div className="lb-toolbar flex flex-row flex-wrap items-end gap-3">
              <SettingsFields
                params={params}
                onChange={setParams}
                corpora={corpora}
                ruleSetName={ruleSet.name}
                verb="Compare"
                afterCounts={
                  <label className="form-control">
                    <span className="label-text text-xs">Sample</span>
                    <SampleSelect
                      value={params.sample}
                      onChange={(sample) => setParams({ sample })}
                    />
                  </label>
                }
              />
            </div>
          </SettingsDialog>
        </div>

        {/* Each opens in Analyze on the text, rules and switches compared on. */}
        <div className="lb-wide flex gap-2">
          <Link
            to="/analyze"
            search={toSearch(params) as never}
            className="btn btn-sm btn-outline max-sm:flex-1"
          >
            Analyze A
          </Link>
          <Link
            to="/analyze"
            search={toSearch(params, { layoutRef: refB }) as never}
            className="btn btn-sm btn-outline max-sm:flex-1"
          >
            Analyze B
          </Link>
        </div>
      </div>

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

      {error && <ErrorAlert message={error} />}

      <Collapsible id="compare.layouts" title="Layouts">
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['A', nameA, typedA, analysisA.report, layerA, setLayerA],
              ['B', nameB, typedB, analysisB.report, layerB, setLayerB],
            ] as const
          ).map(([side, name, compiled, report, chosen, setLayer]) => {
            // A layer past the end, for a moment after the layout changes, is its base.
            const layer = compiled && chosen < compiled.layers.length ? chosen : 0;
            return (
              // Allowed narrower than its layer tabs, which scroll across rather than widen the page.
              <section key={side} className="card bg-base-100 border border-base-300 min-w-0">
                <div className="card-body gap-3 p-4">
                  <h2 className="font-semibold text-sm">
                    {side}: {name}
                  </h2>
                  {compiled && compiled.layers.length > 1 && (
                    <div className="lb-layer-strip min-w-0">
                      <LayerTabs
                        label={`Layers of ${side}`}
                        layers={compiled.layers.map((l) => ({
                          idx: l.idx,
                          id: l.id,
                          name: l.name,
                          color: l.color,
                        }))}
                        active={layer}
                        onSelect={setLayer}
                      />
                    </div>
                  )}
                  {compiled && (
                    <Keyboard
                      id={`kb-${side}`}
                      compiled={compiled}
                      layer={layer}
                      interactive={false}
                      showHold={false}
                      combos={typingCombos(compiled, layer)}
                      // What was pressed on the layer shown, as Analyze's board shows it.
                      heat={report ? heatMap(report, 'usage', layer) : {}}
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
            );
          })}
        </div>
      </Collapsible>

      {rows.length > 0 && (
        <Collapsible id="compare.metrics" title="Metric comparison">
          <div className="space-y-2">
            <FamilyFilter />
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
                  {rows
                    .filter((row) => shown(row.family))
                    .map((row) => (
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
                            row.winner === 'b'
                              ? 'text-success'
                              : row.winner === 'a'
                                ? 'text-error'
                                : ''
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
          </div>
        </Collapsible>
      )}
    </div>
  );
}
