import {
  BUNDLED_LAYOUTS,
  type CorpusManifest,
  getPreset,
  PRESET_IDS,
  toCanonicalJson,
} from '@layoutmaster/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from '../components/Keyboard.js';
import { LayerTabs } from '../components/LayerTabs.js';
import { MetricCard, SummaryStrip } from '../components/Metrics.js';
import { useAnalysisClient } from '../engine/client-context.js';
import { expandPositions, heatMap } from '../engine/heat.js';
import type { AnalyzeRequest, ExplainDTO } from '../engine/protocol.js';
import { useAnalysis } from '../engine/use-analysis.js';
import {
  DEFAULT_PARAMS,
  HEAT_MODES,
  type HeatMode,
  type Params,
  parseParams,
  type RawSearch,
  SAMPLE_SIZES,
  toSearch,
} from '../url/params.js';
import { useLayout } from './useLayout.js';

const FAMILIES: [string, string][] = [
  ['bigram', 'Bigrams'],
  ['skipgram', 'Skipgrams'],
  ['trigram', 'Trigrams'],
  ['usage', 'Usage'],
  ['effort', 'Effort'],
  ['layer', 'Layers'],
];

const HEAT_LABELS: Record<HeatMode, string> = {
  usage: 'Usage',
  sfb: 'SFB contribution',
  effort: 'Effort',
  travel: 'Finger travel',
  layer_taps: 'Layer taps',
};

function symbolLabel(s: string): string {
  return s === ' ' ? '␣' : s;
}

