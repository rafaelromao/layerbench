import type { Collection } from '@layoutmaster/core';
import { create } from 'zustand';
import type { SessionAnswer } from '../server/github-auth.js';
import { toast } from '../state/toasts.js';
import type { GistIds } from '../storage/gist.js';
import type { GitHubAccess } from '../storage/github-api.js';
import { findStorageTarget, type StorageTarget } from '../storage/target.js';

/**
 * - `unknown`: not asked yet.
 * - `unavailable`: this host has no sign-in (a plain static host, or one not set up for it).
 * - `signed-out`, `signed-in`: as they say.
 */
export type SignInStatus = 'unknown' | 'unavailable' | 'signed-out' | 'signed-in';

interface GitHubSessionState {
  status: SignInStatus;
  login: string | null;
  /** The app's URL name, for the link that installs it on a fork. */
  appSlug: string;
  /** `owner/name` of the repository whose forks hold documents. */
  upstream: string;
  /** Where documents go; null until known, and while it cannot be found out. */
  target: StorageTarget | null;
  targetStatus: 'idle' | 'checking' | 'error';
}

const INITIAL: GitHubSessionState = {
  status: 'unknown',
  login: null,
  appSlug: '',
  upstream: '',
  target: null,
  targetStatus: 'idle',
};

/** Who is signed in with GitHub and where their documents go. The token itself is kept apart. */
export const useGitHubSession = create<GitHubSessionState>(() => INITIAL);

/** The access token, in memory only: never in the store, in storage, in a link or a message. */
let token: { value: string; expiresAt: number | null } | null = null;

/** A token is used until a minute before it expires; the server renews it before handing it over. */
const TOKEN_MARGIN_MS = 60_000;

