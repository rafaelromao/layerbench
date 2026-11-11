import type { Collection } from '@layerbench/core';
import { useEffect, useRef, useState } from 'react';
import { toast } from '../state/toasts.js';
import { deleteMissing, sendMissing, useSync } from './auto-sync.js';
import { CompositeStorage } from './composite.js';
import type { Missing } from './unsynced.js';
import { useRefreshCollections, useStorage } from './use-storage.js';

const NOUN: Record<Collection, string> = {
  layouts: 'layout',
  rulesets: 'rule set',
  corpora: 'text',
  proposals: 'proposed change',
};

/** The collections to list again once `keys` (`collection/id`) are gone. */
function collectionsOf(keys: readonly string[]): Collection[] {
  return [...new Set(keys.map((k) => k.split('/')[0] as Collection))];
}

/**
 * One document the account lacks, with what can be done about it where it is listed: send it, or
 * delete it from this browser, which asks first, in the row, since nothing else has a copy.
 */
function Row({
  document,
  busy,
  onSend,
  onDelete,
}: {
  document: Missing;
  /** Something is being done to a document of the list: nothing else is started meanwhile. */
  busy: boolean;
  onSend: () => Promise<boolean>;
  /** Whether it was deleted; if not, the row goes back to asking nothing. */
  onDelete: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const remove = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  // Focus goes to the choice that deletes nothing, and back to Delete if the user keeps it.
  const returning = useRef(false);
  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (returning.current) {
      returning.current = false;
      remove.current?.focus();
    }
  }, [confirming]);

  const back = () => {
    returning.current = true;
    setConfirming(false);
  };
  // A button that is busy keeps focus, as one that is disabled would lose it, and does nothing.
  const guard = (act: () => void) => () => {
    if (!busy) act();
  };
  const busyClass = busy ? ' opacity-60' : '';

  const { name } = document;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-current/20 border-t py-1">
      {confirming ? (
        <fieldset className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <legend className="sr-only">Delete {name}?</legend>
          <p className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">
            Delete <span className="font-semibold">{name}</span> from this browser? It is not in
            your GitHub account as last checked, so it will be gone for good.
          </p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className={`btn btn-xs btn-neutral${busyClass}`}
              aria-label={`Delete ${name} for good`}
              aria-disabled={busy}
              onClick={guard(() => void onDelete().then((gone) => gone || back()))}
            >
              Delete
            </button>
            <button
              ref={keep}
              type="button"
              className={`btn btn-xs btn-outline${busyClass}`}
              aria-label={`Keep ${name}`}
              aria-disabled={busy}
              onClick={guard(back)}
            >
              Keep
            </button>
          </div>
        </fieldset>
      ) : (
        <>
          <span className="min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]">
            <span className="font-semibold">{name}</span>{' '}
            <span className="opacity-80">
              · {NOUN[document.collection]}
              {document.sent ? ', was in a GitHub account before' : ''}
            </span>
          </span>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className={`btn btn-xs btn-outline${busyClass}`}
              aria-label={`Send ${name} to your GitHub account`}
              aria-disabled={busy}
              onClick={guard(() => void onSend())}
            >
              Send
            </button>
            <button
              ref={remove}
              type="button"
              className={`btn btn-xs btn-outline${busyClass}`}
              aria-label={`Delete ${name} from this browser`}
              aria-disabled={busy}
              onClick={guard(() => setConfirming(true))}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/**
 * The documents saved in this browser that the account does not have, one to a row, each to be sent
 * or deleted from here: for the status that says the account lacks some, to say which. A long list
 * scrolls, so the status keeps its height.
 */
export function MissingDocuments() {
  const storage = useStorage();
  const missing = useSync((s) => s.missing);
  const refresh = useRefreshCollections();
  const list = useRef<HTMLUListElement>(null);
  const [busy, setBusy] = useState(false);
  if (!missing || missing.length === 0) return null;

  const focusNear = (at: number) =>
    requestAnimationFrame(() => {
      const rows = list.current?.querySelectorAll<HTMLElement>(':scope > li');
      rows?.[Math.min(at, rows.length - 1)]?.querySelector('button')?.focus();
    });

  /** Whether the document was deleted. */
  const remove = async (document: Missing, at: number): Promise<boolean> => {
    if (!(storage instanceof CompositeStorage)) return false;
    setBusy(true);
    try {
      const gone = await deleteMissing(storage, document);
      if (gone === null) {
        toast.info(
          `${document.name} was saved again since you were shown it, so it was not deleted.`,
        );
        return false;
      }
      toast.info(`Deleted ${document.name} from this browser`);
      refresh(collectionsOf(gone));
      focusNear(at);
      return true;
    } catch (e) {
      toast.error(
        `Could not delete ${document.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Whether the document was sent, and so is off the list. */
  const send = async (document: Missing, at: number): Promise<boolean> => {
    if (!(storage instanceof CompositeStorage)) return false;
    setBusy(true);
    try {
      const sent = await sendMissing(storage, document);
      if (sent) focusNear(at);
      return sent;
    } finally {
      setBusy(false);
    }
  };

  return (
    <ul
      ref={list}
      aria-label="Documents saved in this browser that are not in your GitHub account"
      className="max-h-36 w-full overflow-y-auto sm:max-h-44"
    >
      {missing.map((document, at) => (
        <Row
          key={`${document.collection}/${document.id}`}
          document={document}
          busy={busy}
          onSend={() => send(document, at)}
          onDelete={() => remove(document, at)}
        />
      ))}
    </ul>
  );
}
