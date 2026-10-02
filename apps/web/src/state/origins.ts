import { create } from 'zustand';
import { parseLayoutRef } from '../url/params.js';

/**
 * The stored layout each inline snapshot this tab made was taken of. The editor sends unsaved edits
 * to Analyze as an inline link, which names no stored layout, and Analyze sends them back the same
 * way; the tab remembers which layout they are edits of, so saving them saves that layout rather
 * than a copy beside it. Only this tab knows: the same link opened anywhere else is a layout of its
 * own, and saving it there makes a new one, never one of that browser's own.
 */
interface OriginsState {
  byInline: Record<string, string>;
  remember: (inline: string, id: string) => void;
}

export const useOrigins = create<OriginsState>()((set, get) => ({
  byInline: {},
  remember: (inline, id) => set({ byInline: { ...get().byInline, [inline]: id } }),
}));

/** The stored layout a reference names, or for a snapshot this tab took, the one it was taken of. */
export function storedIdOf(layoutRef: string): string | null {
  const ref = parseLayoutRef(layoutRef);
  if (ref.kind === 'saved') return ref.value;
  if (ref.kind === 'inline') return useOrigins.getState().byInline[layoutRef] ?? null;
  return null;
}
