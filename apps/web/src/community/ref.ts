import { isDocumentId } from '@layerbench/core';

/**
 * How a link names a community layout, one accepted into the Library from someone else, by its id:
 * `community:<id>`. This is the only place that spells it.
 */
const COMMUNITY = 'community:';

export function communityRef(id: string): string {
  return `${COMMUNITY}${id}`;
}

/** The id a reference names a community layout by, or null when it names none. */
export function communityId(ref: string): string | null {
  if (!ref.startsWith(COMMUNITY)) return null;
  const id = ref.slice(COMMUNITY.length);
  return isDocumentId(id) ? id : null;
}