export function AnalyzeView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const params = useMemo(() => parseParams(search), [search]);

  const { layout, compiled, error: layoutError } = useLayout(params.layoutRef);
  const [corpora, setCorpora] = useState<CorpusManifest[]>([]);
  const [mixedId, setMixedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [arcs, setArcs] = useState<[number, number][]>([]);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [explainText, setExplainText] = useState('');
  const [explain, setExplain] = useState<ExplainDTO | null>(null);

  const setParams = useCallback(
    (overrides: Partial<Params>) => {
      navigate({ to: '/', search: toSearch(params, overrides) as never, replace: true });
    },
    [navigate, params],
  );

  useEffect(() => {
    client
      .listCorpora()
      .then(setCorpora)
      .catch(() => setCorpora([]));
  }, [client]);

  // A second corpus is blended in the engine, then referenced by the id of the blend.
  useEffect(() => {
    let cancelled = false;
    if (!params.corpus2) {
      setMixedId(null);
      return;
    }
    client
      .mixCorpora(params.corpus, params.corpus2, params.mix)
      .then((m) => {
        if (!cancelled) setMixedId(m.id);
      })
      .catch(() => {
        if (!cancelled) setMixedId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, params.corpus, params.corpus2, params.mix]);

  const ruleSet = useMemo(() => {
    const base = getPreset(params.preset.replace(/^saved:/, ''));
    return { ...base, globals: { ...base.globals, universe: params.universe } };
  }, [params.preset, params.universe]);

  const request: AnalyzeRequest | null = useMemo(() => {
    if (!layout) return null;
    const corpusId = params.corpus2 ? mixedId : params.corpus;
    if (!corpusId) return null;
    return {
      layout: toCanonicalJson(layout),
      corpusId,
      caseMode: params.caseMode,
      crossWord: ruleSet.globals.cross_word ?? 'reset',
      maxSymbols: params.sample,
      ruleSet,
    };
  }, [layout, params.corpus, params.corpus2, params.caseMode, params.sample, mixedId, ruleSet]);

  const { report, loading, progress, error: analysisError } = useAnalysis(request);
  const error = layoutError ?? analysisError;

  const layerIdx = compiled ? Math.min(params.layer, compiled.layers.length - 1) : 0;
  const heat = useMemo(
    () => (report ? heatMap(report, params.heat, layerIdx) : {}),
    [report, params.heat, layerIdx],
  );

  // Re-run the explanation whenever the text or the way it would be typed changes.
  useEffect(() => {
    let cancelled = false;
    if (!layout || explainText.trim() === '') {
      setExplain(null);
      return;
    }
    const timer = setTimeout(() => {
      client
        .explain(toCanonicalJson(layout), explainText, params.caseMode)
        .then((r) => {
          if (cancelled) return;
          setExplain(r);
          if (!compiled) return;
          const positions = r.steps
            .filter((s) => s.kind !== 'hold_release')
            .map((s) => compiled.keyIndex.get(s.key))
            .filter((p): p is number => p !== undefined);
          setHighlight([...new Set(positions)]);
          setArcs(positions.slice(0, -1).map((p, i) => [p, positions[i + 1]] as [number, number]));
        })
        .catch(() => {
          if (!cancelled) setExplain(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, layout, compiled, explainText, params.caseMode]);

  const highlightItem = (ruleId: string, index: number) => {
    const rule = report?.results.find((r) => r.id === ruleId);
    const item = rule?.items[index];
    if (!report || !item) return;
    setSelectedRule(ruleId);
    setSelectedItem(index);
    setHighlight(expandPositions(report, item.keys));
    setArcs(item.keys.slice(0, -1).map((p, i) => [p, item.keys[i + 1]] as [number, number]));
    setExplain(null);
  };

  const selectMetric = (id: string) => {
    setSelectedRule(id);
    setSelectedItem(null);
    document
      .getElementById(`metric-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const clearHighlight = () => {
    setHighlight([]);
    setArcs([]);
    setExplain(null);
    setExplainText('');
    setSelectedItem(null);
  };

  const query = toSearch(params);
  const corpusName = corpora.find((c) => c.id === params.corpus)?.name ?? params.corpus;

  return (
    <div className="lm-analyze space-y-4">
      <h1 className="sr-only">Analyze</h1>

      <form
        id="analyze-toolbar"
        className="card bg-base-100 border border-base-300 p-3 flex flex-row flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="form-control">
          <span className="label-text text-xs">Layout</span>
          <select
            name="layout"
            aria-label="Layout"
            className="select select-sm select-bordered min-w-48"
            value={params.layoutRef}
            onChange={(e) => setParams({ layoutRef: e.target.value })}
          >
            <optgroup label="Bundled">
              {BUNDLED_LAYOUTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            {!BUNDLED_LAYOUTS.some((l) => l.id === params.layoutRef) && (
              <option value={params.layoutRef}>{layout?.name ?? 'inline layout'}</option>
            )}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Corpus</span>
          <select
            name="corpus"
            aria-label="Corpus"
            className="select select-sm select-bordered"
            value={params.corpus}
            onChange={(e) => setParams({ corpus: e.target.value })}
          >
            {corpora.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Mix with</span>
          <select
            name="corpus2"
            aria-label="Mix with"
            className="select select-sm select-bordered"
            value={params.corpus2 ?? ''}
            onChange={(e) => setParams({ corpus2: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">—</option>
            {corpora
              .filter((c) => c.id !== params.corpus)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>

        {params.corpus2 && (
          <label className="form-control">
            <span className="label-text text-xs">
              {params.mix}% first · {100 - params.mix}% second
            </span>
            <input
              type="range"
              name="mix"
              aria-label="Corpus mix"
              className="range range-xs w-40"
              min={0}
              max={100}
              step={5}
              value={params.mix}
              onChange={(e) => setParams({ mix: Number(e.target.value) })}
            />
          </label>
        )}

        <label className="form-control">
          <span className="label-text text-xs">Rules</span>
          <select
            name="rules"
            aria-label="Rule set"
            className="select select-sm select-bordered"
            value={params.preset}
            onChange={(e) => setParams({ preset: e.target.value })}
          >
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {getPreset(id).name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Sample</span>
          <select
            name="sample"
            aria-label="Sample size"
            className="select select-sm select-bordered"
            value={params.sample}
            onChange={(e) => setParams({ sample: Number(e.target.value) })}
          >
            {SAMPLE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}k`} symbols
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <label className="label cursor-pointer gap-2">
            <span className="label-text text-xs">Model shift</span>
            <input
              type="checkbox"
              name="case"
              className="toggle toggle-sm"
              checked={params.caseMode === 'model'}
              onChange={(e) => setParams({ caseMode: e.target.checked ? 'model' : 'fold' })}
            />
          </label>
          <label className="label cursor-pointer gap-2">
            <span className="label-text text-xs">Include space</span>
            <input
              type="checkbox"
              name="space"
              className="toggle toggle-sm"
              checked={params.universe === 'with_space'}
              onChange={(e) =>
                setParams({ universe: e.target.checked ? 'with_space' : 'no_space' })
              }
            />
          </label>
          <Link to="/edit" search={query as never} className="btn btn-sm btn-ghost">
            Edit
          </Link>
          <Link to="/compare" search={query as never} className="btn btn-sm btn-ghost">
            Compare
          </Link>
        </div>
      </form>

      {error && <div className="alert alert-error text-sm">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {compiled && (
                <LayerTabs
                  layers={compiled.layers.map((l) => ({ idx: l.idx, id: l.id, name: l.name }))}
                  active={layerIdx}
                  onSelect={(idx) => setParams({ layer: idx })}
                />
              )}
              <div className="flex items-center gap-2">
                <label className="label-text text-xs" htmlFor="heat">
                  Heat
                </label>
                <select
                  id="heat"
                  name="heat"
                  className="select select-xs select-bordered"
                  value={params.heat}
                  onChange={(e) => setParams({ heat: e.target.value as HeatMode })}
                >
                  {HEAT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {HEAT_LABELS[m]}
                    </option>
                  ))}
                </select>
                {loading && (
                  <span
                    className="loading loading-spinner loading-xs"
                    role="status"
                    aria-label="Analyzing"
                  />
                )}
              </div>
            </div>

            {compiled && (
              <Keyboard
                id="kb-analyze"
                compiled={compiled}
                layer={layerIdx}
                heat={heat}
                highlight={highlight}
                arcs={arcs}
                onKeyClick={(keyId) => {
                  const pos = compiled.keyIndex.get(keyId);
                  setHighlight(pos === undefined ? [] : [pos]);
                  setArcs([]);
                }}
              />
            )}

            <form
              id="explain-form"
              className="flex items-end gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="form-control flex-1">
                <label className="label-text text-xs" htmlFor="explain-text">
                  How is this typed?
                </label>
                <input
                  id="explain-text"
                  name="text"
                  autoComplete="off"
                  placeholder="ação · chave · hello"
                  className="input input-sm input-bordered w-full font-mono"
                  value={explainText}
                  onChange={(e) => setExplainText(e.target.value)}
                />
              </div>
              {highlight.length > 0 && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={clearHighlight}>
                  clear
                </button>
              )}
            </form>

            {explain && (
              <ol className="flex flex-wrap items-center gap-1">
                {explain.steps.map((s, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: a key can be pressed twice in one word
                    key={`${s.key}-${i}`}
                    className={`badge badge-outline gap-1 font-mono ${
                      s.wastedOneShot ? 'badge-warning' : ''
                    } ${s.kind === 'hold_release' ? 'opacity-50' : ''}`}
                    title={`${s.key} · ${s.layer} · ${s.finger}`}
                  >
                    <span className="opacity-60">{s.key}</span>
                    <span>{symbolLabel(s.symbols) || s.label}</span>
                    <span className="opacity-50">{s.layer}</span>
                  </li>
                ))}
                <li className="badge badge-ghost font-mono">{explain.presses} presses</li>
              </ol>
            )}

            {report && (
              <div className="flex flex-wrap items-center gap-1">
                {report.coverage.unproducible.length === 0 ? (
                  <span className="badge badge-success badge-sm">all symbols producible</span>
                ) : (
                  report.coverage.unproducible.slice(0, 12).map(([sym, n]) => (
                    <span key={sym} className="badge badge-error badge-sm font-mono">
                      {symbolLabel(sym)} ×{n}
                    </span>
                  ))
                )}
                {report.coverage.softDropped.slice(0, 4).map(([sym, n]) => (
                  <span key={sym} className="badge badge-ghost badge-sm font-mono">
                    {symbolLabel(sym)} ×{n}
                  </span>
                ))}
                <span className="ml-auto font-mono text-xs opacity-60">
                  {report.stats.keystrokes} keystrokes · {report.stats.words} words ·{' '}
                  {Math.round(report.elapsedMs)} ms
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3 p-4">
            <div>
              <h2 className="font-semibold text-sm">Summary</h2>
              <p className="font-mono text-xs opacity-60">
                {params.universe === 'with_space' ? 'with space' : 'no space'} ·{' '}
                {params.caseMode === 'model' ? 'shift modeled' : 'case folded'} ·{' '}
                {String(report?.globals.normalization ?? 'percent_of_ngrams')}
              </p>
            </div>

            {report ? (
              <>
                <SummaryStrip results={report.results} onSelect={selectMetric} />
                {report.score.enabled && report.score.value !== null && (
                  <p className="text-sm">
                    Composite score:{' '}
                    <span className="font-mono">{report.score.value.toFixed(1)}</span> / 100
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3 py-6">
                <span className="loading loading-dots loading-md" />
                <div className="flex-1">
                  <p className="text-sm opacity-70">
                    Simulating {params.sample.toLocaleString('en-US')} symbols of {corpusName}…
                  </p>
                  {progress && progress.total > 0 && (
                    <progress
                      className="progress progress-primary w-full"
                      value={progress.done}
                      max={progress.total}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {report &&
        FAMILIES.map(([family, title]) => {
          const results = report.results.filter((r) => r.family === family);
          if (results.length === 0) return null;
          return (
            <section key={family} className="space-y-2">
              <h2 className="text-sm uppercase tracking-wide opacity-60">{title}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {results.map((r) => (
                  <MetricCard
                    key={r.id}
                    result={r}
                    selectedItem={selectedRule === r.id ? selectedItem : null}
                    onHighlightItem={highlightItem}
                  />
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}

export { DEFAULT_PARAMS };
