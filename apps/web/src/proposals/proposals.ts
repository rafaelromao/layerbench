import type { JsonObject, StorageAdapter } from '@layerbench/core';
import type { SubmitOutcome } from '../auth/github-session.js';

/**
 * A change someone proposed to a bundled or community layout. Its layout is saved like any custom
 * layout, and this is kept beside it, in the `proposals` collection under the same id, until the
 * pull request it opened is merged, when the copy goes, the Library having the change, or closed,
 * when the copy stays an ordinary custom layout.
 */
export interface Proposal {
  /**
   * The name proposed for the layout. Its copy may go by another, when a custom layout had this one
   * already; the pull request keeps this.
   */
  name: string;
  /** The layout the change is to. */
  target: { kind: 'bundled' | 'community'; id: string };
  /** The pull request, on github.com; null until one is open, the copy saved but not yet sent. */
  url: string | null;
}

const PULL = /^https:\/\/github\.com\/rafaelromao\/layerbench\/pull\/(\d+)$/;

/** A stored document read as a proposal; anything else is none. */
export function readProposal(doc: unknown): Proposal | null {
  if (!doc || typeof doc !== 'object') return null;
  const { name, target, url } = doc as Record<string, unknown>;
  if (typeof name !== 'string') return null;
  if (url !== null && (typeof url !== 'string' || !PULL.test(url))) return null;
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

/**
 * The proposal kept beside the custom layout `id` forgotten, if there is one: the copy is deleted,
 * or the layout saved there is no copy of it. Whether there was one.
 */
export async function forgetProposal(storage: StorageAdapter, id: string): Promise<boolean> {
  if (!(await storage.get('proposals', id))) return false;
  await storage.delete('proposals', id);
  return true;
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
 * only the proposal goes, and the copy is an ordinary custom layout. One whose pull request is
 * open, or could not be read, is left for another time. The names of those accepted and declined.
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
    // Its copy deleted, there is nothing left to settle, sent or not.
    if (!(await storage.get('layouts', entry.id))) {
      await storage.delete('proposals', entry.id);
      continue;
    }
    if (!proposal.url) continue;
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

/** What saving a proposal's copy again did with it. */
export type Followed =
  | { kind: 'none' }
  | { kind: 'done'; proposal: Proposal; state: 'merged' | 'closed' }
  | { kind: 'sent'; proposal: Proposal; outcome: SubmitOutcome };

/**
 * After the custom layout `from` is saved again, as `to` (another id once renamed): the proposal
 * kept beside it, if any, follows. Not sent yet, or its pull request still open or unread, the
 * copy is sent again and the proposal moves to `to`, with the pull request GitHub answers with,
 * which is a new one when the old was closed meanwhile. Merged or closed, the proposal is settled
 * instead, and the copy is an ordinary custom layout, kept as just saved.
 */
export async function followProposal(
  storage: StorageAdapter,
  from: string,
  to: string,
  send: (proposal: Proposal) => Promise<SubmitOutcome>,
  state: (url: string) => Promise<PullState> = readPullState,
): Promise<Followed> {
  const proposal = await proposalOf(storage, from);
  if (!proposal) return { kind: 'none' };
  // One not sent yet, or whose send failed, is sent now.
  const now = proposal.url ? await state(proposal.url) : 'unknown';
  if (now === 'merged' || now === 'closed') {
    await storage.delete('proposals', from);
    return { kind: 'done', proposal, state: now };
  }
  const outcome = await send(proposal);
  const url = outcome.kind === 'sent' ? outcome.url : proposal.url;
  const followed = { ...proposal, url };
  if (from !== to || url !== proposal.url) {
    await recordProposal(storage, to, followed);
    if (from !== to) await storage.delete('proposals', from);
  }
  return { kind: 'sent', proposal: followed, outcome };
}
