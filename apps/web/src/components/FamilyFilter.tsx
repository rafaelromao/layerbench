import { useEffect, useRef } from 'react';
import { useSession } from '../state/session.js';
import { Switch, SwitchGroup } from './FeatureSwitches.js';

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
    // "Show" on a line of its own and the boxes in columns under it: two to a line on the
    // narrowest phone, three on most, four on a tablet, all seven in one line at a desk.
    <SwitchGroup
      legend="Show"
      columns="grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7"
      className={className}
    >
      <Switch
        label="All"
        strong
        inputRef={all}
        checked={shownCount === ALL.length}
        onChange={(on) => showFamilies(ALL, on)}
      />
      {METRIC_FAMILIES.map(([family, title]) => (
        <Switch
          key={family}
          label={title}
          checked={!hidden.includes(family)}
          onChange={(on) => showFamilies([family], on)}
        />
      ))}
    </SwitchGroup>
  );
}
