import {
  BUNDLED_LAYOUTS,
  type CorpusManifest,
  getPreset,
  layoutLanguageCoverage,
  PRESET_IDS,
  toCanonicalJson,
} from '@layoutmaster/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HelpLink } from '../components/HelpLink.js';
import { Keyboard, typingCombos } from '../components/Keyboard.js';
import { LayerTabs } from '../components/LayerTabs.js';
import { MetricCard, SummaryStrip } from '../components/Metrics.js';
import { presetOf } from '../components/RuleSources.js';
import { useAnalysisClient } from '../engine/client-context.js';
import { expandPositions, heatMap } from '../engine/heat.js';
import type { AnalyzeRequest, ExplainDTO } from '../engine/protocol.js';
import { useAnalysis } from '../engine/use-analysis.js';
import { HELP } from '../guide/help.js';
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
import { playFrames } from './analyze/playback.js';
import { groupByLanguage } from './corpus-groups.js';
import { useLayout } from './useLayout.js';
import { useRuleSet } from './useRuleSet.js';

/** How long each press of a played word stays lit, and the rest before it plays again. */
const PLAY_STEP_MS = 750;
const PLAY_REST_MS = 1200;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

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
  /** Which press of the explained word the board shows; `frame` past the last one is the rest. */
  const [play, setPlay] = useState<{ frame: number; playing: boolean } | null>(null);
  const [showCombos, setShowCombos] = useState(true);

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

  const ruleSet = useRuleSet(params.preset, params.universe);

  const request: AnalyzeRequest | null = useMemo(() => {
    if (!layout) return null;
    const corpusId = params.corpus2 ? mixedId : params.corpus;
    if (!corpusId) return null;
    return {
      layout: toCanonicalJson(layout),
      corpusId,
      caseMode: params.caseMode,
      textClass: params.textClass,
      crossWord: ruleSet.globals.cross_word ?? 'reset',
      maxSymbols: params.sample,
      ruleSet,
    };
  }, [
    layout,
    params.corpus,
    params.corpus2,
    params.caseMode,
    params.textClass,
    params.sample,
    mixedId,
    ruleSet,
  ]);

  const { report, loading, progress, error: analysisError } = useAnalysis(request);
  const error = layoutError ?? analysisError;

  // The single most useful thing to say up front: an unreachable character is a hard word boundary,
  // so a layout that cannot type the corpus's accents scores well by simply not typing them.
  const corpusLanguage = corpora.find((c) => c.id === params.corpus)?.language;
  const languageGap = useMemo(() => {
    if (!compiled || !corpusLanguage) return null;
    for (const tag of corpusLanguage.split('+')) {
      const c = layoutLanguageCoverage(compiled, tag.trim());
      if (c && c.missingRequired.length > 0) return c;
    }
    return null;
  }, [compiled, corpusLanguage]);

  const layerIdx = compiled ? Math.min(params.layer, compiled.layers.length - 1) : 0;

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
          // The board plays the word now; whatever was outlined before gives way to it.
          setHighlight([]);
          setArcs([]);
        })
        .catch(() => {
          if (!cancelled) setExplain(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, layout, explainText, params.caseMode]);

  // The word, press by press, on the layer each press lands on.
  const frames = useMemo(
    () => (explain && compiled ? playFrames(explain.steps, compiled) : []),
    [explain, compiled],
  );
  // A new word starts from its first press; with motion reduced it waits to be stepped through.
  // The same word explained again — the layout re-read, say — is not a new word, and a press the
  // reader stopped on stays where it is.
  const framesKey = frames.map((f) => `${f.step}:${f.layer}:${f.keys.join('.')}`).join('|');
  useEffect(() => {
    setPlay(framesKey ? { frame: 0, playing: !prefersReducedMotion() } : null);
  }, [framesKey]);
  // One press after another, slowly enough to follow, then a rest, and round again.
  useEffect(() => {
    if (!play?.playing || frames.length === 0) return;
    const resting = play.frame >= frames.length;
    const timer = setTimeout(
      () => setPlay((p) => p && { ...p, frame: resting ? 0 : p.frame + 1 }),
      resting ? PLAY_REST_MS : PLAY_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [play, frames]);

  const current = play ? frames[play.frame] : undefined;
  // While a word plays the board follows it from layer to layer, resting on the one it starts on.
  const boardLayer = play && frames.length > 0 ? (current ?? frames[0]).layer : layerIdx;
  const heat = useMemo(
    () => (report ? heatMap(report, params.heat, boardLayer) : {}),
    [report, params.heat, boardLayer],
  );
  const hasTypingCombos = compiled?.combos.some((c) => c.role === 'typing') ?? false;
  const boardCombos = useMemo(() => {
    if (!compiled) return [];
    const all = typingCombos(compiled, boardLayer, current?.combo ?? null);
    // Hidden, a combo still shows while it is the press being played.
    return showCombos ? all : all.filter((c) => c.active);
  }, [compiled, boardLayer, current, showCombos]);
  /** A chord's step names its virtual key; the reader knows it by the keys pressed together. */
  const stepKey = (key: string) => {
    const combo = compiled?.combos.find((c) => compiled.positions[c.pos]?.id === key);
    return combo ? combo.keys.map((k) => compiled?.keys[k]?.id ?? '?').join('+') : key;
  };

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
    setPlay(null);
  };

  const query = toSearch(params);
  const corpusName = corpora.find((c) => c.id === params.corpus)?.name ?? params.corpus;

  return (
    <div className="lm-analyze space-y-4">
      <h1 className="sr-only">Analyze</h1>

      <form
        id="analyze-toolbar"
        className="lm-toolbar card bg-base-100 border border-base-300 p-3 flex flex-row flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="form-control lm-wide">
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

        <label className="form-control lm-wide">
          <span className="label-text text-xs">Corpus</span>
          <select
            name="corpus"
            aria-label="Corpus"
            className="select select-sm select-bordered"
            value={params.corpus}
            onChange={(e) => setParams({ corpus: e.target.value })}
          >
            {groupByLanguage(corpora).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
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
            {groupByLanguage(corpora.filter((c) => c.id !== params.corpus)).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {params.corpus2 && (
          <label className="form-control lm-wide">
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

        <label className="form-control">
          <span className="label-text text-xs">Counts</span>
          <select
            name="text"
            aria-label="Text to count"
            className="select select-sm select-bordered"
            value={params.textClass}
            onChange={(e) => setParams({ textClass: e.target.value as Params['textClass'] })}
          >
            <option value="letters">Letters only</option>
            <option value="letters+digits">Letters and numbers</option>
            <option value="letters+digits+symbols">Letters, numbers and symbols</option>
          </select>
        </label>

        <div className="lm-wide flex flex-wrap items-center gap-3 sm:ml-auto">
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
          <div className="flex gap-2 max-sm:w-full">
            <Link
              to="/edit"
              search={query as never}
              className="btn btn-sm btn-outline max-sm:flex-1"
            >
              Edit
            </Link>
            <Link
              to="/compare"
              search={query as never}
              className="btn btn-sm btn-outline max-sm:flex-1"
            >
              Compare
            </Link>
          </div>
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
                  active={boardLayer}
                  onSelect={(idx) => {
                    // Choosing a layer is looking at it: the word stops playing over it.
                    setPlay(null);
                    setParams({ layer: idx });
                  }}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                {hasTypingCombos && (
                  <label className="label cursor-pointer gap-2">
                    <span className="label-text text-xs">Combos</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-xs"
                      aria-label="Show the combos that type"
                      checked={showCombos}
                      onChange={(e) => setShowCombos(e.target.checked)}
                    />
                  </label>
                )}
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
                className="lm-analyze-board"
                legendList
                compiled={compiled}
                layer={boardLayer}
                heat={heat}
                highlight={play ? (current?.held ?? []) : highlight}
                pressed={current?.keys ?? []}
                combos={boardCombos}
                arcs={play ? [] : arcs}
                onKeyClick={(keyId) => {
                  const pos = compiled.keyIndex.get(keyId);
                  setPlay(null);
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
              {(highlight.length > 0 || explain) && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={clearHighlight}>
                  clear
                </button>
              )}
            </form>

            {explain && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {frames.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() =>
                        setPlay((p) =>
                          p?.playing
                            ? { ...p, playing: false }
                            : { frame: p && p.frame < frames.length ? p.frame : 0, playing: true },
                        )
                      }
                    >
                      {play?.playing ? '⏸ Pause' : '▶ Play'}
                    </button>
                  )}
                  <span className="font-mono text-xs opacity-70">{explain.presses} presses</span>
                </div>
                {/* Each press, in order: the one lit on the board is marked, and any one can be
                    looked at on its own. */}
                <ol className="flex flex-wrap items-center gap-1" aria-label="Presses">
                  {explain.steps.map((s, i) => {
                    const frame = frames.findIndex((f) => f.step === i);
                    const now = current?.step === i;
                    return (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: a key can be pressed twice in one word
                        key={`${s.key}-${i}`}
                      >
                        <button
                          type="button"
                          className={`btn btn-xs gap-1 font-mono ${now ? 'btn-primary' : 'btn-outline'} ${
                            s.wastedOneShot && !now ? 'btn-warning' : ''
                          } ${s.kind === 'hold_release' ? 'opacity-50' : ''}`}
                          title={`${stepKey(s.key)} · ${s.layer} · ${s.finger}`}
                          aria-current={now ? 'step' : undefined}
                          disabled={frame < 0}
                          onClick={() => setPlay({ frame, playing: false })}
                        >
                          <span className="opacity-60">{stepKey(s.key)}</span>
                          <span>{symbolLabel(s.symbols) || s.label}</span>
                          <span className="opacity-50">{s.layer}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {languageGap && (
              <div
                className="alert alert-warning py-2 text-xs"
                role="status"
                aria-label="Language coverage"
              >
                <span>
                  This layout cannot type {languageGap.missingRequired.length} character
                  {languageGap.missingRequired.length === 1 ? '' : 's'} {languageGap.name} needs:{' '}
                  <span className="font-mono">{languageGap.missingRequired.join(' ')}</span>. Each
                  one breaks the word it appears in, so the metrics below understate the cost.
                </span>
              </div>
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
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">Summary</h2>
                <HelpLink help={HELP.headline} />
              </div>
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
                    presetId={presetOf(params.preset)}
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
