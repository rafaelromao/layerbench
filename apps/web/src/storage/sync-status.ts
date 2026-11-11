import { useSyncExternalStore } from 'react';
import {
  retrySignIn,
  type SignInProblem,
  type SignInStatus,
  signIn,
  useGitHubSession,
} from '../auth/github-session.js';
import { checkAgain, review, sendEverything, sendHeld, syncNow, useSync } from './auto-sync.js';
import { unsynced } from './unsynced.js';

/**
 * Where a user's work stands, in words they can act on:
 * - `plain`: this browser is where it is kept, and nothing is wrong or waiting.
 * - `checking`: sign-in is still being asked about.
 * - `synced`: signed in, with everything sent.
 * - `syncing`: signed in, sending, or about to.
 * - `here-only`: saved in this browser, not signed in to send it.
 * - `ended`: signed out without having asked to be: the session is over.
 * - `unreachable`: the sign-in server did not answer, so it is not known whether anyone is signed in.
 * - `offline`: signed in, with no connection: what is saved is kept here, to be sent when there is.
 * - `failed`: signed in, but the last try to send did not go through.
 * - `waiting`: signed in, with documents not sent that nothing is about to send, which is said, never shown as sending.
 * - `lacking`: signed in, with documents in this browser that the account does not have.
 * - `unchecked`: signed in, and this browser's documents could not be checked against the account's.
 * - `conflict`: signed in, with documents changed here and in the account, for the user to settle.
 * - `held`: signed in, with documents saved here not sent, as this browser last sent to another account.
 * - `attention`: signed in, with layouts that stay here for their names.
 */
export type SyncKind =
  | 'plain'
  | 'checking'
  | 'synced'
  | 'syncing'
  | 'here-only'
  | 'ended'
  | 'unreachable'
  | 'offline'
  | 'failed'
  | 'waiting'
  | 'lacking'
  | 'unchecked'
  | 'conflict'
  | 'held'
  | 'attention';

/** What the user can do about it from where the status is shown. */
export type SyncAction =
  | 'sign-in'
  | 'retry-sign-in'
  | 'retry-sync'
  | 'review'
  | 'send-held'
  | 'send-all'
  | 'check-again';

export interface SyncSummary {
  kind: SyncKind;
  /** The sentence that says it. */
  text: string;
  /**
   * Short, after "Storage" on the header's button, which shares a 360 pixel phone's header with
   * the logo and the menu: not a sentence, which `text` is; empty when nothing is worth saying there.
   */
  label: string;
  action: SyncAction | null;
  /** Whether it is something to be told about where the user is working, not only in Storage. */
  notable: boolean;
}

export interface SyncInput {
  status: SignInStatus;
  login: string | null;
  problem: SignInProblem | null;
  /** How many documents were saved here and not sent. */
  pending: number;
  phase: 'idle' | 'syncing' | 'failed';
  error: string | null;
  /** Layouts the last attempt left here because the gists have another of the same name. */
  taken: number;
  /** Documents the last attempt found changed here and in the gists, for the user to settle. */
  conflicts: number;
  /** The account this browser last sent to, while unsent documents are held back from this one. */
  held: string | null;
  /** Whether the browser has no connection. */
  offline: boolean;
  /** Whether an attempt to send is waiting on a timer. */
  scheduled: boolean;
  /** How many documents here the account lacks, as last looked at; null if it has not been. */
  lacking: number | null;
  /** Whether the last look at this browser's documents against the account's did not finish. */
  auditFailed: boolean;
  /** Whether that look is being made now. */
  auditing: boolean;
}

const waiting = (n: number) => `${n} saved here ${n === 1 ? 'waits' : 'wait'} to be sent.`;

