import { BUNDLED_LAYOUTS, type IndexEntry } from '@layoutmaster/core';
import { savedRef } from '../url/params.js';

const byName = (a: { name: string; id?: string }, b: { name: string; id?: string }) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
  (a.id ?? '').localeCompare(b.id ?? '');

/** The bundled layouts in the order a picker lists them: by name. */
const BUNDLED_BY_NAME = [...BUNDLED_LAYOUTS].sort((a, b) =>
  byName({ name: a.name, id: a.id }, { name: b.name, id: b.id }),
);

/**
 * The options of a layout picker: the bundled layouts, then the ones saved in the Library, each
 * group by name, and the layout the link names when it is neither (one carried inline, or not
 * stored any more).
 */
export function LayoutOptions({
  saved,
  current,
  currentName,
}: {
  saved: IndexEntry[];
  /** The value the picker holds. */
  current: string;
  /** What to call it when no option is it. */
  currentName: string;
}) {
  const listed =
    BUNDLED_LAYOUTS.some((l) => l.id === current) || saved.some((e) => savedRef(e.id) === current);
  const savedSorted = [...saved].sort(byName);
  return (
    <>
      <optgroup label="Bundled">
        {BUNDLED_BY_NAME.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </optgroup>
      {savedSorted.length > 0 && (
        <optgroup label="Saved">
          {savedSorted.map((e) => (
            <option key={e.id} value={savedRef(e.id)}>
              {/* Two saved layouts can share a name; their ids tell them apart. */}
              {saved.filter((o) => o.name === e.name).length > 1 ? `${e.name} (${e.id})` : e.name}
            </option>
          ))}
        </optgroup>
      )}
      {!listed && <option value={current}>{currentName}</option>}
    </>
  );
}
