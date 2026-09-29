import {
  BUNDLED_LAYOUTS,
  type CompiledLayout,
  compileLayout,
  GEOMETRY_PRESET_IDS,
  getGeometryPreset,
  importTextLayout,
  type Layout,
  layoutLanguages,
  safeParseLayout,
  slug,
  toCanonicalJson,
} from '@layoutmaster/core';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatValue } from '../components/format.js';
import { HelpLink } from '../components/HelpLink.js';
import { Keyboard } from '../components/Keyboard.js';
import {
  compareBy,
  type LayoutSummary,
  type SortKey,
  type SummaryEntry,
  type SummaryOptions,
  useSummaries,
} from '../engine/use-summaries.js';
import { HELP } from '../guide/help.js';
import { toast } from '../state/toasts.js';
import { useCollection, useStorage } from '../storage/use-storage.js';
import { encodeInline } from '../url/inline.js';
import { inlineRef, parseParams, type RawSearch, savedRef } from '../url/params.js';
import { KeymapDrawerImport } from './library/KeymapDrawerImport.js';
import { type NewLayoutSpec, newLayout } from './new-layout.js';
import { useRuleSet } from './useRuleSet.js';

/** Ranking re-analyzes every layout listed, so it works from the editor's smaller sample. */
const RANK_MAX_SYMBOLS = 100_000;

const SORTS: [SortKey, string][] = [
  ['effort', 'Effort'],
  ['sfb', 'SFB'],
  ['name', 'Name'],
];

