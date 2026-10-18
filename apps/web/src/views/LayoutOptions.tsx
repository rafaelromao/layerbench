import { BUNDLED_LAYOUTS, type IndexEntry } from '@layerbench/core';
import { useEffect } from 'react';
import { readCommunityOnce, useCommunity } from '../community/community.js';
import { communityRef } from '../community/ref.js';
import { customRef } from '../custom/ref.js';

const byName = (a: { name: string; id?: string }, b: { name: string; id?: string }) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
  (a.id ?? '').localeCompare(b.id ?? '');

/** The bundled layouts in the order a picker lists them: by name. */
const BUNDLED_BY_NAME = [...BUNDLED_LAYOUTS].sort((a, b) =>
  byName({ name: a.name, id: a.id }, { name: b.name, id: b.id }),
);

/**
 * The options of a layout picker: the bundled layouts, the community ones, then the custom ones,
 * each group by name, and the layout the link names when it is neither (one carried inline, or not
 * stored any more).
 */
export function LayoutOptions({
  custom,
  current,
  currentName,
}: {
  custom: IndexEntry[];
  /** The value the picker holds. */
  current: string;
  /** What to call it when no option is it. */
  currentName: string;
}) {
  const community = useCommunity((s) => s.layouts);
  // A picker offers them without the Library having been opened first.
  useEffect(() => {
    readCommunityOnce();
  }, []);
  const listed =
    BUNDLED_LAYOUTS.some((l) => l.id === current) ||
    community.some((l) => communityRef(l.id as string) === current) ||
    custom.some((e) => customRef(e.id) === current);
  const communitySorted = [...community].sort(byName);
  const customSorted = [...custom].sort(byName);
  return (
    <>
      <optgroup label="Bundled">
        {BUNDLED_BY_NAME.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </optgroup>
      {communitySorted.length > 0 && (
        <optgroup label="Community">
          {communitySorted.map((l) => (
            <option key={l.id} value={communityRef(l.id as string)}>
              {l.name}
            </option>
          ))}
        </optgroup>
      )}
      {customSorted.length > 0 && (
        <optgroup label="Custom">
          {customSorted.map((e) => (
            <option key={e.id} value={customRef(e.id)}>
              {/* Two custom layouts can share a name; their ids tell them apart. */}
              {custom.filter((o) => o.name === e.name).length > 1 ? `${e.name} (${e.id})` : e.name}
            </option>
          ))}
        </optgroup>
      )}
      {!listed && <option value={current}>{currentName}</option>}
    </>
  );
}
