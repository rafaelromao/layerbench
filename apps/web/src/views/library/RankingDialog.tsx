import type { CorpusManifest } from '@layerbench/core';
import { useEffect, useRef } from 'react';
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

/** Whether the layouts saved here are listed among the bundled ones, with how many there are. */
function SavedFilter({ count }: { count: number }) {
  const hideSaved = useSession((s) => s.hideSaved);
  const setHideSaved = useSession((s) => s.setHideSaved);
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs opacity-70 mb-1">Layouts</legend>
      <label className="label lb-check cursor-pointer justify-start gap-1.5 p-0">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={!hideSaved}
          onChange={(e) => setHideSaved(!e.target.checked)}
        />
        <span className="label-text text-xs">
          Saved layouts <span className="opacity-60">({count})</span>
        </span>
      </label>
    </fieldset>
  );
}

/** Checkboxes for the boards whose layouts are listed, with one for all of them. */
function BoardFilter({ boards }: { boards: BoardChoice[] }) {
  const hidden = useSession((s) => s.hiddenBoards);
  const showBoards = useSession((s) => s.showBoards);
  const all = useRef<HTMLInputElement>(null);
  const ids = boards.map((b) => b.id);
  const shown = ids.filter((id) => !hidden.includes(id)).length;
  const some = shown > 0 && shown < ids.length;

  // "Some but not all" has no attribute of its own; it is a property set on the element.
  useEffect(() => {
    if (all.current) all.current.indeterminate = some;
  }, [some]);

  return (
    <fieldset className="space-y-1">
      <legend className="text-xs opacity-70 mb-1">Boards</legend>
      <label className="label lb-check cursor-pointer gap-1.5 p-0">
        <input
          ref={all}
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={shown === ids.length}
          onChange={(e) => showBoards(ids, e.target.checked)}
        />
        <span className="label-text text-xs font-medium">All</span>
      </label>
      <div className="grid gap-1 sm:grid-cols-2">
        {boards.map((b) => (
          <label
            key={b.id}
            className="label lb-check cursor-pointer justify-start gap-1.5 p-0 whitespace-normal"
          >
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={!hidden.includes(b.id)}
              onChange={(e) => showBoards([b.id], e.target.checked)}
            />
            <span className="label-text text-xs">
              {b.label} <span className="opacity-60">({b.count})</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What the Library ranks and lists by, in one dialog: the text, rules and switches the layouts are
 * scored with, whether saved layouts are listed, and which boards are. The order stays on the page,
 * beside it.
 */
export function RankingDialog({
  params,
  onChange,
  corpora,
  ruleSetName,
  boards,
  savedCount,
  summary,
}: {
  params: Params;
  onChange: (patch: Partial<Params>) => void;
  corpora: CorpusManifest[];
  ruleSetName?: string;
  boards: BoardChoice[];
  /** How many layouts are saved here, listed or not. */
  savedCount: number;
  /** What the button says is chosen, so the choices are visible without opening it. */
  summary: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => dialog.current?.showModal()}>
        Rank and filter
      </button>
      <span className="text-xs opacity-70">{summary}</span>

      <dialog ref={dialog} className="modal" aria-labelledby="ranking-title">
        <div className="modal-box max-w-2xl space-y-4">
          <h2 id="ranking-title" className="font-semibold text-base">
            Rank and filter
          </h2>

          <div className="lb-toolbar flex flex-row flex-wrap items-end gap-3">
            <SettingsFields
              params={params}
              onChange={onChange}
              corpora={corpora}
              ruleSetName={ruleSetName}
              verb="Rank"
            />
          </div>

          <SavedFilter count={savedCount} />
          <BoardFilter boards={boards} />

          <div className="modal-action">
            <button type="button" className="btn btn-sm" onClick={() => dialog.current?.close()}>
              Done
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  );
}
