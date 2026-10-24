import {
  type AnalysisSettings,
  BUNDLED_LAYOUTS,
  type CorpusManifest,
  documentMissing,
  type Layout,
  languagesToJudge,
  layoutLanguageCoverage,
  nameTaken,
  producibleSymbols,
  type RuleItem,
  sameName,
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
import { proposeChange } from '../../auth/github-session.js';
import { Collapsible } from '../../components/Collapsible.js';
import { CombosApart } from '../../components/CombosApart.js';
import { ErrorAlert } from '../../components/ErrorAlert.js';
import { FamilyFilter, METRIC_FAMILIES, useFamilyShown } from '../../components/FamilyFilter.js';
import { featureList } from '../../components/FeatureSwitches.js';
import { HelpLink } from '../../components/HelpLink.js';
import {
  comboPlace,
  combosApart,
  Keyboard,
  type KeyboardHandle,
  KeyLegend,
  typingCombos,
} from '../../components/Keyboard.js';
import { type KeyItemSelection, KeyStats } from '../../components/KeyStats.js';
import { LayerNav, useLayerSwipe } from '../../components/LayerNav.js';
import { MetricCard, SummaryStrip } from '../../components/Metrics.js';
import { NameDialog, type TakenLayout } from '../../components/NameDialog.js';
import { PairBreakdown } from '../../components/PairBreakdown.js';
import { presetOf } from '../../components/RuleSources.js';
import { Tabs, tabId, tabPanelId } from '../../components/Tabs.js';
import { freeCopyName, type SaveOptions } from '../../custom/save-new.js';
import type { useAnalysisClient } from '../../engine/client-context.js';
import { expandPositions, heatMap } from '../../engine/heat.js';
import type { AnalyzeRequest, ExplainDTO, ProducerDTO, ReportDTO } from '../../engine/protocol.js';
import { useAnalysis } from '../../engine/use-analysis.js';
import { useKeyStats } from '../../engine/use-key-stats.js';
import { HELP, type HelpTopic } from '../../guide/help.js';
import type { LayoutSource } from '../../layout-session/open.js';
import type { OpenSession } from '../../layout-session/use-layout-session.js';
import { followProposal, forgetProposal, recordProposal } from '../../proposals/proposals.js';
import { toast } from '../../state/toasts.js';
import { useCollection, useStorage } from '../../storage/use-storage.js';
import { HEAT_MODES, type HeatMode, type Params, toSearch } from '../../url/params.js';
import { ComboInspector } from '../edit/inspector/ComboInspector.js';
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
import {
  editReducer,
  type Panel,
  refusalShownIn,
  selectionOf,
  shownLayer,
} from '../edit/reducer.js';
import { charLabel, missingKeys, spoken } from '../edit/tray.js';
import { initialUndoState, undoable } from '../edit/undo.js';
import { textLanguage, textName } from '../text-of.js';
import type { AnalysisSettingsState } from '../useAnalysisSettings.js';
import { useTypedLayout } from '../useLayout.js';
import { itemLayer } from './item-layer.js';
import { LayoutBar } from './LayoutBar.js';
import { MissingKeysTray } from './MissingKeysTray.js';
import { type CopyName, ProposeDialog, type ProposeOutcome } from './ProposeDialog.js';
import { playFrames } from './playback.js';
import { SubmitDialog } from './SubmitDialog.js';

/** Built once: a reducer rebuilt on every render would reset the editor's history. */
const undoableEditReducer = undoable(editReducer);

/** How long each press of a played word stays lit, and the rest before it plays again. */
const PLAY_STEP_MS = 750;
const PLAY_REST_MS = 1200;
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
const PANEL_TABS = PANELS.map(([id, label]) => ({ id, label }));

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface WorkbenchProps {
  /** The layout session, open: the layout as opened, and what is done with it. */
  session: OpenSession;
  params: Params;
  setParams: (overrides: Partial<Params>) => void;
  /** What the layout is analyzed on, the rule set read. */
  /** What the numbers are made on, as far as their rule set is read. */
  settings: AnalysisSettingsState;
  corpora: CorpusManifest[];
  client: ReturnType<typeof useAnalysisClient>;
  navigate: ReturnType<typeof useNavigate>;
}

/**
 * Analyze, with the layout open for editing: the board, the selected key's editor, its numbers
 * above the summary, the panels, and every number of the analysis, which follows each edit. A swap
 * shows an estimate at once, re-scored from the tables already typed, until the layout as edited is
 * typed afresh.
 */
export function Workbench({
  session,
  params,
  setParams,
  settings,
  corpora,
  client,
  navigate,
}: WorkbenchProps) {
  const [state, send] = useReducer(undoableEditReducer, null, () => {
    const start = initialUndoState(session.layout, session.compiled, params.layer);
    // A draft this tab made is still unsaved: the layout stored, if any, is not this one yet.
    return session.startsUnsaved ? { ...start, dirty: true, saved: null } : start;
  });
  const keyboard = useRef<KeyboardHandle>(null);
  /** What to tell a screen reader: a key's changed legend is not announced on its own. */
  const [message, setMessage] = useState('');
  // What an edit did, told once it is known: what landed, or why it was refused. A layer removed
  // says how to get it back.
  useEffect(() => {
    const last = state.lastEdit;
    if (!last) return;
    if (last.status === 'refused') {
      // The alert above the board is read out on its own; the reason beside a panel's text is not.
      if (refusalShownIn(last.edit) !== 'error') setMessage(last.message);
      return;
    }
    if (last.say) setMessage(last.say);
    const { edit } = last;
    if (edit.kind === 'removeLayer') {
      const name = last.before.layers.find((l) => l.id === edit.layer)?.name ?? edit.layer;
      toast.info(`Removed ${name} — Undo brings it back`);
    }
  }, [state.lastEdit]);

  /** The custom layouts, for the picker; read again after each save. */
  const customLayouts = useCollection('layouts');
  const storage = useStorage();

  // ------------------------------------------------------------------ what is analyzed

  // The board shows the layout as it is written; the numbers are for it as typed, without the
  // features the switches leave out, and so are the heat, the playback and the explanations.
  const typedCompiled = useTypedLayout(state.compiled, settings.linked.without);
  /** The settings to analyze on: none until the rule set is read, nor when it will not open. */
  const ready = settings.settings;

  // The layout as written: the engine types it without the features the settings leave out, and
  // mixes a second corpus in itself.
  const request: AnalyzeRequest | null = useMemo(
    () => (ready ? { layout: toCanonicalJson(state.layout), settings: ready } : null),
    [state.layout, ready],
  );

  const analysis = useAnalysis(request);
  const { report, progress } = analysis;
  // Waiting for the rule set is part of analyzing, and a rule set that will not open is why not.
  const loading = analysis.loading || settings.status === 'reading';
  const analysisError = settings.error ?? analysis.error;

  /** The last report that landed, and the layout and settings it was made on. */
  const [landed, setLanded] = useState<{
    report: ReportDTO;
    layout: Layout;
    settings: AnalysisSettings | null;
  } | null>(null);
  const readyNow = useRef(ready);
  readyNow.current = ready;
  const layoutNow = useRef(state.layout);
  layoutNow.current = state.layout;
  useEffect(() => {
    // A report lands only for the request still standing, so it is of the layout now on screen.
    if (report && !report.provisional) {
      setLanded({ report, layout: layoutNow.current, settings: readyNow.current });
    }
  }, [report]);

  // A swap changes which key types which symbol, nothing else, so the tables already typed can be
  // re-scored in milliseconds — as long as they are of the layout the swap was made on.
  const [estimate, setEstimate] = useState<{ report: ReportDTO; layout: Layout } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new edit can ask for an estimate; a report landing later must not
  useEffect(() => {
    const last = state.lastEdit;
    if (last?.status !== 'landed' || last.edit.kind !== 'swap') return;
    if (!landed || landed.layout !== last.before || landed.settings !== ready) return;
    const swap = last.edit;
    const layerIdx = state.compiled.layerIndex.get(swap.layer);
    const posA = state.compiled.keyIndex.get(swap.from);
    const posB = state.compiled.keyIndex.get(swap.to);
    if (layerIdx === undefined || posA === undefined || posB === undefined || !ready) return;
    let cancelled = false;
    const layout = state.layout;
    client
      .relabel({
        baseKey: landed.report.key,
        layout: toCanonicalJson(layout),
        layerIdx,
        posA,
        posB,
        settings: ready,
      })
      .then((dto) => {
        if (!cancelled && dto) setEstimate({ report: dto, layout });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.lastEdit]);

  // Of this layout, on these settings: one made on rules changed since is the last there was.
  const current = landed !== null && landed.layout === state.layout && landed.settings === ready;
  const provisional = !current && estimate !== null && estimate.layout === state.layout;
  /**
   * What the numbers show: the analysis of this layout, an estimate of it, or the last there was.
   * None while a custom rule set is read, or when it will not open: the set before's would stand in.
   */
  const shown =
    settings.status !== 'read'
      ? null
      : provisional && estimate
        ? estimate.report
        : (landed?.report ?? report);
  const stale = shown !== null && !current && !provisional;

  // ------------------------------------------------------------------ the link

  // The link carries the layout as it is: the session is told each change, and writes a draft of
  // unsaved edits a moment after the last one, or the layout's clean reference once nothing is.
  const { edited } = session;
  useEffect(() => edited(state.layout, state.dirty), [edited, state.layout, state.dirty]);

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

  /**
   * Save the layout, under `name` when one was asked for: a copy's, or another than one taken.
   * Where another custom layout has the name, Save asks again, to overwrite that one or to rename
   * this.
   */
  const store = useCallback(
    async (name?: string, opts: SaveOptions = {}) => {
      const from = state.layout;
      const storedAs = session.storedId;
      // The same name again is the layout as it is, so once saved it is clean.
      const layout = name === undefined || name === from.name ? from : { ...from, name };
      const saved = await session.save(layout, opts);
      if (!saved.ok) {
        if (saved.reason === 'name-taken') {
          setCopyNamed(layout.name);
          // An overwrite refused is of a name kept twice, in the gists and in this browser: only
          // another name gets past it.
          setNaming({ taken: saved.taken, overwrite: opts.overwrite === undefined });
          void customLayouts.refresh();
          return;
        }
        toast.error(
          saved.reason === 'conflict'
            ? 'Someone else changed this layout; reload and try again'
            : `Save failed: ${saved.error}`,
        );
        return;
      }
      // The layout takes the name asked for only once it is saved under it.
      send(
        layout.name === from.name ? { type: 'saved', layout } : { type: 'savedAs', from, layout },
      );
      setCopyNamed(null);
      void customLayouts.refresh();
      if (saved.leftBehind) {
        toast.error(
          `Saved ${layout.name}; its copy under the old name could not be removed and is still in the Library`,
        );
      } else toast.info(`Saved ${layout.name}`);
      // Saved under another id than it was stored by, as a new custom layout or over another one: a
      // proposal kept under that id is not this layout's, and goes.
      if (saved.id !== storedAs) await forgetProposal(storage, saved.id).catch(() => false);
      // A change proposed from this layout follows it: its pull request, while open, gets this
      // version, under the name proposed.
      const followed =
        storedAs === null
          ? null
          : await followProposal(storage, storedAs, saved.id, (proposal) =>
              proposeChange(
                proposal.target,
                toCanonicalJson({ ...layout, id: proposal.target.id, name: proposal.name }),
              ),
            ).catch(() => null);
      if (followed?.kind === 'sent') {
        const to = followed.proposal.name;
        if (followed.outcome.kind === 'sent')
          toast.info(`Your proposed change to ${to} has this version`);
        else toast.error(`Your proposed change to ${to} was not updated`);
      } else if (followed?.kind === 'refused') {
        toast.error(
          `Your change to ${followed.proposal.name} was not proposed: ${followed.reason}; this copy stays in your layouts`,
        );
      } else if (followed?.kind === 'done') {
        const to = followed.proposal.name;
        toast.info(
          followed.state === 'merged'
            ? `Your change to ${to} was accepted; this copy stays in your layouts`
            : `Your change to ${to} was declined; this copy stays in your layouts`,
        );
      }
    },
    [state.layout, session.save, session.storedId, customLayouts.refresh, storage],
  );

  // Save on a bundled or community layout asks first: propose the change, or save a copy. The
  // layout it was is kept for the dialog, as saving makes it a custom layout of its own.
  const [choosing, setChoosing] = useState<LayoutSource | null>(null);
  const propose = useCallback(
    async (copy?: CopyName): Promise<ProposeOutcome> => {
      const source = choosing;
      const layout = state.layout;
      if (!source) return { kind: 'failed', error: 'this layout is not one of the Library' };
      // The Library never lists two layouts under one name, so CI would refuse it.
      if (
        source.kind === 'bundled' &&
        BUNDLED_LAYOUTS.some((l) => l.id !== source.id && l.name === layout.name)
      ) {
        return {
          kind: 'refused',
          reason: `another layout that comes with the app is called ${layout.name}`,
        };
      }
      // What the Library has is signed: the sign-in server refuses a layout that names no author.
      if (documentMissing(layout).includes('author')) {
        return { kind: 'refused', reason: 'it names no author; give it one in Settings first' };
      }
      // The copy goes by the layout's name, or by another where a custom layout has that one; the
      // pull request proposes the layout's.
      const named = copy && copy.name !== layout.name ? { ...layout, name: copy.name } : layout;
      const saved = await session.save(named, copy?.overwrite ? { overwrite: copy.overwrite } : {});
      if (!saved.ok) {
        return saved.reason === 'name-taken'
          ? { kind: 'name-taken', taken: saved.taken }
          : { kind: 'unsaved', error: saved.error };
      }
      send(
        named === layout
          ? { type: 'saved', layout }
          : { type: 'savedAs', from: layout, layout: named },
      );
      void customLayouts.refresh();
      // Kept before it is sent, so a send that fails is tried again by the copy's next save.
      const proposal = { name: layout.name, target: source, url: null };
      await recordProposal(storage, saved.id, proposal);
      const sent = await proposeChange(source, toCanonicalJson({ ...layout, id: source.id }));
      if (sent.kind === 'refused') {
        // What the sign-in server refuses it would refuse again: the copy is a layout of one's own.
        await forgetProposal(storage, saved.id).catch(() => false);
        return { kind: 'refused', reason: `${sent.reason}. Your copy is saved among your layouts` };
      }
      if (sent.kind === 'sent') {
        await recordProposal(storage, saved.id, { ...proposal, url: sent.url });
        void customLayouts.refresh();
      }
      return sent;
    },
    [choosing, session.save, state.layout, storage, customLayouts.refresh],
  );

  // A layout that is not stored here, bundled or carried in a link, is not the user's to overwrite:
  // its first save makes a copy, and asks what to call it. Later saves are of the copy, and ask
  // nothing, unless the layout was renamed to another custom layout's name.
  const [naming, setNaming] = useState<{ taken: TakenLayout | null; overwrite: boolean } | null>(
    null,
  );
  /** The name given for a copy whose save failed, offered again on the next try. */
  const [copyNamed, setCopyNamed] = useState<string | null>(null);
  const copyName = useMemo(
    () =>
      freeCopyName(state.layout.name, [
        ...BUNDLED_LAYOUTS.map((l) => l.name),
        ...customLayouts.entries.map((e) => e.name),
      ]),
    [state.layout.name, customLayouts.entries],
  );
  /** Whether Save makes a copy: of a layout not stored here, bundled or carried in a link. */
  const copying = session.storedId === null;
  const save = useCallback(() => {
    if (session.storedId !== null) void store();
    else if (session.source) setChoosing(session.source);
    else setNaming({ taken: null, overwrite: true });
  }, [session.storedId, session.source, store]);

  // Submit proposes the custom layout under the id it is stored by, which names its file.
  const [submitting, setSubmitting] = useState(false);
  const submitted = useMemo(
    () => (session.storedId === null ? null : { ...state.layout, id: session.storedId }),
    [state.layout, session.storedId],
  );

  const pick = (ref: string) => {
    if (state.dirty && !window.confirm(`Leave ${state.layout.name}? Its unsaved changes are lost.`))
      return;
    void session.open(ref);
  };

  const compare = async () => {
    const ref = await session.link();
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
    if (explainText.trim() === '' || !ready) {
      setExplain(null);
      setPlay(null);
      return;
    }
    const timer = setTimeout(() => {
      client
        .explain(toCanonicalJson(state.layout), explainText, ready)
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
  }, [client, state.layout, explainText, ready]);

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

  /** Choosing a layer is looking at it: the word stops playing over it. */
  const selectLayer = (layer: number) => {
    setPlay(null);
    send({ type: 'selectLayer', layer });
  };
  const swipe = useLayerSwipe(state.compiled.layers, boardLayer, selectLayer, true);

  const heat = useMemo(
    () => (shown ? heatMap(shown, params.heat, boardLayer) : {}),
    [shown, params.heat, boardLayer],
  );
  const hasTypingCombos = typedCompiled.combos.some((c) => c.role === 'typing');
  const boardCombos = useMemo(() => {
    const all = typingCombos(typedCompiled, boardLayer, frame?.combo ?? null);
    // Hidden, a combo on the board still shows while it is the press being played.
    return showCombos ? all : all.filter((c) => c.active);
  }, [typedCompiled, boardLayer, frame, showCombos]);
  // The combos the board leaves to the button beside it, none while hidden. The board places the
  // same list on the same keys (`typedCompiled` keeps `state.compiled`'s), so the two agree on
  // which combos it draws and which it leaves out.
  const apart = useMemo(
    () => (showCombos ? combosApart(typedCompiled, boardCombos) : []),
    [typedCompiled, boardCombos, showCombos],
  );

  // Everything the board outlines: a key armed for a swap, the keys picked for a combo, the keys of
  // the combo open in the editor or one a panel points at, and an outlined pair or word.
  const openCombo = state.combo === null ? undefined : state.layout.combos?.[state.combo];
  const placeOf = (typed: number) => comboPlace(state.compiled, typedCompiled, typed);
  const openBox =
    state.combo === null
      ? null
      : (boardCombos.find((c) => placeOf(c.index) === state.combo)?.index ?? null);
  const highlighted = useMemo(() => {
    if (playing) return frame?.held ?? [];
    const ids = [
      ...(state.swapFrom ? [state.swapFrom] : []),
      ...(state.comboPick ?? openCombo?.keys ?? []),
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
    openCombo,
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
      if (
        state.swapFrom !== null ||
        state.placing !== null ||
        state.comboPick !== null ||
        state.boardHighlight.length > 0
      ) {
        send({ type: 'cancelSwap' });
        send({ type: 'comboPickCancel' });
        send({ type: 'setBoardHighlight', keys: [] });
      } else if (outline.length > 0 || arcs.length > 0) clearOutline();
      else send({ type: 'deselect' });
      return;
    }
    // While keys are being picked for a combo, they are all the board is doing.
    if (state.comboPick) return;
    // With a swap or a character armed, Enter and Space pick its key like a click does.
    if ((state.swapFrom || state.placing !== null) && (e.key === 'Enter' || e.key === ' ')) return;
    // Every printable key types on the key, so arming a swap takes a modifier.
    if (e.altKey) {
      if (e.code === 'KeyS') {
        e.preventDefault();
        stopPlaying();
        // The key picked is the one to swap, not where an armed character goes.
        if (state.placing !== null) send({ type: 'armChar', char: null });
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
      const cleared = keys.length > 1 && keys.includes(keyId) ? keys : [keyId];
      send({
        type: 'edit',
        edit: { kind: 'bind', layer: shownLayer(state), keys: cleared, binding: { kind: 'none' } },
        say: cleared.length > 1 ? `${cleared.length} keys do nothing` : `${keyId} does nothing`,
      });
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

  const corpusLanguage = textLanguage(settings.linked, corpora);
  // The text's languages, then those the layout says it is for.
  const layoutLanguages = state.layout.languages;
  const languageGap = useMemo(() => {
    for (const tag of languagesToJudge(corpusLanguage, layoutLanguages)) {
      const c = layoutLanguageCoverage(typedCompiled, tag);
      if (c && c.missingRequired.length > 0) return c;
    }
    return null;
  }, [typedCompiled, corpusLanguage, layoutLanguages]);
  const corpusName = textName(settings.linked, corpora);

  // What the layout cannot type, as it is now: the text's characters the last report found, the
  // letters the language needs, and what edits from the tray left without a key.
  const producible = useMemo(() => producibleSymbols(typedCompiled), [typedCompiled]);
  const tray = useMemo(
    () =>
      missingKeys({
        unproducible: shown?.coverage.unproducible ?? [],
        required: languageGap?.missingRequired ?? [],
        strays: state.strays,
        producible,
        reportCurrent: current || provisional,
      }),
    [shown, current, provisional, languageGap, state.strays, producible],
  );
  /** What share of the text, typed or not, a character the layout cannot type is. */
  const share = (n: number) => {
    const missed = shown?.coverage.unproducible.reduce((s, [, c]) => s + c, 0) ?? 0;
    const all = (shown?.stats.symbols ?? 0) + missed;
    const p = all > 0 ? (n / all) * 100 : 0;
    return p > 0 && p < 0.01 ? '<0.01%' : `${p.toFixed(2)}%`;
  };
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
        saving={session.saving}
        onMeta={(meta) => send({ type: 'edit', edit: { kind: 'setMeta', ...meta } })}
        onSave={save}
        onSubmit={submitted ? () => setSubmitting(true) : undefined}
        copiesOnSave={session.storedId === null}
        // A custom layout is picked as itself, whatever its link carries.
        layoutRef={session.pickedRef}
        onPick={pick}
        custom={customLayouts.entries}
        corpora={corpora}
        params={params}
        settings={settings}
        onParams={setParams}
        onCompare={compare}
        showCombos={hasTypingCombos ? { on: showCombos, onChange: setShowCombos } : undefined}
      />

      {submitting && submitted && (
        <SubmitDialog layout={submitted} dirty={state.dirty} onClose={() => setSubmitting(false)} />
      )}

      {choosing && (
        <ProposeDialog
          layout={state.layout}
          source={choosing}
          propose={propose}
          copyName={copyName}
          taken={(name) => nameTaken(customLayouts.entries, name, null)}
          onCopy={() => setNaming({ taken: null, overwrite: true })}
          onClose={() => setChoosing(null)}
        />
      )}

      {naming && (
        <NameDialog
          title={copying ? 'Save a copy' : 'Save under another name'}
          intro={
            copying
              ? 'Save makes a copy of this layout in your custom layouts. What should the copy be called?'
              : undefined
          }
          nameLabel={copying ? 'Name of the copy' : 'Name of the layout'}
          initialName={copyNamed ?? copyName}
          submitLabel={copying ? 'Save copy' : 'Save'}
          // The one Save heard of is taken even before the custom layouts are read again, and even
          // when this layout goes by its name too: only this browser has this one, the gists that.
          taken={(name) =>
            naming.taken && sameName(naming.taken.name, name)
              ? naming.taken
              : nameTaken(customLayouts.entries, name, session.storedId)
          }
          onSubmit={(name) => {
            setNaming(null);
            setCopyNamed(name);
            void store(name);
          }}
          onOverwrite={
            naming.overwrite
              ? (name, taken) => {
                  setNaming(null);
                  setCopyNamed(name);
                  void store(name, { overwrite: taken.id });
                }
              : undefined
          }
          onClose={() => {
            setNaming(null);
            setCopyNamed(null);
          }}
        />
      )}

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
                {/* The board first, with nothing above it; the layers centred under it, as on a
                    Library card; then Heat and Undo and Redo, in a row of their own. */}
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="lb-board relative" {...swipe}>
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
                        openCombo={openBox}
                        onComboClick={(combo) => {
                          // While keys are being picked for a combo, they are all the board is doing.
                          if (state.comboPick) return;
                          stopPlaying();
                          send({ type: 'selectCombo', combo: placeOf(combo) });
                        }}
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
                        onDropKey={(drop) =>
                          send({
                            type: 'dropKey',
                            ...drop,
                            say: `${drop.from} ${drop.mode === 'copy' ? 'copied to' : 'swapped with'} ${drop.to}`,
                          })
                        }
                        onKeyShortcut={onKeyShortcut}
                        onEmptyClick={() => {
                          // Picking keys for a combo is all the board is doing until it ends.
                          if (state.comboPick) return;
                          send({ type: 'deselect' });
                          // A character tapped in the tray goes down as an armed swap does.
                          if (state.placing !== null) send({ type: 'armChar', char: null });
                          // The keys a combo or a feature outlined from a panel go too, as on Escape.
                          if (state.boardHighlight.length > 0) {
                            send({ type: 'setBoardHighlight', keys: [] });
                          }
                          clearOutline();
                        }}
                      />
                    </div>
                  </div>

                  <LayerNav
                    className="min-w-0 justify-center"
                    layers={state.compiled.layers}
                    active={boardLayer}
                    onSelect={selectLayer}
                    onRename={(layer, name) =>
                      send({ type: 'edit', edit: { kind: 'renameLayer', layer, name } })
                    }
                  />

                  <div className="lb-board-tools flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
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
                      <CombosApart
                        compiled={typedCompiled}
                        layer={boardLayer}
                        combos={apart}
                        // The board would turn under the dialog as a word plays.
                        onOpen={stopPlaying}
                        onComboClick={(combo) => {
                          if (state.comboPick) return;
                          stopPlaying();
                          send({ type: 'selectCombo', combo: placeOf(combo) });
                        }}
                      />
                      {loading && (
                        <span
                          className="loading loading-spinner loading-xs"
                          role="status"
                          aria-label="Analyzing"
                        />
                      )}
                    </div>
                    {/* On the right, on a row of its own too when a narrow screen wraps it. */}
                    <div className="join shrink-0 ml-auto">
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

                  <MissingKeysTray
                    chars={tray}
                    placing={state.placing}
                    why={(c) =>
                      languageGap?.missingRequired.includes(c)
                        ? `${languageGap.name} needs it`
                        : 'No key types it now'
                    }
                    share={share}
                    onArm={(char) => {
                      stopPlaying();
                      send({ type: 'armChar', char });
                    }}
                    onDisarm={() => send({ type: 'armChar', char: null })}
                    onDrop={({ char, to }) => {
                      stopPlaying();
                      send({
                        type: 'placeChar',
                        keyId: to,
                        char,
                        say: `${spoken(char)} on ${to}`,
                      });
                    }}
                    board={() => document.getElementById('kb-analyze')}
                  />

                  {state.placing !== null && (
                    <p className="text-xs">
                      <span className="font-mono">{charLabel(state.placing)}</span> is armed — tap
                      the key to put it on, or press Escape.{' '}
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => send({ type: 'armChar', char: null })}
                      >
                        Cancel
                      </button>
                    </p>
                  )}

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
                      tap them on the board, then{' '}
                      {state.comboPickFor === null
                        ? 'add the combo in the Combos panel.'
                        : 'use them in the combo editor.'}
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
                                <span>{charLabel(s.symbols) || s.label}</span>
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

          {/* The selected key's numbers, right above the layout's: what the key adds to them. */}
          {keyStatsView && (
            // Escape in the key's numbers closes its editor, as it does in the editor itself.
            <section
              className="lb-edit-keynumbers card bg-base-100 border border-base-300 min-w-0"
              aria-label="Key numbers"
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || e.defaultPrevented || state.selected === null) return;
                e.preventDefault();
                const keyId = state.selected;
                send({ type: 'deselect' });
                focusKey(keyId);
              }}
            >
              <div className="card-body gap-2 p-3 sm:p-4 min-w-0">{keyStatsView}</div>
            </section>
          )}

          <SummaryCard
            shown={shown}
            provisional={provisional}
            stale={stale || (loading && !provisional)}
            progress={progress}
            params={params}
            corpusName={corpusName}
            languageGap={languageGap}
            onSelect={selectMetric}
            failed={settings.status === 'failed'}
          />

          <section className="lb-edit-extras min-w-0" aria-label="Legend">
            <Collapsible id="analyze.legend" title="Legend">
              <KeyLegend compiled={state.compiled} layer={boardLayer} />
            </Collapsible>
          </section>

          <p aria-live="polite" className="sr-only">
            {state.swapFrom
              ? `${state.swapFrom} armed for a swap`
              : state.placing !== null
                ? `${spoken(state.placing)} armed: tap a key to put it on`
                : message}
          </p>
        </div>

        <div className="lb-edit-side">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere in the inspector
              closes it, the way it would a dialog; the controls inside handle everything else. */}
          <div
            className="lb-edit-inspector min-w-0"
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.defaultPrevented) return;
              if (state.combo !== null) {
                e.preventDefault();
                send({ type: 'selectCombo', combo: null });
                return;
              }
              if (state.selected === null) return;
              e.preventDefault();
              const keyId = state.selected;
              send({ type: 'deselect' });
              focusKey(keyId);
            }}
          >
            {state.combo !== null ? (
              // Remounts per combo, so a half-typed field never follows the editor to another one.
              <ComboInspector key={state.combo} state={state} send={send} combo={state.combo} />
            ) : (
              <KeyInspector state={state} send={send} focusKey={focusKey} />
            )}
          </div>

          <section className="lb-edit-panels card bg-base-100 border border-base-300 min-w-0">
            <div className="card-body gap-3 p-3 sm:p-4 min-w-0">
              <Collapsible id="analyze.editor" title="Editor">
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tabs
                      label="Editor panels"
                      prefix="editor"
                      className="lb-panel-tabs min-w-0 flex-1"
                      tabs={PANEL_TABS}
                      value={state.panel}
                      onChange={(panel) => send({ type: 'setPanel', panel })}
                    />
                    <HelpLink help={PANELS.find(([p]) => p === state.panel)?.[2] ?? HELP.panels} />
                  </div>

                  <div
                    role="tabpanel"
                    id={tabPanelId('editor', state.panel)}
                    aria-labelledby={tabId('editor', state.panel)}
                    className="min-w-0"
                  >
                    {state.panel === 'layers' && <LayersPanel state={state} send={send} />}
                    {state.panel === 'features' && <FeaturesPanel state={state} send={send} />}
                    {state.panel === 'geometry' && <GeometryPanel state={state} send={send} />}
                    {state.panel === 'combos' && <CombosPanel state={state} send={send} />}
                    {state.panel === 'behaviors' && (
                      <BehaviorsPanel
                        state={state}
                        send={send}
                        onShow={() => {
                          // The feature is what the board shows now: no word, no outlined n-gram.
                          setPlay(null);
                          clearOutline();
                        }}
                      />
                    )}
                    {state.panel === 'paths' && (
                      <PathsPanel state={state} send={send} producers={producers} />
                    )}
                    {state.panel === 'json' && <JsonPanel state={state} send={send} />}
                  </div>
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
 * The numbers up front, what they are of, and how much of the text the layout cannot type: the
 * characters themselves wait in the missing-keys tray under the board.
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
  failed,
}: {
  shown: ReportDTO | null;
  provisional: boolean;
  stale: boolean;
  progress: { done: number; total: number } | null;
  params: Params;
  corpusName: string;
  languageGap: { name: string; missingRequired: string[] } | null;
  onSelect: (id: string) => void;
  /** Whether there will be no numbers to wait for: the analysis cannot be made. */
  failed: boolean;
}) {
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
            ) : failed ? null : (
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
                      Each one ends the word it is in, so the numbers leave those words out. They
                      wait in the missing-keys tray under the board, to be put on keys.
                    </p>
                  </>
                )}
                {shown.coverage.softDropped.length > 0 && (
                  <p className="opacity-70">
                    Punctuation skipped:{' '}
                    {shown.coverage.softDropped.map(([sym, n], i) => (
                      <span key={sym} className="font-mono">
                        {i > 0 && ' '}
                        {charLabel(sym)} ×{n.toLocaleString('en-US')}
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
