import {
  type Bands,
  BUNDLED_LAYOUTS,
  CATEGORY_NAMES,
  type CompiledLayout,
  classifyBand,
  compileLayout,
  forRanking,
  freeName,
  GEOMETRY_PRESET_IDS,
  getGeometryPreset,
  homeRowLetters,
  LAYOUT_CATEGORIES,
  type Layout,
  type LayoutCategory,
  languageCovered,
  languagesToJudge,
  layoutCategory,
  layoutLanguageCoverage,
  layoutLanguages,
  NameTakenError,
  nameTaken,
  type RuleSet,
  typedLayout,
} from '@layerbench/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refreshCommunity, useCommunity } from '../community/community.js';
import { communityRef } from '../community/ref.js';
import { featureList } from '../components/FeatureSwitches.js';
import { formatValue, qualityBorder } from '../components/format.js';
import { HelpLink } from '../components/HelpLink.js';
import { BandBadge } from '../components/Metrics.js';
import { NameDialog, type TakenLayout } from '../components/NameDialog.js';
import { customRef } from '../custom/ref.js';
import { retryingSaver, type SaveOptions } from '../custom/save-new.js';
import { rankingKey, recall, rememberBehind } from '../engine/ranking-memory.js';
import {
  compareBy,
  type LayoutSummary,
  type SummaryEntry,
  sortsByMetric,
  useSummaries,
} from '../engine/use-summaries.js';
import { HELP } from '../guide/help.js';
import { openLayout } from '../layout-session/open.js';
import { useRememberSelection } from '../state/selection.js';
import { useSession } from '../state/session.js';
import { toast } from '../state/toasts.js';
import { useCollection, useStorage } from '../storage/use-storage.js';
import { encodeInline } from '../url/inline.js';
import {
  ENGLISH_CORPUS,
  inlineRef,
  type Params,
  parseParams,
  type RawSearch,
  settingsOf,
  toSearch,
} from '../url/params.js';
import { ImportDialog } from './library/ImportDialog.js';
import { LayerPreview } from './library/LayerPreview.js';
import {
  type BoardChoice,
  type CategoryChoice,
  RankFilters,
  SORTS,
} from './library/RankFilters.js';
import { type NewLayoutSpec, newLayout } from './new-layout.js';
import { SettingsDialog } from './SettingsDialog.js';
import { textLanguage, textName } from './text-of.js';
import { useAnalysisSettings } from './useAnalysisSettings.js';
import { useCorpora } from './useCorpora.js';

/** Where a layout on a board of its own is filed among the boards. */
const CUSTOM_BOARD = 'custom';

function boardOf(layout: Layout | undefined): string {
  return layout && 'preset' in layout.geometry ? layout.geometry.preset : CUSTOM_BOARD;
}

function boardLabel(id: string): string {
  if (id === CUSTOM_BOARD || !GEOMETRY_PRESET_IDS.includes(id)) return 'Other boards';
  // Every columnar board is split; the prefix only lengthens a list of them.
  return getGeometryPreset(id).name.replace(/^Split columnar /, '');
}

/** Characters named on a card before the list is cut short. */
const MISSING_SHOWN = 5;

/**
 * A language the layout cannot write: the text's, which ranks it behind the layouts that can, or one
 * it says it is for, which is only flagged.
 */
interface Lacking {
  language: string;
  letters: string[];
  behind: boolean;
}

/** The bands of the two numbers a card shows, as the rule set ranked on gives them. */
interface HeadlineBands {
  effort: Bands | null;
  sfb: Bands | null;
}

function headlineBands(ruleSet: RuleSet | undefined): HeadlineBands {
  const bandsOf = (id: string) => ruleSet?.rules.find((r) => r.id === id)?.bands ?? null;
  return { effort: bandsOf('effort'), sfb: bandsOf('sfb') };
}

/**
 * One of a card's two numbers, with its band's badge and colour on its border, as Analyze's summary
 * shows it. A rule set that gives the metric no bands leaves it plain.
 */
