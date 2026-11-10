import { create } from 'zustand';

/**
 * Which stored documents were replaced under whatever has them open, as `collection/id`, so an editor
 * that holds an older copy does not save it over the version the user chose. `tick` says it changed.
 */
interface DocumentsChanged {
  tick: number;
  changed: readonly string[];
}

export const useDocumentsChanged = create<DocumentsChanged>(() => ({ tick: 0, changed: [] }));

/** Say that these documents (`collection/id`) were replaced in storage. */
export function documentsChanged(keys: readonly string[]): void {
  useDocumentsChanged.setState((s) => ({ tick: s.tick + 1, changed: keys }));
}
