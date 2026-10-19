import {
  type CorpusManifest,
  type IndexEntry,
  isLayoutLink,
  LANGUAGE_PROFILES,
  type Layout,
} from '@layerbench/core';
import { useState } from 'react';
import { Switch, SwitchGroup } from '../../components/FeatureSwitches.js';
import type { Params } from '../../url/params.js';
import { SampleSelect, SettingsFields } from '../AnalysisSelects.js';
import { TextAreaField, TextField } from '../edit/inspector/controls.js';
import { LayoutOptions } from '../LayoutOptions.js';
import { SettingsDialog, settingsSummary } from '../SettingsDialog.js';
import type { AnalysisSettingsState } from '../useAnalysisSettings.js';

/**
 * The layout in hand and what it is measured on. In sight: its name, whether it is saved and the
 * way to save it, the way to submit a custom layout to the Library, which layout this is, what the
 * numbers are made with, and the way to compare it.
 * In the Settings dialog: its author, description and link, the text and rules the numbers come from,
 * the switches, and whether the board draws the combos that type.
 */
export function LayoutBar({
  layout,
  dirty,
  saving,
  onMeta,
  onSave,
  onSubmit,
  copiesOnSave,
  layoutRef,
  onPick,
  custom,
  corpora,
  params,
  settings,
  onParams,
  onCompare,
  showCombos,
}: {
  layout: Layout;
  dirty: boolean;
  saving: boolean;
  onMeta: (meta: {
    name?: string;
    author?: string;
    description?: string;
    link?: string;
    languages?: string[];
  }) => void;
  onSave: () => void;
  /** Propose it as a community layout; absent for a layout that is not a custom one. */
  onSubmit?: () => void;
  /** Saving makes a copy, as this layout is not one of the user's custom layouts yet. */
  copiesOnSave: boolean;
  /** The layout the link names, for the picker. */
  layoutRef: string;
  onPick: (layoutRef: string) => void;
  /** The custom layouts in the Library, offered beside the bundled ones. */
  custom: IndexEntry[];
  corpora: CorpusManifest[];
  params: Params;
  /** What the numbers are made on, as far as their rule set is read. */
  settings: AnalysisSettingsState;
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
          title={copiesOnSave ? 'Save a copy in your custom layouts' : 'Keep it in the Library'}
          disabled={saving}
          onClick={onSave}
        >
          Save
        </button>
        {onSubmit && (
          <button
            type="button"
            className="btn btn-sm btn-outline shrink-0 max-sm:px-2"
            title="Propose it for the Library's community layouts, by a pull request"
            onClick={onSubmit}
          >
            Submit
          </button>
        )}
      </div>
      {/* On a phone one line, so the board and the editor under it start within the first screen:
          the picker shows the layout's name without a caption, and Settings is a gear. */}
      <div id="analyze-toolbar" className="flex items-end gap-2 sm:gap-3">
        <label className="form-control min-w-0 flex-1 sm:flex-none">
          <span className="label-text text-xs max-sm:sr-only">Layout</span>
          <select
            name="layout"
            aria-label="Layout"
            className="select select-sm select-bordered w-full sm:min-w-48"
            value={layoutRef}
            onChange={(e) => onPick(e.target.value)}
          >
            <LayoutOptions custom={custom} current={layoutRef} currentName={layout.name} />
          </select>
        </label>
        <div className="flex shrink-0 items-center gap-2 sm:min-w-0 sm:flex-1">
          <div className="sm:min-w-0 sm:flex-1">
            <SettingsDialog summary={settingsSummary(settings, corpora)} compact>
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
                {/* Keyed by the layout, so a draft left wrong in one is not shown on the next. */}
                <LinkField
                  key={layoutRef}
                  link={layout.link ?? ''}
                  onChange={(link) => onMeta({ link })}
                />
                <LanguagesField
                  languages={layout.languages ?? []}
                  onChange={(languages) => onMeta({ languages })}
                />
              </fieldset>
              <h3 className="text-xs font-semibold">What the numbers are made with</h3>
              <div className="lb-toolbar flex flex-row flex-wrap items-end gap-3">
                <SettingsFields
                  params={params}
                  onChange={onParams}
                  corpora={corpora}
                  verb="Analyze"
                  afterCounts={
                    <SampleSelect
                      value={params.sample}
                      onChange={(sample) => onParams({ sample })}
                    />
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

/**
 * Where the layout comes from: the author's keymap, firmware or page. Optional; one given is an
 * http(s) URL, and anything else stays in the field, said wrong, and is not kept.
 */
function LinkField({ link, onChange }: { link: string; onChange: (link: string) => void }) {
  const [wrong, setWrong] = useState(false);
  // A link set another way, by Undo or another layout, is not the one said wrong.
  const [shown, setShown] = useState(link);
  if (shown !== link) {
    setShown(link);
    setWrong(false);
  }
  return (
    // Typing again takes the warning away until the link is left again.
    <div className="form-control min-w-0 sm:max-w-md" onInput={() => setWrong(false)}>
      <span className="label-text text-xs" aria-hidden="true">
        Link <span className="opacity-60">(optional)</span>
      </span>
      <div className="flex items-center gap-2">
        <TextField
          label="Link"
          value={link}
          mono={false}
          placeholder="https://…"
          className={`w-full ${wrong ? 'input-error' : ''}`}
          // Escape puts the link back as it was, which is no longer wrong.
          onKeyDown={(e) => {
            if (e.key === 'Escape') setWrong(false);
          }}
          onCommit={(text) => {
            const given = text.trim();
            const ok = !given || isLayoutLink(given);
            setWrong(!ok);
            if (ok) onChange(given);
          }}
        />
        {link && !wrong && (
          <a
            className="link text-xs shrink-0"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the link (opens in a new tab)"
          >
            Open
          </a>
        )}
      </div>
      {wrong && (
        <p role="alert" className="text-xs text-error">
          A link is one address starting with http:// or https://.
        </p>
      )}
    </div>
  );
}

/**
 * The languages the layout is for. Analyze and the Library hold it to them, as well as to the
 * text's: one that is for Spanish and has no `ñ` is told so on any text. A tag with no profile here,
 * written into the JSON, is kept as it is.
 */
function LanguagesField({
  languages,
  onChange,
}: {
  languages: string[];
  onChange: (languages: string[]) => void;
}) {
  const known = Object.values(LANGUAGE_PROFILES);
  const others = languages.filter((tag) => !known.some((p) => p.tag === tag));
  const toggle = (tag: string, on: boolean) => {
    const chosen = known.map((p) => p.tag).filter((t) => (t === tag ? on : languages.includes(t)));
    onChange([...chosen, ...others]);
  };
  return (
    <fieldset className="form-control min-w-0">
      <legend className="label-text text-xs">Languages it is for</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {known.map((p) => (
          <label key={p.tag} className="label cursor-pointer gap-1.5 py-0">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={languages.includes(p.tag)}
              onChange={(e) => toggle(p.tag, e.target.checked)}
            />
            <span className="label-text text-xs">{p.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
