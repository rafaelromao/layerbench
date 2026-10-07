import {
  type CompiledLayout,
  compileLayout,
  GEOMETRY_PRESET_IDS,
  importTextLayout,
  type Layout,
  safeParseLayout,
} from '@layerbench/core';
import { useEffect, useRef, useState } from 'react';
import { HelpLink } from '../../components/HelpLink.js';
import { Keyboard } from '../../components/Keyboard.js';
import { HELP } from '../../guide/help.js';
import { KeymapDrawerImport } from './KeymapDrawerImport.js';

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

/** A layout written as text or as LayerBench JSON, previewed as it is typed. */
function TextImport({
  canSave,
  onOpen,
  onSave,
}: {
  canSave: boolean;
  onOpen: (layout: Layout) => void;
  onSave: (layout: Layout) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [preset, setPreset] = useState('3x5+2');
  const [name, setName] = useState('Imported layout');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The preview follows the text as it is typed, so a malformed import is obvious immediately.
  useEffect(() => {
    if (text.trim() === '') {
      setPreview(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      const result = buildPreview(text, preset, name);
      if (result.ok) {
        setPreview(result.preview);
        setError(null);
      } else {
        setPreview(null);
        setError(result.error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [text, preset, name]);

  return (
    <div className="space-y-3">
      <p className="text-xs opacity-70">
        A native JSON document, three rows of space-separated letters with an optional fourth thumb
        row, or a string of 30 characters as cmini writes one, or 33 to 35 as cyanophage does.
      </p>

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
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-2">
          <label className="form-control">
            <span className="label-text text-xs">Name</span>
            <input
              aria-label="Layout name"
              className="input input-sm input-bordered"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">Geometry (text import)</span>
            <select
              aria-label="Geometry"
              className="select select-sm select-bordered"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
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
            onClick={() => preview && onOpen(preview.layout)}
          >
            Open in analyzer
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!preview || !canSave}
            onClick={async () => {
              if (preview && (await onSave(preview.layout))) {
                setText('');
                setPreview(null);
              }
            }}
          >
            Save to library
          </button>
        </div>
      </div>

      {error && <p className="text-error text-xs">{error}</p>}

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
  );
}

const TABS = [
  ['text', 'Text or JSON'],
  ['keymap', 'keymap-drawer'],
] as const;

/**
 * Bringing a layout in, from text, LayerBench JSON or a keymap-drawer file, in a dialog of its own
 * rather than under the list. Each way keeps what was entered while the other is shown.
 */
export function ImportDialog({
  canSave,
  onOpen,
  onSave,
  onImportKeymap,
}: {
  /** False when this browser cannot save, such as a private window that refuses storage. */
  canSave: boolean;
  /** Open a layout in Analyze without saving it. */
  onOpen: (layout: Layout) => void;
  /** Save a layout to the Library; true once it is saved. */
  onSave: (layout: Layout) => Promise<boolean>;
  /** Save a layout read from a keymap-drawer file and open it to edit. */
  onImportKeymap: (layout: Layout) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('text');

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => dialog.current?.showModal()}>
        Import
      </button>

      <dialog ref={dialog} className="modal" aria-labelledby="import-title">
        <div className="modal-box max-w-3xl space-y-4">
          <div className="flex items-center gap-2">
            <h2 id="import-title" className="font-semibold text-base">
              Import a layout
            </h2>
            <HelpLink help={HELP.importing} />
          </div>

          <div role="tablist" aria-label="Import from" className="tabs tabs-border tabs-sm">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`import-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`import-panel-${id}`}
                className={`tab ${tab === id ? 'tab-active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id="import-panel-text"
            aria-labelledby="import-tab-text"
            hidden={tab !== 'text'}
          >
            <TextImport
              canSave={canSave}
              onOpen={onOpen}
              onSave={async (layout) => {
                const done = await onSave(layout);
                if (done) dialog.current?.close();
                return done;
              }}
            />
          </div>
          <div
            role="tabpanel"
            id="import-panel-keymap"
            aria-labelledby="import-tab-keymap"
            hidden={tab !== 'keymap'}
            className="space-y-3"
          >
            <p className="text-xs opacity-70">
              A keymap-drawer YAML file: its layers, legends and combos, onto the board it
              describes. Choose which layers to bring in, and what to call them.
            </p>
            <KeymapDrawerImport onImport={onImportKeymap} />
          </div>

          <div className="modal-action">
            <button type="button" className="btn btn-sm" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  );
}
