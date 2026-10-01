import { type CorpusManifest, getPreset, PRESET_IDS } from '@layoutmaster/core';
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
