import {
  BUNDLED_LAYOUTS,
  type CompiledLayout,
  compileLayout,
  freeId,
  GEOMETRY_PRESET_IDS,
  getGeometryPreset,
  importTextLayout,
  type Layout,
  languageCovered,
  layoutLanguageCoverage,
  layoutLanguages,
  safeParseLayout,
  toCanonicalJson,
  withoutFeatures,
} from '@layoutmaster/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { featureList } from '../components/FeatureSwitches.js';
import { formatValue } from '../components/format.js';
import { HelpLink } from '../components/HelpLink.js';
import { Keyboard } from '../components/Keyboard.js';
import { useDismiss } from '../components/use-dismiss.js';
import {
  compareBy,
  type LayoutSummary,
  type SortKey,
  type SummaryEntry,
  type SummaryOptions,
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
  toSearch,
} from '../url/params.js';
import { AnalysisSettings } from './AnalysisSelects.js';
import { KeymapDrawerImport } from './library/KeymapDrawerImport.js';
import { LayerStrip } from './library/LayerStrip.js';
import { type NewLayoutSpec, newLayout } from './new-layout.js';
import { useCorpora } from './useCorpora.js';
import { useRuleSet } from './useRuleSet.js';

/**
 * Ranking types the text once for every layout listed, so it never takes more than this, whatever
 * sample the other views were set to. The status line names the sample, so nobody takes it for
 * Analyze's.
 */
const RANK_MAX_SYMBOLS = 100_000;

const SORTS: [SortKey, string][] = [
  ['effort', 'Effort'],
  ['sfb', 'SFB'],
  ['name', 'Name'],
];

/** Characters named on a card before the list is cut short. */
const MISSING_SHOWN = 5;

/**
 * The two numbers every card shows, whether or not the list is sorted by them, and what the layout
 * left out of the text to get them.
 */
function Ranking({
  summary,
  lacking,
  nobodyCan = false,
}: {
  summary: LayoutSummary | undefined;
  /** Letters the corpus's language needs that the layout cannot type; set when it ranks behind. */
  lacking?: { language: string; letters: string[] };
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
      {lacking ? (
        <p className="lm-skips text-xs text-warning" title={`Letters ${lacking.language} needs`}>
          Cannot type {lacking.letters.join(' ')}: skips {summary.skipped.toFixed(2)}% of the text
          {nobodyCan ? '.' : ', ranked after the layouts that can.'}
        </p>
      ) : (
        summary.skipped > 0 && (
          <p className="lm-skips text-xs opacity-60">
            Skips {summary.skipped.toFixed(2)}% of the text: {missing}
          </p>
        )
      )}
    </>
  );
}

interface Preview {
  layout: Layout;
  compiled: CompiledLayout;
  warnings: string[];
}

