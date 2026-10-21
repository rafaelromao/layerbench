import type { JsonObject, StorageAdapter } from '@layerbench/core';

/**
 * A change someone proposed to a bundled or community layout. Its layout is saved like any custom
 * layout, and this is kept beside it, in the `proposals` collection under the same id, until the
 * pull request it opened is merged, when the copy goes, the Library having the change, or closed,
 * when the copy stays an ordinary custom layout.
 */
export interface Proposal {
  /** The layout's name, as the index lists it. */
  name: string;
  /** The layout the change is to. */
  target: { kind: 'bundled' | 'community'; id: string };
  /** The pull request, on github.com. */
  url: string;
}

const PULL = /^https:\/\/github\.com\/rafaelromao\/layerbench\/pull\/(\d+)$/;

/** A stored document read as a proposal; anything else is none. */
export function readProposal(doc: unknown): Proposal | null {
  if (!doc || typeof doc !== 'object') return null;
  const { name, target, url } = doc as Record<string, unknown>;
  if (typeof name !== 'string' || typeof url !== 'string' || !PULL.test(url)) return null;
  if (!target || typeof target !== 'object') return null;
  const { kind, id } = target as Record<string, unknown>;
  if ((kind !== 'bundled' && kind !== 'community') || typeof id !== 'string') return null;
  return { name, target: { kind, id }, url };
}

/** Where GitHub's API answers for the pull request, or null for one not in the repository. */
export function pullApi(url: string): string | null {
  const m = PULL.exec(url);
  return m ? `https://api.github.com/repos/rafaelromao/layerbench/pulls/${m[1]}` : null;
}

/** The proposal kept beside the custom layout `id`. */
export async function recordProposal(
  storage: StorageAdapter,
  id: string,
  proposal: Proposal,
): Promise<void> {
  const current = await storage.get('proposals', id);
  await storage.put('proposals', id, proposal as unknown as JsonObject, {
    expectedSha: current?.meta.sha ?? null,
  });
}

/** The proposal kept beside the custom layout `id`, if it is one. */
export async function proposalOf(storage: StorageAdapter, id: string): Promise<Proposal | null> {
  const stored = await storage.get('proposals', id);
  return readProposal(stored?.doc);
}

/** What a proposal's pull request is now; `unknown` when GitHub could not say. */
export type PullState = 'open' | 'merged' | 'closed' | 'unknown';

/** Read from GitHub, as anyone may for the public repository; any failure is `unknown`. */
export async function readPullState(url: string): Promise<PullState> {
  const api = pullApi(url);
  if (!api) return 'unknown';
  try {
    const res = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return 'unknown';
    const pull = (await res.json()) as { state?: unknown; merged?: unknown };
    if (pull.merged === true) return 'merged';
    if (pull.state === 'open') return 'open';
    return pull.state === 'closed' ? 'closed' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Each proposal whose pull request is done, settled: merged, the copy and the proposal go; closed,
 * only the proposal goes, and the copy is an ordinary custom layout. One whose pull request is open,
 * or could not be read, is left for another time. The names of those accepted and declined.
 */
export async function settleProposals(
  storage: StorageAdapter,
  state: (url: string) => Promise<PullState> = readPullState,
): Promise<{ accepted: string[]; declined: string[] }> {
  const accepted: string[] = [];
  const declined: string[] = [];
  for (const entry of await storage.list('proposals')) {
    const proposal = await proposalOf(storage, entry.id);
    if (!proposal) continue;
    const now = await state(proposal.url);
    if (now === 'merged') {
      await storage.delete('layouts', entry.id);
      await storage.delete('proposals', entry.id);
      accepted.push(proposal.name);
    } else if (now === 'closed') {
      await storage.delete('proposals', entry.id);
      declined.push(proposal.name);
    }
  }
  return { accepted, declined };
}