const AFTER_SIGN_IN = 'layoutmaster:after-sign-in';
const targetKey = (login: string) => `layoutmaster:storage-target:${login}`;
const gistKey = (login: string) => `layoutmaster:gists:${login}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A browser with site data disabled finds things out again on the next visit.
  }
}

/**
 * GitHub's refresh tokens work once: two tabs renewing at the same moment would sign each other
 * out. A lock shared by every tab of the app makes them take turns; the second one finds the token
 * the first was given.
 */
async function exclusively<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('layoutmaster:github-session', work) : work();
}

function isAnswer(value: unknown): value is SessionAnswer {
  return (
    !!value && typeof value === 'object' && typeof (value as SessionAnswer).available === 'boolean'
  );
}

/** Ask the server. Anything but its JSON (a static host's `index.html`) means no sign-in here. */
async function askServer(): Promise<SessionAnswer | null> {
  const res = await fetch('/api/auth/session', { method: 'POST', credentials: 'same-origin' });
  if (res.status === 502) throw new Error('GitHub could not be reached');
  if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
  const body: unknown = await res.json().catch(() => null);
  return isAnswer(body) ? body : null;
}

function apply(answer: SessionAnswer | null): void {
  if (!answer?.available) {
    token = null;
    useGitHubSession.setState({ ...INITIAL, status: 'unavailable' });
    return;
  }
  const config = { appSlug: answer.appSlug ?? '', upstream: answer.upstream ?? '' };
  if (!answer.signedIn || !answer.token || !answer.login) {
    token = null;
    useGitHubSession.setState({ ...INITIAL, ...config, status: 'signed-out' });
    return;
  }
  token = { value: answer.token, expiresAt: answer.expiresAt ?? null };
  const previous = useGitHubSession.getState();
  useGitHubSession.setState({
    ...config,
    status: 'signed-in',
    login: answer.login,
    // The last place found for this login is used at once; detection confirms or corrects it.
    target:
      previous.login === answer.login && previous.target
        ? previous.target
        : readJson<StorageTarget>(targetKey(answer.login)),
  });
}

function current(): typeof token {
  return token;
}

function usable(t: typeof token): t is NonNullable<typeof token> {
  return !!t && (t.expiresAt === null || t.expiresAt - Date.now() > TOKEN_MARGIN_MS);
}

/** A token for GitHub's API, renewed when it is close to expiring. Throws once signed out. */
export async function getToken(): Promise<string> {
  if (usable(token)) return token.value;
  await exclusively(async () => {
    if (!usable(token)) apply(await askServer());
  });
  // Read again: the work done under the lock replaced it.
  const renewed = current();
  if (!usable(renewed)) throw new Error('signed out of GitHub');
  return renewed.value;
}

/** GitHub said the token is no good: find out whether the session is over. */
function onUnauthorized(): void {
  token = null;
  void exclusively(async () => apply(await askServer())).catch(() => {});
}

export const gitHubAccess: GitHubAccess = { token: getToken, onUnauthorized };

/** The gists that hold each collection, remembered per GitHub account. */
export function gistIds(login: string): GistIds {
  return {
    get: (c: Collection) => readJson<Partial<Record<Collection, string>>>(gistKey(login))?.[c],
    set: (c: Collection, id: string | undefined) => {
      const ids = { ...readJson<Partial<Record<Collection, string>>>(gistKey(login)) };
      if (id) ids[c] = id;
      else delete ids[c];
      writeJson(gistKey(login), ids);
    },
  };
}

/** Find out, again, where documents go: after signing in, or after giving the app a fork. */
export async function detectTarget(): Promise<void> {
  const { status, login, upstream } = useGitHubSession.getState();
  if (status !== 'signed-in' || !login) return;
  useGitHubSession.setState({ targetStatus: 'checking' });
  try {
    const target = await findStorageTarget(gitHubAccess, login, upstream);
    if (useGitHubSession.getState().login !== login) return;
    writeJson(targetKey(login), target);
    const previous = useGitHubSession.getState().target;
    // The same place found again keeps its object, so storage is not rebuilt for nothing.
    const same = JSON.stringify(previous) === JSON.stringify(target);
    useGitHubSession.setState({ target: same ? previous : target, targetStatus: 'idle' });
  } catch {
    // Documents stay where they were going rather than splitting between two places.
    if (useGitHubSession.getState().login === login) {
      useGitHubSession.setState({ targetStatus: 'error' });
    }
  }
}

/**
 * Put back the page the user signed in from. Its link can hold a whole unsaved layout, far too
 * long to travel through GitHub and a cookie, so it waits in this tab instead. Call before the
 * router reads the address.
 */
export function restoreAfterSignIn(): void {
  const failed = new URLSearchParams(location.search).get('signin') === 'failed';
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(AFTER_SIGN_IN);
    sessionStorage.removeItem(AFTER_SIGN_IN);
  } catch {
    // Without session storage the app opens on its first page instead.
  }
  // Only a path on this site; anything else is ignored.
  if (saved?.startsWith('/') && !saved.startsWith('//')) history.replaceState(null, '', saved);
  else if (failed) history.replaceState(null, '', '/');
  if (failed) toast.error('Signing in with GitHub did not complete');
}

/** Learn whether anyone is signed in, and where their documents go. Called once, at start. */
export async function initGitHubSession(): Promise<void> {
  try {
    await exclusively(async () => apply(await askServer()));
  } catch {
    // The server or GitHub is unreachable: the browser keeps working on its own.
    useGitHubSession.setState({ status: 'signed-out' });
    return;
  }
  void detectTarget();
}

export function signIn(): void {
  try {
    sessionStorage.setItem(AFTER_SIGN_IN, location.pathname + location.search + location.hash);
  } catch {
    // The app opens on its first page afterwards instead.
  }
  location.assign('/api/auth/login');
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  token = null;
  const { appSlug, upstream } = useGitHubSession.getState();
  useGitHubSession.setState({ ...INITIAL, appSlug, upstream, status: 'signed-out' });
}
