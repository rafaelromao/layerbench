import {
  boardFromKeys,
  boardFromPreset,
  type CompiledLayout,
  compileLayout,
  cptKeys,
  GEOMETRY_PRESET_IDS,
  getGeometryPreset,
  type ImportReport,
  importKeymapDrawer,
  type KdDocument,
  type Layout,
  orthoKeys,
  type PhysicalKey,
  presetsWithKeys,
  qmkInfoKeys,
  type ResolvedBoard,
  readKeymapDrawer,
} from '@layoutmaster/core';
import { useEffect, useId, useMemo, useState } from 'react';
import { Keyboard } from '../../components/Keyboard.js';
import { LayerTabs } from '../../components/LayerTabs.js';
import { TextField } from '../edit/inspector/controls.js';

interface LayerChoice {
  /** The layer's name in the file. */
  source: string;
  name: string;
  on: boolean;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const COLUMNAR_PRESETS = GEOMETRY_PRESET_IDS.filter(
  (id) => getGeometryPreset(id).family === 'columnar',
);

/** The board a file is read onto, and what, if anything, the reader still has to choose. */
function resolveBoard(
  doc: KdDocument,
  name: string,
  preset: string,
  info: { keys: PhysicalKey[]; name: string } | null,
): { board: ResolvedBoard | null; choose: boolean; error: string | null } {
  const positions = Math.max(...doc.layers.map((l) => l.keys.length));
  try {
    if (info) return { board: boardFromKeys(info.keys, info.name), choose: true, error: null };
    if (doc.layout.kind === 'cpt') {
      return { board: boardFromKeys(cptKeys(doc.layout.spec), name), choose: false, error: null };
    }
    if (doc.layout.kind === 'ortho') {
      return {
        board: boardFromKeys(orthoKeys(doc.layout.ortho), name),
        choose: false,
        error: null,
      };
    }
    const pick = preset || presetsWithKeys(positions)[0] || '';
    return { board: pick ? boardFromPreset(pick, positions) : null, choose: true, error: null };
  } catch (e) {
    return { board: null, choose: true, error: message(e) };
  }
}

/**
 * Import a keymap-drawer YAML file: its layers, onto the board it describes — or, when it only
 * names a keyboard, onto a board the reader picks or a QMK `info.json` they have. Every layer can
 * be left out, renamed and put in another order before anything is saved.
 */
export function KeymapDrawerImport({ onImport }: { onImport: (layout: Layout) => void }) {
  const [text, setText] = useState('');
  const [doc, setDoc] = useState<KdDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<LayerChoice[]>([]);
  const [name, setName] = useState('Imported keymap');
  const [preset, setPreset] = useState('');
  const [info, setInfo] = useState<{ keys: PhysicalKey[]; name: string } | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const fileId = useId();
  const infoId = useId();

  useEffect(() => {
    if (text.trim() === '') {
      setDoc(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const next = readKeymapDrawer(text);
        setDoc(next);
        setError(null);
        setChoices(next.layers.map((l) => ({ source: l.name, name: l.name, on: true })));
        setPreset('');
        setInfo(null);
        setShown(0);
      } catch (e) {
        setDoc(null);
        setError(message(e));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const resolved = useMemo(
    () => (doc ? resolveBoard(doc, name, preset, info) : null),
    [doc, name, preset, info],
  );

  const result = useMemo((): {
    layout: Layout;
    compiled: CompiledLayout;
    report: ImportReport;
  } | null => {
    if (!doc || !resolved?.board) return null;
    const layers = choices.filter((c) => c.on).map(({ source, name: n }) => ({ source, name: n }));
    if (layers.length === 0) return null;
    try {
      const { layout, report } = importKeymapDrawer(doc, { name, layers, board: resolved.board });
      return { layout, compiled: compileLayout(layout), report };
    } catch {
      return null;
    }
  }, [doc, resolved, choices, name]);

  const importError = useMemo(() => {
    if (!doc || !resolved?.board || result) return null;
    const layers = choices.filter((c) => c.on);
    if (layers.length === 0) return 'Choose at least one layer to import.';
    try {
      const { layout } = importKeymapDrawer(doc, {
        name,
        layers: layers.map(({ source, name: n }) => ({ source, name: n })),
        board: resolved.board,
      });
      compileLayout(layout);
      return null;
    } catch (e) {
      return message(e);
    }
  }, [doc, resolved, result, choices, name]);

  const positions = doc ? Math.max(...doc.layers.map((l) => l.keys.length)) : 0;
  const matching = presetsWithKeys(positions);
  const reportOf = (layerName: string) => result?.report.layers.find((r) => r.name === layerName);
  const move = (i: number, by: number) =>
    setChoices((cs) => {
      const next = [...cs];
      const j = i + by;
      if (j < 0 || j >= next.length) return cs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const baseIndex = choices.findIndex((c) => c.on);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea
          aria-label="keymap-drawer YAML"
          rows={6}
          className="textarea textarea-bordered font-mono text-xs"
          placeholder={
            'layout: {cols_thumbs_notation: 33333+2 2+33333}\nlayers:\n  Base:\n  - [Q, W, E, R, T, Y, U, I, O, P]\n  …'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={fileId} className="btn btn-sm">
            Choose a .yaml file
          </label>
          <input
            id={fileId}
            type="file"
            accept=".yaml,.yml,text/yaml,application/yaml"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
              e.target.value = '';
            }}
          />
          <p className="text-[11px] opacity-60 max-w-56">
            Written by <span className="font-mono">keymap parse</span> or by hand. Nothing is
            fetched: the board comes from the file, or from you.
          </p>
        </div>
      </div>

      {error && <p className="text-error text-xs">{error}</p>}

      {doc && resolved && (
        <div className="space-y-3">
          <div className="rounded-box border border-base-300 p-3 space-y-2">
            <h3 className="text-xs font-semibold">Board</h3>
            {resolved.choose && (
              <p className="text-xs opacity-80">
                {doc.layout.kind === 'named'
                  ? `The file names the keyboard ${doc.layout.name}, whose shape cannot be looked up from here. `
                  : 'The file does not say which keyboard it is for. '}
                {matching.length > 0
                  ? `It has ${positions} keys, which is the board below.`
                  : `No board here has ${positions} keys: pick the nearest, whose keys are filled in order, or give the keyboard's QMK info.json.`}
              </p>
            )}
            {resolved.choose && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Board to import onto"
                  className="select select-sm select-bordered w-auto"
                  value={info ? '' : preset || matching[0] || ''}
                  onChange={(e) => {
                    setInfo(null);
                    setPreset(e.target.value);
                  }}
                >
                  {info && <option value="">{info.name} (from info.json)</option>}
                  {!info && !preset && matching.length === 0 && <option value="">choose…</option>}
                  {COLUMNAR_PRESETS.map((id) => (
                    <option key={id} value={id}>
                      {getGeometryPreset(id).name}
                      {matching.includes(id) ? ' — matches' : ''}
                    </option>
                  ))}
                </select>
                <label htmlFor={infoId} className="btn btn-sm btn-ghost">
                  Use a QMK info.json…
                </label>
                <input
                  id={infoId}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const layoutName =
                        doc.layout.kind === 'named' ? doc.layout.layoutName : undefined;
                      setInfo(qmkInfoKeys(JSON.parse(await file.text()), layoutName));
                      setInfoError(null);
                    } catch (err) {
                      setInfoError(message(err));
                    }
                  }}
                />
              </div>
            )}
            {infoError && <p className="text-error text-xs">{infoError}</p>}
            {resolved.error && <p className="text-error text-xs">{resolved.error}</p>}
            {resolved.board && (
              <p className="text-xs">
                Onto <strong>{resolved.board.description}</strong>.
              </p>
            )}
          </div>

          <div className="rounded-box border border-base-300 p-3 space-y-2">
            <h3 className="text-xs font-semibold">Layers</h3>
            <p className="text-[11px] opacity-60">
              Untick a layer to leave it out; the first one ticked becomes the base layer. A key
              that reaches a layer left out is kept as an imported key.
            </p>
            <ol className="space-y-1 list-none p-0 m-0" aria-label="Layers to import">
              {choices.map((c, i) => {
                const r = c.on ? reportOf(c.name) : undefined;
                return (
                  <li key={c.source} className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      aria-label={`Import ${c.source}`}
                      checked={c.on}
                      onChange={(e) =>
                        setChoices((cs) =>
                          cs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)),
                        )
                      }
                    />
                    <TextField
                      label={`Name for ${c.source}`}
                      value={c.name}
                      mono={false}
                      className="input-xs w-32"
                      onCommit={(n) => {
                        const clean = n.trim();
                        if (clean) {
                          setChoices((cs) =>
                            cs.map((x, j) => (j === i ? { ...x, name: clean } : x)),
                          );
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      aria-label={`Move ${c.source} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      aria-label={`Move ${c.source} down`}
                      disabled={i === choices.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    {i === baseIndex && <span className="badge badge-ghost badge-sm">base</span>}
                    {r && (
                      <span className="text-[11px] opacity-70">
                        {r.read} of {r.keys} keys read
                        {r.kept.length > 0 &&
                          ` · kept as imported: ${r.kept.slice(0, 8).join(', ')}${r.kept.length > 8 ? ` and ${r.kept.length - 8} more` : ''}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {result && (
            <div className="space-y-2">
              <LayerTabs
                layers={result.compiled.layers.map((l) => ({ idx: l.idx, id: l.id, name: l.name }))}
                active={Math.min(shown, result.compiled.layers.length - 1)}
                onSelect={setShown}
              />
              <Keyboard
                id="kb-kd-import"
                compiled={result.compiled}
                layer={Math.min(shown, result.compiled.layers.length - 1)}
                interactive={false}
              />
              <p className="text-xs opacity-70">
                {result.report.combos.imported} combo
                {result.report.combos.imported === 1 ? '' : 's'} imported
                {result.report.combos.skipped.length > 0 &&
                  `; left out: ${result.report.combos.skipped.join('; ')}`}
                .
              </p>
              {result.report.notes.length > 0 && (
                <ul className="text-xs text-warning space-y-1">
                  {result.report.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {importError && <p className="text-error text-xs">{importError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <TextField
              label="Name of the imported layout"
              value={name}
              mono={false}
              className="w-56"
              onCommit={(n) => {
                if (n.trim()) setName(n.trim());
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!result}
              onClick={() => result && onImport(result.layout)}
            >
              Import and edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
