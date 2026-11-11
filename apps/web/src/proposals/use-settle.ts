import type { StorageAdapter } from '@layerbench/core';
import { useEffect, useRef, useState } from 'react';
import { toast } from '../state/toasts.js';
import { settleProposals } from './proposals.js';

/**
 * Settles the proposals whose pull requests are done, once storage is the one documents are kept
 * in (not while sign-in is still being asked about, when the page is about to be given another),
 * and says what came of each. `onSettled` is called when any copy went or any proposal was
 * dropped, to list them again. Returns the ids of the copies whose change is merged but not in the
 * app that is open yet.
 *
 * What was settled is told whether or not the page still has this storage when GitHub answers: the
 * copies are deleted by then, and the notice is the only word their owner gets of it. The notices
 * stay until they are closed.
 */
export function useSettleProposals(
  storage: StorageAdapter,
  ready: boolean,
  onSettled: () => void,
): ReadonlySet<string> {
  const [landing, setLanding] = useState<ReadonlySet<string>>(new Set());
  const settled = useRef(onSettled);
  settled.current = onSettled;
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void settleProposals(storage)
      .then(({ accepted, declined, landing }) => {
        for (const name of accepted) {
          toast.info(`Your change to ${name} was accepted; your copy of it is gone`, {
            sticky: true,
          });
        }
        for (const name of declined) {
          toast.info(`Your change to ${name} was declined; your copy stays in your layouts`, {
            sticky: true,
          });
        }
        if (accepted.length + declined.length > 0) settled.current();
        if (live) setLanding(new Set(landing));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [storage, ready]);
  return landing;
}
