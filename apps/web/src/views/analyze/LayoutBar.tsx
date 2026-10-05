import {
  BUNDLED_LAYOUTS,
  type CorpusManifest,
  type IndexEntry,
  type Layout,
} from '@layoutmaster/core';
import { type Params, savedRef } from '../../url/params.js';
import { AnalysisSettings, SampleSelect } from '../AnalysisSelects.js';
import { groupByLanguage } from '../corpus-groups.js';
import { TextField } from '../edit/inspector/controls.js';

/**
 * What the layout is and what it is measured on, all in sight: its name, whether it is saved and
 * the way to save it, its author and description; then which layout this is, the text and rules the
 * numbers come from, and the way to compare it. On a phone the rows stay few: two fields share each,
 * labelled on their border.
 */
export function LayoutBar({
  layout,
  dirty,
  saving,
  onMeta,
  onSave,
  layoutRef,
  onPick,
  saved,
  corpora,
  params,
  ruleSetName,
  onParams,
  onCompare,
}: {
  layout: Layout;
  dirty: boolean;
  saving: boolean;
  onMeta: (meta: { name?: string; author?: string; description?: string }) => void;
  onSave: () => void;
  /** The layout the link names, for the picker. */
  layoutRef: string;
  onPick: (layoutRef: string) => void;
  /** The layouts saved in the Library, offered beside the bundled ones. */
  saved: IndexEntry[];
  corpora: CorpusManifest[];
  params: Params;
  ruleSetName?: string;
  onParams: (overrides: Partial<Params>) => void;
  onCompare: () => void;
}) {
  const listed =
    BUNDLED_LAYOUTS.some((l) => l.id === layoutRef) ||
    saved.some((e) => savedRef(e.id) === layoutRef);
  const savedSorted = [...saved].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  return (
    <section
      className="lm-editor-bar card bg-base-100 border border-base-300 gap-3 px-3 py-2"
      aria-label="Layout"
    >
      {/* One line at every width: on a narrow phone the name gives the badge its room, rather than
          the bar taking a line more and the board jumping down on the first edit. */}
      <div className="flex items-center gap-1 sm:gap-2">
        <TextField
          label="Name"
          value={layout.name}
          mono={false}
          className="input-ghost font-semibold text-base flex-1 min-w-0 px-1"
          onCommit={(name) => {
            if (name.trim()) onMeta({ name: name.trim() });
          }}
        />
        {dirty && (
          <span className="badge badge-warning badge-sm shrink-0 max-sm:px-1.5">unsaved</span>
        )}
        <button
          type="button"
          className={`btn btn-sm shrink-0 max-sm:px-2 ${dirty ? 'btn-primary' : ''}`}
          title="Keep it in the Library"
          disabled={saving}
          onClick={onSave}
        >
          Save
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
        <div className="floating-label">
          <span aria-hidden="true">Author</span>
          <TextField
            label="Author"
            placeholder="Author"
            value={layout.author ?? ''}
            mono={false}
            className="w-full"
            onCommit={(author) => onMeta({ author })}
          />
        </div>
        <div className="floating-label">
          <span aria-hidden="true">Description</span>
          <TextField
            label="Description"
            placeholder="Description"
            value={layout.description ?? ''}
            mono={false}
            className="w-full"
            onCommit={(description) => onMeta({ description })}
          />
        </div>
      </div>
      <form
        id="analyze-toolbar"
        className="lm-toolbar flex flex-row flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="form-control lm-wide">
          <span className="label-text text-xs">Layout</span>
          <select
            name="layout"
            aria-label="Layout"
            className="select select-sm select-bordered min-w-48"
            value={layoutRef}
            onChange={(e) => onPick(e.target.value)}
          >
            <optgroup label="Bundled">
              {BUNDLED_LAYOUTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            {savedSorted.length > 0 && (
              <optgroup label="Saved">
                {savedSorted.map((e) => (
                  <option key={e.id} value={savedRef(e.id)}>
                    {/* Two saved layouts can share a name; their ids tell them apart. */}
                    {saved.filter((o) => o.name === e.name).length > 1
                      ? `${e.name} (${e.id})`
                      : e.name}
                  </option>
                ))}
              </optgroup>
            )}
            {!listed && <option value={layoutRef}>{layout.name}</option>}
          </select>
        </label>
        <AnalysisSettings
          params={params}
          onChange={onParams}
          corpora={corpora}
          ruleSetName={ruleSetName}
          verb="Analyze"
          afterCorpus={
            <>
              <label className="form-control">
                <span className="label-text text-xs">Mix with</span>
                <select
                  name="corpus2"
                  aria-label="Mix with"
                  className="select select-sm select-bordered"
                  value={params.corpus2 ?? ''}
                  onChange={(e) =>
                    onParams({ corpus2: e.target.value === '' ? null : e.target.value })
                  }
                >
                  <option value="">—</option>
                  {groupByLanguage(corpora.filter((c) => c.id !== params.corpus)).map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {params.corpus2 && (
                <label className="form-control lm-wide">
                  <span className="label-text text-xs">
                    {params.mix}% first · {100 - params.mix}% second
                  </span>
                  <input
                    type="range"
                    name="mix"
                    aria-label="Corpus mix"
                    className="range range-xs w-40"
                    min={0}
                    max={100}
                    step={5}
                    value={params.mix}
                    onChange={(e) => onParams({ mix: Number(e.target.value) })}
                  />
                </label>
              )}
            </>
          }
          afterCounts={
            <label className="form-control">
              <span className="label-text text-xs">Sample</span>
              <SampleSelect value={params.sample} onChange={(sample) => onParams({ sample })} />
            </label>
          }
          actions={
            <button
              type="button"
              className="btn btn-sm btn-outline max-sm:flex-1"
              onClick={onCompare}
            >
              Compare
            </button>
          }
        />
      </form>
    </section>
  );
}
