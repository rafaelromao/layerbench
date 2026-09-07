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
  /** Panel selected in the editor, remembered between visits. */
  editPanel: string;
  setEditPanel: (panel: string) => void;
  collapsedFamilies: string[];
  toggleFamily: (family: string) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      editPanel: 'binding',
      setEditPanel: (editPanel) => set({ editPanel }),
      collapsedFamilies: [],
      toggleFamily: (family) => {
        const current = get().collapsedFamilies;
        set({
          collapsedFamilies: current.includes(family)
            ? current.filter((f) => f !== family)
            : [...current, family],
        });
      },
    }),
    { name: 'layoutmaster:session' },
  ),
);
