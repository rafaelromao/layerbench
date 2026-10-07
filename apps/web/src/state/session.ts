import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SortKey } from '../engine/use-summaries.js';
import { applyTheme, type ThemeChoice } from './theme.js';

/**
 * Per-browser preferences. Nothing here belongs in a shareable link: the URL carries what an
 * analysis is, this carries how one person likes to look at it.
 */
interface SessionState {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
  editPanel: string;
  setEditPanel: (panel: string) => void;
  /** Metric families whose sections Analyze and Compare hide; the same in every view. */
  hiddenFamilies: string[];
  showFamilies: (families: readonly string[], shown: boolean) => void;
  /** How the Library sorts its layouts. */
  librarySort: SortKey;
  setLibrarySort: (sort: SortKey) => void;
  /** Boards whose layouts the Library leaves out, by preset id (`custom` for any other board). */
  hiddenBoards: string[];
  showBoards: (boards: readonly string[], shown: boolean) => void;
  /** Whether the Library leaves out the layouts saved in this browser or account. */
  hideSaved: boolean;
  setHideSaved: (hide: boolean) => void;
  /** The groups of Analyze and Compare folded away, by id; the same in every visit. */
  collapsedGroups: string[];
  toggleGroup: (group: string) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      editPanel: 'layers',
      setEditPanel: (editPanel) => set({ editPanel }),
      hiddenFamilies: [],
      showFamilies: (families, shown) => {
        const rest = get().hiddenFamilies.filter((f) => !families.includes(f));
        set({ hiddenFamilies: shown ? rest : [...rest, ...families] });
      },
      librarySort: 'effort',
      setLibrarySort: (librarySort) => set({ librarySort }),
      hiddenBoards: [],
      showBoards: (boards, shown) => {
        const rest = get().hiddenBoards.filter((b) => !boards.includes(b));
        set({ hiddenBoards: shown ? rest : [...rest, ...boards] });
      },
      hideSaved: false,
      setHideSaved: (hideSaved) => set({ hideSaved }),
      collapsedGroups: [],
      toggleGroup: (group) => {
        const current = get().collapsedGroups;
        set({
          collapsedGroups: current.includes(group)
            ? current.filter((g) => g !== group)
            : [...current, group],
        });
      },
    }),
    {
      name: 'layerbench:session',
      partialize: (s) => ({
        theme: s.theme,
        editPanel: s.editPanel,
        hiddenFamilies: s.hiddenFamilies,
        librarySort: s.librarySort,
        hiddenBoards: s.hiddenBoards,
        hideSaved: s.hideSaved,
        collapsedGroups: s.collapsedGroups,
      }),
    },
  ),
);
