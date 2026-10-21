import type { LayoutSource } from './open.js';

/**
 * The drafts this tab made: each inline link of unsaved edits it wrote, and the custom layout it is an
 * edit of, or null for a layout never saved. Saving a draft saves that layout rather than a copy
 * beside it, and opening the link again — a reload, Back — still shows the edits as unsaved. Only
 * this tab knows, and it keeps knowing across a reload: the same link opened anywhere else is a
 * layout of its own.
 */
export interface Drafts {
  /** The custom layout a draft is an edit of, null for one never saved; undefined if not a draft. */
  originOf(ref: string): string | null | undefined;
  /** The bundled or community layout a draft of one never saved was made from; null if none. */
  sourceOf(ref: string): LayoutSource | null;
  remember(ref: string, storedId: string | null, source?: LayoutSource | null): void;
  /** No longer a draft: what it holds was saved, so opening it again is opening the custom layout. */
  forget(ref: string): void;
}

const STORE_KEY = 'layerbench:origins';

type Kept = string | null | { storedId: string | null; source: LayoutSource | null };
/** Drafts kept; the oldest are forgotten first. */
const KEEP = 30;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Drafts kept in `store`, the tab's session storage in the app. One that cannot be read or written —
 * full, or blocked — still keeps them in memory until the tab closes.
 */
export function webDrafts(store: Store | null, keep = KEEP): Drafts {
  // A draft's custom layout alone, as tabs kept them first, or with what it was made from.
  let byRef: Record<string, Kept> = {};
  try {
    const parsed = JSON.parse(store?.getItem(STORE_KEY) ?? 'null') as unknown;
    if (parsed && typeof parsed === 'object') byRef = parsed as Record<string, Kept>;
  } catch {
    // Nothing readable was kept: no drafts.
  }
  const kept = (ref: string): { storedId: string | null; source: LayoutSource | null } => {
    const k = byRef[ref];
    return k !== null && typeof k === 'object' ? k : { storedId: k ?? null, source: null };
  };
  const save = () => {
    try {
      store?.setItem(STORE_KEY, JSON.stringify(byRef));
    } catch {
      // Storage full or blocked: the drafts are still known until the tab closes.
    }
  };
  return {
    originOf: (ref) => (ref in byRef ? kept(ref).storedId : undefined),
    sourceOf: (ref) => (ref in byRef ? kept(ref).source : null),
    remember(ref, storedId, source = null) {
      const { [ref]: _old, ...rest } = byRef;
      const value: Kept = source ? { storedId, source } : storedId;
      byRef = Object.fromEntries(Object.entries({ ...rest, [ref]: value }).slice(-keep));
      save();
    },
    forget(ref) {
      if (!(ref in byRef)) return;
      const { [ref]: _gone, ...rest } = byRef;
      byRef = rest;
      save();
    },
  };
}

/** The drafts of this browser tab, kept in its session storage. */
export function tabDrafts(): Drafts {
  let store: Store | null = null;
  try {
    store = window.sessionStorage;
  } catch {
    // Site data blocked: the drafts live in memory only.
  }
  return webDrafts(store);
}
