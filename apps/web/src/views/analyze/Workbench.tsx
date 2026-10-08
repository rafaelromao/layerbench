import {
  type CorpusManifest,
  type Layout,
  languagesToJudge,
  layoutLanguageCoverage,
  type RuleItem,
  safeParseLayout,
  toCanonicalJson,
} from '@layerbench/core';
import type { useNavigate } from '@tanstack/react-router';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Collapsible } from '../../components/Collapsible.js';
import { ErrorAlert } from '../../components/ErrorAlert.js';
import { FamilyFilter, METRIC_FAMILIES, useFamilyShown } from '../../components/FamilyFilter.js';
import { featureList } from '../../components/FeatureSwitches.js';
import { HelpLink } from '../../components/HelpLink.js';
import {
  Keyboard,
  type KeyboardHandle,
  KeyLegend,
  typingCombos,
} from '../../components/Keyboard.js';
import { type KeyItemSelection, KeyStats } from '../../components/KeyStats.js';
import { LayerTabs } from '../../components/LayerTabs.js';
import { MetricCard, SummaryStrip } from '../../components/Metrics.js';
import { PairBreakdown } from '../../components/PairBreakdown.js';
import { presetOf } from '../../components/RuleSources.js';
import type { useAnalysisClient } from '../../engine/client-context.js';
import { expandPositions, heatMap } from '../../engine/heat.js';
import type { AnalyzeRequest, ExplainDTO, ProducerDTO, ReportDTO } from '../../engine/protocol.js';
import { useAnalysis } from '../../engine/use-analysis.js';
import { useKeyStats } from '../../engine/use-key-stats.js';
import { HELP, type HelpTopic } from '../../guide/help.js';
import { draftOf, storedIdOf, useOrigins } from '../../state/origins.js';
import { toast } from '../../state/toasts.js';
import { useCollection, type useStorage } from '../../storage/use-storage.js';
import { encodeInline } from '../../url/inline.js';
import {
  HEAT_MODES,
  type HeatMode,
  inlineRef,
  type Params,
  parseLayoutRef,
  savedRef,
  toSearch,
} from '../../url/params.js';
import { KeyInspector } from '../edit/inspector/KeyInspector.js';
import {
  BehaviorsPanel,
  CombosPanel,
  FeaturesPanel,
  GeometryPanel,
  JsonPanel,
  LayersPanel,
  PathsPanel,
} from '../edit/panels.js';
import { editReducer, type Panel, selectionOf } from '../edit/reducer.js';
import { initialUndoState, undoable } from '../edit/undo.js';
import { useTypedLayout } from '../useLayout.js';
import type { useRuleSet } from '../useRuleSet.js';
import { itemLayer } from './item-layer.js';
import { LayoutBar } from './LayoutBar.js';
import { playFrames } from './playback.js';
import { saveLayout } from './save-layout.js';

/** Built once: a reducer rebuilt on every render would reset the editor's history. */
const undoableEditReducer = undoable(editReducer);

/** How long each press of a played word stays lit, and the rest before it plays again. */
const PLAY_STEP_MS = 750;
const PLAY_REST_MS = 1200;
/** How long the link waits after the last edit before it takes in the edited layout. */
const LINK_DELAY_MS = 400;

const HEAT_LABELS: Record<HeatMode, string> = {
  usage: 'Usage',
  sfb: 'SFB contribution',
  effort: 'Effort',
  travel: 'Finger travel',
  layer_taps: 'Layer taps',
};

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

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function symbolLabel(s: string): string {
  return s === ' ' ? '␣' : s;
}

/**
 * The link of a saved layout: the layout itself, after the `#`, so the link opens for anyone it is
 * sent to. Where that layout is saved and unchanged, opening the link opens it as the saved one.
 */
async function snapshotRef(layout: Layout, id: string): Promise<string> {
  return inlineRef(await encodeInline({ ...layout, id }));
}

export interface WorkbenchProps {
  initialLayout: Layout;
  initialCompiled: NonNullable<ReturnType<typeof useTypedLayout>['compiled']>;
  /** The reference the layout was opened from. */
  openedRef: string;
  params: Params;
  setParams: (overrides: Partial<Params>) => void;
  /** Mark a reference this view writes into its own link, so the link changing does not reopen it. */
  claim: (layoutRef: string) => void;
  /** Open another layout from the picker, even the same one afresh. */
  open: (layoutRef: string) => void;
  ruleSet: ReturnType<typeof useRuleSet>;
  corpora: CorpusManifest[];
  client: ReturnType<typeof useAnalysisClient>;
  storage: ReturnType<typeof useStorage>;
  navigate: ReturnType<typeof useNavigate>;
}

