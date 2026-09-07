import {
  BUNDLED_LAYOUTS,
  type CompiledLayout,
  compileLayout,
  GEOMETRY_PRESET_IDS,
  importTextLayout,
  type Layout,
  safeParseLayout,
  slug,
  toCanonicalJson,
} from '@layoutmaster/core';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from '../components/Keyboard.js';
import { toast } from '../state/toasts.js';
import { useCollection, useStorage } from '../storage/use-storage.js';
import { encodeInline } from '../url/inline.js';
import { inlineRef, savedRef } from '../url/params.js';

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

  const saveToLibrary = useCallback(async () => {
    if (!preview) return;
    const id = slug(preview.layout.name);
    try {
      await storage.put('layouts', id, toCanonicalJson({ ...preview.layout, id }), {
        message: `Import layout ${preview.layout.name}`,
      });
      toast.info(`Saved ${preview.layout.name} as ${id}`);
      setImportText('');
      setPreview(null);
      saved.refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [preview, storage, saved]);

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
      <section className="space-y-2">
        <h1 className="text-sm uppercase tracking-wide opacity-60">Bundled layouts</h1>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {bundled.map(({ layout, compiled }) => (
            <article key={layout.id} className="card bg-base-100 border border-base-300">
              <div className="card-body gap-2 p-4">
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-sm">{layout.name}</h2>
                    <p className="text-xs opacity-60">
                      {[
                        layout.author,
                        compiled.geometry.id,
                        `${compiled.layers.length} layer${compiled.layers.length === 1 ? '' : 's'}`,
                        (layout.languages ?? []).join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Link
                    to="/"
                    search={{ layout: layout.id } as never}
                    className="btn btn-primary btn-xs"
                  >
                    Analyze
                  </Link>
                </header>
                <Keyboard
                  id={`kb-${layout.id}`}
                  compiled={compiled}
                  interactive={false}
                  showHold={false}
                  className="opacity-90"
                />
                {layout.description && <p className="text-xs opacity-70">{layout.description}</p>}
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
            {saved.entries.map((entry) => (
              <article key={entry.id} className="card bg-base-100 border border-base-300">
                <div className="card-body gap-2 p-4">
                  <h3 className="font-semibold text-sm">{entry.name}</h3>
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
                  <div className="flex gap-2">
                    <Link
                      to="/"
                      search={{ layout: savedRef(entry.id) } as never}
                      className="btn btn-primary btn-xs"
                    >
                      Analyze
                    </Link>
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
    </div>
  );
}