export function summarize(i: SyncInput): SyncSummary {
  const none = { action: null, notable: false } as const;
  if (i.status === 'unknown') {
    return { kind: 'checking', text: 'Checking your GitHub sign-in…', label: '', ...none };
  }
  if (i.status === 'signed-in' && i.login) {
    if (i.held !== null && i.pending > 0) {
      const n = i.pending;
      return {
        kind: 'held',
        text: `${n} ${n === 1 ? 'document' : 'documents'} saved in this browser ${n === 1 ? 'has' : 'have'} not been sent: this browser last sent to @${i.held}, and you are signed in as @${i.login}. Send ${n === 1 ? 'it' : 'them'} to your account only if ${n === 1 ? 'it is' : 'they are'} yours.`,
        label: ' · unsynced',
        action: 'send-held',
        notable: true,
      };
    }
    if (i.offline) {
      return {
        kind: 'offline',
        text: `You are offline. ${i.pending > 0 ? `${waiting(i.pending)} They are sent` : 'What you save is kept in this browser and sent'} when you are back online.`,
        label: ' · offline',
        ...none,
        notable: true,
      };
    }
    if (i.phase === 'failed' && i.pending > 0) {
      return {
        kind: 'failed',
        text: `Saved in this browser, but not sent to your GitHub account: ${i.error ?? 'it could not be reached'}. It tries again by itself.`,
        label: ' · unsynced',
        action: 'retry-sync',
        notable: true,
      };
    }
    if (i.conflicts > 0) {
      const n = i.conflicts;
      return {
        kind: 'conflict',
        text: `${n} ${n === 1 ? 'document was' : 'documents were'} changed in this browser and in your GitHub account. Nothing is replaced until you choose which version to keep.`,
        label: ' · conflict',
        action: 'review',
        notable: true,
      };
    }
    if (i.phase === 'idle' && i.pending > 0 && i.taken > 0 && i.pending <= i.taken) {
      const n = i.taken;
      return {
        kind: 'attention',
        text: `${n} ${n === 1 ? 'layout stays' : 'layouts stay'} in this browser only, because your GitHub account has ${n === 1 ? 'another layout' : 'other layouts'} of the same name. Rename ${n === 1 ? 'it' : 'them'}, or open ${n === 1 ? 'it' : 'each'} and save to overwrite the other.`,
        label: ' · unsynced',
        ...none,
        notable: true,
      };
    }
    if (i.phase === 'syncing' || (i.scheduled && i.pending > 0)) {
      return {
        kind: 'syncing',
        text: 'Sending what this browser holds to your GitHub account…',
        label: ' · syncing…',
        ...none,
      };
    }
    const left = Math.max(0, i.pending - i.conflicts - i.taken);
    if (left > 0) {
      return {
        kind: 'waiting',
        text: `${left} ${left === 1 ? 'document saved' : 'documents saved'} in this browser ${left === 1 ? 'has' : 'have'} not been sent to your GitHub account yet.`,
        label: ' · unsynced',
        action: 'retry-sync',
        notable: true,
      };
    }
    // Not a check mark before the first look has finished: it may find documents the account lacks.
    if (i.auditing && i.lacking === null) {
      return {
        kind: 'checking',
        text: "Checking this browser's documents against your GitHub account…",
        label: '',
        ...none,
      };
    }
    if (i.auditFailed) {
      return {
        kind: 'unchecked',
        text: "Could not check this browser's documents against your GitHub account, so some may not be in it.",
        label: ' · unchecked',
        action: 'check-again',
        notable: true,
      };
    }
    if (i.lacking !== null && i.lacking > 0) {
      const n = i.lacking;
      return {
        kind: 'lacking',
        text: `${n} ${n === 1 ? 'document saved' : 'documents saved'} in this browser ${n === 1 ? 'is' : 'are'} not in your GitHub account: never sent, or deleted from it elsewhere. Send ${n === 1 ? 'it' : 'them'}, or delete ${n === 1 ? 'it' : 'them'} here.`,
        label: ' · unsynced',
        action: 'send-all',
        notable: true,
      };
    }
    return {
      kind: 'synced',
      text: `Saved in this browser and in your GitHub account (@${i.login}).`,
      label: ' ✓',
      ...none,
    };
  }
  if (i.problem === 'ended') {
    return {
      kind: 'ended',
      text: `Your GitHub sign-in ended, so nothing is syncing. Sign in again to keep your layouts in your account.${i.pending > 0 ? ` ${waiting(i.pending)}` : ''}`,
      label: ' · signed out',
      action: 'sign-in',
      notable: true,
    };
  }
  if (i.problem === 'unreachable') {
    return {
      kind: 'unreachable',
      text: `GitHub sign-in did not answer, so only this browser's copies are shown and nothing is syncing.${i.pending > 0 ? ` ${waiting(i.pending)}` : ''}`,
      label: ' · unsynced',
      action: 'retry-sign-in',
      notable: true,
    };
  }
  if (i.status === 'signed-out' && i.pending > 0) {
    return {
      kind: 'here-only',
      text:
        i.pending === 1
          ? 'Saved in this browser only. Sign in with GitHub to sync it.'
          : `${i.pending} documents are saved in this browser only. Sign in with GitHub to sync them.`,
      label: ' · unsynced',
      action: 'sign-in',
      notable: true,
    };
  }
  return { kind: 'plain', text: 'Saved in this browser.', label: '', ...none };
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** The status of the user's work, for whatever shows it. */
export function useSyncSummary(): SyncSummary {
  const status = useGitHubSession((s) => s.status);
  const login = useGitHubSession((s) => s.login);
  const problem = useGitHubSession((s) => s.problem);
  const pending = useSyncExternalStore(unsynced.subscribe, unsynced.count);
  const phase = useSync((s) => s.phase);
  const error = useSync((s) => s.error);
  const taken = useSync((s) => s.last?.taken ?? 0);
  const conflicts = useSync((s) => s.last?.conflicts.length ?? 0);
  const held = useSync((s) => s.held?.account ?? null);
  const scheduled = useSync((s) => s.scheduled);
  const lacking = useSync((s) => s.lacking);
  const auditFailed = useSync((s) => s.auditFailed);
  const auditing = useSync((s) => s.auditing);
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  return summarize({
    status,
    login,
    problem,
    pending,
    phase,
    error,
    taken,
    conflicts,
    held,
    offline: !online,
    scheduled,
    lacking,
    auditFailed,
    auditing,
  });
}

/** Do what a status offers. */
export function act(action: SyncAction): void {
  if (action === 'sign-in') void signIn();
  else if (action === 'retry-sign-in') void retrySignIn();
  else if (action === 'review') review(true);
  else if (action === 'send-held') sendHeld();
  else if (action === 'send-all') sendEverything();
  else if (action === 'check-again') checkAgain();
  else syncNow();
}

/** What a button for an action says. */
export const ACTION_LABEL: Record<SyncAction, string> = {
  'sign-in': 'Sign in with GitHub',
  'retry-sign-in': 'Try again',
  'retry-sync': 'Try now',
  review: 'Choose',
  'send-held': 'Send to my account',
  'send-all': 'Send them',
  'check-again': 'Check again',
};