/**
 * Analyze, with the layout open for editing: the board, the selected key's editor and numbers, the
 * panels, and every number of the analysis, which follows each edit. A swap shows an estimate at
 * once, re-scored from the tables already typed, until the layout as edited is typed afresh.
 */
export function Workbench({
  initialLayout,
  initialCompiled,
  openedRef,
  params,
  setParams,
  claim,
  open,
  ruleSet,
  corpora,
  client,
  storage,
  navigate,
}: WorkbenchProps) {
  const [state, send] = useReducer(undoableEditReducer, null, () => {
    const start = initialUndoState(initialLayout, initialCompiled, params.layer);
    // A draft this tab made is still unsaved: the layout stored, if any, is not this one yet.
    return draftOf(openedRef) ? { ...start, dirty: true, saved: null } : start;
  });
  const keyboard = useRef<KeyboardHandle>(null);
  /** What to tell a screen reader: a key's changed legend is not announced on its own. */
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  /** The stored layout this is, or will be saved as: the one opened, or the one a draft is of. */
  const [storedId, setStoredId] = useState<string | null>(() => storedIdOf(openedRef));
  /** The link's layout whenever nothing is unsaved: the one opened, or the one last saved. */
  const [cleanRef, setCleanRef] = useState(openedRef);
  const remember = useOrigins((s) => s.remember);
  const forget = useOrigins((s) => s.forget);

  // A saved layout opened by its id, as the Library and the picker open one, gets the link that
  // carries it whole, which opens anywhere: an id opens only where the layout is saved.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for the layout opened
  useEffect(() => {
    if (state.dirty || storedId === null || parseLayoutRef(openedRef).kind !== 'saved') return;
    let cancelled = false;
    snapshotRef(initialLayout, storedId).then((ref) => {
      if (!cancelled) setCleanRef(ref);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A layout from a link is the one saved here when the id it carries is saved here with the same
  // contents: its owner's link, opened in another tab, browser or device. Anything else, someone
  // else's layout or one changed since the link was made, stays a layout of its own, saved as a
  // copy, so nothing saved here is ever overwritten by a link.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for the layout opened
  useEffect(() => {
    const id = initialLayout.id;
    if (state.dirty || storedId !== null || !id || parseLayoutRef(openedRef).kind !== 'inline')
      return;
    let cancelled = false;
    storage
      .get('layouts', id)
      .then((stored) => {
        const parsed = stored ? safeParseLayout(stored.doc) : null;
        if (cancelled || !parsed?.ok) return;
        const same =
          JSON.stringify(toCanonicalJson(parsed.layout)) ===
          JSON.stringify(toCanonicalJson(initialLayout));
        if (same) setStoredId(id);
      })
      .catch(() => {
        // Storage that cannot be read leaves it a layout of its own.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** The saved layouts, for the picker; read again after each save. */
  const savedLayouts = useCollection('layouts');

  // ------------------------------------------------------------------ what is analyzed

  // The board shows the layout as it is written; the numbers are for it as typed, without the
  // features the switches leave out, and so are the heat, the playback and the explanations.
  const typed = useTypedLayout(state.layout, state.compiled, params.without);
  const typedLayout = typed.layout ?? state.layout;
  const typedCompiled = typed.compiled ?? state.compiled;

  // A second corpus is blended in the engine, then referenced by the id of the blend.
  const [mixedId, setMixedId] = useState<string | null>(null);
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

  const request: AnalyzeRequest | null = useMemo(() => {
    const corpusId = params.corpus2 ? mixedId : params.corpus;
    if (!corpusId) return null;
    return {
      layout: toCanonicalJson(typedLayout),
      corpusId,
      caseMode: params.caseMode,
      textClass: params.textClass,
      crossWord: ruleSet.globals.cross_word ?? 'reset',
      maxSymbols: params.sample,
      ruleSet,
    };
  }, [
    typedLayout,
    params.corpus,
    params.corpus2,
    mixedId,
    params.caseMode,
    params.textClass,
    params.sample,
    ruleSet,
  ]);

  const { report, loading, progress, error: analysisError } = useAnalysis(request);

  /** The last report that landed, and the layout it was of. */
  const [landed, setLanded] = useState<{ report: ReportDTO; layout: Layout } | null>(null);
  const layoutNow = useRef(state.layout);
  layoutNow.current = state.layout;
  useEffect(() => {
    // A report lands only for the request still standing, so it is of the layout now on screen.
    if (report && !report.provisional) setLanded({ report, layout: layoutNow.current });
  }, [report]);

  // A swap changes which key types which symbol, nothing else, so the tables already typed can be
  // re-scored in milliseconds — as long as they are of the layout the swap was made on.
  const [estimate, setEstimate] = useState<{ report: ReportDTO; layout: Layout } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new swap asks for an estimate; a report landing later must not
  useEffect(() => {
    const swap = state.lastSwap;
    if (!swap || !landed || landed.layout !== swap.before) return;
    const posA = state.compiled.keyIndex.get(swap.from);
    const posB = state.compiled.keyIndex.get(swap.to);
    if (posA === undefined || posB === undefined) return;
    let cancelled = false;
    const layout = state.layout;
    client
      .relabel({
        baseKey: landed.report.key,
        layout: toCanonicalJson(typedLayout),
        layerIdx: swap.layerIdx,
        posA,
        posB,
        ruleSet,
      })
      .then((dto) => {
        if (!cancelled && dto) setEstimate({ report: dto, layout });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.lastSwap]);

  const current = landed !== null && landed.layout === state.layout;
  const provisional = !current && estimate !== null && estimate.layout === state.layout;
  /** What the numbers show: the analysis of this layout, an estimate of it, or the last there was. */
  const shown = provisional && estimate ? estimate.report : (landed?.report ?? report);
  const stale = shown !== null && !current && !provisional;

  // ------------------------------------------------------------------ the link

  // The link carries the layout as it is: an unsaved one as an inline snapshot, written a moment
  // after the last edit, and remembered as a draft of the stored layout it is an edit of; the
  // stored or opened one again once nothing is unsaved. Nothing is written as the view opens.
  const pendingLink = useRef<Promise<string> | null>(null);
  const linkFor = useCallback(async (): Promise<string> => {
    if (!state.dirty) return cleanRef;
    const ref = inlineRef(await encodeInline(state.layout));
    remember(ref, storedId);
    return ref;
  }, [state.dirty, state.layout, cleanRef, storedId, remember]);
  const linkNow = useRef(params.layoutRef);
  linkNow.current = params.layoutRef;
  useEffect(() => {
    const write = (ref: string) => {
      if (ref === linkNow.current) return;
      claim(ref);
      navigate({
        to: '/analyze',
        search: ((prev: Record<string, string | undefined>) => ({ ...prev, layout: ref })) as never,
        replace: true,
        // The same view, written again: the page stays where it was scrolled to.
        resetScroll: false,
      });
    };
    if (!state.dirty) {
      write(cleanRef);
      return;
    }
    // A draft opened from its own link is in the link already.
    if (state.layout === initialLayout && draftOf(openedRef)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const pending = linkFor();
      pendingLink.current = pending;
      pending.then((ref) => {
        if (pendingLink.current === pending) pendingLink.current = null;
        if (!cancelled) write(ref);
      });
    }, LINK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.layout, state.dirty, cleanRef, linkFor, initialLayout, openedRef, claim, navigate]);

  // The layer edited is the one the link names, so a link opens on it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the editor moves the layer; the link follows it
  useEffect(() => {
    if (params.layer !== state.layer) setParams({ layer: state.layer });
  }, [state.layer]);

  // An unsaved layout is easy to lose by closing the tab.
  useEffect(() => {
    if (!state.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state.dirty]);

  const save = useCallback(async () => {
    const layout = state.layout;
    setSaving(true);
    try {
      const { id, leftBehind } = await saveLayout(storage, layout, storedId);
      // Its link from now on carries it whole, so it can still be sent. A moment ago that may have
      // been the link of a draft of it, which it no longer is.
      const ref = await snapshotRef(layout, id);
      forget(ref);
      setCleanRef(ref);
      send({ type: 'saved', layout });
      setStoredId(id);
      void savedLayouts.refresh();
      if (leftBehind) {
        toast.error(
          `Saved ${layout.name}; its copy under the old name could not be removed and is still in the Library`,
        );
      } else toast.info(`Saved ${layout.name}`);
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
  }, [state.layout, storage, storedId, savedLayouts.refresh, forget]);

  const pick = (ref: string) => {
    if (state.dirty && !window.confirm(`Leave ${state.layout.name}? Its unsaved changes are lost.`))
      return;
    open(ref);
  };

  const compare = async () => {
    const ref = await (pendingLink.current ?? linkFor());
    navigate({ to: '/compare', search: toSearch(params, { layoutRef: ref }) as never });
  };

  // ------------------------------------------------------------------ outlines and playback

  const [outline, setOutline] = useState<number[]>([]);
  const [arcs, setArcs] = useState<[number, number][]>([]);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  /** A pair ending on a layer key, opened to show what that key was pressed for. */
  const [pressedFor, setPressedFor] = useState<{ rule: string; item: RuleItem } | null>(null);
  const [showCombos, setShowCombos] = useState(true);

  const clearOutline = useCallback(() => {
    setOutline([]);
    setArcs([]);
    setSelectedItem(null);
  }, []);
  // An edit moves keys: what was outlined may no longer be where it was drawn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only an edit clears it
  useEffect(() => {
    clearOutline();
    setPressedFor(null);
  }, [state.layout]);

  const outlineItem = useCallback(
    (item: RuleItem) => {
      if (!shown) return;
      setOutline(expandPositions(shown, item.keys));
      setArcs(item.keys.slice(0, -1).map((p, i) => [p, item.keys[i + 1]] as [number, number]));
    },
    [shown],
  );

  const [explainText, setExplainText] = useState('');
  const [explain, setExplain] = useState<{ text: string; dto: ExplainDTO } | null>(null);
  /** Which press of the explained word the board shows; `frame` past the last one is the rest. */
  const [play, setPlay] = useState<{ frame: number; playing: boolean } | null>(null);

  // Re-run the explanation whenever the text or the way it would be typed changes.
  useEffect(() => {
    let cancelled = false;
    if (explainText.trim() === '') {
      setExplain(null);
      setPlay(null);
      return;
    }
    const timer = setTimeout(() => {
      client
        .explain(toCanonicalJson(typedLayout), explainText, params.caseMode)
        .then((dto) => {
          if (!cancelled) setExplain({ text: explainText, dto });
        })
        .catch(() => {
          if (!cancelled) setExplain(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, typedLayout, explainText, params.caseMode]);

  const frames = useMemo(
    () => (explain ? playFrames(explain.dto.steps, typedCompiled) : []),
    [explain, typedCompiled],
  );
  // A new word starts from its first press, unless motion is reduced; the same word explained
  // again — after an edit — stays where it was, on a press that still exists.
  const playedText = useRef<string | null>(null);
  useEffect(() => {
    if (!explain || frames.length === 0) {
      setPlay(null);
      playedText.current = null;
      return;
    }
    if (playedText.current !== explain.text) {
      playedText.current = explain.text;
      setPlay({ frame: 0, playing: !prefersReducedMotion() });
      // The board plays the word now; whatever was outlined gives way to it.
      clearOutline();
    } else {
      setPlay((p) => p && { ...p, frame: Math.min(p.frame, frames.length) });
    }
  }, [explain, frames, clearOutline]);
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

  const frame = play ? frames[play.frame] : undefined;
  // While a word plays the board follows it from layer to layer, resting on the one it starts on.
  const playing = play !== null && frames.length > 0;
  const boardLayer = playing ? (frame ?? frames[0]).layer : state.layer;

  /** A gesture on the board while a word plays acts on the layer the board shows, then stops it. */
  const stopPlaying = () => {
    if (!playing) return;
    if (boardLayer !== state.layer) send({ type: 'selectLayer', layer: boardLayer });
    setPlay(null);
  };

  const heat = useMemo(
    () => (shown ? heatMap(shown, params.heat, boardLayer) : {}),
    [shown, params.heat, boardLayer],
  );
  const hasTypingCombos = typedCompiled.combos.some((c) => c.role === 'typing');
  const boardCombos = useMemo(() => {
    const all = typingCombos(typedCompiled, boardLayer, frame?.combo ?? null);
    // Hidden, a combo still shows while it is the press being played.
    return showCombos ? all : all.filter((c) => c.active);
  }, [typedCompiled, boardLayer, frame, showCombos]);

  // Everything the board outlines: a key armed for a swap, the keys picked for a combo, the keys of
  // a combo a panel points at, and an outlined pair or word.
  const highlighted = useMemo(() => {
    if (playing) return frame?.held ?? [];
    const ids = [
      ...(state.swapFrom ? [state.swapFrom] : []),
      ...(state.comboPick ?? []),
      ...state.boardHighlight,
    ];
    const edits = ids
      .map((id) => state.compiled.keyIndex.get(id))
      .filter((p): p is number => p !== undefined);
    return [...edits, ...outline];
  }, [
    playing,
    frame,
    state.swapFrom,
    state.comboPick,
    state.boardHighlight,
    state.compiled,
    outline,
  ]);

  const highlightItem = (ruleId: string, index: number) => {
    const rule = shown?.results.find((r) => r.id === ruleId);
    const item = rule?.items[index];
    if (!item) return;
    setPlay(null);
    setSelectedRule(ruleId);
    setSelectedItem(index);
    outlineItem(item);
    // The board turns to the layer the item happens on, so its keys are the ones drawn.
    const layer = itemLayer(item.layers);
    if (layer !== null && layer !== state.layer) send({ type: 'selectLayer', layer });
    if (item.then?.length) setPressedFor({ rule: rule.label, item });
  };

  const selectMetric = (id: string) => {
    setSelectedRule(id);
    setSelectedItem(null);
    document
      .getElementById(`metric-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ------------------------------------------------------------------ the selected key

  const selectedPos =
    state.selected !== null ? (state.compiled.keyIndex.get(state.selected) ?? null) : null;
  const keyStats = useKeyStats(shown, selectedPos, state.layer);
  const keyStatsView =
    shown && state.selected !== null ? (
      <KeyStats
        compiled={state.compiled}
        report={shown}
        keyId={state.selected}
        layer={state.layer}
        stats={keyStats.stats}
        updating={keyStats.updating || provisional || stale}
        onSelectItem={({ ruleId, item }: KeyItemSelection) => {
          outlineItem(item);
          // A pair ending on a layer key opens what that key was pressed for, as a card's does.
          if (item.then?.length) {
            const label = shown.results.find((r) => r.id === ruleId)?.label ?? ruleId;
            setPressedFor({ rule: label, item });
          }
        }}
      />
    ) : null;

  // ------------------------------------------------------------------ the rest of the editor

  const [producers, setProducers] = useState<Record<string, ProducerDTO[]>>({});
  useEffect(() => {
    if (state.panel !== 'paths') return;
    client
      .producers(toCanonicalJson(state.layout), params.caseMode)
      .then(setProducers)
      .catch(() => setProducers({}));
  }, [client, state.panel, state.layout, params.caseMode]);

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
      // One thing at a time: a swap or pick in progress, then an outline, then the editor.
      if (state.swapFrom !== null || state.comboPick !== null || state.boardHighlight.length > 0) {
        send({ type: 'cancelSwap' });
        send({ type: 'comboPickCancel' });
        send({ type: 'setBoardHighlight', keys: [] });
      } else if (outline.length > 0 || arcs.length > 0) clearOutline();
      else send({ type: 'deselect' });
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
        stopPlaying();
        send({ type: 'keyClick', keyId });
        send({ type: 'startSwap' });
      }
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      stopPlaying();
      send({ type: 'typeOnKey', keyId, seed: null });
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      stopPlaying();
      // On one of several selected keys, every one of them.
      const keys = selectionOf(state);
      if (keys.length > 1 && keys.includes(keyId)) {
        send({ type: 'clearSelection' });
        setMessage(`${keys.length} keys do nothing`);
        return;
      }
      send({ type: 'clearKey', keyId });
      setMessage(`${keyId} does nothing`);
      return;
    }
    // Space keeps activating the key like the button it is; everything else typed on a key is
    // the start of its binding.
    if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault();
      stopPlaying();
      send({ type: 'typeOnKey', keyId, seed: e.key });
    }
  };

  const corpusLanguage = corpora.find((c) => c.id === params.corpus)?.language;
  // The text's languages, then those the layout says it is for.
  const layoutLanguages = state.layout.languages;
  const languageGap = useMemo(() => {
    for (const tag of languagesToJudge(corpusLanguage, layoutLanguages)) {
      const c = layoutLanguageCoverage(typedCompiled, tag);
      if (c && c.missingRequired.length > 0) return c;
    }
    return null;
  }, [typedCompiled, corpusLanguage, layoutLanguages]);
  const corpusName = corpora.find((c) => c.id === params.corpus)?.name ?? params.corpus;
  /** A chord's step names its virtual key; the reader knows it by the keys pressed together. */
  const stepKey = (key: string) => {
    const combo = typedCompiled.combos.find((c) => typedCompiled.positions[c.pos]?.id === key);
    return combo ? combo.keys.map((k) => typedCompiled.keys[k]?.id ?? '?').join('+') : key;
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: undo belongs to the whole view, reached from whatever inside it has focus.
    <div
      className="lb-analyze space-y-4"
      onKeyDown={(e) => {
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
        const target = e.target as HTMLElement;
        // A text field has an undo stack of its own, and it should win inside itself.
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        undo(e.shiftKey);
      }}
    >
      <h1 className="sr-only">Analyze</h1>

      <LayoutBar
        layout={state.layout}
        dirty={state.dirty}
        saving={saving}
        onMeta={(meta) => send({ type: 'setMeta', ...meta })}
        onSave={save}
        // A saved layout is picked as itself, whatever its link carries.
        layoutRef={!state.dirty && storedId !== null ? savedRef(storedId) : params.layoutRef}
        onPick={pick}
        saved={savedLayouts.entries}
        corpora={corpora}
        params={params}
        ruleSetName={ruleSet.name}
        onParams={setParams}
        onCompare={compare}
        showCombos={hasTypingCombos ? { on: showCombos, onChange: setShowCombos } : undefined}
      />

      {params.without.length > 0 && (
        <div className="alert text-sm py-2" role="status">
          <span>Typed without {featureList(params.without)}. The keys are edited as written.</span>
          <button
            type="button"
            className="btn btn-xs whitespace-nowrap"
            onClick={() => setParams({ without: [] })}
          >
            Use every feature
          </button>
        </div>
      )}

      {state.error && <ErrorAlert message={state.error} />}
      {analysisError && <ErrorAlert message={`Could not analyze: ${analysisError}`} />}

      {/* The board first, then the selected key's editor under it on a phone, beside it at a desk,
          and the board scrolls with the page at every width. */}
      <div className={`lb-edit-grid ${state.selected ? 'lb-editing' : ''}`}>
        <div className="lb-edit-main">
          <section
            className="lb-edit-board card bg-base-100 border border-base-300 min-w-0"
            aria-label="Board"
          >
            <div className="card-body gap-2 p-3 sm:p-4 min-w-0">
              <Collapsible id="analyze.board" title="Board">
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="lb-layer-strip min-w-0 flex-1">
                      <LayerTabs
                        layers={state.compiled.layers.map((l) => ({
                          idx: l.idx,
                          id: l.id,
                          name: l.name,
                          color: l.color,
                        }))}
                        active={boardLayer}
                        onSelect={(layer) => {
                          // Choosing a layer is looking at it: the word stops playing over it.
                          setPlay(null);
                          send({ type: 'selectLayer', layer });
                        }}
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <label className="label-text text-xs" htmlFor="heat">
                      Heat
                    </label>
                    <select
                      id="heat"
                      name="heat"
                      className="select select-xs select-bordered w-auto"
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

                  <div className="lb-board relative">
                    {/* The board pans inside its own box on a narrow screen. */}
                    <div className="lb-board-scroll">
                      <Keyboard
                        ref={keyboard}
                        id="kb-analyze"
                        legendList="separate"
                        compiled={state.compiled}
                        layer={boardLayer}
                        selected={state.selected}
                        alsoSelected={state.also}
                        heat={heat}
                        highlight={highlighted}
                        pressed={frame?.keys ?? []}
                        combos={boardCombos}
                        arcs={playing ? [] : arcs}
                        draggable
                        onDragStart={() => stopPlaying()}
                        onKeyClick={(keyId, how) => {
                          if (state.comboPick) {
                            send({ type: 'comboPickToggle', keyId });
                            return;
                          }
                          stopPlaying();
                          if (!state.swapFrom) clearOutline();
                          // A click, a tap and Space all select; the inspector is where editing
                          // happens, so a finger and a mouse reach it the same way. With Shift, or a
                          // finger rested on the key, the key joins the others selected or leaves.
                          send(
                            how?.add
                              ? { type: 'toggleSelect', keyId }
                              : { type: 'keyClick', keyId },
                          );
                        }}
                        onDropKey={(drop) => {
                          const keys = selectionOf(state);
                          const many =
                            drop.to.kind === 'layer' && keys.length > 1 && keys.includes(drop.from);
                          send({ type: 'dropKey', ...drop });
                          setMessage(
                            drop.to.kind === 'layer'
                              ? `${many ? `${keys.length} keys` : drop.from} ${drop.mode === 'copy' ? 'copied' : 'sent'} to ${drop.to.layerId}`
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
                      <span className="font-mono">{state.comboPick.join('+') || 'none yet'}</span> —
                      tap them on the board, then add the combo in the Combos panel.
                    </p>
                  )}
                </div>
              </Collapsible>
            </div>
          </section>

          <section
            className="lb-edit-explain card bg-base-100 border border-base-300 min-w-0"
            aria-label="A word, typed"
          >
            <div className="card-body gap-2 p-3 sm:p-4">
              <Collapsible id="analyze.word" title="A word, typed">
                <div className="flex flex-col gap-2 min-w-0">
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
                    {(outline.length > 0 || explain) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          clearOutline();
                          setExplainText('');
                        }}
                      >
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
                                  : {
                                      frame: p && p.frame < frames.length ? p.frame : 0,
                                      playing: true,
                                    },
                              )
                            }
                          >
                            {play?.playing ? '⏸ Pause' : '▶ Play'}
                          </button>
                        )}
                        <span className="font-mono text-xs opacity-70">
                          {explain.dto.presses} presses
                        </span>
                      </div>
                      {/* Each press, in order: the one lit on the board is marked, and any one can be
                      looked at on its own. */}
                      <ol className="flex flex-wrap items-center gap-1" aria-label="Presses">
                        {explain.dto.steps.map((s, i) => {
                          const at = frames.findIndex((f) => f.step === i);
                          const now = frame?.step === i;
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
                                disabled={at < 0}
                                onClick={() => setPlay({ frame: at, playing: false })}
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
                </div>
              </Collapsible>
            </div>
          </section>

          <SummaryCard
            shown={shown}
            provisional={provisional}
            stale={stale || (loading && !provisional)}
            progress={progress}
            params={params}
            corpusName={corpusName}
            languageGap={languageGap}
            onSelect={selectMetric}
          />

          <section className="lb-edit-extras min-w-0" aria-label="Legend">
            <Collapsible id="analyze.legend" title="Legend">
              <KeyLegend compiled={state.compiled} layer={boardLayer} />
            </Collapsible>
          </section>

          <p aria-live="polite" className="sr-only">
            {state.swapFrom ? `${state.swapFrom} armed for a swap` : message}
          </p>
        </div>

        <div className="lb-edit-side">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere in the inspector
              closes it, the way it would a dialog; the controls inside handle everything else. */}
          <div
            className="lb-edit-inspector min-w-0"
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.defaultPrevented || state.selected === null) return;
              e.preventDefault();
              const keyId = state.selected;
              send({ type: 'deselect' });
              focusKey(keyId);
            }}
          >
            <KeyInspector
              state={state}
              send={send}
              focusKey={focusKey}
              announce={setMessage}
              stats={keyStatsView}
            />
          </div>

          <section className="lb-edit-panels card bg-base-100 border border-base-300 min-w-0">
            <div className="card-body gap-3 p-3 sm:p-4 min-w-0">
              <Collapsible id="analyze.editor" title="Editor">
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      role="tablist"
                      aria-label="Editor panels"
                      className="lb-panel-tabs tabs tabs-border tabs-sm min-w-0 flex-1"
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
              </Collapsible>
            </div>
          </section>
        </div>

        {shown && (
          <MetricFamilies
            report={shown}
            selectedRule={selectedRule}
            selectedItem={selectedItem}
            onHighlightItem={highlightItem}
            presetId={presetOf(params.preset)}
          />
        )}
      </div>

      {pressedFor && (
        <PairBreakdown
          compiled={typedCompiled}
          rule={pressedFor.rule}
          item={pressedFor.item}
          onClose={() => setPressedFor(null)}
        />
      )}
    </div>
  );
}

/**
 * The numbers up front, what they are of, and what the layout cannot type: every character of the
 * text with no way to type it, most frequent first, each breaking the word it is in.
 */
function SummaryCard({
  shown,
  provisional,
  stale,
  progress,
  params,
  corpusName,
  languageGap,
  onSelect,
}: {
  shown: ReportDTO | null;
  provisional: boolean;
  stale: boolean;
  progress: { done: number; total: number } | null;
  params: Params;
  corpusName: string;
  languageGap: { name: string; missingRequired: string[] } | null;
  onSelect: (id: string) => void;
}) {
  const symbols = shown?.stats.symbols ?? 0;
  const share = (n: number) => {
    const all = symbols + (shown?.coverage.unproducible.reduce((s, [, c]) => s + c, 0) ?? 0);
    const p = all > 0 ? (n / all) * 100 : 0;
    return p > 0 && p < 0.01 ? '<0.01%' : `${p.toFixed(2)}%`;
  };
  return (
    <section
      className="lb-edit-summary card bg-base-100 border border-base-300 min-w-0"
      aria-label="Summary"
    >
      <div className="card-body gap-3 p-3 sm:p-4">
        <Collapsible
          id="analyze.summary"
          title="Summary"
          extra={
            <>
              <HelpLink help={HELP.headline} />
              {provisional && <span className="text-xs opacity-70">estimate after swap</span>}
              {stale && !provisional && <span className="text-xs opacity-70">updating…</span>}
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-mono text-xs opacity-60">
                {params.universe === 'with_space' ? 'with space' : 'no space'} ·{' '}
                {params.caseMode === 'model' ? 'shift modeled' : 'case folded'} ·{' '}
                {String(shown?.globals.normalization ?? 'percent_of_ngrams')} ·{' '}
                {params.sample.toLocaleString('en-US')} symbols of {corpusName}
              </p>
            </div>

            {stale && progress && progress.total > 0 && (
              <progress
                className="progress progress-primary w-full h-1"
                value={progress.done}
                max={progress.total}
                aria-label="Analysis progress"
              />
            )}

            {shown ? (
              <>
                <SummaryStrip results={shown.results} onSelect={onSelect} />
                {shown.score.enabled && shown.score.value !== null && (
                  <p className="text-sm">
                    Composite score:{' '}
                    <span className="font-mono">{shown.score.value.toFixed(1)}</span> / 100
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3 py-6">
                <span className="loading loading-dots loading-md" />
                <p className="text-sm opacity-70 flex-1">
                  Simulating {params.sample.toLocaleString('en-US')} symbols of {corpusName}…
                </p>
              </div>
            )}

            {languageGap && (
              <div
                className="alert alert-warning py-2 text-xs"
                role="note"
                aria-label="Language coverage"
              >
                <span>
                  This layout cannot type {languageGap.missingRequired.length} character
                  {languageGap.missingRequired.length === 1 ? '' : 's'} {languageGap.name} needs:{' '}
                  <span className="font-mono">{languageGap.missingRequired.join(' ')}</span>.
                </span>
              </div>
            )}

            {shown && (
              <div className="space-y-1 text-xs">
                {shown.coverage.unproducible.length === 0 ? (
                  <p>
                    <span className="badge badge-success badge-sm">
                      every character in the text can be typed
                    </span>
                  </p>
                ) : (
                  <>
                    <h3 className="font-semibold">
                      Cannot type {shown.coverage.unproducible.length} character
                      {shown.coverage.unproducible.length === 1 ? '' : 's'} of the text
                    </h3>
                    <p className="opacity-70">
                      Each one ends the word it is in, so the numbers leave those words out.
                    </p>
                    <ul
                      className="flex flex-wrap gap-1"
                      aria-label="Characters the layout cannot type"
                    >
                      {shown.coverage.unproducible.map(([sym, n]) => (
                        <li
                          key={sym}
                          className="badge badge-error badge-sm font-mono gap-1"
                          title={`${n.toLocaleString('en-US')} times`}
                        >
                          {symbolLabel(sym)}
                          <span className="opacity-80">
                            ×{n.toLocaleString('en-US')} · {share(n)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {shown.coverage.softDropped.length > 0 && (
                  <p className="opacity-70">
                    Punctuation skipped:{' '}
                    {shown.coverage.softDropped.map(([sym, n], i) => (
                      <span key={sym} className="font-mono">
                        {i > 0 && ' '}
                        {symbolLabel(sym)} ×{n.toLocaleString('en-US')}
                      </span>
                    ))}
                  </p>
                )}
                <p className="font-mono opacity-60">
                  {shown.stats.keystrokes.toLocaleString('en-US')} keystrokes ·{' '}
                  {shown.stats.words.toLocaleString('en-US')} words · {Math.round(shown.elapsedMs)}{' '}
                  ms
                </p>
              </div>
            )}
          </div>
        </Collapsible>
      </div>
    </section>
  );
}

/** Every number, grouped by what it counts. Drawn again only when the report or selection moves. */
const MetricFamilies = memo(function MetricFamilies({
  report,
  selectedRule,
  selectedItem,
  onHighlightItem,
  presetId,
}: {
  report: ReportDTO;
  selectedRule: string | null;
  selectedItem: number | null;
  onHighlightItem: (ruleId: string, index: number) => void;
  presetId?: string;
}) {
  const shown = useFamilyShown();
  return (
    <Collapsible id="analyze.numbers" title="Numbers" className="lb-edit-results">
      <div className="space-y-4 min-w-0">
        <FamilyFilter />
        {METRIC_FAMILIES.map(([family, title]) => {
          const results = report.results.filter((r) => r.family === family);
          if (results.length === 0 || !shown(family)) return null;
          return (
            <section key={family} className="space-y-2">
              <h2 className="text-sm uppercase tracking-wide opacity-60">{title}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {results.map((r) => (
                  <MetricCard
                    key={r.id}
                    result={r}
                    selectedItem={selectedRule === r.id ? selectedItem : null}
                    onHighlightItem={onHighlightItem}
                    presetId={presetId}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Collapsible>
  );
});
