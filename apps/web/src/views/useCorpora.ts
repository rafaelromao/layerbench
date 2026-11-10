import type { CorpusManifest } from '@layerbench/core';
import { useEffect, useState } from 'react';
import { useAnalysisClient } from '../engine/client-context.js';

/** The corpora the engine can analyze on, for a picker: empty until listed, or if they cannot be. */
export function useCorpora(): CorpusManifest[] {
  const client = useAnalysisClient();
  const [corpora, setCorpora] = useState<CorpusManifest[]>([]);
  useEffect(() => {
    // A list that comes back after the picker is gone, as when a test ends first, is let go.
    let cancelled = false;
    client
      .listCorpora()
      .then((list) => {
        if (!cancelled) setCorpora(list);
      })
      .catch(() => {
        if (!cancelled) setCorpora([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);
  return corpora;
}
