import { useEffect, useState } from 'react';
import { useCollection, useStorage } from '../storage/use-storage.js';
import { type Proposal, proposalOf, readPullState } from './proposals.js';

/**
 * The pull request of the change proposed from the custom layout `id`, while it is open, or merged
 * and not in this app yet: null for a layout none was proposed from, one not sent yet, and one whose
 * pull request is merged, the app having the change, or closed. Read, never settled: settling a
 * merged one deletes the copy, which is the Library's to do, not the page that has it open. A pull
 * request GitHub could not be asked about still counts as open, as on the Library's cards. GitHub
 * is asked once for each pull request, not each time the proposals are read again. `refresh` reads
 * the proposals again, after one is kept, moved or forgotten.
 */
export function useProposalUrl(id: string | null): {
  url: string | null;
  /** The change is merged, and this app, built before, does not have it yet. */
  merged: boolean;
  refresh: () => void;
} {
  const storage = useStorage();
  const proposals = useCollection('proposals');
  // What was read, and for which layout: another layout shows nothing until it is read, and the
  // same one keeps its tag while it is read again.
  const [kept, setKept] = useState<{
    id: string;
    url: string | null;
    kind: Proposal['target']['kind'];
  } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the entries are what says a proposal was kept, moved or forgotten
  useEffect(() => {
    if (id === null) return;
    let live = true;
    void proposalOf(storage, id)
      .catch(() => null)
      .then((proposal) => {
        if (live)
          setKept({ id, url: proposal?.url ?? null, kind: proposal?.target.kind ?? 'bundled' });
      });
    return () => {
      live = false;
    };
  }, [id, storage, proposals.entries]);

  const url = kept !== null && kept.id === id ? kept.url : null;
  const kind = kept?.kind ?? 'bundled';
  // The pull request asked about, whether it is still open, and whether it waits for this app.
  const [asked, setAsked] = useState<{ url: string; open: boolean; merged: boolean } | null>(null);
  useEffect(() => {
    if (url === null) return;
    let live = true;
    void readPullState(url, kind).then((state) => {
      // Merged but not in this app yet (`landing`), the copy still holds the change: tagged.
      if (live) {
        setAsked({
          url,
          open: state !== 'merged' && state !== 'closed',
          merged: state === 'landing',
        });
      }
    });
    return () => {
      live = false;
    };
  }, [url, kind]);

  const shown = url !== null && asked?.url === url && asked.open;
  return {
    url: shown ? url : null,
    merged: shown && asked.merged,
    refresh: proposals.refresh,
  };
}
