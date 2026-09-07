import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { AnalysisClient } from './protocol.js';
import { createWorkerClient } from './worker-client.js';

const ClientContext = createContext<AnalysisClient | null>(null);

/**
 * Makes the engine available to the view tree. Tests inject a client that runs on the same thread;
 * the app spawns a worker.
 */
export function AnalysisClientProvider({
  client,
  children,
}: {
  client?: AnalysisClient;
  children: ReactNode;
}) {
  const value = useMemo(() => client ?? createWorkerClient(), [client]);
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useAnalysisClient(): AnalysisClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useAnalysisClient must be used inside AnalysisClientProvider');
  return client;
}