function HeadlineStat({
  name,
  value,
  unit,
  bands,
}: {
  name: string;
  value: number | null;
  unit: 'effort' | 'percent';
  bands: Bands | null;
}) {
  const band = classifyBand(value, bands);
  return (
    <div
      className={`flex items-center gap-1 rounded-box border px-1.5 py-0.5 ${qualityBorder(band)}`}
    >
      <dt className="opacity-60">{name}</dt>
      {/* The band is part of the value, so it is read with it. */}
      <dd className="m-0 flex items-center gap-1">
        <span className="font-mono tabular-nums">{formatValue(value, unit)}</span>
        <BandBadge band={band} />
      </dd>
    </div>
  );
}

/**
 * The two numbers every card shows, whether or not the list is sorted by them, and what the layout
 * left out of the text to get them.
 */
function Ranking({
  summary,
  bands,
  lacking,
  nobodyCan = false,
}: {
  summary: LayoutSummary | undefined;
  bands: HeadlineBands;
  /** Letters a language the layout is held to needs that it cannot type. */
  lacking?: Lacking;
  /** Every layout listed lacks some, so none is ranked behind another for it. */
  nobodyCan?: boolean;
}) {
  if (!summary) {
    return <p className="text-xs opacity-50">scoring…</p>;
  }
  const missing =
    summary.missing.slice(0, MISSING_SHOWN).join(' ') +
    (summary.missing.length > MISSING_SHOWN ? ' …' : '');
  return (
    <>
      <dl className="flex flex-wrap gap-2 my-1 text-xs">
        <HeadlineStat name="Effort" value={summary.effort} unit="effort" bands={bands.effort} />
        <HeadlineStat name="SFB" value={summary.sfb} unit="percent" bands={bands.sfb} />
      </dl>
      {lacking?.behind ? (
        <p className="lb-skips text-xs text-warning" title={`Letters ${lacking.language} needs`}>
          Cannot type {lacking.letters.join(' ')}: skips {summary.skipped.toFixed(2)}% of the text
          {nobodyCan ? '.' : ', ranked after the layouts that can.'}
        </p>
      ) : (
        <>
          {lacking && (
            <p className="lb-lacks text-xs text-warning">
              Cannot type {lacking.letters.join(' ')}, which {lacking.language} needs.
            </p>
          )}
          {summary.skipped > 0 && (
            <p className="lb-skips text-xs opacity-60">
              Skips {summary.skipped.toFixed(2)}% of the text: {missing}
            </p>
          )}
        </>
      )}
    </>
  );
}

/**
 * What the layout can write. A language it declares but cannot fully type is shown struck through,
 * with the missing characters named — the difference between "supports Spanish" and "supports
 * Spanish except ñ" decides whether an analysis means anything.
 */
function LanguageBadges({ compiled }: { compiled: CompiledLayout }) {
  const coverage = layoutLanguages(compiled);
  if (coverage.length === 0) return null;
  return (
    <p className="mt-0.5 flex flex-wrap gap-1">
      {coverage.map((c) => (
        <span
          key={c.tag}
          className={`badge badge-xs ${c.missingRequired.length === 0 ? 'badge-ghost' : 'badge-warning'}`}
          title={
            c.missingRequired.length === 0
              ? `Types everything ${c.name} needs`
              : `Cannot type ${c.missingRequired.join(' ')}`
          }
        >
          {c.tag}
          {c.missingRequired.length > 0 ? ` −${c.missingRequired.length}` : ''}
        </span>
      ))}
    </p>
  );
}

/** A layout as the list shows it, whether it came with the app, from the community, or is custom. */
interface Listed {
  /**
   * What its score is kept under: `b:<id>` for a bundled layout, `m:<id>` for a community one,
   * `c:<id>` for a custom one.
   */
  key: string;
  name: string;
  custom: boolean;
  /** Accepted into the Library from someone else, read from the `layerbench-data` branch. */
  community: boolean;
  /** The bundled or community id, or the id it is kept under. */
  id: string;
  /** How a link names it: the bundled id, `community:<id>` or `custom:<id>`. */
  ref: string;
  /** Missing while a custom document is still being read, or if it will not parse. */
  layout: Layout | undefined;
  /** Missing as `layout` is, or if it will not compile. */
  compiled: CompiledLayout | undefined;
  /** Author, board and layers, and when a custom one last changed. */
  meta: string;
  /** The board's preset id, or `custom`: what the board filter goes by. */
  board: string;
  /** Worked out from its keys; missing while a custom document is still being read. */
  category: LayoutCategory | undefined;
  /** The letters on its base layer's home row, what Home row sorts by; missing as `compiled` is. */
  homeRow: string | undefined;
}

