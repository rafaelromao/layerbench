/**
 * The drafts this tab made: each inline link of unsaved edits it wrote, and the saved layout it is an
 * edit of, or null for a layout never saved. Saving a draft saves that layout rather than a copy
 * beside it, and opening the link again — a reload, Back — still shows the edits as unsaved. Only
 * this tab knows, and it keeps knowing across a reload: the same link opened anywhere else is a
 * layout of its own.
 */
export interface Drafts {
  /** The saved layout a draft is an edit of, null for one never saved; undefined if not a draft. */
  originOf(ref: string): string | null | undefined;
  remember(ref: string, storedId: string | null): void;
  /** No longer a draft: what it holds was saved, so opening it again is opening the saved layout. */
  forget(ref: string): void;
}

const STORE_KEY = 'layerbench:origins';
/** Drafts kept; the oldest are forgotten first. */
const KEEP = 30;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Drafts kept in `store`, the tab's session storage in the app. One that cannot be read or written —
 * full, or blocked — still keeps them in memory until the tab closes.
 */
export function webDrafts(store: Store | null, keep = KEEP): Drafts {
  let byRef: Record<string, string | null> = {};
  try {
    const parsed = JSON.parse(store?.getItem(STORE_KEY) ?? 'null') as unknown;
    if (parsed && typeof parsed === 'object') byRef = parsed as Record<string, string | null>;
  } catch {
    // Nothing readable was kept: no drafts.
  }
  const save = () => {
    try {
      store?.setItem(STORE_KEY, JSON.stringify(byRef));
    } catch {
      // Storage full or blocked: the drafts are still known until the tab closes.
    }
  };
  return {
    originOf: (ref) => (ref in byRef ? byRef[ref] : undefined),
    remember(ref, storedId) {
      const { [ref]: _old, ...rest } = byRef;
      byRef = Object.fromEntries(Object.entries({ ...rest, [ref]: storedId }).slice(-keep));
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
