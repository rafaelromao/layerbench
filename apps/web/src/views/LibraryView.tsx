import {
  BUNDLED_LAYOUTS,
  type CompiledLayout,
  compileLayout,
  forRanking,
  freeId,
  GEOMETRY_PRESET_IDS,
  getGeometryPreset,
  type Layout,
  languageCovered,
  languagesToJudge,
  layoutLanguageCoverage,
  layoutLanguages,
  safeParseLayout,
  toCanonicalJson,
  typedLayout,
} from '@layerbench/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { featureList } from '../components/FeatureSwitches.js';
import { formatValue } from '../components/format.js';
import { HelpLink } from '../components/HelpLink.js';
import { useDismiss } from '../components/use-dismiss.js';
import { rankingKey, recall, rememberBehind } from '../engine/ranking-memory.js';
import {
  compareBy,
  type LayoutSummary,
  type SummaryEntry,
  useSummaries,
} from '../engine/use-summaries.js';
import { HELP } from '../guide/help.js';
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
  savedRef,
  settingsOf,
  toSearch,
} from '../url/params.js';
import { ImportDialog } from './library/ImportDialog.js';
import { LayerStrip } from './library/LayerStrip.js';
import { type BoardChoice, RankingDialog, SORTS } from './library/RankingDialog.js';
import { type NewLayoutSpec, newLayout } from './new-layout.js';
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
 * The two numbers every card shows, whether or not the list is sorted by them, and what the layout
 * left out of the text to get them.
 */
/**
 * A language the layout cannot write: the text's, which ranks it behind the layouts that can, or one
 * it says it is for, which is only flagged.
 */
interface Lacking {
  language: string;
  letters: string[];
  behind: boolean;
}

