import { bundledLayout, type Layout, slug, toCanonicalJson } from '@layoutmaster/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Keyboard, type KeyboardHandle } from '../components/Keyboard.js';
import { LayerTabs } from '../components/LayerTabs.js';
import { EDIT_SUMMARY_IDS, SummaryStrip } from '../components/Metrics.js';
import { useCoarsePointer } from '../components/use-coarse-pointer.js';
import { clearDropTargets, paintDropTarget, targetUnder } from '../components/use-key-drag.js';
import { useAnalysisClient } from '../engine/client-context.js';
import type { AnalyzeRequest, ProducerDTO, ReportDTO } from '../engine/protocol.js';
import { useAnalysis } from '../engine/use-analysis.js';
import { toast } from '../state/toasts.js';
import { useStorage } from '../storage/use-storage.js';
import { encodeInline } from '../url/inline.js';
import { inlineRef, parseParams, type RawSearch, savedRef, toSearch } from '../url/params.js';
import { BindingPalette } from './edit/BindingPalette.js';
import { bindingFromFields } from './edit/binding-form.js';
import { type BindingTextContext, parseBindingText } from './edit/binding-text.js';
import { KeyEditor } from './edit/KeyEditor.js';
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
import { editReducer, type Panel } from './edit/reducer.js';
import { initialUndoState, undoable } from './edit/undo.js';
import { useLayout } from './useLayout.js';
import { useRuleSet } from './useRuleSet.js';

