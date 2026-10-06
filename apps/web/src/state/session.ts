import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
    }),
    {
      name: 'layoutmaster:session',
      partialize: (s) => ({
        theme: s.theme,
        editPanel: s.editPanel,
        hiddenFamilies: s.hiddenFamilies,
      }),
    },
  ),
);
