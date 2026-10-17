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
  const shownCount = ALL.filter((f) => !hidden.includes(f)).length;

  return (
    // "Show" on a line of its own and the boxes in columns under it: two to a line on the
    // narrowest phone, three on most, four on a tablet, all seven in one line at a desk.
    <SwitchGroup
      legend="Show"
      columns="grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7"
      className={className}
      all={{ shown: shownCount, total: ALL.length, onChange: (on) => showFamilies(ALL, on) }}
    >
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