/** The two numbers every card shows, whether or not the list is sorted by them. */
function Ranking({ summary }: { summary: LayoutSummary | undefined }) {
  if (!summary) {
    return <p className="text-xs opacity-50">scoring…</p>;
  }
  return (
    <dl className="flex gap-3 text-xs font-mono tabular-nums m-0">
      <div className="flex gap-1">
        <dt className="opacity-60 font-sans">Effort</dt>
        <dd className="m-0">{formatValue(summary.effort, 'effort')}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="opacity-60 font-sans">SFB</dt>
        <dd className="m-0">{formatValue(summary.sfb, 'percent')}</dd>
      </div>
    </dl>
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

/** New layout: pick a board, a starting point, and whether it gets number and symbol layers. */
function NewLayoutDialog({ onCreate }: { onCreate: (spec: NewLayoutSpec) => void }) {
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState<NewLayoutSpec>({
    name: 'My layout',
    geometry: '3x5+2',
    start: 'empty',
    numbers: false,
  });

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        New layout
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
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
    () => BUNDLED_LAYOUTS.map((layout) => ({ layout, compiled: compileLayout(layout) })),
    [],
  );

  // Ranking uses the corpus and rule set in the link, so it agrees with what Analyze would show.
  const search = useSearch({ strict: false }) as RawSearch;
  const params = useMemo(() => parseParams(search), [search]);
  const ruleSet = useRuleSet(params.preset, params.universe);
  const [sortBy, setSortBy] = useState<SortKey>('effort');

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

  const summaryEntries: SummaryEntry[] = useMemo(
    () => [
      ...bundled.map(({ layout }) => ({ key: `b:${layout.id}`, layout })),
      ...saved.entries.map((e) => ({ key: `s:${e.id}`, layout: savedLayouts.get(e.id) ?? null })),
    ],
    [bundled, saved.entries, savedLayouts],
  );
  const summaryOptions: SummaryOptions = useMemo(
    () => ({
      corpusId: params.corpus,
      caseMode: params.caseMode,
      textClass: params.textClass,
      maxSymbols: Math.min(params.sample, RANK_MAX_SYMBOLS),
      ruleSet,
    }),
    [params.corpus, params.caseMode, params.textClass, params.sample, ruleSet],
  );
  const { summaries, pending } = useSummaries(summaryEntries, summaryOptions);
  // Every layout failing at once means the corpus or rule set is at fault, not the layouts.
  const unscored =
    summaries.size > 0 && [...summaries.values()].every((s) => s.effort === null && s.sfb === null);

  // Cards would jump around as each score landed, so the list keeps its order until all are in and
  // then moves once. Sorting by name needs no scores and applies at once.
  const settled = pending === 0 || sortBy === 'name';
  const bundledSorted = useMemo(() => {
    if (!settled) return bundled;
    const by = compareBy(sortBy, summaries);
    return [...bundled].sort((a, b) =>
      by(
        { key: `b:${a.layout.id}`, name: a.layout.name },
        { key: `b:${b.layout.id}`, name: b.layout.name },
      ),
    );
  }, [bundled, settled, sortBy, summaries]);
  const savedSorted = useMemo(() => {
    if (!settled) return saved.entries;
    const by = compareBy(sortBy, summaries);
    return [...saved.entries].sort((a, b) =>
      by({ key: `s:${a.id}`, name: a.name }, { key: `s:${b.id}`, name: b.name }),
    );
  }, [saved.entries, settled, sortBy, summaries]);

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
    navigate({ to: '/', search: { layout: inlineRef(blob) } as never });
  }, [preview, navigate]);

  /**
   * Save under a free id. Two layouts with the same name used to overwrite each other silently,
   * because the id is a slug of the name and nothing checked whether it was taken.
   */
  const saveNew = useCallback(
    async (layout: Layout, message: string): Promise<string | null> => {
      const base = slug(layout.name);
      const taken = new Set(saved.entries.map((e) => e.id));
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      try {
        await storage.put('layouts', id, toCanonicalJson({ ...layout, id }), { message });
        saved.refresh();
        toast.info(id === base ? `Saved as ${id}` : `Saved as ${id} — ${base} was taken`);
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

  /** Duplicate any layout, bundled or saved, and open the copy in the editor. */
  const duplicate = useCallback(
    async (layout: Layout) => {
      const copy = { ...layout, name: `${layout.name} copy` };
      const id = await saveNew(copy, `Duplicate ${layout.name}`);
      if (id) navigate({ to: '/edit', search: { layout: savedRef(id) } as never });
    },
    [saveNew, navigate],
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
      if (id) navigate({ to: '/edit', search: { layout: savedRef(id) } as never });
    },
    [saveNew, navigate],
  );

  /** An imported keymap goes straight to the editor, saved, so nothing about it is lost. */
  const importKeymap = useCallback(
    async (layout: Layout) => {
      const id = await saveNew(layout, `Import keymap-drawer layout ${layout.name}`);
      if (id) navigate({ to: '/edit', search: { layout: savedRef(id) } as never });
    },
    [saveNew, navigate],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this saved layout?')) return;
      try {
        await storage.delete('layouts', id);
        toast.info(`Deleted ${id}`);
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
            ? `Scoring layouts… ${summaryEntries.length - pending} of ${summaryEntries.length}`
            : unscored
              ? `Could not score the layouts on ${params.corpus}.`
              : `Lower is better for both. ${Math.min(params.sample, RANK_MAX_SYMBOLS).toLocaleString('en-US')} symbols of ${params.corpus}, ${ruleSet.name ?? 'rule set'}.`}
        </span>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wide opacity-60">Bundled layouts</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {bundledSorted.map(({ layout, compiled }) => (
            <article key={layout.id} className="card bg-base-100 border border-base-300">
              <div className="card-body gap-2 p-4">
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm">{layout.name}</h3>
                    <p className="text-xs opacity-60">
                      {[
                        layout.author,
                        compiled.geometry.id,
                        `${compiled.layers.length} layer${compiled.layers.length === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <LanguageBadges compiled={compiled} />
                    <Ranking summary={summaries.get(`b:${layout.id}`)} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Link
                      to="/"
                      search={{ layout: layout.id } as never}
                      className="btn btn-primary btn-xs"
                    >
                      Analyze
                    </Link>
                    <button
                      type="button"
                      aria-label={`Duplicate ${layout.name}`}
                      className="btn btn-xs"
                      onClick={() => duplicate(layout)}
                    >
                      Duplicate
                    </button>
                  </div>
                </header>
                <Keyboard
                  id={`kb-${layout.id}`}
                  compiled={compiled}
                  interactive={false}
                  showHold={false}
                  className="opacity-90"
                />
                {layout.description && (
                  // A description may carry a link, which would otherwise hold the card, and the
                  // whole list with it, wider than a phone.
                  <p className="text-xs opacity-70 [overflow-wrap:anywhere]">
                    {layout.description}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm uppercase tracking-wide opacity-60">Saved layouts</h2>
          {!saved.available && (
            <span className="badge badge-warning badge-sm">storage unavailable</span>
          )}
        </div>
        {saved.entries.length === 0 ? (
          <p className="text-sm opacity-70">
            Nothing saved yet. Save from the editor, or import below.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {savedSorted.map((entry) => (
              <article key={entry.id} className="card bg-base-100 border border-base-300">
                <div className="card-body gap-2 p-4">
                  <h3 className="font-semibold text-sm">{entry.name}</h3>
                  <Ranking summary={summaries.get(`s:${entry.id}`)} />
                  <p className="text-xs opacity-60">
                    {[
                      entry.author,
                      entry.geometry,
                      entry.layers ? `${entry.layers} layers` : null,
                      entry.updatedAt ? `updated ${entry.updatedAt.slice(0, 10)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/"
                      search={{ layout: savedRef(entry.id) } as never}
                      className="btn btn-primary btn-xs"
                    >
                      Analyze
                    </Link>
                    <Link
                      to="/edit"
                      search={{ layout: savedRef(entry.id) } as never}
                      className="btn btn-xs"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      aria-label={`Duplicate ${entry.name}`}
                      className="btn btn-xs"
                      onClick={() => duplicateSaved(entry.id)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => remove(entry.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
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