/** Built once: a reducer rebuilt on every render would reset the editor's history. */
const undoableEditReducer = undoable(editReducer);

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
    undoableEditReducer,
    initialUndoState(initialLayout, initialCompiled, params.layer),
  );
  const coarse = useCoarsePointer();
  const keyboard = useRef<KeyboardHandle>(null);
  const [board, setBoard] = useState<HTMLDivElement | null>(null);
  /** A binding taken from the palette and not yet placed. */
  const [carried, setCarried] = useState<string | null>(null);
  /** What to tell a screen reader: a key's changed legend is not announced on its own. */
  const [message, setMessage] = useState('');
  const [producers, setProducers] = useState<Record<string, ProducerDTO[]>>({});
  const [estimate, setEstimate] = useState<{ report: ReportDTO; layout: Layout } | null>(null);
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
        if (!cancelled && dto) setEstimate({ report: dto, layout: state.layout });
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
  // Only a swap can be estimated, and only for the layout it was computed from: any other edit
  // would leave the estimate describing a layout that is no longer on screen.
  const reportIsStale = !report || report.key === previousReport.current?.key;
  const provisional = estimate !== null && estimate.layout === state.layout && reportIsStale;
  const shown = provisional && estimate ? estimate.report : report;

  const bindingContext: BindingTextContext = useMemo(
    () => ({
      layers: state.compiled.layers.map((l) => ({ id: l.id, name: l.name })),
      behaviors: Object.keys(state.layout.behaviors ?? {}),
      hostLocale: state.compiled.hostLocale,
    }),
    [state.compiled, state.layout.behaviors],
  );

  // Everything the board should outline: a key armed for a swap, the keys being picked for a
  // combo, and the keys of a combo the user asked to see.
  const highlighted = useMemo(() => {
    const ids = [
      ...(state.swapFrom ? [state.swapFrom] : []),
      ...(state.comboPick ?? []),
      ...state.boardHighlight,
    ];
    return ids
      .map((id) => state.compiled.keyIndex.get(id))
      .filter((p): p is number => p !== undefined);
  }, [state.swapFrom, state.comboPick, state.boardHighlight, state.compiled]);

  const place = useCallback(
    (text: string, keyId: string) => {
      const result = parseBindingText(text, bindingContext);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      send({ type: 'commitBinding', keyId, binding: bindingFromFields(result.fields) });
      setMessage(`${keyId} set to ${text}`);
    },
    [bindingContext],
  );

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
    // biome-ignore lint/a11y/noStaticElementInteractions: undo belongs to the whole editor, reached from whatever inside it has focus.
    <div
      className="space-y-4"
      onKeyDown={(e) => {
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
        const target = e.target as HTMLElement;
        // A text field has an undo stack of its own, and it should win inside itself.
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        send({ type: e.shiftKey ? 'redo' : 'undo' });
        setMessage(e.shiftKey ? 'Redone' : 'Undone');
      }}
    >
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
        {/* min-w-0 all the way down to the board: a grid item and a flex child both refuse to
            shrink below their content, and the board is deliberately wider than a phone. */}
        <section className="card bg-base-100 border border-base-300 min-w-0">
          <div className="card-body gap-3 p-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <LayerTabs
                layers={state.compiled.layers.map((l) => ({ idx: l.idx, id: l.id, name: l.name }))}
                active={state.layer}
                onSelect={(layer) => send({ type: 'selectLayer', layer })}
              />
            </div>
            <p className="text-xs opacity-60 lm-pointer-hint">
              Type on a key to set it: <span className="font-mono">&amp;kp ç</span>,{' '}
              <span className="font-mono">&amp;lt num a</span>,{' '}
              <span className="font-mono">&amp;mo sym</span>. Enter edits, Delete clears, arrow keys
              move. Drag a key onto another to swap it, hold Alt to copy, or drop it on a layer tab
              to send it there.
            </p>
            <p className="text-xs opacity-60 lm-touch-hint">
              Tap a key to edit it: the list that opens builds a binding without typing. Tap a
              binding below and then a key to place it. Press and hold a key to drag it.
            </p>

            {/* biome-ignore lint/a11y/noStaticElementInteractions: the drop handling belongs to the
                board as a whole; every key inside it is already a button. */}
            <div
              ref={setBoard}
              className="lm-board relative"
              onDragOver={(e) => {
                if (!carried) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                clearDropTargets();
                const over = targetUnder(e.clientX, e.clientY);
                if (over?.kind === 'key') paintDropTarget(over, 'copy');
              }}
              onDragLeave={clearDropTargets}
              onDrop={(e) => {
                e.preventDefault();
                clearDropTargets();
                const text = e.dataTransfer.getData('text/plain') || carried;
                const over = targetUnder(e.clientX, e.clientY);
                setCarried(null);
                if (text && over?.kind === 'key') place(text, over.keyId);
              }}
            >
              {/* The board pans inside its own box. The editor cannot live in that box: a
                  scroll container clips on both axes, whatever only one of them was set to. */}
              <div className="lm-board-scroll">
                <Keyboard
                  ref={keyboard}
                  id="kb-edit"
                  compiled={state.compiled}
                  layer={state.layer}
                  selected={state.selected}
                  draggable
                  highlight={highlighted}
                  onKeyClick={(keyId) => {
                    if (state.comboPick) {
                      send({ type: 'comboPickToggle', keyId });
                      return;
                    }
                    if (carried) {
                      place(carried, keyId);
                      setCarried(null);
                      return;
                    }
                    // A finger cannot type on a key to open the editor, so the tap has to do it —
                    // otherwise there is no way into it at all without a hardware keyboard.
                    if (coarse && !state.swapFrom) {
                      send({ type: 'openEditor', keyId, seed: null });
                      return;
                    }
                    send({ type: 'keyClick', keyId });
                  }}
                  onDragStart={() => send({ type: 'closeEditor' })}
                  onDropKey={(drop) => {
                    send({ type: 'dropKey', ...drop });
                    setMessage(
                      drop.to.kind === 'layer'
                        ? `${drop.from} sent to ${drop.to.layerId}`
                        : `${drop.from} ${drop.mode === 'copy' ? 'copied to' : 'swapped with'} ${drop.to.keyId}`,
                    );
                  }}
                  onKeyShortcut={(e, keyId) => {
                    if (e.ctrlKey || e.metaKey) return;
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      send({ type: 'cancelSwap' });
                      send({ type: 'comboPickCancel' });
                      send({ type: 'setBoardHighlight', keys: [] });
                      setCarried(null);
                      return;
                    }
                    // While keys are being picked for a combo, they are all the board is doing.
                    if (state.comboPick) return;
                    // Every printable key now types on the key, so arming a swap takes a modifier.
                    if (e.altKey) {
                      if (e.code === 'KeyS') {
                        e.preventDefault();
                        send({ type: 'keyClick', keyId });
                        send({ type: 'startSwap' });
                      }
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'F2') {
                      e.preventDefault();
                      send({ type: 'openEditor', keyId, seed: null });
                      return;
                    }
                    if (e.key === 'Backspace' || e.key === 'Delete') {
                      e.preventDefault();
                      send({ type: 'clearKey', keyId });
                      setMessage(`${keyId} cleared`);
                      return;
                    }
                    // Space keeps activating the key like the button it is; everything else typed
                    // on a key is the start of its binding.
                    if (e.key.length === 1 && e.key !== ' ') {
                      e.preventDefault();
                      send({ type: 'openEditor', keyId, seed: e.key });
                    }
                  }}
                />
              </div>

              <KeyEditor
                state={state}
                send={send}
                wrapper={board}
                focusKey={(keyId) => keyboard.current?.focusKey(keyId)}
                announce={setMessage}
              />
            </div>

            <BindingPalette compiled={state.compiled} carried={carried} onCarry={setCarried} />

            <p aria-live="polite" className="sr-only">
              {state.swapFrom ? `${state.swapFrom} armed for a swap` : message}
            </p>

            {state.swapFrom && (
              <p className="text-xs">
                <span className="font-mono">{state.swapFrom}</span> is armed —{' '}
                {state.swapMode === 'copy'
                  ? 'tap the key to copy it onto'
                  : 'tap the key to swap it with'}
                , or press Escape.
              </p>
            )}

            {state.comboPick && (
              <p className="text-xs">
                Picking keys for a combo:{' '}
                <span className="font-mono">{state.comboPick.join('+') || 'none yet'}</span> — click
                them on the board, then add the combo in the Combos panel.
              </p>
            )}

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