function layerCount(n: number): string {
  return `${n} layer${n === 1 ? '' : 's'}`;
}

/** One card, the same for every layout; a custom or community one says so. */
function LayoutCard({
  item,
  summary,
  bands,
  lacking,
  nobodyCan,
  actions,
}: {
  item: Listed;
  summary: LayoutSummary | undefined;
  bands: HeadlineBands;
  lacking: Lacking | undefined;
  nobodyCan: boolean;
  /** Open, last so it is always flush right, and Delete to its left on a custom layout. */
  actions: ReactNode;
}) {
  return (
    <article className="card bg-base-100 border border-base-300">
      <div className="card-body gap-2 p-4">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <h3 className="font-semibold text-sm">{item.name}</h3>
              {item.custom && (
                <span className="badge badge-outline badge-primary badge-xs">custom</span>
              )}
              {item.community && (
                <span className="badge badge-outline badge-secondary badge-xs">community</span>
              )}
              {item.category && (
                <span className="lb-category badge badge-ghost badge-xs">
                  {CATEGORY_NAMES[item.category]}
                </span>
              )}
            </div>
            {item.meta && <p className="text-xs opacity-60">{item.meta}</p>}
            {item.compiled && <LanguageBadges compiled={item.compiled} />}
            <Ranking summary={summary} bands={bands} lacking={lacking} nobodyCan={nobodyCan} />
          </div>
          <div className="ml-auto flex shrink-0 gap-1">{actions}</div>
        </header>
        {item.compiled && (
          <LayerPreview
            id={
              item.custom
                ? `kb-custom-${item.id}`
                : item.community
                  ? `kb-community-${item.id}`
                  : `kb-${item.id}`
            }
            compiled={item.compiled}
            name={item.name}
          />
        )}
        {item.layout?.description && (
          // A description may carry a link, which would otherwise hold the card, and the whole list
          // with it, wider than a phone.
          <p className="text-xs opacity-70 whitespace-pre-line [overflow-wrap:anywhere]">
            {item.layout.description}
          </p>
        )}
        {item.layout?.link && (
          <p className="text-xs opacity-70 [overflow-wrap:anywhere]">
            <a className="link" href={item.layout.link} target="_blank" rel="noopener noreferrer">
              {item.layout.link}
            </a>
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * New layout: a name, a board, a starting point, and whether it gets number and symbol layers. A
 * name a custom layout has is offered to overwrite that one, or to be changed.
 */
function NewLayoutDialog({
  initialName,
  taken,
  onCreate,
}: {
  /** A name no custom layout has yet. */
  initialName: string;
  taken: (name: string) => TakenLayout | null;
  onCreate: (spec: NewLayoutSpec, opts?: SaveOptions) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rest, setRest] = useState<Omit<NewLayoutSpec, 'name'>>({
    geometry: '3x5+2',
    start: 'empty',
    defaultLayers: false,
  });

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        New layout
      </button>
      {open && (
        <NameDialog
          title="New layout"
          nameLabel="New layout name"
          initialName={initialName}
          submitLabel="Create and edit"
          taken={taken}
          onSubmit={(name) => {
            setOpen(false);
            onCreate({ ...rest, name });
          }}
          onOverwrite={(name, layout) => {
            setOpen(false);
            onCreate({ ...rest, name }, { overwrite: layout.id });
          }}
          onClose={() => setOpen(false)}
        >
          <label className="form-control">
            <span className="label-text text-xs">Board</span>
            <select
              aria-label="New layout board"
              className="select select-sm select-bordered"
              value={rest.geometry}
              onChange={(e) => setRest({ ...rest, geometry: e.target.value })}
            >
              {GEOMETRY_PRESET_IDS.map((id) => (
                <option key={id} value={id}>
                  {getGeometryPreset(id).name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control">
            <span className="label-text text-xs">Start from</span>
            <select
              aria-label="New layout starting point"
              className="select select-sm select-bordered"
              value={rest.start}
              onChange={(e) =>
                setRest({ ...rest, start: e.target.value as NewLayoutSpec['start'] })
              }
            >
              <option value="empty">An empty board</option>
              <option value="qwerty">Qwerty, to rearrange</option>
            </select>
          </label>

          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              aria-label="Add the default layers"
              className="checkbox checkbox-sm"
              checked={rest.defaultLayers}
              onChange={(e) => setRest({ ...rest, defaultLayers: e.target.checked })}
            />
            <span className="label-text text-xs">
              Add the default layers: numbers, symbols, accents
            </span>
          </label>
        </NameDialog>
      )}
    </>
  );
}

export function LibraryView() {
  const storage = useStorage();
  const navigate = useNavigate();
  const custom = useCollection('layouts');

  const bundled = useMemo(
    () =>
      BUNDLED_LAYOUTS.map((layout) => ({
        id: layout.id ?? layout.name,
        layout,
        compiled: compileLayout(layout),
      })),
    [],
  );

  // Community layouts: those kept in this browser at once, then read afresh each time the Library
  // opens, so one accepted since appears without a deploy.
  const communityLayouts = useCommunity((s) => s.layouts);
  const communityStatus = useCommunity((s) => s.status);
  const communityError = useCommunity((s) => s.error);
  useEffect(() => {
    refreshCommunity();
  }, []);
  const community = useMemo(
    () =>
      communityLayouts.flatMap((layout) => {
        try {
          return [{ id: layout.id as string, layout, compiled: compileLayout(layout) }];
        } catch {
          // Each was compiled once when it was read; this only keeps the list safe if one is not.
          return [];
        }
      }),
    [communityLayouts],
  );

  // Ranking is on the analysis settings in the link, so it agrees with what Analyze would show; the
  // sample is capped, as twenty-odd layouts are typed one after another, and the status line names
  // it, so nobody takes it for Analyze's.
  const search = useSearch({ strict: false }) as RawSearch;
  const params = useMemo(() => parseParams(search, ENGLISH_CORPUS), [search]);
  const ranking = useMemo(() => forRanking(settingsOf(params)), [params]);
  useRememberSelection(params);
  const settings = useAnalysisSettings(ranking);
  const corpora = useCorpora();
  const corpusName = textName(ranking, corpora);
  const corpusLanguage = textLanguage(ranking, corpora);

  /** The choice lives in the link, so a ranking can be shared and survives a reload. */
  const setParams = useCallback(
    (overrides: Partial<Params>) => {
      // No layout is being looked at here; the one `toSearch` always writes would only be noise.
      const { layout: _layout, ...rest } = toSearch(params, overrides);
      // The same view, written again: the page stays where it was scrolled to.
      navigate({ to: '/library', search: rest as never, replace: true, resetScroll: false });
    },
    [navigate, params],
  );
  /**
   * Analyze opens on what the cards were ranked on, the capped sample included, so a layout opened
   * from here shows the numbers its card showed.
   */
  const analyzeSearch = useCallback(
    (layoutRef: string) => toSearch(params, { layoutRef, sample: ranking.sample }) as never,
    [params, ranking.sample],
  );
  const sortBy = useSession((s) => s.librarySort);
  const setSortBy = useSession((s) => s.setLibrarySort);

  // Custom layouts are listed from their index; ranking needs the documents themselves.
  const [customLayouts, setCustomLayouts] = useState<Map<string, Layout>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // All at once: from GitHub, each is a round trip of its own.
      const read = await Promise.all(
        custom.entries.map(async (entry) => {
          const opened = await openLayout(customRef(entry.id), storage);
          return opened.ok ? ([entry.id, opened.layout] as const) : null;
        }),
      );
      if (!cancelled) setCustomLayouts(new Map(read.filter((r) => r !== null)));
    })();
    return () => {
      cancelled = true;
    };
  }, [custom.entries, storage]);

  const customCompiled = useMemo(() => {
    const out = new Map<string, CompiledLayout>();
    for (const [id, layout] of customLayouts) {
      try {
        out.set(id, compileLayout(layout));
      } catch {
        // A document that parses but will not compile is listed without its board.
      }
    }
    return out;
  }, [customLayouts]);

  // Each layout as it is ranked: typed without the features left out, as the engine types it. The
  // cards still draw the layout itself; only what it can type is judged on this.
  const { without } = params;
  const ranked = useMemo(() => {
    const out = new Map<string, CompiledLayout>();
    for (const { id, compiled } of bundled) out.set(`b:${id}`, typedLayout(compiled, without));
    for (const { id, compiled } of community) out.set(`m:${id}`, typedLayout(compiled, without));
    for (const [id, compiled] of customCompiled) out.set(`c:${id}`, typedLayout(compiled, without));
    return out;
  }, [bundled, community, customCompiled, without]);

  // Bundled, community and custom layouts are one list, ranked together: a layout of one's own means
  // something next to the ones it would replace. A community layout is in the category its keys
  // give it, as one submitted is never standardized.
  const listed: Listed[] = useMemo(
    () => [
      ...bundled.map(({ id, layout, compiled }) => ({
        key: `b:${id}`,
        name: layout.name,
        custom: false,
        community: false,
        id,
        ref: id,
        layout,
        compiled,
        meta: [layout.author, compiled.geometry.id, layerCount(compiled.layers.length)]
          .filter(Boolean)
          .join(' · '),
        board: boardOf(layout),
        category: layoutCategory(layout),
        homeRow: homeRowLetters(compiled),
      })),
      ...community.map(({ id, layout, compiled }) => ({
        key: `m:${id}`,
        name: layout.name,
        custom: false,
        community: true,
        id,
        ref: communityRef(id),
        layout,
        compiled,
        meta: [layout.author, compiled.geometry.id, layerCount(compiled.layers.length)]
          .filter(Boolean)
          .join(' · '),
        board: boardOf(layout),
        category: layoutCategory(layout),
        homeRow: homeRowLetters(compiled),
      })),
      ...custom.entries.map((entry) => ({
        key: `c:${entry.id}`,
        name: entry.name,
        custom: true,
        community: false,
        id: entry.id,
        ref: customRef(entry.id),
        layout: customLayouts.get(entry.id),
        compiled: customCompiled.get(entry.id),
        meta: [
          entry.author,
          entry.geometry,
          entry.layers ? layerCount(entry.layers) : null,
          entry.updatedAt ? `updated ${entry.updatedAt.slice(0, 10)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        board: entry.geometry ?? boardOf(customLayouts.get(entry.id)),
        // One not read yet, or that will not compile, is in no category.
        category: customCompiled.has(entry.id)
          ? layoutCategory(customLayouts.get(entry.id) as Layout)
          : undefined,
        homeRow: customCompiled.has(entry.id)
          ? homeRowLetters(customCompiled.get(entry.id) as CompiledLayout)
          : undefined,
      })),
    ],
    [bundled, community, custom.entries, customLayouts, customCompiled],
  );

  // Custom and community layouts can be left out of the list, and then they count on no board
  // either.
  const hideCustom = useSession((s) => s.hideCustom);
  const hideCommunity = useSession((s) => s.hideCommunity);
  const pool = useMemo(
    () =>
      listed.filter((item) => !(hideCustom && item.custom) && !(hideCommunity && item.community)),
    [listed, hideCustom, hideCommunity],
  );

  // The boards the listed layouts are on, in the order the presets are offered, each with how
  // many layouts it has; only shown boards are listed, and only listed layouts are scored.
  const hiddenBoards = useSession((s) => s.hiddenBoards);
  const boards: BoardChoice[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of pool) counts.set(item.board, (counts.get(item.board) ?? 0) + 1);
    const order = [...GEOMETRY_PRESET_IDS, CUSTOM_BOARD];
    return [...counts]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([id, count]) => ({ id, label: boardLabel(id), count }));
  }, [pool]);
  // The categories, each with how many layouts it has, the same way.
  const hiddenCategories = useSession((s) => s.hiddenCategories);
  const categories: CategoryChoice[] = useMemo(
    () =>
      LAYOUT_CATEGORIES.map((id) => ({
        id,
        count: pool.filter((item) => item.category === id).length,
      })),
    [pool],
  );
  const categoryShown = useCallback(
    (item: Listed) => item.category === undefined || !hiddenCategories.includes(item.category),
    [hiddenCategories],
  );
  const shownListed = useMemo(
    () => pool.filter((item) => !hiddenBoards.includes(item.board) && categoryShown(item)),
    [pool, hiddenBoards, categoryShown],
  );
  /** Why fewer layouts are listed than there are, for the line under the sort. */
  const leftOut = [
    hideCustom && listed.some((item) => item.custom) ? 'without the custom ones' : '',
    hideCommunity && listed.some((item) => item.community) ? 'without the community ones' : '',
    pool.some((item) => !categoryShown(item)) ? 'in the categories chosen' : '',
    pool.some((item) => hiddenBoards.includes(item.board)) ? 'on the boards chosen' : '',
  ].filter(Boolean);
  const shownKeys = useMemo(() => new Set(shownListed.map((item) => item.key)), [shownListed]);

  const summaryEntries: SummaryEntry[] = useMemo(
    () =>
      [
        ...bundled.map(({ id, layout }) => ({ key: `b:${id}`, layout })),
        ...community.map(({ id, layout }) => ({ key: `m:${id}`, layout })),
        // One that will not compile is still sent, so it fails and shows as unscored.
        ...custom.entries.map((e) => ({
          key: `c:${e.id}`,
          layout: customLayouts.get(e.id) ?? null,
        })),
      ].filter((entry) => shownKeys.has(entry.key)),
    [bundled, community, custom.entries, customLayouts, shownKeys],
  );
  // The last ranking on the same settings is what the list opens with.
  const rankingContext = rankingKey(ranking);
  // Nothing is scored until the rule set is read, and a rule set that will not open scores nothing.
  const { summaries, pending } = useSummaries(
    settings.status === 'failed' ? [] : summaryEntries,
    settings.settings,
    rankingContext,
  );
  const bands = useMemo(() => headlineBands(settings.settings?.rules), [settings.settings]);

  // A layout that cannot type letters the corpus's language needs skips them, and skipping is free:
  // it would rank above one that pays to type them. Those go behind, whatever their numbers. A
  // layout is held to the languages it says it is for as well, but only flagged for those: one for
  // Spanish without an ñ is not what it claims, yet on this text it skipped nothing for it.
  const lacking = useMemo(() => {
    const out = new Map<string, Lacking>();
    const fromText = new Set(languagesToJudge(corpusLanguage));
    const check = (key: string, compiled: CompiledLayout) => {
      for (const tag of languagesToJudge(corpusLanguage, compiled.layout.languages)) {
        const coverage = layoutLanguageCoverage(compiled, tag);
        if (coverage && !languageCovered(coverage)) {
          out.set(key, {
            language: coverage.name,
            letters: coverage.missingRequired,
            behind: fromText.has(tag),
          });
          return;
        }
      }
    };
    for (const [key, compiled] of ranked) check(key, compiled);
    return out;
  }, [corpusLanguage, ranked]);
  // Which layouts go behind can only be told once the corpora are listed and a layout's document is
  // read. Until then each is where the last visit found it, so the list does not reorder as they
  // arrive.
  const decided = corpora.length > 0;
  const behindBefore = useMemo(() => recall(rankingContext).behind, [rankingContext]);
  const behind = useMemo(() => {
    const out = new Set<string>();
    for (const { key } of listed) {
      const known = decided && ranked.has(key);
      if (known ? lacking.get(key)?.behind : behindBefore.has(key)) out.add(key);
    }
    return out;
  }, [listed, decided, ranked, lacking, behindBefore]);
  useEffect(() => {
    if (!decided) return;
    const found = new Map([...ranked.keys()].map((key) => [key, !!lacking.get(key)?.behind]));
    rememberBehind(rankingContext, found);
  }, [decided, ranked, lacking, rankingContext]);
  // When no layout listed can write the language, none is behind the others: the list keeps its
  // metric order. One that can, on a board left out, does not count.
  const nobodyCan =
    behind.size > 0 &&
    shownListed.length > 0 &&
    shownListed.every((item) => !ranked.has(item.key) || behind.has(item.key));
  // A mixed text has two languages, and the layouts behind may each lack a different one.
  const lackingLanguages = new Set(
    [...lacking.values()].filter((l) => l.behind).map((l) => l.language),
  );
  const lackingWhat =
    lackingLanguages.size === 1
      ? `every letter ${[...lackingLanguages][0]} needs`
      : "every letter the text's languages need";
  // Every layout failing at once means the corpus or rule set is at fault, not the layouts.
  const unscored =
    summaries.size > 0 && [...summaries.values()].every((s) => s.effort === null && s.sfb === null);

  // The chosen order applies from the first score on: each layout takes its place as its score
  // lands, and those still being scored wait below the ranked ones.
  const sorted = useMemo(
    () => [...shownListed].sort(compareBy(sortBy, summaries, behind)),
    [shownListed, sortBy, summaries, behind],
  );

  /** An import opened before it is saved travels whole in the link, as an unsaved edit does. */
  const openInAnalyzer = useCallback(
    async (layout: Layout) => {
      const blob = await encodeInline(layout);
      navigate({ to: '/analyze', search: analyzeSearch(inlineRef(blob)) });
    },
    [navigate, analyzeSearch],
  );

  /**
   * A save that found its name taken, waiting to hear whether to overwrite or what else to call it.
   * An overwrite refused is of a name kept twice, in the gists and in this browser: only another
   * name gets past it, so it is not offered again.
   */
  const [clash, setClash] = useState<{
    layout: Layout;
    message: string;
    taken: TakenLayout;
    overwrite: boolean;
    settle: (id: string | null) => void;
  } | null>(null);

  /**
   * Save as a custom layout of its own, and say so by the layout's name: the id is only for links.
   * Where another custom layout has the name, it asks first whether to overwrite that one or to
   * call this one something else, and settles once answered: with the id saved under, or null.
   */
  const saver = useRef(retryingSaver());
  const saveNew = useCallback(
    async (layout: Layout, message: string, opts: SaveOptions = {}): Promise<string | null> => {
      try {
        const { id } = await saver.current(storage, layout, message, opts);
        custom.refresh();
        toast.info(`Saved ${layout.name}`);
        return id;
      } catch (e) {
        if (e instanceof NameTakenError) {
          custom.refresh();
          const overwrite = opts.overwrite === undefined;
          return new Promise((settle) =>
            setClash({ layout, message, taken: e.taken, overwrite, settle }),
          );
        }
        toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
    [storage, custom],
  );

  /** The custom layout that already goes by a name, if any. */
  const takenBy = useCallback(
    (name: string) => nameTaken(custom.entries, name, null),
    [custom.entries],
  );

  const saveToLibrary = useCallback(
    async (layout: Layout) => (await saveNew(layout, `Import layout ${layout.name}`)) !== null,
    [saveNew],
  );

  const createLayout = useCallback(
    async (spec: NewLayoutSpec, opts?: SaveOptions) => {
      const layout = newLayout(spec);
      const id = await saveNew(layout, `Create layout ${spec.name}`, opts);
      if (id) navigate({ to: '/analyze', search: analyzeSearch(customRef(id)) });
    },
    [saveNew, navigate, analyzeSearch],
  );

  /** An imported keymap goes straight to Analyze, saved, so nothing about it is lost. */
  const importKeymap = useCallback(
    async (layout: Layout) => {
      const id = await saveNew(layout, `Import keymap-drawer layout ${layout.name}`);
      if (id) navigate({ to: '/analyze', search: analyzeSearch(customRef(id)) });
    },
    [saveNew, navigate, analyzeSearch],
  );

  const remove = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(`Delete ${name}?`)) return;
      try {
        await storage.delete('layouts', id);
        toast.info(`Deleted ${name}`);
        custom.refresh();
      } catch (e) {
        toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [storage, custom],
  );

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Library</h1>
      <div className="flex flex-wrap items-center gap-2">
        <NewLayoutDialog
          initialName={freeName(
            'My layout',
            custom.entries.map((e) => e.name),
          )}
          taken={takenBy}
          onCreate={createLayout}
        />
        <ImportDialog
          canSave={custom.available}
          onOpen={openInAnalyzer}
          onSave={saveToLibrary}
          onImportKeymap={importKeymap}
        />
        {clash && (
          <NameDialog
            title="Save under another name"
            nameLabel="Name of the layout"
            initialName={clash.layout.name}
            submitLabel="Save"
            // The one the save heard of is taken even before the custom layouts are read again.
            taken={(name) => nameTaken([clash.taken, ...custom.entries], name, null)}
            onSubmit={(name) => {
              setClash(null);
              void saveNew({ ...clash.layout, name }, clash.message).then(clash.settle);
            }}
            onOverwrite={
              clash.overwrite
                ? (name, taken) => {
                    setClash(null);
                    const layout = { ...clash.layout, name };
                    void saveNew(layout, clash.message, { overwrite: taken.id }).then(clash.settle);
                  }
                : undefined
            }
            onClose={() => {
              setClash(null);
              clash.settle(null);
            }}
          />
        )}
        <p className="text-xs opacity-70">
          Start from an empty board or import yours. Or open any layout below in Analyze and change
          it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SettingsDialog title="Rank and filter">
          <RankFilters
            params={params}
            onChange={setParams}
            corpora={corpora}
            boards={boards}
            categories={categories}
            customCount={custom.entries.length}
            communityCount={community.length}
          />
        </SettingsDialog>
        <fieldset className="join" aria-label="Sort layouts by">
          <legend className="text-xs opacity-70 float-left mr-2 self-center">Sort by</legend>
          {SORTS.map(([key, label]) => (
            // daisyUI draws a radio styled as a button from its accessible name.
            <input
              key={key}
              type="radio"
              name="library-sort"
              aria-label={label}
              className="join-item btn btn-xs"
              checked={sortBy === key}
              onChange={() => setSortBy(key)}
            />
          ))}
        </fieldset>
        <HelpLink help={HELP.sorting} />
      </div>

      <div className="space-y-1">
        {/* What the choices in Rank and filter leave out, so they are visible without opening it. */}
        <p className="text-xs opacity-70 empty:hidden" aria-live="polite">
          {leftOut.length > 0
            ? `${shownListed.length} of ${listed.length} layouts, ${leftOut.join(', ')}.`
            : ''}
        </p>
        <p className="text-xs opacity-60" aria-live="polite">
          {settings.status === 'reading'
            ? `Scoring layouts once the rule set ${settings.rulesName} is read…`
            : settings.status === 'failed'
              ? `Could not score the layouts: ${settings.error}.`
              : pending > 0
                ? `Scoring layouts on a sample of ${ranking.sample.toLocaleString('en-US')} symbols… ${summaryEntries.length - pending} of ${summaryEntries.length}`
                : unscored
                  ? `Could not score the layouts on ${corpusName}.`
                  : `Lower is better for both. Ranked on a sample of ${ranking.sample.toLocaleString('en-US')} symbols of ${corpusName}, ${settings.rulesName}${
                      without.length > 0 ? `, typed without ${featureList(without)}` : ''
                    }.${
                      nobodyCan
                        ? ` None of these layouts types ${lackingWhat}.`
                        : behind.size > 0 && sortsByMetric(sortBy)
                          ? ` Layouts that cannot type ${lackingWhat} come last.`
                          : ''
                    }`}
        </p>
      </div>

      <section className="space-y-2" aria-labelledby="library-layouts">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="library-layouts" className="text-sm uppercase tracking-wide opacity-60">
            Layouts
          </h2>
          {!custom.available && (
            <span className="badge badge-warning badge-sm">storage unavailable</span>
          )}
          {communityStatus === 'failed' && (
            <span className="badge badge-warning badge-sm">
              {community.length > 0
                ? 'community layouts as last read'
                : 'community layouts unavailable'}
            </span>
          )}
          {communityStatus === 'partial' && (
            <span className="badge badge-warning badge-sm" title={communityError ?? undefined}>
              some community layouts not read
            </span>
          )}
          {custom.entries.length === 0 && (
            <span className="text-xs opacity-70">
              Nothing custom yet. Save from Analyze, or import one.
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((item) => (
            <LayoutCard
              key={item.key}
              item={item}
              summary={summaries.get(item.key)}
              bands={bands}
              lacking={lacking.get(item.key)}
              nobodyCan={nobodyCan}
              actions={
                <>
                  {item.custom && (
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      className="btn btn-xs"
                      onClick={() => remove(item.id, item.name)}
                    >
                      Delete
                    </button>
                  )}
                  <Link
                    to="/analyze"
                    search={analyzeSearch(item.ref)}
                    aria-label={`Open ${item.name}`}
                    className="btn btn-primary btn-xs"
                  >
                    Open
                  </Link>
                </>
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
