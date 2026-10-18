import { CATEGORY_NAMES, type CorpusManifest, type LayoutCategory } from '@layerbench/core';
import { Switch, SwitchGroup } from '../../components/FeatureSwitches.js';
import type { SortKey } from '../../engine/use-summaries.js';
import { useSession } from '../../state/session.js';
import type { Params } from '../../url/params.js';
import { SettingsFields } from '../AnalysisSelects.js';

export const SORTS: [SortKey, string][] = [
  ['effort', 'Effort'],
  ['sfb', 'SFB'],
  ['name', 'Name'],
];

export interface BoardChoice {
  id: string;
  label: string;
  /** How many listed layouts are on it. */
  count: number;
}

export interface CategoryChoice {
  id: LayoutCategory;
  /** How many listed layouts are in it. */
  count: number;
}

/** Whether the custom layouts are listed among the bundled ones, with how many there are. */
function CustomFilter({ count }: { count: number }) {
  const hideCustom = useSession((s) => s.hideCustom);
  const setHideCustom = useSession((s) => s.setHideCustom);
  return (
    <SwitchGroup legend="Layouts">
      <Switch
        label="Custom layouts"
        count={count}
        checked={!hideCustom}
        onChange={(on) => setHideCustom(!on)}
      />
    </SwitchGroup>
  );
}

/** Checkboxes for the categories whose layouts are listed, with one for all of them. */
function CategoryFilter({ categories }: { categories: CategoryChoice[] }) {
  const hidden = useSession((s) => s.hiddenCategories);
  const showCategories = useSession((s) => s.showCategories);
  const ids = categories.map((c) => c.id);
  return (
    <SwitchGroup
      legend="Categories"
      all={{
        shown: ids.filter((id) => !hidden.includes(id)).length,
        total: ids.length,
        onChange: (on) => showCategories(ids, on),
      }}
    >
      {categories.map((c) => (
        <Switch
          key={c.id}
          label={CATEGORY_NAMES[c.id]}
          count={c.count}
          checked={!hidden.includes(c.id)}
          onChange={(on) => showCategories([c.id], on)}
        />
      ))}
    </SwitchGroup>
  );
}

/** Checkboxes for the boards whose layouts are listed, with one for all of them. */
function BoardFilter({ boards }: { boards: BoardChoice[] }) {
  const hidden = useSession((s) => s.hiddenBoards);
  const showBoards = useSession((s) => s.showBoards);
  const ids = boards.map((b) => b.id);
  return (
    // Board names are long: one to a line on a phone, two from 640px.
    <SwitchGroup
      legend="Boards"
      columns="grid-cols-1 sm:grid-cols-2"
      all={{
        shown: ids.filter((id) => !hidden.includes(id)).length,
        total: ids.length,
        onChange: (on) => showBoards(ids, on),
      }}
    >
      {boards.map((b) => (
        <Switch
          key={b.id}
          label={b.label}
          count={b.count}
          checked={!hidden.includes(b.id)}
          onChange={(on) => showBoards([b.id], on)}
        />
      ))}
    </SwitchGroup>
  );
}

/**
 * What the Library ranks and lists by, drawn in its Rank and filter dialog: the text, rules and
 * switches the layouts are scored with, whether custom layouts are listed, and which categories
 * and boards are. The order stays on the page, beside it.
 */
export function RankFilters({
  params,
  onChange,
  corpora,
  boards,
  categories,
  customCount,
}: {
  params: Params;
  onChange: (patch: Partial<Params>) => void;
  corpora: CorpusManifest[];
  boards: BoardChoice[];
  categories: CategoryChoice[];
  /** How many custom layouts there are, listed or not. */
  customCount: number;
}) {
  return (
    <>
      <div className="lb-toolbar flex flex-row flex-wrap items-end gap-3">
        <SettingsFields params={params} onChange={onChange} corpora={corpora} verb="Rank" />
      </div>
      <CustomFilter count={customCount} />
      <CategoryFilter categories={categories} />
      <BoardFilter boards={boards} />
    </>
  );
}
