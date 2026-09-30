import { FEATURE_KINDS, FEATURE_LABELS, type FeatureKind } from '@layoutmaster/core';

/** "magic keys, typing combos and multi-letter macros". */
export function featureList(features: readonly FeatureKind[]): string {
  const names = features.map((f) => FEATURE_LABELS[f].toLowerCase());
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * One switch per special feature a layout is typed with. Unticking one types every layout here
 * without it, as `off=` in the link: the Library ranks that way, Compare compares that way, and
 * Analyze, opened from either, analyzes the same way.
 */
export function FeatureSwitches({
  legend,
  without,
  onChange,
  className = '',
}: {
  legend: string;
  without: readonly FeatureKind[];
  onChange: (without: FeatureKind[]) => void;
  className?: string;
}) {
  return (
    <fieldset className={`lm-rank-with flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <legend className="text-xs opacity-70 float-left mr-1">{legend}</legend>
      {FEATURE_KINDS.map((kind) => (
        <label key={kind} className="label cursor-pointer gap-1.5 p-0">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={!without.includes(kind)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? without.filter((k) => k !== kind)
                  : FEATURE_KINDS.filter((k) => k === kind || without.includes(k)),
              )
            }
          />
          <span className="label-text text-xs">{FEATURE_LABELS[kind]}</span>
        </label>
      ))}
    </fieldset>
  );
}
