import { bundledLayout, slug, toCanonicalJson } from '@layoutmaster/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Keyboard } from '../components/Keyboard.js';
import { LayerTabs } from '../components/LayerTabs.js';
import { EDIT_SUMMARY_IDS, SummaryStrip } from '../components/Metrics.js';
import { useAnalysisClient } from '../engine/client-context.js';
import type { AnalyzeRequest, ProducerDTO, ReportDTO } from '../engine/protocol.js';
import { useAnalysis } from '../engine/use-analysis.js';
import { toast } from '../state/toasts.js';
import { useStorage } from '../storage/use-storage.js';
import { encodeInline } from '../url/inline.js';
import { inlineRef, parseParams, type RawSearch, savedRef, toSearch } from '../url/params.js';
import {
  BehaviorsPanel,
  BindingPanel,
  CombosPanel,
  FeaturesPanel,
  GeometryPanel,
  JsonPanel,
  LayersPanel,
  PathsPanel,
  SavePanel,
} from './edit/panels.js';
import { editReducer, initialState, type Panel } from './edit/reducer.js';
import { useLayout } from './useLayout.js';
import { useRuleSet } from './useRuleSet.js';

/** Editing re-analyzes on every change, so it works from a smaller sample than the Analyze view. */
const EDIT_MAX_SYMBOLS = 100_000;

const PANELS: [Panel, string][] = [
  ['binding', 'Key'],
  ['layers', 'Layers'],
  ['features', 'Features'],
  ['geometry', 'Geometry'],
  ['combos', 'Combos'],
  ['behaviors', 'Behaviors'],
  ['paths', 'Typing paths'],
  ['json', 'JSON'],
  ['save', 'Save'],
];

export function EditView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const storage = useStorage();
  const params = useMemo(() => parseParams(search), [search]);
  const loaded = useLayout(params.layoutRef);
  const ruleSet = useRuleSet(params.preset, params.universe);

  return loaded.compiled && loaded.layout ? (
    <Editor
      key={params.layoutRef}
      initialLayout={loaded.layout}
      initialCompiled={loaded.compiled}
      params={params}
      ruleSet={ruleSet}
      client={client}
      storage={storage}
      navigate={navigate}
    />
  ) : (
    <div className="space-y-4">
      <h1 className="sr-only">Edit</h1>
      {loaded.error ? (
        <div className="alert alert-error text-sm">{loaded.error}</div>
      ) : (
        <span className="loading loading-dots loading-md" />
      )}
    </div>
  );
}

type EditorProps = {
  initialLayout: NonNullable<ReturnType<typeof useLayout>['layout']>;
  initialCompiled: NonNullable<ReturnType<typeof useLayout>['compiled']>;
  params: ReturnType<typeof parseParams>;
  ruleSet: ReturnType<typeof useRuleSet>;
  client: ReturnType<typeof useAnalysisClient>;
  storage: ReturnType<typeof useStorage>;
  navigate: ReturnType<typeof useNavigate>;
};

