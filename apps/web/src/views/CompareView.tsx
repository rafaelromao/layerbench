import { type CorpusManifest, layoutLanguages, toCanonicalJson } from '@layerbench/core';
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Collapsible } from '../components/Collapsible.js';
import { ErrorAlert } from '../components/ErrorAlert.js';
import { FamilyFilter, useFamilyShown } from '../components/FamilyFilter.js';
import { featureList } from '../components/FeatureSwitches.js';
import { formatValue } from '../components/format.js';
import { HeatLegend } from '../components/HeatLegend.js';
import { HeatNote } from '../components/HeatNote.js';
import { HeatSelect } from '../components/HeatSelect.js';
import { HelpLink } from '../components/HelpLink.js';
import { LanguageChips } from '../components/LanguageChips.js';
import { LegendButton, type LegendEntry } from '../components/LegendDialog.js';
import { BandBadge, isHeadline, SummaryStrip } from '../components/Metrics.js';
import { PreviewBoard } from '../components/PreviewBoard.js';
import { customId, customRef } from '../custom/ref.js';
import { useAnalysisClient } from '../engine/client-context.js';
import {
  effectiveHeat,
  expandPositions,
  HEAT_LABELS,
  heatMap,
  heatPeak,
  layerShare,
} from '../engine/heat.js';
import type { AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { type AnalysisState, useAnalysis } from '../engine/use-analysis.js';
import { ExportImageButton } from '../export/ExportImageButton.js';
import { type ShareImage, ShareImageDialog } from '../export/ShareImageDialog.js';
import { compareImage, unsavedVersion } from '../export/share-image.js';
import { HELP, rulerShown } from '../guide/help.js';
import { tabDrafts } from '../layout-session/drafts.js';
import { carriedRef, openLayout, snapshotRef } from '../layout-session/open.js';
import { useRememberSelection } from '../state/selection.js';
import { toast } from '../state/toasts.js';
import { useCollection, useStorage } from '../storage/use-storage.js';
import { portableCorpusError } from '../url/corpus-share.js';
import { type Params, parseParams, type RawSearch, settingsOf, toSearch } from '../url/params.js';
import { encodeRuleSnapshot } from '../url/rule-snapshot.js';
import {
  buildPortableTarget,
  parsePortableSearch,
  portableSearchTooLong,
  retainPortableState,
} from '../url/share-target.js';
import { SampleSelect, SettingsFields } from './AnalysisSelects.js';
import { compareRows } from './compare-rows.js';
import { LayoutOptions } from './LayoutOptions.js';
import { SettingsDialog, settingsSummary } from './SettingsDialog.js';
import { ShareLinkButton } from './ShareLinkButton.js';
import { useAnalysisSettings } from './useAnalysisSettings.js';
import { useCorporaState } from './useCorpora.js';
import { type LayoutState, useLayout, useTypedLayout } from './useLayout.js';

const DEFAULT_B = 'qwerty';

/** A loaded custom layout may stand in during its own local-ID-to-inline URL replacement. */
async function capturedLayoutRef(ref: string, loaded: LayoutState): Promise<string | null> {
  if (!loaded.layout || !loaded.compiled) return null;
  if (loaded.ref !== ref) {
    if (
      !ref.startsWith('inline:') ||
      loaded.storedId === null ||
      (await snapshotRef(loaded.layout, loaded.storedId)) !== ref
    )
      return null;
  }
  if (loaded.storedId === null || ref.startsWith('inline:')) return ref;
  return snapshotRef(loaded.layout, loaded.storedId);
}

function parsedLayer(value: string | undefined): number {
  if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) return 0;
  const layer = Number(value);
  return layer <= 31 ? layer : 0;
}

/**
 * Once the layout `ref` names under `key` has opened, a custom one named by its id travels in the link
 * whole, its id inside, as Analyze's does, so a link to the comparison opens anywhere: an id opens
 * only where the layout is saved.
 */
