import type { Collection } from '@layerbench/core';
import { create } from 'zustand';
import type { SessionAnswer } from '../server/github-auth.js';
import { toast } from '../state/toasts.js';
import type { GistIds } from '../storage/gist.js';
import type { GitHubAccess } from '../storage/github-api.js';
import { findStorageTarget, type StorageTarget } from '../storage/target.js';

/**
 * - `unknown`: not asked yet.
 * - `unavailable`: this copy of the app has no sign-in (a plain static host, or one not set up for it).
 * - `signed-out`, `signed-in`: as they say.
 */
export type SignInStatus = 'unknown' | 'unavailable' | 'signed-out' | 'signed-in';

interface GitHubSessionState {
  status: SignInStatus;
  login: string | null;
  /** The app's public id, which the trip to GitHub starts with. */
  clientId: string;
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
  clientId: '',
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

/**
 * Where the sign-in server answers: a domain of its own in production (`VITE_AUTH_ORIGIN`, see
 * vite.config.ts), this page's own origin on the dev server.
 */
const AUTH = import.meta.env.VITE_AUTH_ORIGIN ?? '';

/**
 * The sealed session: both tokens, encrypted with a key only the server has. The server is on
 * another site, where a cookie would be a third-party one, so the page keeps it. Whoever holds it
 * can have tokens renewed until it expires or the user signs out, which is one more reason the page
 * runs no code from anywhere else.
 */
const SESSION_KEY = 'layerbench:github-session';
/** What coming back from GitHub needs: the state and PKCE verifier sent, and the page to return to. */
const SIGN_IN = 'layerbench:sign-in';
/** A trip to GitHub that takes longer than this is abandoned; signing in again starts a new one. */
const SIGN_IN_MAX_AGE_MS = 10 * 60_000;
const SIGN_IN_FAILED = 'Signing in with GitHub did not complete';
const targetKey = (login: string) => `layerbench:storage-target:${login}`;
const gistKey = (login: string) => `layerbench:gists:${login}`;

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

function storedSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function keepSession(value: string | null): void {
  try {
    if (value) localStorage.setItem(SESSION_KEY, value);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // A browser with site data disabled signs in again on the next visit.
  }
}

/**
 * GitHub's refresh tokens work once: two tabs renewing at the same moment would sign each other
 * out. A lock shared by every tab of the app makes them take turns; the second one finds the session
 * the first was given.
 */
async function exclusively<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('layerbench:github-session', () => work()) : work();
}

function isAnswer(value: unknown): value is SessionAnswer {
  return (
    !!value && typeof value === 'object' && typeof (value as SessionAnswer).available === 'boolean'
  );
}

