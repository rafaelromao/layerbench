import { useEffect, useState } from 'react';
import { useCollection, useStorage } from '../storage/use-storage.js';
import { proposalOf, readPullState } from './proposals.js';

/**
 * The pull request of the change proposed from the custom layout `id`, while it is open: null for
 * a layout none was proposed from, one not sent yet, and one whose pull request is merged or
 * closed. Read, never settled: settling a merged one deletes the copy, which is the Library's to
 * do, not the page that has it open. A pull request GitHub could not be asked about still counts
 * as open, as on the Library's cards. `refresh` reads the proposals again, after one is kept,
 * moved or forgotten.
 */
export function useProposalUrl(id: string | null): { url: string | null; refresh: () => void } {
  const storage = useStorage();
  const proposals = useCollection('proposals');
  // What was read, and for which layout: another layout shows nothing until it is read, and the
  // same one keeps its tag while it is read again.
  const [read, setRead] = useState<{ id: string; url: string | null } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the entries are what says a proposal was kept, moved or forgotten
  useEffect(() => {
    if (id === null) return;
    let live = true;
    void (async () => {
      const proposal = await proposalOf(storage, id).catch(() => null);
      let open: string | null = null;
      if (proposal?.url) {
        const state = await readPullState(proposal.url);
        if (state === 'open' || state === 'unknown') open = proposal.url;
      }
      if (live) setRead({ id, url: open });
    })();
    return () => {
      live = false;
    };
  }, [id, storage, proposals.entries]);
  return { url: read !== null && read.id === id ? read.url : null, refresh: proposals.refresh };
}
