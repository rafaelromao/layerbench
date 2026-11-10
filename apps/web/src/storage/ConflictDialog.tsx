import type { Collection } from '@layerbench/core';
import { useEffect, useRef, useState } from 'react';
import { documentsChanged } from '../state/documents-changed.js';
import { toast } from '../state/toasts.js';
import { review, settledConflict, syncNow, useSync } from './auto-sync.js';
import { CompositeStorage, type Conflict } from './composite.js';
import { compareLink, describeDifferences } from './differences.js';
import { useStorage } from './use-storage.js';

const NOUN: Record<Collection, string> = {
  layouts: 'layout',
  rulesets: 'rule set',
  corpora: 'text',
  proposals: 'proposed change',
};

const NO_CONFLICTS: Conflict[] = [];

/**
 * The choices do nothing for this long after the dialog opens by itself: a tap meant for what was on
 * the screen a moment ago must not land on a button that overwrites a version.
 */
const ARM_MS = 400;

/** Whether focus is in something a person types in, which a dialog must not open over. */
function isTyping(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !['button', 'checkbox', 'radio', 'submit'].includes(element.type)) ||
    element.isContentEditable
  );
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** When a version was saved, as the user's own locale writes it. */
function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'at a time that is not known'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Version({ title, name, savedAt }: { title: string; name: string; savedAt: string }) {
  return (
    <div className="min-w-0 rounded-box border border-base-300 p-2 text-xs">
      <p className="font-semibold">{title}</p>
      <p className="[overflow-wrap:anywhere]">{name}</p>
      <p className="opacity-70">Saved {when(savedAt)}</p>
    </div>
  );
}

/**
 * Asks, for each document changed in this browser and in the account since the two last agreed,
 * which version to keep. One dialog holds the queue, so signing in with several of them does not
 * interrupt again and again. Nothing is replaced before the user chooses; closing it without
 * choosing leaves both as they are, flagged in the status, and it opens again on the next visit,
 * or from the status, for the same ones.
 */
export function ConflictDialog() {
  const storage = useStorage();
  const reviewing = useSync((s) => s.reviewing);
  const conflicts = useSync((s) => s.last?.conflicts ?? NO_CONFLICTS);
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [compare, setCompare] = useState<string | null>(null);
  // The one being shown stays so while it is there: a list made again by each attempt must not swap
  // the document under the user's finger.
  const [pinned, setPinned] = useState<string | null>(null);
  const current = conflicts.find((c) => `${c.collection}/${c.id}` === pinned) ?? conflicts[0];
  const open = reviewing && current !== undefined;
  const shown = current ? `${current.collection}/${current.id}` : null;
  useEffect(() => setPinned(shown), [shown]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!open) {
      if (element.open) element.close();
      return;
    }
    if (element.open) return;
    // Never over someone typing: the next key would land on a button that overwrites a version.
    // It waits until they leave the field, however long that is.
    let cancelled = false;
    const tryOpen = () => {
      if (cancelled || element.open) return;
      if (isTyping(document.activeElement)) {
        document.addEventListener('focusout', () => setTimeout(tryOpen), { once: true });
      } else {
        element.showModal();
        // It opens by itself, so onto the one button that overwrites nothing: the browser's own
        // choice is the first button, which Space or Enter would press.
        element.querySelector<HTMLElement>('[data-first]')?.focus();
      }
    };
    tryOpen();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setArmed(false);
      return;
    }
    const timer = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setCompare(null);
    if (!current) return;
    let cancelled = false;
    compareLink(current)
      .then((link) => {
        if (!cancelled) setCompare(link);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current]);

  const settle = async (choice: 'mine' | 'theirs') => {
    if (!current || !(storage instanceof CompositeStorage)) return;
    setBusy(true);
    const kept = choice === 'mine' ? "this browser's" : "GitHub's";
    try {
      const result =
        choice === 'mine' ? await storage.keepMine(current) : await storage.keepTheirs(current);
      if (result === 'kept') {
        settledConflict(current);
        // This browser's copy was replaced by the account's: an editor that has it open is told.
        if (choice === 'theirs') documentsChanged([`${current.collection}/${current.id}`]);
        toast.info(`Kept ${kept} version of ${current.name}`);
      } else if (result === 'edited') {
        // Not the account that changed: this browser's own copy was edited after the dialog showed it.
        toast.error(
          `${current.name} was edited in this browser since you were shown it, so nothing was replaced. Choose again.`,
        );
      } else if (result === 'gone') {
        // Deleted from the account since: nothing there to keep, and this browser's is not thrown away.
        settledConflict(current);
        toast.info(
          `${current.name} was deleted from your GitHub account since, so this browser's version stays and is sent again.`,
        );
        syncNow();
      } else {
        toast.error(
          `${current.name} changed again in your GitHub account, so nothing was replaced. Choose again.`,
        );
        syncNow();
      }
    } catch (e) {
      toast.error(
        `Could not keep ${kept} version of ${current.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      // Back to the safe place, rather than wherever the disabled buttons left it.
      requestAnimationFrame(() =>
        dialog.current?.querySelector<HTMLElement>('[data-first]')?.focus(),
      );
    }
  };

  const differences = current ? describeDifferences(current.mine.doc, current.theirs.doc) : [];

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="conflict-title"
      onClose={() => review(false)}
    >
      {current && (
        <div className="modal-box max-w-lg space-y-3">
          <div>
            <h2 id="conflict-title" className="font-semibold text-base [overflow-wrap:anywhere]">
              Two versions of {current.name}
            </h2>
            <p className="text-xs opacity-70">
              {conflicts.length > 1
                ? `${capital(NOUN[current.collection])} 1 of ${conflicts.length} to choose`
                : `One ${NOUN[current.collection]} to choose`}
            </p>
          </div>
          <p className="text-xs">
            This {NOUN[current.collection]} is not the same in this browser and in your GitHub
            account, and neither is known to be an edit of the other: both were changed since they
            last agreed, or this browser cannot tell which is the older. Choose the version to keep:
            nothing is replaced until you do.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Version title="This browser" name={current.name} savedAt={current.mine.updatedAt} />
            <Version
              title="Your GitHub account"
              name={current.theirs.name}
              savedAt={current.theirs.updatedAt}
            />
          </div>
          <div className="text-xs">
            <p className="font-semibold">What differs</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {differences.map((line, position) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are text, and two can read alike
                <li key={`${position}:${line}`} className="[overflow-wrap:anywhere]">
                  {line}
                </li>
              ))}
            </ul>
            {compare && (
              <a className="link mt-1 inline-block" href={compare} target="_blank" rel="noreferrer">
                Compare them side by side (opens in a new tab)
              </a>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-outline flex-1"
              disabled={busy || !armed}
              onClick={() => void settle('mine')}
            >
              Keep mine
            </button>
            <button
              type="button"
              className="btn btn-outline flex-1"
              disabled={busy || !armed}
              onClick={() => void settle('theirs')}
            >
              Keep theirs
            </button>
          </div>
          <p className="text-xs opacity-70">
            Keep mine sends this browser's version to your account; Keep theirs replaces this
            browser's with the account's.
          </p>
          <div className="modal-action">
            {/* Where focus lands when it opens, as it can open under someone's fingers: the one
                button that overwrites nothing (it is put there when the dialog opens). */}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              data-first
              onClick={() => review(false)}
            >
              Decide later
            </button>
          </div>
        </div>
      )}
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}