/** Native JSON documents start with a brace; anything else is read as a classic text layout. */
function buildPreview(
  text: string,
  preset: string,
  name: string,
): { ok: true; preview: Preview } | { ok: false; error: string } {
  const trimmed = text.trim();
  try {
    if (trimmed.startsWith('{')) {
      const parsed = safeParseLayout(JSON.parse(trimmed));
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        preview: { layout: parsed.layout, compiled: compileLayout(parsed.layout), warnings: [] },
      };
    }
    const { layout, overflow, warnings } = importTextLayout(trimmed, preset, name);
    return {
      ok: true,
      preview: {
        layout,
        compiled: compileLayout(layout),
        warnings: [...overflow.map((t) => `overflow: ${t}`), ...warnings],
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
  lacking: { language: string; letters: string[] } | undefined;
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
          <p className="text-xs opacity-70 [overflow-wrap:anywhere]">{item.layout.description}</p>
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
    numbers: false,
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
            className="card w-full max-w-md bg-base-100 shadow-xl"
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
                  aria-label="Add number and symbol layers"
                  className="checkbox checkbox-sm"
                  checked={spec.numbers}
                  onChange={(e) => setSpec({ ...spec, numbers: e.target.checked })}
                />
                <span className="label-text text-xs">Add number and symbol layers</span>
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

  const [importText, setImportText] = useState('');
  const [importPreset, setImportPreset] = useState('3x5+2');
  const [importName, setImportName] = useState('Imported layout');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const bundled = useMemo(
    () =>
      BUNDLED_LAYOUTS.map((layout) => ({
        id: layout.id ?? layout.name,
        layout,
        compiled: compileLayout(layout),
      })),
    [],
  );

  // Ranking uses the corpus and rule set in the link, so it agrees with what Analyze would show.
  const search = useSearch({ strict: false }) as RawSearch;
  const params = useMemo(() => parseParams(search, ENGLISH_CORPUS), [search]);
  const rankSymbols = Math.min(params.sample, RANK_MAX_SYMBOLS);
  useRememberSelection(params);
  const ruleSet = useRuleSet(params.preset, params.universe);
  const corpora = useCorpora();
  const corpusName = corpora.find((c) => c.id === params.corpus)?.name ?? params.corpus;
  const corpusLanguage = corpora.find((c) => c.id === params.corpus)?.language;

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
  /** Analyze opens on the corpus and rules the card was ranked by, so the numbers match. */
  const analyzeSearch = useCallback(
    (layoutRef: string) => toSearch(params, { layoutRef }) as never,
    [params],
  );
  const sortBy = useSession((s) => s.librarySort);
  const setSortBy = useSession((s) => s.setLibrarySort);

  // Saved layouts are listed from their index; ranking needs the documents themselves.
  const [savedLayouts, setSavedLayouts] = useState<Map<string, Layout>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out = new Map<string, Layout>();
      for (const entry of saved.entries) {
        const doc = await storage.get('layouts', entry.id).catch(() => null);
        const parsed = doc ? safeParseLayout(doc.doc) : null;
        if (parsed?.ok) out.set(entry.id, parsed.layout);
      }
      if (!cancelled) setSavedLayouts(out);
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

  // Each layout as it is ranked: typed without the features left out. The cards still draw the
  // layout itself; only its numbers, and what it can type, come from this.
  const { without } = params;
  const ranked = useMemo(() => {
    const out = new Map<string, { layout: Layout; compiled: CompiledLayout }>();
    const add = (key: string, layout: Layout, compiled: CompiledLayout) => {
      if (without.length === 0) {
        out.set(key, { layout, compiled });
        return;
      }
      const plain = withoutFeatures(layout, without);
      try {
        out.set(key, { layout: plain, compiled: compileLayout(plain) });
      } catch {
        // Left unranked, like a saved layout that will not compile.
      }
    };
    for (const { id, layout, compiled } of bundled) add(`b:${id}`, layout, compiled);
    for (const [id, layout] of savedLayouts) {
      const compiled = savedCompiled.get(id);
      if (compiled) add(`s:${id}`, layout, compiled);
    }
    return out;
  }, [bundled, savedLayouts, savedCompiled, without]);

  const summaryEntries: SummaryEntry[] = useMemo(
    () => [
      ...bundled.map(({ id }) => {
        const key = `b:${id}`;
        return { key, layout: ranked.get(key)?.layout ?? null };
      }),
      ...saved.entries.map((e) => {
        const key = `s:${e.id}`;
        // One that will not compile is still sent, so it fails and shows as unscored.
        return { key, layout: ranked.get(key)?.layout ?? savedLayouts.get(e.id) ?? null };
      }),
    ],
    [bundled, saved.entries, ranked, savedLayouts],
  );
  const summaryOptions: SummaryOptions = useMemo(
    () => ({
      corpusId: params.corpus,
      caseMode: params.caseMode,
      textClass: params.textClass,
      maxSymbols: rankSymbols,
      ruleSet,
    }),
    [params.corpus, params.caseMode, params.textClass, rankSymbols, ruleSet],
  );
  const { summaries, pending } = useSummaries(summaryEntries, summaryOptions);

  // A layout that cannot type letters the corpus's language needs skips them, and skipping is free:
  // it would rank above one that pays to type them. Those go behind, whatever their numbers.
  const lacking = useMemo(() => {
    const out = new Map<string, { language: string; letters: string[] }>();
    if (!corpusLanguage) return out;
    const tags = corpusLanguage.split('+').map((t) => t.trim());
    const check = (key: string, compiled: CompiledLayout) => {
      for (const tag of tags) {
        const coverage = layoutLanguageCoverage(compiled, tag);
        if (coverage && !languageCovered(coverage)) {
          out.set(key, { language: coverage.name, letters: coverage.missingRequired });
          return;
        }
      }
    };
    for (const [key, { compiled }] of ranked) check(key, compiled);
    return out;
  }, [corpusLanguage, ranked]);
  const behind = useMemo(() => new Set(lacking.keys()), [lacking]);
  // When no layout can write the language, none is behind the others: the list keeps its metric order.
  const nobodyCan = behind.size > 0 && behind.size === ranked.size;
  const lackingLanguage = [...lacking.values()][0]?.language;
  // Every layout failing at once means the corpus or rule set is at fault, not the layouts.
  const unscored =
    summaries.size > 0 && [...summaries.values()].every((s) => s.effort === null && s.sfb === null);

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
      })),
    ],
    [bundled, saved.entries, savedLayouts, savedCompiled],
  );

  // The chosen order applies from the first score on: each layout takes its place as its score
  // lands, and those still being scored wait below the ranked ones.
  const sorted = useMemo(
    () => [...listed].sort(compareBy(sortBy, summaries, behind)),
    [listed, sortBy, summaries, behind],
  );

  // The preview follows the text as it is typed, so a malformed import is obvious immediately.
  useEffect(() => {
    if (importText.trim() === '') {
      setPreview(null);
      setImportError(null);
      return;
    }
    const timer = setTimeout(() => {
      const result = buildPreview(importText, importPreset, importName);
      if (result.ok) {
        setPreview(result.preview);
        setImportError(null);
      } else {
        setPreview(null);
        setImportError(result.error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [importText, importPreset, importName]);

  const openInAnalyzer = useCallback(async () => {
    if (!preview) return;
    const blob = await encodeInline(preview.layout);
    navigate({ to: '/analyze', search: toSearch(params, { layoutRef: inlineRef(blob) }) as never });
  }, [preview, navigate, params]);

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

  const saveToLibrary = useCallback(async () => {
    if (!preview) return;
    const id = await saveNew(preview.layout, `Import layout ${preview.layout.name}`);
    if (id === null) return;
    setImportText('');
    setPreview(null);
  }, [preview, saveNew]);

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
        <p className="text-xs opacity-70">
          Start from an empty board, or duplicate any layout below and change it.
        </p>
      </div>

      <div className="lm-toolbar flex flex-row flex-wrap items-end gap-3">
        <AnalysisSettings
          params={params}
          onChange={setParams}
          corpora={corpora}
          ruleSetName={ruleSet.name}
          verb="Rank"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <span className="text-xs opacity-60" aria-live="polite">
          {pending > 0
            ? `Scoring layouts on a sample of ${rankSymbols.toLocaleString('en-US')} symbols… ${summaryEntries.length - pending} of ${summaryEntries.length}`
            : unscored
              ? `Could not score the layouts on ${corpusName}.`
              : `Lower is better for both. Ranked on a sample of ${rankSymbols.toLocaleString('en-US')} symbols of ${corpusName}, ${ruleSet.name ?? 'rule set'}${
                  without.length > 0 ? `, typed without ${featureList(without)}` : ''
                }.${
                  nobodyCan
                    ? ` None of these layouts types every letter ${lackingLanguage} needs.`
                    : behind.size > 0 && sortBy !== 'name'
                      ? ` Layouts that cannot type every letter ${lackingLanguage} needs come last.`
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
              Nothing saved yet. Save from Analyze, or import below.
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

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3 p-4">
          <div>
            <h2 className="font-semibold text-sm">Import</h2>
            <p className="text-xs opacity-70">
              A native JSON document, three rows of space-separated letters with an optional fourth
              thumb row, or a 30- to 34-character string in the cmini and cyanophage conventions.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="form-control">
              <span className="sr-only">Layout to import</span>
              <textarea
                id="import-text"
                wrap="off"
                aria-label="Layout to import"
                rows={5}
                className="textarea textarea-bordered font-mono text-xs"
                placeholder={'q w e r t  y u i o p\na s d f g  h j k l ;\nz x c v b  n m , . /'}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </label>
            <div className="flex flex-col gap-2">
              <label className="form-control">
                <span className="label-text text-xs">Name</span>
                <input
                  aria-label="Layout name"
                  className="input input-sm input-bordered"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Geometry (text import)</span>
                <select
                  aria-label="Geometry"
                  className="select select-sm select-bordered"
                  value={importPreset}
                  onChange={(e) => setImportPreset(e.target.value)}
                >
                  {GEOMETRY_PRESET_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!preview}
                onClick={openInAnalyzer}
              >
                Open in analyzer
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!preview || !saved.available}
                onClick={saveToLibrary}
              >
                Save to library
              </button>
            </div>
          </div>

          {importError && <p className="text-error text-xs">{importError}</p>}

          {preview && (
            <div className="grid gap-3 md:grid-cols-2">
              <Keyboard
                id="kb-import"
                compiled={preview.compiled}
                interactive={false}
                showHold={false}
              />
              {preview.warnings.length > 0 && (
                <ul className="text-warning text-xs space-y-1">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3 p-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">Import from keymap-drawer</h2>
              <HelpLink help={HELP.importing} />
            </div>
            <p className="text-xs opacity-70">
              A keymap-drawer YAML file: its layers, legends and combos, onto the board it
              describes. Choose which layers to bring in, and what to call them.
            </p>
          </div>
          <KeymapDrawerImport onImport={importKeymap} />
        </div>
      </section>
    </div>
  );
}