function post(route: 'session' | 'token' | 'logout', body: object): Promise<Response> {
  return fetch(`${AUTH}/api/auth/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Ask the server. Anything but its JSON (a static host's `index.html`) means no sign-in here. */
async function ask(route: 'session' | 'token', body: object): Promise<SessionAnswer | null> {
  const res = await post(route, body);
  if (res.status === 502) throw new Error('GitHub could not be reached');
  if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
  const answer: unknown = await res.json().catch(() => null);
  return isAnswer(answer) ? answer : null;
}

function apply(answer: SessionAnswer | null): void {
  if (!answer?.available) {
    token = null;
    useGitHubSession.setState({ ...INITIAL, status: 'unavailable' });
    return;
  }
  const config = {
    clientId: answer.clientId ?? '',
    appSlug: answer.appSlug ?? '',
    upstream: answer.upstream ?? '',
  };
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

/**
 * Where the session stands, asked with the one this browser keeps; a session the server renews
 * replaces it. `rejected` is a token GitHub turned down, which is renewed at once if the session
 * still hands it out. Called under the lock. Throws, leaving storage alone, when the server or
 * GitHub cannot be reached.
 */
async function renew(rejected?: string): Promise<void> {
  const sent = storedSession();
  let used = sent;
  let answer = await ask('session', sent ? { session: sent } : {});
  // What another tab stores can reach this one late. A session turned down may be one that tab has
  // just renewed and retired, so the one it stored gets a try before anything is forgotten.
  const latest = storedSession();
  if (answer?.available && !answer.signedIn && latest && latest !== sent) {
    used = latest;
    answer = await ask('session', { session: latest });
  }
  // Revoked on GitHub, the token would be handed back until it expired, hours away. Renewing it
  // gets a good one, or ends a session GitHub no longer honours. A token another tab had renewed
  // meanwhile is simply taken.
  if (rejected !== undefined && used && answer?.signedIn && answer.token === rejected) {
    answer = await ask('session', { session: used, renew: true });
  }
  if (answer?.available) {
    if (answer.session) keepSession(answer.session);
    else if (!answer.signedIn && used && storedSession() === used) keepSession(null);
  }
  apply(answer);
}

/** Trade the code GitHub came back with for a session. Called under the lock. */
async function exchange(back: SignInReturn): Promise<void> {
  let answer: SessionAnswer | null = null;
  try {
    answer = await ask('token', { ...back, redirectUri: redirectUri() });
  } catch {
    // Reported below, with every other way this can fail.
  }
  if (answer?.signedIn && answer.session) {
    keepSession(answer.session);
    apply(answer);
    return;
  }
  toast.error(SIGN_IN_FAILED);
  await renew();
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
    if (!usable(token)) await renew();
  });
  // Read again: the work done under the lock replaced it.
  const renewed = current();
  if (!usable(renewed)) throw new Error('signed out of GitHub');
  return renewed.value;
}

/** GitHub turned this token down: have it renewed, or find out the session is over. */
function onUnauthorized(rejected: string): void {
  if (token?.value === rejected) token = null;
  void exclusively(async () => {
    // Another request turned down at the same time may have had it renewed already.
    if (usable(token) && token.value !== rejected) return;
    await renew(rejected);
  }).catch(() => {});
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

// ---------------------------------------------------------------------------------------------
// The trip to GitHub

interface PendingSignIn {
  state: string;
  verifier: string;
  returnTo: string;
  /** Epoch milliseconds when it started. */
  at: number;
}

/** What the page comes back from GitHub with, to trade for a session. */
export interface SignInReturn {
  code: string;
  verifier: string;
}

/** What GitHub adds to the address on the way back, whether signing in worked or not. */
const FROM_GITHUB = ['code', 'state', 'error', 'error_description', 'error_uri'];

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Where GitHub sends the browser back: the app's root, registered as the GitHub App's callback. */
function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

/** A path on this site, and nothing else: `//elsewhere` and `/\elsewhere` are other sites. */
function onThisSite(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  try {
    return new URL(path, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/** The sign-in this tab started, taken so it cannot be used twice; null when none, or too old. */
function takePending(): PendingSignIn | null {
  try {
    const raw = sessionStorage.getItem(SIGN_IN);
    sessionStorage.removeItem(SIGN_IN);
    const pending = raw ? (JSON.parse(raw) as PendingSignIn) : null;
    return pending && Date.now() - pending.at < SIGN_IN_MAX_AGE_MS ? pending : null;
  } catch {
    return null;
  }
}

/**
 * The address that starts signing in at GitHub. What coming back takes (the state to check, the
 * PKCE verifier, the page to return to) waits in this tab; null when the tab cannot keep it.
 */
export async function authorizeUrl(clientId: string): Promise<string | null> {
  const state = randomToken();
  const verifier = randomToken();
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const pending: PendingSignIn = {
    state,
    verifier,
    returnTo: location.pathname + location.search + location.hash,
    at: Date.now(),
  };
  try {
    sessionStorage.setItem(SIGN_IN, JSON.stringify(pending));
  } catch {
    return null;
  }
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.href;
}

/**
 * Back from GitHub: take its answer off the address before the router reads it, and put back the
 * page the user signed in from. That page's link can hold a whole unsaved layout, far too long to
 * travel through GitHub, so it waited in this tab. Returns the code to trade for a session, or
 * null, saying so when signing in did not complete.
 */
export function returnFromGitHub(): SignInReturn | null {
  const params = new URLSearchParams(location.search);
  const state = params.get('state');
  // GitHub comes back to the app's root, always with the state it was sent.
  if (!state || location.pathname !== import.meta.env.BASE_URL) return null;

  const pending = takePending();
  const code = params.get('code');
  const back =
    pending && pending.state === state && code && !params.has('error')
      ? { code, verifier: pending.verifier }
      : null;

  for (const name of FROM_GITHUB) params.delete(name);
  const rest = params.toString();
  history.replaceState(
    null,
    '',
    pending && onThisSite(pending.returnTo)
      ? pending.returnTo
      : `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`,
  );
  if (!back) toast.error(SIGN_IN_FAILED);
  return back;
}

/**
 * Learn whether anyone is signed in, and where their documents go: called once, at start, with
 * what `returnFromGitHub` found. One request under the lock either way, so an answer about the
 * session from before signing in cannot land after the new one and undo it.
 */
export async function initGitHubSession(back: SignInReturn | null = null): Promise<void> {
  try {
    await exclusively(() => (back ? exchange(back) : renew()));
  } catch {
    // The server or GitHub is unreachable: the browser keeps working on its own.
    useGitHubSession.setState({ status: 'signed-out' });
    return;
  }
  void detectTarget();
}

export async function signIn(): Promise<void> {
  if (!useGitHubSession.getState().clientId) {
    // The server could not be asked when the app started: once more, before giving up.
    await exclusively(renew).catch(() => {});
  }
  const { clientId } = useGitHubSession.getState();
  const url = clientId ? await authorizeUrl(clientId) : null;
  if (url) location.assign(url);
  else toast.error('Signing in with GitHub could not start; try again in a moment');
}

export async function signOut(): Promise<void> {
  await exclusively(async () => {
    const sent = storedSession();
    keepSession(null);
    token = null;
    // Revoked as a courtesy; signing out does not depend on the server answering.
    if (sent) await post('logout', { session: sent }).catch(() => {});
  });
  const { clientId, appSlug, upstream } = useGitHubSession.getState();
  useGitHubSession.setState({ ...INITIAL, clientId, appSlug, upstream, status: 'signed-out' });
}