function useCarriedInLink(key: 'layout' | 'b', ref: string, loaded: LayoutState) {
  const navigate = useNavigate();
  const { layout, storedId } = loaded;
  const opened = loaded.ref === ref;
  useEffect(() => {
    if (!opened || !layout) return;
    let cancelled = false;
    void carriedRef(ref, { layout, storedId }).then((carried) => {
      if (cancelled || carried === ref) return;
      navigate({
        to: '/compare',
        search: ((prev: RawSearch) => ({ ...prev, [key]: carried })) as never,
        replace: true,
        resetScroll: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, ref, opened, layout, storedId, navigate]);
}

/**
 * What a side's heat is drawn from: its report once it answers the layout and settings on show,
 * `null` where there will be none, missing while it is being made. A report of the layout before,
 * or of other settings, would put its heat on keys it was not measured on.
 */
function heatSource(
  loaded: LayoutState,
  request: AnalyzeRequest | null,
  analysis: AnalysisState,
  settingsFailed: boolean,
): ReportDTO | null | undefined {
  if (settingsFailed || loaded.error || analysis.error !== null) return null;
  return analysis.report && analysis.answered === request ? analysis.report : undefined;
}

export function CompareView() {
  const search = useSearch({ strict: false }) as RawSearch;
  const portable = parsePortableSearch('compare', search, window.location.href);
  if (portable && !portable.ok) return <ErrorAlert message={portable.error} />;
  return portable?.ok ? (
    <PortableCompareGate search={portable.search} />
  ) : (
    <ComparePage search={search} />
  );
}

function PortableCompareGate({ search }: { search: RawSearch }) {
  const { corpora, loaded } = useCorporaState();
  const params = useMemo(() => parseParams(search), [search]);
  if (!loaded)
    return (
      <div role="status" className="flex items-center gap-2 py-4 text-sm">
        <span className="loading loading-dots loading-xs" />
        Checking the shared corpus…
      </div>
    );
  const error = portableCorpusError(params.corpus, params.corpus2, corpora);
  return error ? (
    <ErrorAlert message={error} />
  ) : (
    <ComparePage search={search} sharedCorpora={corpora} />
  );
}

function ComparePage({
  search,
  sharedCorpora,
}: {
  search: RawSearch;
  sharedCorpora?: CorpusManifest[];
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const client = useAnalysisClient();
  const params = useMemo(() => parseParams(search), [search]);
  const shown = useFamilyShown();
  useRememberSelection(params, search.rulesSnapshot);
  const refB = search.b ?? DEFAULT_B;

  const [corpora, setCorpora] = useState<CorpusManifest[]>(sharedCorpora ?? []);
  const [corporaLoaded, setCorporaLoaded] = useState(sharedCorpora !== undefined);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (sharedCorpora) return;
    client
      .listCorpora()
      .then((list) => {
        setCorpora(list);
        setCorporaLoaded(true);
      })
      .catch(() => {
        setCorpora([]);
        setCorporaLoaded(true);
      });
  }, [client, sharedCorpora]);

  const custom = useCollection('layouts');
  const storage = useStorage();
  const layoutSelection = useRef({ layout: 0, b: 0 });
  useEffect(
    () =>
      router.history.subscribe(() => {
        layoutSelection.current.layout += 1;
        layoutSelection.current.b += 1;
      }),
    [router],
  );
  useEffect(
    () => () => {
      layoutSelection.current.layout += 1;
      layoutSelection.current.b += 1;
    },
    [],
  );
  const a = useLayout(params.layoutRef);
  const b = useLayout(refB);
  useCarriedInLink('layout', params.layoutRef, a);
  useCarriedInLink('b', refB, b);
  // Both sides are typed without the same features, as the Library ranks them. Each board draws
  // the keys as written and the combos as typed, as Analyze's does; the heat lands on the keys it
  // was measured on either way.
  const typedA = useTypedLayout(a.compiled, params.without);
  const typedB = useTypedLayout(b.compiled, params.without);
  // What each side can write of the languages it is for, as its Library card shows them.
  const languagesA = useMemo(() => (a.compiled ? layoutLanguages(a.compiled) : []), [a.compiled]);
  const languagesB = useMemo(() => (b.compiled ? layoutLanguages(b.compiled) : []), [b.compiled]);
  const settings = useAnalysisSettings(settingsOf(params), search.rulesSnapshot);
  /** The settings to analyze on: none until the rule set is read, nor when it will not open. */
  const ready = settings.settings;

  // Each side as written, on the same settings: the engine types both without the same features.
  const requestA: AnalyzeRequest | null = useMemo(
    () => (a.layout && ready ? { layout: toCanonicalJson(a.layout), settings: ready } : null),
    [a.layout, ready],
  );
  const requestB: AnalyzeRequest | null = useMemo(
    () => (b.layout && ready ? { layout: toCanonicalJson(b.layout), settings: ready } : null),
    [b.layout, ready],
  );

  const analysisA = useAnalysis(requestA);
  const analysisB = useAnalysis(requestB);
  const error = a.error ?? b.error ?? settings.error ?? analysisA.error ?? analysisB.error;

  // Both boards are coloured on one scale, the busiest key of either layout on any layer, so the
  // same colour is the same amount on both. The scale is of the two, so neither is coloured until
  // both are scored, or one never will be.
  const settingsFailed = settings.status === 'failed';
  const heatA = heatSource(a, requestA, analysisA, settingsFailed);
  const heatB = heatSource(b, requestB, analysisB, settingsFailed);
  const heatSettled = heatA !== undefined && heatB !== undefined;
  const heatTop = useMemo(
    () => Math.max(0, ...[heatA, heatB].map((s) => (s ? heatPeak(s, params.heat) : 0))),
    [heatA, heatB, params.heat],
  );
  // Both are rated on one rule set, so a rule it lacks is lacking on both.
  const heatFallback = [heatA, heatB].some(
    (s) => s && effectiveHeat(s, params.heat) !== params.heat,
  );
  /**
   * Where Effort's and SFB's badges lead: the ruler of the rule set both sides are rated on. Not
   * while the numbers shown are of other rules than the link now names, as after a switch of rule
   * set until both sides have been made again.
   */
  const ratedOn = analysisA.answered?.settings.rules;
  const ruler = rulerShown(
    settings.linked.rules,
    ratedOn === analysisB.answered?.settings.rules ? ratedOn : null,
    ready?.rules,
  );

  const setParams = useCallback(
    (overrides: Partial<Params> & { b?: string; layerA?: number; layerB?: number }) => {
      const currentSearch = router.state.location.search as RawSearch;
      const currentParams = parseParams(currentSearch);
      const currentB = currentSearch.b ?? DEFAULT_B;
      const { b: nextB, layerA: nextLayerA, layerB: nextLayerB, ...rest } = overrides;
      const next: RawSearch = {
        ...toSearch(currentParams, { ...rest, layer: 0 }),
        b: nextB ?? currentB,
      };
      const selectedA = nextLayerA ?? parsedLayer(currentSearch.layerA);
      const selectedB = nextLayerB ?? parsedLayer(currentSearch.layerB);
      if (selectedA > 0) next.layerA = String(selectedA);
      if (selectedB > 0) next.layerB = String(selectedB);
      const portableRulesUnchanged =
        rest.preset === undefined || rest.preset === currentParams.preset;
      const keepSnapshot =
        currentSearch.rulesSnapshot &&
        portableRulesUnchanged &&
        customId(next.rules ?? '') !== null;
      const canStayPortable =
        customId(next.layout ?? '') === null &&
        customId(next.b ?? '') === null &&
        customId(next.corpus ?? '') === null &&
        customId(next.corpus2 ?? '') === null &&
        (!corporaLoaded ||
          portableCorpusError(
            next.corpus ?? currentParams.corpus,
            next.corpus2 ?? null,
            corpora,
          ) === null);
      if (currentSearch.share === '1' && portableRulesUnchanged && canStayPortable) {
        next.share = '1';
      }
      if (keepSnapshot) next.rulesSnapshot = currentSearch.rulesSnapshot;
      if (next.share === '1' && portableSearchTooLong('compare', next, window.location.origin)) {
        toast.error(
          'This change would make the shared comparison URL too long. Shorten the layout description or choose a smaller custom rule set; the current comparison is unchanged.',
        );
        return;
      }
      navigate({
        to: '/compare',
        search: next as never,
        replace: true,
        // The same view, written again: the page stays where it was scrolled to.
        resetScroll: false,
      });
    },
    [corpora, corporaLoaded, navigate, router],
  );

  const chooseLayout = useCallback(
    async (key: 'layout' | 'b', ref: string) => {
      const sequence = ++layoutSelection.current[key];
      const startedWith = {
        pathname: router.state.location.pathname,
        search: router.state.location.searchStr,
        hash: router.state.location.hash,
      };
      const isCurrentSelection = () => {
        const location = router.state.location;
        return (
          sequence === layoutSelection.current[key] &&
          location.pathname === startedWith.pathname &&
          location.pathname === '/compare' &&
          location.searchStr === startedWith.search &&
          location.hash === startedWith.hash
        );
      };
      const id = customId(ref);
      if (search.share === '1' && id !== null) {
        try {
          const opened = await openLayout(ref, storage);
          if (!isCurrentSelection()) return;
          if (!opened.ok) {
            toast.error(`Could not include that layout in the shared link: ${opened.error}`);
            return;
          }
          const inline = await snapshotRef(opened.layout, opened.storedId ?? id);
          if (!isCurrentSelection()) return;
          setParams(key === 'layout' ? { layoutRef: inline, layerA: 0 } : { b: inline, layerB: 0 });
        } catch (error) {
          if (!isCurrentSelection()) return;
          toast.error(
            `Could not include that layout in the shared link: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        return;
      }
      setParams(key === 'layout' ? { layoutRef: ref, layerA: 0 } : { b: ref, layerB: 0 });
    },
    [router, search.share, setParams, storage],
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
  // A layout carried whole that is a custom one here, as saved, is picked as that custom layout;
  // with changes not saved there, it is its own entry, so the saved one can be picked against it.
  const pickedA =
    a.ref === params.layoutRef && a.storedId && !a.unsaved
      ? customRef(a.storedId)
      : params.layoutRef;
  const pickedB = b.ref === refB && b.storedId && !b.unsaved ? customRef(b.storedId) : refB;

  /**
   * The image of both layouts, while its dialog is open, made of what is on show when it is asked
   * for. It needs both sides opened and scored: the one scale the boards are coloured on is of
   * the two, and an image with one side plain would be read as that layout having no heat.
   */
  const [sharing, setSharing] = useState<ShareImage | null>(null);
  const scoredA = heatSettled ? heatA : null;
  const scoredB = heatSettled ? heatB : null;
  const exportBlocked =
    a.compiled && b.compiled && scoredA && scoredB && a.layout && b.layout
      ? null
      : error
        ? 'Available once both layouts open and are scored'
        : 'Available once both layouts are scored';
  const exportImage = () => {
    if (!(a.layout && b.layout && a.compiled && b.compiled && scoredA && scoredB)) return;
    // The edits this tab sent along from Analyze are this user's; a link someone else made is not.
    const madeHere = (ref: string) => tabDrafts().originOf(ref) !== undefined;
    setSharing(
      compareImage(
        {
          layout: a.layout,
          compiled: a.compiled,
          typed: typedA ?? a.compiled,
          report: scoredA,
          unsaved: unsavedVersion(a, madeHere),
          combos: true,
        },
        {
          layout: b.layout,
          compiled: b.compiled,
          typed: typedB ?? b.compiled,
          report: scoredB,
          unsaved: unsavedVersion(b, madeHere),
          combos: true,
        },
        params.heat,
        heatTop,
        settingsSummary(settings, corpora),
      ),
    );
  };

  // Each board's chosen layer is in the URL, independently, so reload and sharing restore both.
  const requestedLayerA = parsedLayer(search.layerA);
  const requestedLayerB = parsedLayer(search.layerB);
  const layerA = a.compiled && requestedLayerA >= a.compiled.layers.length ? 0 : requestedLayerA;
  const layerB = b.compiled && requestedLayerB >= b.compiled.layers.length ? 0 : requestedLayerB;
  const setLayerA = useCallback((layer: number) => setParams({ layerA: layer }), [setParams]);
  const setLayerB = useCallback((layer: number) => setParams({ layerB: layer }), [setParams]);

  const shareLink = async () => {
    if (!corporaLoaded)
      throw new Error('Wait for the available texts to finish loading before sharing.');
    const corpusError = portableCorpusError(params.corpus, params.corpus2, corpora);
    if (corpusError) throw new Error(corpusError);
    const [layoutARef, layoutBRef] = await Promise.all([
      capturedLayoutRef(params.layoutRef, a),
      capturedLayoutRef(refB, b),
    ]);
    if (!layoutARef || !layoutBRef || !a.layout || !b.layout)
      throw new Error('Wait for both layouts to finish loading before sharing.');

    let rulesSnapshot: string | undefined;
    if (customId(params.preset) !== null) {
      if (settings.status !== 'read')
        throw new Error(
          settings.status === 'failed'
            ? settings.error
            : 'Wait for the custom rule set to finish loading before sharing.',
        );
      rulesSnapshot = encodeRuleSnapshot(settings.settings.rules);
    }

    // The loaded documents are captured before any asynchronous encoding. A picker change cannot
    // replace either side midway through building this target.
    const searchForTarget: RawSearch = {
      ...toSearch(params, { layoutRef: layoutARef, layer: 0 }),
      b: layoutBRef,
      ...(layerA > 0 && { layerA: String(layerA) }),
      ...(layerB > 0 && { layerB: String(layerB) }),
    };
    const baseHref = router.buildLocation({ to: '/compare', search: {} as never }).publicHref;
    return buildPortableTarget({
      baseHref,
      origin: window.location.origin,
      route: 'compare',
      search: searchForTarget,
      ...(rulesSnapshot !== undefined && { rulesSnapshot }),
    });
  };

  // The Legend's lists, for each side that is open, on the layer it shows: a layer past the end,
  // for a moment after the layout changes, is its base.
  const legends: LegendEntry[] = [
    { side: 'A', name: nameA, compiled: a.compiled, chosen: layerA },
    { side: 'B', name: nameB, compiled: b.compiled, chosen: layerB },
  ].flatMap(({ side, name, compiled, chosen }) =>
    compiled
      ? [
          {
            title: `${side}: ${name}`,
            compiled,
            layer: chosen < compiled.layers.length ? chosen : 0,
          },
        ]
      : [],
  );

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
            value={pickedA}
            onChange={(e) => void chooseLayout('layout', e.target.value)}
          >
            <LayoutOptions custom={custom.entries} current={pickedA} currentName={nameA} />
          </select>
        </label>

        <label className="form-control">
          <span className="label-text text-xs">Layout B</span>
          <select
            aria-label="Layout B"
            className="select select-sm select-bordered min-w-44"
            value={pickedB}
            onChange={(e) => void chooseLayout('b', e.target.value)}
          >
            <LayoutOptions custom={custom.entries} current={pickedB} currentName={nameB} />
          </select>
        </label>

        {/* On a phone Settings and the two Analyze links share a row, so the gear sits beside them,
            as Analyze's sits beside its Compare. Wider, the row is no box of its own: Settings and
            the links are items of the bar, each wrapping onto a line of its own when the bar is
            too narrow for them, so neither is drawn over the other. */}
        <div className="lb-wide flex min-w-0 items-center gap-2 sm:contents">
          {/* Never narrower than the button and a word of the summary: it wraps, not overflows. */}
          <div className="min-w-0 sm:min-w-min sm:flex-1">
            {/* As Analyze's: the gear on a phone, as the Library's, and its name wider. */}
            <SettingsDialog summary={settingsSummary(settings, corpora)} compact>
              <div className="lb-toolbar flex flex-row flex-wrap items-end gap-3">
                <SettingsFields
                  params={params}
                  onChange={setParams}
                  corpora={corpora}
                  verb="Compare"
                  afterCounts={
                    <SampleSelect
                      value={params.sample}
                      onChange={(sample) => setParams({ sample })}
                    />
                  }
                />
              </div>
            </SettingsDialog>
          </div>

          {/* Each opens in Analyze on the text, rules and switches compared on. */}
          <div className="flex gap-2 max-sm:flex-1">
            <Link
              to="/analyze"
              search={
                retainPortableState(
                  search,
                  toSearch(params, {
                    layoutRef: params.layoutRef,
                    ...(search.share === '1' && { layer: layerA }),
                  }),
                ) as never
              }
              className="btn btn-sm btn-outline max-sm:flex-1"
            >
              Analyze A
            </Link>
            <Link
              to="/analyze"
              search={
                retainPortableState(
                  search,
                  toSearch(params, {
                    layoutRef: refB,
                    ...(search.share === '1' && { layer: layerB }),
                  }),
                ) as never
              }
              className="btn btn-sm btn-outline max-sm:flex-1"
            >
              Analyze B
            </Link>
            <ShareLinkButton createTarget={shareLink} />
          </div>
        </div>
      </div>

      {sharing && <ShareImageDialog image={sharing} onClose={() => setSharing(null)} />}

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

      <Collapsible
        id="compare.layouts"
        title="Layouts"
        // The Legend is a popup of both sides' lists, read one against the other, its button at the
        // right of the heading, where the row has room: no row of its own under each board.
        extra={<LegendButton className="ml-auto" legends={legends} />}
      >
        {/* What both boards' colours measure, and what they mean, above the two of them. */}
        <div className="space-y-1 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <HeatSelect
              id="compare-heat"
              value={params.heat}
              onChange={(heat) => setParams({ heat })}
            />
            <HelpLink help={HELP.heat} />
            <ExportImageButton
              className="ml-auto"
              blocked={exportBlocked}
              onClick={exportImage}
              what="both layouts’ boards"
            />
          </div>
          {/* The scale is of both only while neither side has failed. */}
          <HeatLegend
            mode={params.heat}
            fallback={heatFallback}
            both={heatA !== null && heatB !== null}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['A', nameA, a.compiled, typedA, analysisA.report, heatA, heatB, layerA, setLayerA],
              ['B', nameB, b.compiled, typedB, analysisB.report, heatB, heatA, layerB, setLayerB],
            ] as const
          ).map(([side, name, compiled, typed, report, heat, other, chosen, setLayer]) => {
            // A layer past the end, for a moment after the layout changes, is its base.
            const layer = compiled && chosen < compiled.layers.length ? chosen : 0;
            const scored = heatSettled && heat ? heat : null;
            const colours = scored ? heatMap(scored, params.heat, layer, heatTop) : undefined;
            // What is really drawn: a rule set without the rule the mode asks for draws usage.
            const drawn = heat ? HEAT_LABELS[effectiveHeat(heat, params.heat)] : undefined;
            return (
              <section key={side} className="card bg-base-100 border border-base-300 min-w-0">
                <div className="card-body gap-3 p-4">
                  <h2 className="font-semibold text-sm">
                    {side}: {name}
                  </h2>
                  {compiled && (
                    <div className="min-w-0">
                      <PreviewBoard
                        id={`kb-${side}`}
                        // The list of numbered keys is the Legend, a popup over the page.
                        legend={false}
                        // The keys as written and the combos as typed, as Analyze draws them.
                        compiled={compiled}
                        typed={typed}
                        layer={layer}
                        onLayer={setLayer}
                        highlight={highlightFor(report)}
                        label={`Layers of ${side}`}
                        heat={colours}
                        heatName={colours ? drawn : undefined}
                        // Room for it from the start: the arrows stay put when the score comes in.
                        layerShare={scored ? layerShare(scored, layer) : null}
                        // Why the board is plain, right under it.
                        note={
                          <HeatNote
                            pending={!heatSettled && heat !== null}
                            failed={heat === null}
                            bare={colours !== undefined && Object.keys(colours).length === 0}
                            drawn={drawn}
                            // A scale of its own where the other side failed.
                            both={other !== null}
                          />
                        }
                      />
                    </div>
                  )}
                  <Collapsible id="compare.summary" title="Summary">
                    <div className="flex flex-col gap-3">
                      {/* A chip puts both sides on its language's text: they are compared on one. */}
                      <LanguageChips
                        coverage={side === 'A' ? languagesA : languagesB}
                        text={params}
                        onText={(corpus) => setParams({ corpus, corpus2: null })}
                      />
                      {report ? (
                        <SummaryStrip results={report.results} ruler={ruler} />
                      ) : settings.status === 'failed' ? null : (
                        <div className="flex items-center gap-2 py-4">
                          <span className="loading loading-dots loading-xs" />
                          <span className="text-sm opacity-70">analyzing…</span>
                        </div>
                      )}
                    </div>
                  </Collapsible>
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
                          <div className="text-[10px] uppercase tracking-wide opacity-60">
                            {row.family}
                          </div>
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {formatValue(row.a.value, row.unit)}{' '}
                          <BandBadge
                            band={row.a.band}
                            ruler={isHeadline(row.id) ? ruler : undefined}
                          />
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {row.b ? formatValue(row.b.value, row.unit) : '–'}{' '}
                          {row.b && (
                            <BandBadge
                              band={row.b.band}
                              ruler={isHeadline(row.id) ? ruler : undefined}
                            />
                          )}
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
