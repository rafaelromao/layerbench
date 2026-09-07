import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyTheme, type ThemeChoice } from './theme.js';

export interface GitHubSettings {
  repo: string;
  branch: string;
  path: string;
  enabled: boolean;
}

const TOKEN_KEY = 'layoutmaster:github-token';

/** The token is read and written on its own, so a dump of the preferences never contains it. */
function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A browser with site data disabled simply forgets the token between visits.
  }
}

/**
 * Per-browser preferences. Nothing here belongs in a shareable link: the URL carries what an
 * analysis is, this carries how one person likes to look at it, and where their documents live.
 */
interface SessionState {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
  editPanel: string;
  setEditPanel: (panel: string) => void;
  collapsedFamilies: string[];
  toggleFamily: (family: string) => void;
  github: GitHubSettings;
  setGitHub: (patch: Partial<GitHubSettings>) => void;
  githubToken: string;
  setGitHubToken: (token: string) => void;
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
      github: { repo: '', branch: 'main', path: 'data', enabled: false },
      setGitHub: (patch) => set({ github: { ...get().github, ...patch } }),
      githubToken: readToken(),
      setGitHubToken: (githubToken) => {
        writeToken(githubToken);
        set({ githubToken });
      },
    }),
    {
      name: 'layoutmaster:session',
      // The token is deliberately absent from what gets persisted here.
      partialize: (s) => ({
        theme: s.theme,
        editPanel: s.editPanel,
        collapsedFamilies: s.collapsedFamilies,
        github: s.github,
      }),
    },
  ),
);

/** Whether the repository is configured well enough to use. */
export function gitHubReady(state: Pick<SessionState, 'github' | 'githubToken'>): boolean {
  return state.github.enabled && state.github.repo.includes('/') && state.githubToken !== '';
}
