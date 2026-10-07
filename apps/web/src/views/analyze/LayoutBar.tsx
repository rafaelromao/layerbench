import type { CorpusManifest, IndexEntry, Layout } from '@layerbench/core';
import { Switch, SwitchGroup } from '../../components/FeatureSwitches.js';
import type { Params } from '../../url/params.js';
import { AnalysisSettings, SampleSelect } from '../AnalysisSelects.js';
import { groupByLanguage } from '../corpus-groups.js';
import { TextAreaField, TextField } from '../edit/inspector/controls.js';
import { LayoutOptions } from '../LayoutOptions.js';
import { SettingsDialog, settingsSummary } from '../SettingsDialog.js';

/**
 * The layout in hand and what it is measured on. In sight: its name, whether it is saved and the
 * way to save it, which layout this is, what the numbers are made with, and the way to compare it.
 * In the Settings dialog: its author and description, the text and rules the numbers come from,
 * the switches, and whether the board draws the combos that type.
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
  showCombos,
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
  /** Whether the board draws the combos that type; absent when the layout has none. */
  showCombos?: { on: boolean; onChange: (on: boolean) => void };
}) {
  return (
    <section
      className="lb-editor-bar card bg-base-100 border border-base-300 gap-3 px-3 py-2"
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
      <div id="analyze-toolbar" className="lb-toolbar flex flex-row flex-wrap items-end gap-3">
        <label className="form-control lb-wide">
          <span className="label-text text-xs">Layout</span>
          <select
            name="layout"
            aria-label="Layout"
            className="select select-sm select-bordered min-w-48"
            value={layoutRef}
            onChange={(e) => onPick(e.target.value)}
          >
            <LayoutOptions saved={saved} current={layoutRef} currentName={layout.name} />
          </select>
        </label>
        <div className="lb-wide flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <SettingsDialog summary={settingsSummary(params, corpora, ruleSetName)}>
              <fieldset className="grid gap-2">
                <legend className="float-left col-span-full text-xs font-semibold">
                  This layout
                </legend>
                <div className="form-control min-w-0 sm:max-w-xs">
                  <span className="label-text text-xs" aria-hidden="true">
                    Author
                  </span>
                  <TextField
                    label="Author"
                    value={layout.author ?? ''}
                    mono={false}
                    className="w-full"
                    onCommit={(author) => onMeta({ author })}
                  />
                </div>
                <div className="form-control min-w-0">
                  <span className="label-text text-xs" aria-hidden="true">
                    Description
                  </span>
                  <TextAreaField
                    label="Description"
                    value={layout.description ?? ''}
                    className="w-full"
                    onCommit={(description) => onMeta({ description })}
                  />
                </div>
              </fieldset>
              <h3 className="text-xs font-semibold">What the numbers are made with</h3>
              <div className="lb-toolbar flex flex-row flex-wrap items-end gap-3">
                <AnalysisSettings
                  params={params}
                  onChange={onParams}
                  corpora={corpora}
                  ruleSetName={ruleSetName}
                  verb="Analyze"
                  afterCorpus={<MixWith corpora={corpora} params={params} onParams={onParams} />}
                  afterCounts={
                    <label className="form-control">
                      <span className="label-text text-xs">Sample</span>
                      <SampleSelect
                        value={params.sample}
                        onChange={(sample) => onParams({ sample })}
                      />
                    </label>
                  }
                  afterSwitches={
                    showCombos && (
                      <SwitchGroup legend="On the board">
                        <Switch
                          label="Combos"
                          title="Draw the combos that type on the board"
                          checked={showCombos.on}
                          onChange={showCombos.onChange}
                        />
                      </SwitchGroup>
                    )
                  }
                />
              </div>
            </SettingsDialog>
          </div>
          <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={onCompare}>
            Compare
          </button>
        </div>
      </div>
    </section>
  );
}

/** A second corpus blended into the first, and how much of each. */
function MixWith({
  corpora,
  params,
  onParams,
}: {
  corpora: CorpusManifest[];
  params: Params;
  onParams: (overrides: Partial<Params>) => void;
}) {
  return (
    <>
      <label className="form-control">
        <span className="label-text text-xs">Mix with</span>
        <select
          name="corpus2"
          aria-label="Mix with"
          className="select select-sm select-bordered"
          value={params.corpus2 ?? ''}
          onChange={(e) => onParams({ corpus2: e.target.value === '' ? null : e.target.value })}
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
        <label className="form-control lb-wide">
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
  );
}
