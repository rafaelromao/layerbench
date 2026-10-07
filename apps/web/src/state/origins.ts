import { create } from 'zustand';
import { parseLayoutRef } from '../url/params.js';

/**
 * The drafts this tab made: each inline snapshot of unsaved edits it wrote into a link, and the
 * stored layout it is a draft of, or null for a layout never stored. Analyze writes unsaved edits
 * into its link as an inline layout, which names no stored layout; the tab remembers which one they
 * are edits of, so saving them saves that layout rather than a copy beside it, and so opening the
 * link again — a reload, Back — still shows them as unsaved. Only this tab knows, and it keeps
 * knowing across a reload: the same link opened anywhere else is a layout of its own.
 */
interface OriginsState {
  byInline: Record<string, string | null>;
  remember: (inline: string, id: string | null) => void;
}

const STORE_KEY = 'layerbench:origins';
/** Drafts kept; the oldest are forgotten first. */
const KEEP = 30;

function load(): Record<string, string | null> {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}

function save(byInline: Record<string, string | null>): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(byInline));
  } catch {
    // Storage full or blocked: the drafts are still known until the tab closes.
  }
}

export const useOrigins = create<OriginsState>()((set, get) => ({
  byInline: load(),
  remember: (inline, id) => {
    const { [inline]: _old, ...rest } = get().byInline;
    const entries = Object.entries({ ...rest, [inline]: id });
    const byInline = Object.fromEntries(entries.slice(-KEEP));
    save(byInline);
    set({ byInline });
  },
}));

/** Is this reference a draft this tab made, of a stored layout or of one never stored? */
export function draftOf(layoutRef: string): { storedId: string | null } | null {
  const byInline = useOrigins.getState().byInline;
  return parseLayoutRef(layoutRef).kind === 'inline' && layoutRef in byInline
    ? { storedId: byInline[layoutRef] }
    : null;
}

/** The stored layout a reference names, or for a draft this tab made, the one it is a draft of. */
export function storedIdOf(layoutRef: string): string | null {
  const ref = parseLayoutRef(layoutRef);
  if (ref.kind === 'saved') return ref.value;
  if (ref.kind === 'inline') return useOrigins.getState().byInline[layoutRef] ?? null;
  return null;
}
