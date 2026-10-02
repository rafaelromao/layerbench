import {
  type CorpusManifest,
  freeId,
  idForName,
  type Layout,
  toCanonicalJson,
} from '@layoutmaster/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { HelpLink } from '../components/HelpLink.js';
import { Keyboard, type KeyboardHandle, KeyLegend, typingCombos } from '../components/Keyboard.js';
import { LayerTabs } from '../components/LayerTabs.js';
import { EDIT_SUMMARY_IDS, SummaryStrip } from '../components/Metrics.js';
import { useAnalysisClient } from '../engine/client-context.js';
import type { AnalyzeRequest, ProducerDTO, ReportDTO } from '../engine/protocol.js';
import { useAnalysis } from '../engine/use-analysis.js';
import { HELP, type HelpTopic } from '../guide/help.js';
import { useRememberSelection } from '../state/selection.js';
import { toast } from '../state/toasts.js';
import { useStorage } from '../storage/use-storage.js';
import { encodeInline } from '../url/inline.js';
import {
  ENGLISH_CORPUS,
  inlineRef,
  type Params,
  parseLayoutRef,
  parseParams,
  type RawSearch,
  savedRef,
  toSearch,
} from '../url/params.js';
import { AnalysisSettings } from './AnalysisSelects.js';
import { TextField } from './edit/inspector/controls.js';
import { KeyInspector } from './edit/inspector/KeyInspector.js';
import {
  BehaviorsPanel,
  CombosPanel,
  FeaturesPanel,
  GeometryPanel,
  JsonPanel,
  LayersPanel,
  PathsPanel,
} from './edit/panels.js';
import { editReducer, type Panel } from './edit/reducer.js';
import { initialUndoState, undoable } from './edit/undo.js';
import { useCorpora } from './useCorpora.js';
import { useLayout, useTypedLayout } from './useLayout.js';
import { useRuleSet } from './useRuleSet.js';

/** Built once: a reducer rebuilt on every render would reset the editor's history. */
const undoableEditReducer = undoable(editReducer);

/** Editing re-analyzes on every change, so it works from a smaller sample than the Analyze view. */
const EDIT_MAX_SYMBOLS = 100_000;

/** Each panel, and the part of the guide its "?" leads to. */
const PANELS: [Panel, string, HelpTopic][] = [
  ['layers', 'Layers', HELP.layers],
  ['features', 'Features', HELP.features],
  ['geometry', 'Geometry', HELP.panels],
  ['combos', 'Combos', HELP.panels],
  ['behaviors', 'Behaviors', HELP.panels],
  ['paths', 'Typing paths', HELP.panels],
  ['json', 'JSON', HELP.exporting],
];

