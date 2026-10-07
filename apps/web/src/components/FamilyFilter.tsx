import { useEffect, useRef } from 'react';
import { useSession } from '../state/session.js';

/** The families a report's metrics are grouped in, in the order their sections are drawn. */
export const METRIC_FAMILIES: readonly (readonly [family: string, title: string])[] = [
  ['bigram', 'Bigrams'],
  ['skipgram', 'Skipgrams'],
  ['trigram', 'Trigrams'],
  ['usage', 'Usage'],
  ['effort', 'Effort'],
  ['layer', 'Layers'],
];

const ALL = METRIC_FAMILIES.map(([family]) => family);

/** Whether a family's metrics are shown. A family not in the list is always shown. */
export function useFamilyShown(): (family: string) => boolean {
  const hidden = useSession((s) => s.hiddenFamilies);
  return (family) => !hidden.includes(family);
}

/**
 * Checkboxes for which families of metrics are shown, with one for all of them. The choice is the
 * same in Analyze and Compare, and kept in this browser.
 */
export function FamilyFilter({ className = '' }: { className?: string }) {
  const hidden = useSession((s) => s.hiddenFamilies);
  const showFamilies = useSession((s) => s.showFamilies);
  const all = useRef<HTMLInputElement>(null);

  const shownCount = ALL.filter((f) => !hidden.includes(f)).length;
  const some = shownCount > 0 && shownCount < ALL.length;

  // "Some but not all" has no attribute of its own; it is a property set on the element.
  useEffect(() => {
    if (all.current) all.current.indeterminate = some;
  }, [some]);

  return (
    <fieldset className={`lb-rank-with flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <legend className="text-xs opacity-70 float-left mr-1">Show</legend>
      <label className="label lb-check cursor-pointer gap-1.5 p-0">
        <input
          ref={all}
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={shownCount === ALL.length}
          onChange={(e) => showFamilies(ALL, e.target.checked)}
        />
        <span className="label-text text-xs font-medium">All</span>
      </label>
      {METRIC_FAMILIES.map(([family, title]) => (
        <label key={family} className="label lb-check cursor-pointer gap-1.5 p-0">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={!hidden.includes(family)}
            onChange={(e) => showFamilies([family], e.target.checked)}
          />
          <span className="label-text text-xs">{title}</span>
        </label>
      ))}
    </fieldset>
  );
}