function Editor({
  initialLayout,
  initialCompiled,
  params,
  ruleSet,
  client,
  storage,
  navigate,
}: EditorProps) {
  const [state, send] = useReducer(
    editReducer,
    initialState(initialLayout, initialCompiled, params.layer),
  );
  const [producers, setProducers] = useState<Record<string, ProducerDTO[]>>({});
  const [estimate, setEstimate] = useState<ReportDTO | null>(null);
  const previousReport = useRef<ReportDTO | null>(null);

  const request: AnalyzeRequest = useMemo(
    () => ({
      layout: toCanonicalJson(state.layout),
      corpusId: params.corpus,
      caseMode: params.caseMode,
      textClass: params.textClass,
      crossWord: 'reset',
      maxSymbols: Math.min(params.sample, EDIT_MAX_SYMBOLS),
      ruleSet,
    }),
    [state.layout, params.corpus, params.caseMode, params.textClass, params.sample, ruleSet],
  );

  const { report, loading } = useAnalysis(request);

  // Keep the last completed report, so a swap has something to estimate from.
  useEffect(() => {
    if (report && !report.provisional) {
      previousReport.current = report;
      setEstimate(null);
    }
  }, [report]);

  useEffect(() => {
    client
      .producers(toCanonicalJson(state.layout), params.caseMode)
      .then(setProducers)
      .catch(() => setProducers({}));
  }, [client, state.layout, params.caseMode]);

  /**
   * Swapping two plain keys changes which key types which symbol, nothing else, so the previous
   * n-gram tables can be re-scored in milliseconds. The estimate stands until the full analysis
   * of the edited layout arrives.
   */
  useEffect(() => {
    const swap = state.lastSwap;
    const base = previousReport.current;
    if (!swap || !base) return;
    const posA = state.compiled.keyIndex.get(swap.from);
    const posB = state.compiled.keyIndex.get(swap.to);
    if (posA === undefined || posB === undefined) return;

    let cancelled = false;
    client
      .relabel({
        baseKey: base.key,
        layout: toCanonicalJson(state.layout),
        layerIdx: swap.layerIdx,
        posA,
        posB,
        ruleSet,
      })
      .then((dto) => {
        if (!cancelled && dto) setEstimate(dto);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.lastSwap, state.compiled, state.layout, client, ruleSet]);

  // An unsaved layout is easy to lose by closing the tab.
  useEffect(() => {
    if (!state.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state.dirty]);

  // While the visible report still describes the layout as it was before the swap, the estimate is
  // the more truthful of the two, so it wins until the real analysis of the edited layout lands.
  const reportIsStale = !report || report.key === previousReport.current?.key;
  const provisional = estimate !== null && reportIsStale;
  const shown = provisional ? estimate : report;

  const save = useCallback(
    async (name: string) => {
      const layout = state.layout;
      const keepsId =
        layout.id && !bundledLayout(layout.id) && params.layoutRef.startsWith('saved:');
      const id = keepsId ? slug(layout.id as string) : slug(name);
      try {
        await storage.put('layouts', id, toCanonicalJson({ ...layout, id, name }), {
          message: `Save layout ${name}`,
        });
        send({ type: 'saved', id, name });
        toast.info(`Saved as ${id}`);
        navigate({
          to: '/edit',
          search: toSearch(params, { layoutRef: savedRef(id) }) as never,
          replace: true,
        });
      } catch (e) {
        const conflict = e instanceof Error && e.name === 'StorageConflictError';
        toast.error(
          conflict
            ? 'Someone else changed this layout; reload and try again'
            : `Save failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [state.layout, params, storage, navigate],
  );

  const openInAnalyzer = useCallback(async () => {
    const blob = await encodeInline(state.layout);
    navigate({ to: '/', search: toSearch(params, { layoutRef: inlineRef(blob) }) as never });
  }, [state.layout, params, navigate]);

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Edit</h1>

      <form
        id="meta-form"
        className="card bg-base-100 border border-base-300 p-3 flex flex-row flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="form-control">
          <span className="label-text text-xs">Name</span>
          <input
            aria-label="Name"
            className="input input-sm input-bordered"
            value={state.layout.name}
            onChange={(e) => send({ type: 'setMeta', name: e.target.value })}
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Author</span>
          <input
            aria-label="Author"
            className="input input-sm input-bordered"
            value={state.layout.author ?? ''}
            onChange={(e) => send({ type: 'setMeta', author: e.target.value })}
          />
        </label>
        <label className="form-control flex-1 min-w-48">
          <span className="label-text text-xs">Description</span>
          <input
            aria-label="Description"
            className="input input-sm input-bordered w-full"
            value={state.layout.description ?? ''}
            onChange={(e) => send({ type: 'setMeta', description: e.target.value })}
          />
        </label>
        {state.dirty && <span className="badge badge-warning badge-sm">unsaved</span>}
        <button type="button" className="btn btn-sm" onClick={openInAnalyzer}>
          Analyze
        </button>
      </form>

      {state.error && <div className="alert alert-error text-sm">{state.error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <LayerTabs
                layers={state.compiled.layers.map((l) => ({ idx: l.idx, id: l.id, name: l.name }))}
                active={state.layer}
                onSelect={(layer) => send({ type: 'selectLayer', layer })}
              />
            </div>
            <p className="text-xs opacity-60">
              Click a key to select it. Drag one key onto another to swap them, or press S on a
              selected key and then choose its partner.
            </p>

            <Keyboard
              id="kb-edit"
              compiled={state.compiled}
              layer={state.layer}
              selected={state.selected}
              draggable
              highlight={
                state.swapFrom
                  ? [state.compiled.keyIndex.get(state.swapFrom)].filter(
                      (p): p is number => p !== undefined,
                    )
                  : []
              }
              onKeyClick={(keyId) => send({ type: 'keyClick', keyId })}
              onSwap={(from, to) => send({ type: 'swap', from, to })}
              onKeyShortcut={(key, keyId) => {
                // Swapping without a pointer: S arms the focused key, Escape cancels.
                if (key === 's' || key === 'S') {
                  send({ type: 'keyClick', keyId });
                  send({ type: 'startSwap' });
                } else if (key === 'Escape') {
                  send({ type: 'cancelSwap' });
                }
              }}
            />

            <p aria-live="polite" className="sr-only">
              {state.swapFrom ? `${state.swapFrom} armed for a swap` : ''}
            </p>

            {shown && <SummaryStrip results={shown.results} ids={EDIT_SUMMARY_IDS} />}

            <p className="text-xs opacity-60">
              Quick analysis on {Math.min(params.sample, EDIT_MAX_SYMBOLS).toLocaleString('en-US')}{' '}
              symbols
              {provisional && <span> · estimate after swap</span>}
              {loading && <span> · updating…</span>}
            </p>
          </div>
        </section>

        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3 p-4">
            <div role="tablist" aria-label="Editor panels" className="tabs tabs-bordered tabs-sm">
              {PANELS.map(([panel, label]) => (
                <button
                  key={panel}
                  type="button"
                  role="tab"
                  aria-selected={state.panel === panel}
                  className={`tab ${state.panel === panel ? 'tab-active' : ''}`}
                  onClick={() => send({ type: 'setPanel', panel })}
                >
                  {label}
                </button>
              ))}
            </div>

            {state.panel === 'binding' && <BindingPanel state={state} send={send} />}
            {state.panel === 'layers' && <LayersPanel state={state} send={send} />}
            {state.panel === 'features' && <FeaturesPanel state={state} send={send} />}
            {state.panel === 'geometry' && <GeometryPanel state={state} send={send} />}
            {state.panel === 'combos' && <CombosPanel state={state} send={send} />}
            {state.panel === 'behaviors' && <BehaviorsPanel state={state} send={send} />}
            {state.panel === 'paths' && (
              <PathsPanel state={state} send={send} producers={producers} />
            )}
            {state.panel === 'json' && <JsonPanel state={state} send={send} />}
            {state.panel === 'save' && <SavePanel layout={state.layout} onSave={save} />}
          </div>
        </section>
      </div>
    </div>
  );
}
