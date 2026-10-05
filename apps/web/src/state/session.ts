import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyTheme, type ThemeChoice } from './theme.js';

/**
 * Where the personal access token of earlier versions was kept. Signing in with GitHub replaced
 * it, so whatever is left there is removed rather than left lying in the browser.
 */
const OLD_TOKEN_KEY = 'layoutmaster:github-token';

try {
  localStorage.removeItem(OLD_TOKEN_KEY);
} catch {
  // Nothing can have been kept where nothing can be read.
}

/**
 * Per-browser preferences. Nothing here belongs in a shareable link: the URL carries what an
 * analysis is, this carries how one person likes to look at it.
 */
interface SessionState {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
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
      editPanel: 'layers',
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
    {
      name: 'layoutmaster:session',
      // Version 1 dropped the repository settings, which signing in with GitHub replaced.
      version: 1,
      migrate: (persisted) => {
        const { github: _github, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return rest as unknown as SessionState;
      },
      partialize: (s) => ({
        theme: s.theme,
        editPanel: s.editPanel,
        collapsedFamilies: s.collapsedFamilies,
      }),
    },
  ),
);
