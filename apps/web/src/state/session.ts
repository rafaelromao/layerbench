import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SortKey } from '../engine/use-summaries.js';
import type { HeatMode } from '../url/params.js';
import { applyTheme, type ThemeChoice } from './theme.js';

/**
 * This browser's storage, where a write it refuses (a full quota, a window that keeps nothing) is
 * let go rather than thrown from the click that made the choice: the choice then holds for the visit
 * and the page goes on. A storage that cannot be read at all is left as it is, with the defaults.
 */
const browserStorage = createJSONStorage(() => ({
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Kept in memory only.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing was stored to remove.
    }
  },
}));

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
  /** Whether the Library leaves out the custom layouts. */
  hideCustom: boolean;
  setHideCustom: (hide: boolean) => void;
  /** Whether the Library leaves out the community layouts. */
  hideCommunity: boolean;
  setHideCommunity: (hide: boolean) => void;
  /** Categories whose layouts the Library leaves out: `standard`, `thumb_alpha`, `special`. */
  hiddenCategories: string[];
  showCategories: (categories: readonly string[], shown: boolean) => void;
  /**
   * Languages whose layouts the Library leaves out, by tag: a layout stays listed while a language
   * it declares is not among them.
   */
  hiddenLanguages: string[];
  showLanguages: (languages: readonly string[], shown: boolean) => void;
  /** Whether the Library's boards are coloured by heat. */
  libraryHeat: boolean;
  setLibraryHeat: (on: boolean) => void;
  /** What that heat measures, as Analyze's Heat does. */
  libraryHeatMode: HeatMode;
  setLibraryHeatMode: (mode: HeatMode) => void;
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
      hideCustom: false,
      setHideCustom: (hideCustom) => set({ hideCustom }),
      hideCommunity: false,
      setHideCommunity: (hideCommunity) => set({ hideCommunity }),
      hiddenCategories: [],
      showCategories: (categories, shown) => {
        const rest = get().hiddenCategories.filter((c) => !categories.includes(c));
        set({ hiddenCategories: shown ? rest : [...rest, ...categories] });
      },
      hiddenLanguages: [],
      showLanguages: (languages, shown) => {
        const rest = get().hiddenLanguages.filter((l) => !languages.includes(l));
        set({ hiddenLanguages: shown ? rest : [...rest, ...languages] });
      },
      libraryHeat: false,
      setLibraryHeat: (libraryHeat) => set({ libraryHeat }),
      libraryHeatMode: 'usage',
      setLibraryHeatMode: (libraryHeatMode) => set({ libraryHeatMode }),
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
      storage: browserStorage,
      partialize: (s) => ({
        theme: s.theme,
        editPanel: s.editPanel,
        hiddenFamilies: s.hiddenFamilies,
        librarySort: s.librarySort,
        hiddenBoards: s.hiddenBoards,
        hideCustom: s.hideCustom,
        hideCommunity: s.hideCommunity,
        hiddenCategories: s.hiddenCategories,
        hiddenLanguages: s.hiddenLanguages,
        libraryHeat: s.libraryHeat,
        libraryHeatMode: s.libraryHeatMode,
        collapsedGroups: s.collapsedGroups,
      }),
    },
  ),
);
