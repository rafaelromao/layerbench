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
  busy: boolean;
  onSend: () => void;
  onDelete: () => void;
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

  const { name } = document;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-current/20 border-t py-1">
      {confirming ? (
        <fieldset className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <legend className="sr-only">Delete {name}?</legend>
          <p className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">
            Delete <span className="font-semibold">{name}</span> from this browser? It is not in
            your GitHub account, so it will be gone for good.
          </p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="btn btn-xs btn-neutral"
              aria-label={`Delete ${name} for good`}
              disabled={busy}
              onClick={onDelete}
            >
              Delete
            </button>
            <button
              ref={keep}
              type="button"
              className="btn btn-xs btn-outline"
              aria-label={`Keep ${name}`}
              disabled={busy}
              onClick={() => {
                returning.current = true;
                setConfirming(false);
              }}
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
              {document.sent ? ', was in your account once' : ''}
            </span>
          </span>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="btn btn-xs btn-outline"
              aria-label={`Send ${name} to your GitHub account`}
              disabled={busy}
              onClick={onSend}
            >
              Send
            </button>
            <button
              ref={remove}
              type="button"
              className="btn btn-xs btn-outline"
              aria-label={`Delete ${name} from this browser`}
              disabled={busy}
              onClick={() => setConfirming(true)}
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

  const remove = async (document: Missing, at: number) => {
    if (!(storage instanceof CompositeStorage)) return;
    setBusy(true);
    try {
      const gone = await deleteMissing(storage, document);
      if (gone === null) {
        toast.info(
          `${document.name} was saved again since you were shown it, so it was not deleted.`,
        );
        return;
      }
      toast.info(`Deleted ${document.name} from this browser`);
      refresh(collectionsOf(gone));
      focusNear(at);
    } catch (e) {
      toast.error(
        `Could not delete ${document.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ul
      ref={list}
      aria-label="Documents saved in this browser that are not in your GitHub account"
      className="max-h-44 w-full overflow-y-auto"
    >
      {missing.map((document, at) => (
        <Row
          key={`${document.collection}/${document.id}`}
          document={document}
          busy={busy}
          onSend={() => {
            sendMissing(document);
            focusNear(at);
          }}
          onDelete={() => void remove(document, at)}
        />
      ))}
    </ul>
  );
}
