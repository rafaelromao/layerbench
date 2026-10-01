import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AnalysisClient } from './protocol.js';
import { createWorkerClient } from './worker-client.js';

const ClientContext = createContext<AnalysisClient | null>(null);

/** How many requests to the engine are still out: corpora being fetched, analyses being run. */
class Busy {
  private count = 0;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly isBusy = () => this.count > 0;

  track<T>(result: Promise<T>): Promise<T> {
    this.change(1);
    const done = () => this.change(-1);
    result.then(done, done);
    return result;
  }

  private change(by: number) {
    const was = this.isBusy();
    this.count += by;
    if (this.isBusy() !== was) for (const listener of this.listeners) listener();
  }
}

const BusyContext = createContext<Busy | null>(null);

/** The same client, with every request it answers with a promise counted until it settles. */
function counted(client: AnalysisClient, busy: Busy): AnalysisClient {
  return new Proxy(client, {
    get(target, prop) {
      const member = Reflect.get(target, prop);
      if (typeof member !== 'function') return member;
      return (...args: unknown[]) => {
        const result = member.apply(target, args);
        return result instanceof Promise ? busy.track(result) : result;
      };
    },
  });
}

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
  const busy = useMemo(() => new Busy(), []);
  const value = useMemo(() => counted(client ?? createWorkerClient(), busy), [client, busy]);
  return (
    <BusyContext.Provider value={busy}>
      <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
    </BusyContext.Provider>
  );
}

export function useAnalysisClient(): AnalysisClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useAnalysisClient must be used inside AnalysisClientProvider');
  return client;
}

/**
 * Whether the engine is fetching or computing anything. It turns on once that has lasted `delayMs`,
 * as an answer from a cache comes back in a few milliseconds and an indicator flashing for each
 * would be noise; it turns off once the engine has been idle for `lingerMs`, as the Library scores
 * its layouts one after another and would otherwise blink between every two.
 */
export function useEngineBusy(delayMs = 200, lingerMs = 400): boolean {
  const busy = useContext(BusyContext);
  const now = useSyncExternalStore(
    busy?.subscribe ?? noSubscribe,
    busy?.isBusy ?? notBusy,
    busy?.isBusy ?? notBusy,
  );
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (now === shown) return;
    const timer = setTimeout(() => setShown(now), now ? delayMs : lingerMs);
    return () => clearTimeout(timer);
  }, [now, shown, delayMs, lingerMs]);
  return shown;
}

const noSubscribe = () => () => {};
const notBusy = () => false;
