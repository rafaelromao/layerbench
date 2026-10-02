import { useEffect } from 'react';
import { create } from 'zustand';
import { type Params, type RawSearch, selectionSearch } from '../url/params.js';

/**
 * The analysis choices in force: the ones last made in a view that analyzes, so moving to another
 * view keeps them. Only links read this. Each view still takes what it shows from its own URL, so
 * a link opens the same analysis wherever it is followed. It is kept for the tab and not stored:
 * a fresh visit starts from what its link says.
 */
interface SelectionState {
  /** As query keys, ready to put in a link; null until a view that analyzes has been opened. */
  search: RawSearch | null;
  remember: (params: Params) => void;
}

export const useSelection = create<SelectionState>()((set, get) => ({
  search: null,
  remember: (params) => {
    const next = selectionSearch(params);
    const current = get().search;
    // The same choices give the same keys in the same order, so this is enough to tell them apart.
    if (current && JSON.stringify(current) === JSON.stringify(next)) return;
    set({ search: next });
  },
}));

/** Keep the choices a view is showing as the ones in force, for the links to other views. */
export function useRememberSelection(params: Params): void {
  const remember = useSelection((s) => s.remember);
  useEffect(() => remember(params), [remember, params]);
}

/**
 * The choices in force, with what a link sets itself on top: "this corpus", "this rule set". A key
 * the link sets to undefined is left out, as a second corpus is by "analyze with this corpus".
 */
export function useCarried(): (own?: RawSearch) => RawSearch {
  const search = useSelection((s) => s.search);
  return (own = {}) => {
    const out: RawSearch = { ...(search ?? {}), ...own };
    for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
    return out;
  };
}
