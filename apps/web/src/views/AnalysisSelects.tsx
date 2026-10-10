import { type CorpusManifest, getPreset, PRESET_IDS, type TextClass } from '@layerbench/core';
import type { ReactNode } from 'react';
import { FeatureSwitches, Switch } from '../components/FeatureSwitches.js';
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

/** "100k symbols". */
export function sampleLabel(n: number): string {
  return `${n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}k`} symbols`;
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
          {sampleLabel(n)}
        </option>
      ))}
    </select>
  );
}

/**
 * The choices every analysis is made with, drawn the same in each view that analyzes: the text and
 * a second one to mix in, the rules, what counts, the features the layouts are typed with, space
 * and shift. A view adds its own around them: the sample after what counts, and switches of its
 * own after the others, lined up with them.
 *
 * Laid out as fields of a toolbar (`lb-toolbar`), into which the fragment is spread: the switches
 * take a line of their own, so every view shows them in the same place.
 */
export function SettingsFields({
  params,
  onChange,
  corpora,
  ruleSetName,
  verb,
  afterCounts,
  afterSwitches,
}: {
  params: Params;
  onChange: (patch: Partial<Params>) => void;
  corpora: CorpusManifest[];
  /** What to call a saved rule set the link names. */
  ruleSetName?: string;
  /** What the view does with what the switches type: "Rank", "Compare", "Analyze". */
  verb: string;
  afterCounts?: ReactNode;
  afterSwitches?: ReactNode;
}) {
  return (
    <>
      <label className="form-control lb-wide min-w-0">
        <span className="label-text text-xs">Corpus</span>
        <CorpusSelect
          corpora={corpora}
          value={params.corpus}
          onChange={(corpus) => onChange({ corpus })}
        />
      </label>
      <MixWith corpora={corpora} params={params} onParams={onChange} />
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
      <div className="lb-wide basis-full space-y-3">
        <FeatureSwitches
          legend={`${verb} with`}
          help={<HelpLink help={HELP.without} />}
          without={params.without}
          onChange={(without) => onChange({ without })}
        >
          {/* The same kind of choice as the features, so drawn among them. */}
          <Switch
            label="Space"
            name="space"
            title="Count the space bar's presses"
            checked={params.universe === 'with_space'}
            onChange={(on) => onChange({ universe: on ? 'with_space' : 'no_space' })}
          />
          <Switch
            label="Shift"
            name="case"
            title="Type capitals with the shift key, rather than count them as lower case"
            checked={params.caseMode === 'model'}
            onChange={(on) => onChange({ caseMode: on ? 'model' : 'fold' })}
          />
        </FeatureSwitches>
        {afterSwitches}
      </div>
    </>
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
