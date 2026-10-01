import type { CorpusManifest } from '@layoutmaster/core';
import { useEffect, useState } from 'react';
import { useAnalysisClient } from '../engine/client-context.js';

/** The corpora the engine can analyze on, for a picker: empty until listed, or if they cannot be. */
export function useCorpora(): CorpusManifest[] {
  const client = useAnalysisClient();
  const [corpora, setCorpora] = useState<CorpusManifest[]>([]);
  useEffect(() => {
    client
      .listCorpora()
      .then(setCorpora)
      .catch(() => setCorpora([]));
  }, [client]);
  return corpora;
}