export function EditView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const navigate = useNavigate();
  const client = useAnalysisClient();
  const storage = useStorage();
  const params = useMemo(() => parseParams(search, ENGLISH_CORPUS), [search]);
  useRememberSelection(params);
  const loaded = useLayout(params.layoutRef);
  const ruleSet = useRuleSet(params.preset, params.universe);
  // The editor reads its layout once, as it mounts. While a new reference is being read, what is
  // loaded is still the one before it: an editor started from that would show the wrong layout, and
  // its next save would store it over this one.
  const current = loaded.ref === params.layoutRef;

  return current && loaded.compiled && loaded.layout ? (
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
      {current && loaded.error ? (
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
  const keyboard = useRef<KeyboardHandle>(null);
  /** What to tell a screen reader: a key's changed legend is not announced on its own. */
  const [message, setMessage] = useState('');
  const [producers, setProducers] = useState<Record<string, ProducerDTO[]>>({});
  const [estimate, setEstimate] = useState<{ report: ReportDTO; layout: Layout } | null>(null);
  const previousReport = useRef<ReportDTO | null>(null);
  const corpora = useCorpora();
  /** A save on its way: a second press would store a second copy of a layout saved the first time. */
  const [saving, setSaving] = useState(false);

  // The board shows the layout as it is being written; the numbers are for it as typed, without the
  // features the switches leave out, as everywhere else.
  const typed = useTypedLayout(state.layout, state.compiled, params.without).layout ?? state.layout;

  const request: AnalyzeRequest = useMemo(
    () => ({
      layout: toCanonicalJson(typed),
      corpusId: params.corpus,
      caseMode: params.caseMode,
      textClass: params.textClass,
      crossWord: 'reset',
      maxSymbols: Math.min(params.sample, EDIT_MAX_SYMBOLS),
      ruleSet,
    }),
    [typed, params.corpus, params.caseMode, params.textClass, params.sample, ruleSet],
  );

  const { report, loading, error: analysisError } = useAnalysis(request);

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
        layout: toCanonicalJson(typed),
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
  }, [state.lastSwap, state.compiled, state.layout, typed, client, ruleSet]);

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

  /**
   * The corpus and rules live in the link, as on every view. The layout reference stays the same, so
   * the editor is not opened afresh and nothing unsaved is lost.
   */
  const setParams = useCallback(
    (overrides: Partial<Params>) => {
      navigate({ to: '/edit', search: toSearch(params, overrides) as never, replace: true });
    },
    [navigate, params],
  );

  const save = useCallback(async () => {
    const layout = state.layout;
    const ref = parseLayoutRef(params.layoutRef);
    setSaving(true);
    try {
      // A layout's id follows its name. One opened from storage keeps its id while that still
      // matches its name, and moves to its new name's once renamed; anything else takes a free id
      // from its name. Neither overwrites a saved layout whose name happens to slug the same.
      const taken = new Set((await storage.list('layouts')).map((e) => e.id));
      const id =
        ref.kind === 'saved'
          ? idForName(layout.name, ref.value, taken)
          : freeId(layout.name, taken);
      await storage.put('layouts', id, toCanonicalJson({ ...layout, id }), {
        message: `Save layout ${layout.name}`,
      });
      const moved = ref.kind === 'saved' && id !== ref.value;
      let left = false;
      if (moved) {
        // Only once the new copy is safely stored does the old one go.
        try {
          await storage.delete('layouts', ref.value, {
            message: `Rename layout to ${layout.name}`,
          });
        } catch {
          left = true;
        }
      }
      send({ type: 'saved', layout });
      if (left) {
        toast.error(
          `Saved ${layout.name}; its copy under the old name could not be removed and is still in the Library`,
        );
      } else toast.info(`Saved ${layout.name}`);
      if (ref.kind !== 'saved' || moved) {
        navigate({
          to: '/edit',
          search: toSearch(params, { layoutRef: savedRef(id) }) as never,
          replace: true,
        });
      }
    } catch (e) {
      const conflict = e instanceof Error && e.name === 'StorageConflictError';
      toast.error(
        conflict
          ? 'Someone else changed this layout; reload and try again'
          : `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }, [state.layout, params, storage, navigate]);

  const openInAnalyzer = useCallback(async () => {
    const blob = await encodeInline(state.layout);
    navigate({ to: '/analyze', search: toSearch(params, { layoutRef: inlineRef(blob) }) as never });
  }, [state.layout, params, navigate]);

  const focusKey = useCallback((keyId: string) => keyboard.current?.focusKey(keyId), []);
  const undo = (redo: boolean) => {
    send({ type: redo ? 'redo' : 'undo' });
    setMessage(redo ? 'Redone' : 'Undone');
  };

  /** Keystrokes on a focused key: typing sets it, Enter offers it for typing, Delete clears it. */
  const onKeyShortcut = (e: ReactKeyboardEvent<SVGGElement>, keyId: string) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      const busy =
        state.swapFrom !== null || state.comboPick !== null || state.boardHighlight.length > 0;
      if (!busy) {
        send({ type: 'deselect' });
        return;
      }
      send({ type: 'cancelSwap' });
      send({ type: 'comboPickCancel' });
      send({ type: 'setBoardHighlight', keys: [] });
      return;
    }
    // While keys are being picked for a combo, they are all the board is doing.
    if (state.comboPick) return;
    // With a swap armed, Enter and Space pick its partner like a click does.
    if (state.swapFrom && (e.key === 'Enter' || e.key === ' ')) return;
    // Every printable key types on the key, so arming a swap takes a modifier.
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
      send({ type: 'typeOnKey', keyId, seed: null });
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      send({ type: 'clearKey', keyId });
      setMessage(`${keyId} cleared`);
      return;
    }
    // Space keeps activating the key like the button it is; everything else typed on a key is
    // the start of its binding.
    if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault();
      send({ type: 'typeOnKey', keyId, seed: e.key });
    }
  };

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
        undo(e.shiftKey);
      }}
    >
      <h1 className="sr-only">Edit</h1>

      <EditorBar
        layout={state.layout}
        dirty={state.dirty}
        saving={saving}
        onMeta={(meta) => send({ type: 'setMeta', ...meta })}
        onSave={save}
        onAnalyze={openInAnalyzer}
        corpora={corpora}
        params={params}
        ruleSetName={ruleSet.name}
        onParams={setParams}
      />

      {state.error && (
        <div role="alert" className="alert alert-error text-sm">
          {state.error}
        </div>
      )}

      {/* One inspector for the selected key, the same on every screen: beside the board where there
          is room for both; under it where there is not, with the board pinned above it while a key
          is being edited, so the next key is always a tap away. */}
      <div className={`lm-edit-grid ${state.selected ? 'lm-editing' : ''}`}>
        <div className="lm-edit-main">
          {/* min-w-0 all the way down to the board: a grid item and a flex child both refuse to
              shrink below their content, and the board is deliberately wider than a phone. */}
          <section
            className="lm-edit-board card bg-base-100 border border-base-300 min-w-0"
            aria-label="Board"
          >
            <div className="card-body gap-2 p-3 sm:p-4 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="lm-layer-strip min-w-0 flex-1">
                  <LayerTabs
                    layers={state.compiled.layers.map((l) => ({
                      idx: l.idx,
                      id: l.id,
                      name: l.name,
                      color: l.color,
                    }))}
                    active={state.layer}
                    onSelect={(layer) => send({ type: 'selectLayer', layer })}
                    onRename={(id, name) => send({ type: 'renameLayer', id, name })}
                  />
                </div>
                <div className="join shrink-0">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost join-item"
                    aria-label="Undo"
                    title="Undo (Ctrl+Z)"
                    disabled={state.past.length === 0}
                    onClick={() => undo(false)}
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost join-item"
                    aria-label="Redo"
                    title="Redo (Ctrl+Shift+Z)"
                    disabled={state.future.length === 0}
                    onClick={() => undo(true)}
                  >
                    ↷
                  </button>
                </div>
              </div>

              <div className="lm-board relative">
                {/* The board pans inside its own box on a narrow screen. */}
                <div className="lm-board-scroll">
                  <Keyboard
                    ref={keyboard}
                    id="kb-edit"
                    legendList="separate"
                    compiled={state.compiled}
                    layer={state.layer}
                    selected={state.selected}
                    combos={typingCombos(state.compiled, state.layer)}
                    draggable
                    highlight={highlighted}
                    onKeyClick={(keyId) => {
                      if (state.comboPick) {
                        send({ type: 'comboPickToggle', keyId });
                        return;
                      }
                      // A click, a tap and Space all select; the inspector is where editing
                      // happens, so a finger and a mouse reach it the same way.
                      send({ type: 'keyClick', keyId });
                    }}
                    onDropKey={(drop) => {
                      send({ type: 'dropKey', ...drop });
                      setMessage(
                        drop.to.kind === 'layer'
                          ? `${drop.from} sent to ${drop.to.layerId}`
                          : `${drop.from} ${drop.mode === 'copy' ? 'copied to' : 'swapped with'} ${drop.to.keyId}`,
                      );
                    }}
                    onKeyShortcut={onKeyShortcut}
                  />
                </div>
              </div>

              {state.swapFrom && (
                <p className="text-xs">
                  <span className="font-mono">{state.swapFrom}</span> is armed —{' '}
                  {state.swapMode === 'copy'
                    ? 'tap the key to copy it onto'
                    : 'tap the key to swap it with'}
                  , or press Escape.{' '}
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => send({ type: 'cancelSwap' })}
                  >
                    Cancel
                  </button>
                </p>
              )}

              {state.comboPick && (
                <p className="text-xs">
                  Picking keys for a combo:{' '}
                  <span className="font-mono">{state.comboPick.join('+') || 'none yet'}</span> — tap
                  them on the board, then add the combo in the Combos panel.
                </p>
              )}
            </div>
          </section>

          <section className="lm-edit-extras space-y-3 min-w-0" aria-label="Legend and analysis">
            <KeyLegend compiled={state.compiled} layer={state.layer} />
            {shown && <SummaryStrip results={shown.results} ids={EDIT_SUMMARY_IDS} />}
            <p className="text-xs opacity-60">
              Quick analysis on {Math.min(params.sample, EDIT_MAX_SYMBOLS).toLocaleString('en-US')}{' '}
              symbols
              {provisional && <span> · estimate after swap</span>}
              {loading && <span> · updating…</span>}
            </p>
            {analysisError && (
              <p role="alert" className="text-error text-xs">
                Could not analyze: {analysisError}
              </p>
            )}
          </section>

          <p aria-live="polite" className="sr-only">
            {state.swapFrom ? `${state.swapFrom} armed for a swap` : message}
          </p>
        </div>

        <div className="lm-edit-side">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere in the inspector
              closes it, the way it would a dialog; the controls inside handle everything else. */}
          <div
            className="lm-edit-inspector min-w-0"
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.defaultPrevented || state.selected === null) return;
              e.preventDefault();
              const keyId = state.selected;
              send({ type: 'deselect' });
              focusKey(keyId);
            }}
          >
            <KeyInspector state={state} send={send} focusKey={focusKey} announce={setMessage} />
          </div>

          <section className="lm-edit-panels card bg-base-100 border border-base-300 min-w-0">
            <div className="card-body gap-3 p-3 sm:p-4 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  role="tablist"
                  aria-label="Editor panels"
                  className="lm-panel-tabs tabs tabs-border tabs-sm min-w-0 flex-1"
                >
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
                <HelpLink help={PANELS.find(([p]) => p === state.panel)?.[2] ?? HELP.panels} />
              </div>

              {state.panel === 'layers' && <LayersPanel state={state} send={send} />}
              {state.panel === 'features' && <FeaturesPanel state={state} send={send} />}
              {state.panel === 'geometry' && <GeometryPanel state={state} send={send} />}
              {state.panel === 'combos' && <CombosPanel state={state} send={send} />}
              {state.panel === 'behaviors' && <BehaviorsPanel state={state} send={send} />}
              {state.panel === 'paths' && (
                <PathsPanel state={state} send={send} producers={producers} />
              )}
              {state.panel === 'json' && <JsonPanel state={state} send={send} />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * What the layout is and what it is measured on, all in sight: its name, whether it is saved and the
 * way to save it, its author and description, then the corpus and rules the numbers under the board
 * come from. On a phone the rows stay this few: two fields share each, labelled on their border.
 */
function EditorBar({
  layout,
  dirty,
  saving,
  onMeta,
  onSave,
  onAnalyze,
  corpora,
  params,
  ruleSetName,
  onParams,
}: {
  layout: Layout;
  dirty: boolean;
  saving: boolean;
  onMeta: (meta: { name?: string; author?: string; description?: string }) => void;
  onSave: () => void;
  onAnalyze: () => void;
  corpora: CorpusManifest[];
  params: Params;
  ruleSetName?: string;
  onParams: (overrides: Partial<Params>) => void;
}) {
  return (
    <section
      className="lm-editor-bar card bg-base-100 border border-base-300 gap-3 px-3 py-2"
      aria-label="Layout"
    >
      {/* One line at every width: on a narrow phone the name gives the badge its room, rather than
          the bar taking a line more and the board jumping down on the first edit. The spacing is
          tighter there, so the name keeps what it can. */}
      <div className="flex items-center gap-1 sm:gap-2">
        <TextField
          label="Name"
          value={layout.name}
          mono={false}
          className="input-ghost font-semibold text-base flex-1 min-w-0 px-1"
          onCommit={(name) => {
            if (name.trim()) onMeta({ name: name.trim() });
          }}
        />
        {dirty && (
          <span className="badge badge-warning badge-sm shrink-0 max-sm:px-1.5">unsaved</span>
        )}
        <button
          type="button"
          className={`btn btn-sm shrink-0 max-sm:px-2 ${dirty ? 'btn-primary' : ''}`}
          title="Keep it in the Library"
          disabled={saving}
          onClick={onSave}
        >
          Save
        </button>
        <button type="button" className="btn btn-sm shrink-0 max-sm:px-2" onClick={onAnalyze}>
          Analyze
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
        <div className="floating-label">
          <span aria-hidden="true">Author</span>
          <TextField
            label="Author"
            placeholder="Author"
            value={layout.author ?? ''}
            mono={false}
            className="w-full"
            onCommit={(author) => onMeta({ author })}
          />
        </div>
        <div className="floating-label">
          <span aria-hidden="true">Description</span>
          <TextField
            label="Description"
            placeholder="Description"
            value={layout.description ?? ''}
            mono={false}
            className="w-full"
            onCommit={(description) => onMeta({ description })}
          />
        </div>
      </div>
      <div className="lm-toolbar flex flex-row flex-wrap items-end gap-3">
        <AnalysisSettings
          params={params}
          onChange={onParams}
          corpora={corpora}
          ruleSetName={ruleSetName}
          verb="Analyze"
        />
      </div>
    </section>
  );
}
