import { type CorpusManifest, getPreset, PRESET_IDS, type TextClass } from '@layoutmaster/core';
import type { ReactNode } from 'react';
import { FeatureSwitches } from '../components/FeatureSwitches.js';
import { HelpLink } from '../components/HelpLink.js';
import { HELP } from '../guide/help.js';
import { type Params, SAMPLE_SIZES } from '../url/params.js';
import { groupByLanguage } from './corpus-groups.js';

/**
 * The text a layout is analyzed on, by language. A corpus the list does not have, such as one named
 * by a link before the list arrives, is still offered, so the select always shows what is in use.
 */
export function CorpusSelect({
  corpora,
  value,
  onChange,
  className = '',
}: {
  corpora: CorpusManifest[];
  value: string;
  onChange: (corpus: string) => void;
  className?: string;
}) {
  return (
    <select
      name="corpus"
      aria-label="Corpus"
      className={`select select-sm select-bordered min-w-0 ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {groupByLanguage(corpora).map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
      {!corpora.some((c) => c.id === value) && <option value={value}>{value}</option>}
    </select>
  );
}

/** The rule set a layout is measured with: a preset, or the saved set a link names. */
export function RuleSetSelect({
  value,
  savedName,
  onChange,
  className = '',
}: {
  value: string;
  /** What to call a saved set (`saved:<id>`), which has no preset to take a name from. */
  savedName?: string;
  onChange: (preset: string) => void;
  className?: string;
}) {
  return (
    <select
      name="rules"
      aria-label="Rule set"
      className={`select select-sm select-bordered ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {PRESET_IDS.map((id) => (
        <option key={id} value={id}>
          {getPreset(id).name}
        </option>
      ))}
      {value.startsWith('saved:') && <option value={value}>{savedName ?? value}</option>}
    </select>
  );
}

/** What a layout is measured on: letters alone, or numbers and symbols as well. */
export function TextClassSelect({
  value,
  onChange,
  className = '',
}: {
  value: TextClass;
  onChange: (textClass: TextClass) => void;
  className?: string;
}) {
  return (
    <select
      name="text"
      aria-label="Text to count"
      className={`select select-sm select-bordered ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as TextClass)}
    >
      <option value="letters">Letters only</option>
      <option value="letters+digits">Letters and numbers</option>
      <option value="letters+digits+symbols">Letters, numbers and symbols</option>
    </select>
  );
}

/** How much of the corpus a full analysis types. */
export function SampleSelect({
  value,
  onChange,
  className = '',
}: {
  value: number;
  onChange: (sample: number) => void;
  className?: string;
}) {
  return (
    <select
      name="sample"
      aria-label="Sample size"
      className={`select select-sm select-bordered ${className}`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {SAMPLE_SIZES.map((n) => (
        <option key={n} value={n}>
          {n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}k`} symbols
        </option>
      ))}
    </select>
  );
}

/**
 * The choices every analysis is made with, drawn the same in each view that analyzes: the text,
 * the rules, what counts, the features the layouts are typed with, space and shift. A view adds its
 * own around them: a second corpus to mix in after the corpus, the sample after what counts, and
 * its buttons at the end of the switches' line.
 *
 * Laid out as fields of a toolbar (`lm-toolbar`), into which the fragment is spread: the switches
 * take a line of their own, so every view shows them in the same place.
 */
export function AnalysisSettings({
  params,
  onChange,
  corpora,
  ruleSetName,
  verb,
  afterCorpus,
  afterCounts,
  actions,
}: {
  params: Params;
  onChange: (patch: Partial<Params>) => void;
  corpora: CorpusManifest[];
  /** What to call a saved rule set the link names. */
  ruleSetName?: string;
  /** What the view does with what the switches type: "Rank", "Compare", "Analyze". */
  verb: string;
  afterCorpus?: ReactNode;
  afterCounts?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <label className="form-control lm-wide min-w-0">
        <span className="label-text text-xs">Corpus</span>
        <CorpusSelect
          corpora={corpora}
          value={params.corpus}
          onChange={(corpus) => onChange({ corpus })}
        />
      </label>
      {afterCorpus}
      <label className="form-control">
        <span className="label-text text-xs">Rules</span>
        <RuleSetSelect
          value={params.preset}
          savedName={ruleSetName}
          onChange={(preset) => onChange({ preset })}
        />
      </label>
      <label className="form-control">
        <span className="label-text text-xs">Counts</span>
        <TextClassSelect
          value={params.textClass}
          onChange={(textClass) => onChange({ textClass })}
        />
      </label>
      {afterCounts}
      <div className="lm-wide basis-full flex flex-wrap items-center gap-x-4 gap-y-1">
        <FeatureSwitches
          legend={`${verb} with`}
          without={params.without}
          onChange={(without) => onChange({ without })}
          className="max-sm:w-full"
        />
        {/* Drawn like the feature switches beside them, since they are the same kind of choice. */}
        <label className="label lm-check cursor-pointer gap-1.5 p-0">
          <input
            type="checkbox"
            name="space"
            className="checkbox checkbox-xs"
            checked={params.universe === 'with_space'}
            onChange={(e) => onChange({ universe: e.target.checked ? 'with_space' : 'no_space' })}
          />
          <span className="label-text text-xs">Include space</span>
        </label>
        <label className="label lm-check cursor-pointer gap-1.5 p-0">
          <input
            type="checkbox"
            name="case"
            className="checkbox checkbox-xs"
            checked={params.caseMode === 'model'}
            onChange={(e) => onChange({ caseMode: e.target.checked ? 'model' : 'fold' })}
          />
          <span className="label-text text-xs">Model shift</span>
        </label>
        <HelpLink help={HELP.without} />
        {actions && <div className="flex gap-2 max-sm:w-full sm:ml-auto">{actions}</div>}
      </div>
    </>
  );
}