function Ranking({
  summary,
  lacking,
  nobodyCan = false,
}: {
  summary: LayoutSummary | undefined;
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
      <dl className="flex flex-wrap gap-x-3 text-xs font-mono tabular-nums m-0">
        <div className="flex gap-1">
          <dt className="opacity-60 font-sans">Effort</dt>
          <dd className="m-0">{formatValue(summary.effort, 'effort')}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="opacity-60 font-sans">SFB</dt>
          <dd className="m-0">{formatValue(summary.sfb, 'percent')}</dd>
        </div>
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

/** A layout as the list shows it, whether it came with the app or was saved here. */
interface Listed {
  /** What its score is kept under: `b:<id>` for a bundled layout, `s:<id>` for a saved one. */
  key: string;
  name: string;
  saved: boolean;
  /** The bundled id, or the id it is saved under. */
  id: string;
  /** How a link names it: the bundled id, or `saved:<id>`. */
  ref: string;
  /** Missing while a saved document is still being read, or if it will not parse. */
  layout: Layout | undefined;
  /** Missing as `layout` is, or if it will not compile. */
  compiled: CompiledLayout | undefined;
  /** Author, board and layers, and when a saved one last changed. */
  meta: string;
  /** The board's preset id, or `custom`: what the board filter goes by. */
  board: string;
}

function layerCount(n: number): string {
  return `${n} layer${n === 1 ? '' : 's'}`;
}

/** One card, the same for a bundled layout and a saved one; a saved one says so. */
function LayoutCard({
  item,
  summary,
  lacking,
  nobodyCan,
  actions,
}: {
  item: Listed;
  summary: LayoutSummary | undefined;
  lacking: Lacking | undefined;
  nobodyCan: boolean;
  /** Two to a row, so the four a saved layout has take no more width than a bundled one's two. */
  actions: ReactNode;
}) {
  return (
    <article className="card bg-base-100 border border-base-300">
      <div className="card-body gap-2 p-4">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <h3 className="font-semibold text-sm">{item.name}</h3>
              {item.saved && (
                <span className="badge badge-outline badge-primary badge-xs">saved</span>
              )}
            </div>
            {item.meta && <p className="text-xs opacity-60">{item.meta}</p>}
            {item.compiled && <LanguageBadges compiled={item.compiled} />}
            <Ranking summary={summary} lacking={lacking} nobodyCan={nobodyCan} />
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-1">{actions}</div>
        </header>
        {item.compiled && (
          <LayerStrip
            id={item.saved ? `kb-saved-${item.id}` : `kb-${item.id}`}
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
      </div>
    </article>
  );
}

/** New layout: pick a board, a starting point, and whether it gets number and symbol layers. */
function NewLayoutDialog({ onCreate }: { onCreate: (spec: NewLayoutSpec) => void }) {
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState<NewLayoutSpec>({
    name: 'My layout',
    geometry: '3x5+2',
    start: 'empty',
    defaultLayers: false,
  });
  const form = useRef<HTMLFormElement>(null);
  // A tap on the dimmed page around the dialog, or Escape, is a change of mind.
  useDismiss(form, () => setOpen(false), { active: open });

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        New layout
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
            ref={form}
            aria-label="New layout"
            // Capped at the screen as it is now, as the dialogs are, and scrolled inside when that is
            // less than the form, as on a phone held sideways.
            className="card w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-base-100 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              setOpen(false);
              onCreate(spec);
            }}
          >
            <div className="card-body gap-3 p-4">
              <h2 className="font-semibold text-sm">New layout</h2>

              <label className="form-control">
                <span className="label-text text-xs">Name</span>
                <input
                  aria-label="New layout name"
                  className="input input-sm input-bordered"
                  value={spec.name}
                  onChange={(e) => setSpec({ ...spec, name: e.target.value })}
                />
              </label>

              <label className="form-control">
                <span className="label-text text-xs">Board</span>
                <select
                  aria-label="New layout board"
                  className="select select-sm select-bordered"
                  value={spec.geometry}
                  onChange={(e) => setSpec({ ...spec, geometry: e.target.value })}
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
                  value={spec.start}
                  onChange={(e) =>
                    setSpec({ ...spec, start: e.target.value as NewLayoutSpec['start'] })
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
                  checked={spec.defaultLayers}
                  onChange={(e) => setSpec({ ...spec, defaultLayers: e.target.checked })}
                />
                <span className="label-text text-xs">
                  Add the default layers: numbers, symbols, dead keys
                </span>
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Create and edit
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function LibraryView() {
  const storage = useStorage();
  const navigate = useNavigate();
  const saved = useCollection('layouts');

  const bundled = useMemo(
    () =>
      BUNDLED_LAYOUTS.map((layout) => ({
        id: layout.id ?? layout.name,
        layout,
        compiled: compileLayout(layout),
      })),
    [],
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

  // Saved layouts are listed from their index; ranking needs the documents themselves.
  const [savedLayouts, setSavedLayouts] = useState<Map<string, Layout>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // All at once: from GitHub, each is a round trip of its own.
      const read = await Promise.all(
        saved.entries.map(async (entry) => {
          const doc = await storage.get('layouts', entry.id).catch(() => null);
          const parsed = doc ? safeParseLayout(doc.doc) : null;
          return parsed?.ok ? ([entry.id, parsed.layout] as const) : null;
        }),
      );
      if (!cancelled) setSavedLayouts(new Map(read.filter((r) => r !== null)));
    })();
    return () => {
      cancelled = true;
    };
  }, [saved.entries, storage]);

  const savedCompiled = useMemo(() => {
    const out = new Map<string, CompiledLayout>();
    for (const [id, layout] of savedLayouts) {
      try {
        out.set(id, compileLayout(layout));
      } catch {
        // A document that parses but will not compile is listed without its board.
      }
    }
    return out;
  }, [savedLayouts]);

  // Each layout as it is ranked: typed without the features left out, as the engine types it. The
  // cards still draw the layout itself; only what it can type is judged on this.
  const { without } = params;
  const ranked = useMemo(() => {
    const out = new Map<string, CompiledLayout>();
    for (const { id, compiled } of bundled) out.set(`b:${id}`, typedLayout(compiled, without));
    for (const [id, compiled] of savedCompiled) out.set(`s:${id}`, typedLayout(compiled, without));
    return out;
  }, [bundled, savedCompiled, without]);

  // Bundled and saved layouts are one list, ranked together: a layout of one's own means something
  // next to the ones it would replace.
  const listed: Listed[] = useMemo(
    () => [
      ...bundled.map(({ id, layout, compiled }) => ({
        key: `b:${id}`,
        name: layout.name,
        saved: false,
        id,
        ref: id,
        layout,
        compiled,
        meta: [layout.author, compiled.geometry.id, layerCount(compiled.layers.length)]
          .filter(Boolean)
          .join(' · '),
        board: boardOf(layout),
      })),
      ...saved.entries.map((entry) => ({
        key: `s:${entry.id}`,
        name: entry.name,
        saved: true,
        id: entry.id,
        ref: savedRef(entry.id),
        layout: savedLayouts.get(entry.id),
        compiled: savedCompiled.get(entry.id),
        meta: [
          entry.author,
          entry.geometry,
          entry.layers ? layerCount(entry.layers) : null,
          entry.updatedAt ? `updated ${entry.updatedAt.slice(0, 10)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        board: entry.geometry ?? boardOf(savedLayouts.get(entry.id)),
      })),
    ],
    [bundled, saved.entries, savedLayouts, savedCompiled],
  );

  // Saved layouts can be left out of the list, and then they count on no board either.
  const hideSaved = useSession((s) => s.hideSaved);
  const pool = useMemo(
    () => (hideSaved ? listed.filter((item) => !item.saved) : listed),
    [listed, hideSaved],
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
  const shownListed = useMemo(
    () => pool.filter((item) => !hiddenBoards.includes(item.board)),
    [pool, hiddenBoards],
  );
  /** Why fewer layouts are listed than there are, for the line beside the dialog's button. */
  const leftOut = [
    pool.length < listed.length ? 'without the saved ones' : '',
    shownListed.length < pool.length ? 'on the boards chosen' : '',
  ].filter(Boolean);
  const shownKeys = useMemo(() => new Set(shownListed.map((item) => item.key)), [shownListed]);

  const summaryEntries: SummaryEntry[] = useMemo(
    () =>
      [
        ...bundled.map(({ id, layout }) => ({ key: `b:${id}`, layout })),
        // One that will not compile is still sent, so it fails and shows as unscored.
        ...saved.entries.map((e) => ({ key: `s:${e.id}`, layout: savedLayouts.get(e.id) ?? null })),
      ].filter((entry) => shownKeys.has(entry.key)),
    [bundled, saved.entries, savedLayouts, shownKeys],
  );
  // The last ranking on the same settings is what the list opens with.
  const rankingContext = rankingKey(ranking);
  const { summaries, pending } = useSummaries(summaryEntries, settings, rankingContext);

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

  /** Save under a free id, and say so by the layout's name: the id is only for links. */
  const saveNew = useCallback(
    async (layout: Layout, message: string): Promise<string | null> => {
      const id = freeId(layout.name, new Set(saved.entries.map((e) => e.id)));
      try {
        await storage.put('layouts', id, toCanonicalJson({ ...layout, id }), { message });
        saved.refresh();
        toast.info(`Saved ${layout.name}`);
        return id;
      } catch (e) {
        toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
    [storage, saved],
  );

  const saveToLibrary = useCallback(
    async (layout: Layout) => (await saveNew(layout, `Import layout ${layout.name}`)) !== null,
    [saveNew],
  );

  /** Duplicate any layout, bundled or saved, and open the copy in Analyze, to edit. */
  const duplicate = useCallback(
    async (layout: Layout) => {
      const copy = { ...layout, name: `${layout.name} copy` };
      const id = await saveNew(copy, `Duplicate ${layout.name}`);
      if (id) navigate({ to: '/analyze', search: analyzeSearch(savedRef(id)) });
    },
    [saveNew, navigate, analyzeSearch],
  );

  const duplicateSaved = useCallback(
    async (id: string) => {
      const doc = await storage.get('layouts', id);
      const parsed = doc ? safeParseLayout(doc.doc) : null;
      if (!parsed?.ok) {
        toast.error(`Could not read ${id}`);
        return;
      }
      await duplicate(parsed.layout);
    },
    [storage, duplicate],
  );

  const createLayout = useCallback(
    async (spec: NewLayoutSpec) => {
      const layout = newLayout(spec);
      const id = await saveNew(layout, `Create layout ${spec.name}`);
      if (id) navigate({ to: '/analyze', search: analyzeSearch(savedRef(id)) });
    },
    [saveNew, navigate, analyzeSearch],
  );

  /** An imported keymap goes straight to Analyze, saved, so nothing about it is lost. */
  const importKeymap = useCallback(
    async (layout: Layout) => {
      const id = await saveNew(layout, `Import keymap-drawer layout ${layout.name}`);
      if (id) navigate({ to: '/analyze', search: analyzeSearch(savedRef(id)) });
    },
    [saveNew, navigate, analyzeSearch],
  );

  const remove = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(`Delete ${name}?`)) return;
      try {
        await storage.delete('layouts', id);
        toast.info(`Deleted ${name}`);
        saved.refresh();
      } catch (e) {
        toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [storage, saved],
  );

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Library</h1>
      <div className="flex flex-wrap items-center gap-2">
        <NewLayoutDialog onCreate={createLayout} />
        <ImportDialog
          canSave={saved.available}
          onOpen={openInAnalyzer}
          onSave={saveToLibrary}
          onImportKeymap={importKeymap}
        />
        <p className="text-xs opacity-70">
          Start from an empty board, import yours, or duplicate any layout below and change it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RankingDialog
          params={params}
          onChange={setParams}
          corpora={corpora}
          ruleSetName={settings.rules.name}
          boards={boards}
          savedCount={saved.entries.length}
          summary={
            leftOut.length > 0
              ? `${shownListed.length} of ${listed.length} layouts, ${leftOut.join(', ')}.`
              : ''
          }
        />
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs opacity-60" aria-live="polite">
          {pending > 0
            ? `Scoring layouts on a sample of ${ranking.sample.toLocaleString('en-US')} symbols… ${summaryEntries.length - pending} of ${summaryEntries.length}`
            : unscored
              ? `Could not score the layouts on ${corpusName}.`
              : `Lower is better for both. Ranked on a sample of ${ranking.sample.toLocaleString('en-US')} symbols of ${corpusName}, ${settings.rules.name ?? 'rule set'}${
                  without.length > 0 ? `, typed without ${featureList(without)}` : ''
                }.${
                  nobodyCan
                    ? ` None of these layouts types ${lackingWhat}.`
                    : behind.size > 0 && sortBy !== 'name'
                      ? ` Layouts that cannot type ${lackingWhat} come last.`
                      : ''
                }`}
        </span>
      </div>

      <section className="space-y-2" aria-labelledby="library-layouts">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="library-layouts" className="text-sm uppercase tracking-wide opacity-60">
            Layouts
          </h2>
          {!saved.available && (
            <span className="badge badge-warning badge-sm">storage unavailable</span>
          )}
          {saved.entries.length === 0 && (
            <span className="text-xs opacity-70">
              Nothing saved yet. Save from Analyze, or import one.
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((item) => (
            <LayoutCard
              key={item.key}
              item={item}
              summary={summaries.get(item.key)}
              lacking={lacking.get(item.key)}
              nobodyCan={nobodyCan}
              actions={
                <>
                  <Link
                    to="/analyze"
                    search={analyzeSearch(item.ref)}
                    className="btn btn-primary btn-xs"
                  >
                    Analyze
                  </Link>
                  <button
                    type="button"
                    aria-label={`Duplicate ${item.name}`}
                    className="btn btn-xs"
                    onClick={() => {
                      if (item.saved) duplicateSaved(item.id);
                      else if (item.layout) duplicate(item.layout);
                    }}
                  >
                    Duplicate
                  </button>
                  {item.saved && (
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      className="btn btn-ghost btn-xs"
                      onClick={() => remove(item.id, item.name)}
                    >
                      Delete
                    </button>
                  )}
                </>
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
