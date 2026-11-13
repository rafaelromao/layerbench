import type { Collection } from '@layerbench/core';
import { create } from 'zustand';
import type { SessionAnswer } from '../server/github-auth.js';
import type { SubmitAnswer } from '../server/submit.js';
import { toast } from '../state/toasts.js';
import type { GistIds } from '../storage/gist.js';
import { type GitHubAccess, timeoutSignal } from '../storage/github-api.js';

/**
 * - `unknown`: not asked yet.
 * - `unavailable`: this copy of the app has no sign-in (a plain static host, or one not set up for it).
 * - `signed-out`, `signed-in`: as they say.
 */
export type SignInStatus = 'unknown' | 'unavailable' | 'signed-out' | 'signed-in';

/**
 * What went wrong with a session this browser had, which the page says rather than leaves a user
 * to guess:
 * - `ended`: the server or GitHub no longer honours it.
 * - `unreachable`: neither answered in time, so it is not known whether the session still holds.
 */
export type SignInProblem = 'ended' | 'unreachable';

interface GitHubSessionState {
  status: SignInStatus;
  login: string | null;
  /** Why a browser that had a session is not signed in; null otherwise. */
  problem: SignInProblem | null;
  /** The app's public id, which the trip to GitHub starts with. */
  clientId: string;
  /** Whether the server says the user may change the Library: GitHub lets them push to it. */
  maintainer: boolean;
}

const INITIAL: GitHubSessionState = {
  status: 'unknown',
  login: null,
  problem: null,
  clientId: '',
  maintainer: false,
};

/** Who is signed in with GitHub. The token itself is kept apart. */
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
/**
 * How long the sign-in server, or another tab holding the session's lock, has to answer before the
 * page stops waiting for it: a check that never ended would leave the page asking for ever. Only the
 * waiting stops. The request is not cancelled: the server spends the refresh token it is sent and
 * answers with the next session, which an answer that arrives late must still be there to keep.
 */
const SIGN_IN_CHECK_MS = 10_000;
/** Set when the session ended without the user asking, until they sign in or out: told on every visit. */
const ENDED = 'layerbench:sign-in-ended';
/**
 * Where a signed-in user's documents went when they could be saved to a fork. Gists hold them now;
 * what was remembered is forgotten.
 */
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

function forget(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Without site data there is nothing kept to forget.
  }
}

function storedSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Remove secrets this module stores before displaying route diagnostics. */
export function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : 'An unexpected error occurred.';
  const secrets = [token?.value, storedSession()].filter((secret): secret is string => !!secret);
  let safe = message;
  for (const secret of secrets) {
    safe = safe.split(secret).join('[redacted]');
    safe = safe.split(encodeURIComponent(secret)).join('[redacted]');
  }
  const credentialAssignment = new RegExp(
    [
      String.raw`\b(access[_ -]?token|refresh[_ -]?token|token|sealed[_ -]?session|session)`,
      String.raw`\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)`,
    ].join(''),
    'gi',
  );
  return safe
    .replace(/\b(?:gh[opusr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/gi, '[redacted]')
    .replace(credentialAssignment, '$1=[redacted]');
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
  if (!locks) return work();
  // Only the wait is limited: a tab frozen in the middle of renewing would otherwise hold every
  // other tab up for ever. Work that has the lock is never cut short.
  const signal = timeoutSignal(SIGN_IN_CHECK_MS);
  try {
    return await locks.request('layerbench:github-session', signal ? { signal } : {}, () => work());
  } catch (e) {
    throw isTimeout(e) ? new Error('another tab of LayerBench is holding up the sign-in') : e;
  }
}

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

function isAnswer(value: unknown): value is SessionAnswer {
  return (
    !!value && typeof value === 'object' && typeof (value as SessionAnswer).available === 'boolean'
  );
}

type Route = 'session' | 'token' | 'logout' | 'submit' | 'propose' | 'maintain';

function post(route: Route, body: object): Promise<Response> {
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
  // A server that is down or too busy has not said there is no sign-in: only a host with no such
  // route, which answers with the app instead, has.
  if (res.status >= 500 || res.status === 429) {
    throw new Error(`the sign-in server answered ${res.status}`);
  }
  if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
  const answer: unknown = await res.json().catch(() => null);
  return isAnswer(answer) ? answer : null;
}

/**
 * `work`, or an error once it has gone on for `ms`. The work is not stopped: it goes on to
 * its end, and what it does then still counts.
 */
function within<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  work.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** `lapsed`: this browser had a session, and the server says there is none now. */
function apply(answer: SessionAnswer | null, lapsed = false): void {
  if (!answer?.available) {
    token = null;
    useGitHubSession.setState({ ...INITIAL, status: 'unavailable' });
    return;
  }
  const config = { clientId: answer.clientId ?? '' };
  if (!answer.signedIn || !answer.token || !answer.login) {
    token = null;
    // A session that ended is told of until the user signs in or out, not only on the visit it ended.
    if (lapsed) writeJson(ENDED, true);
    useGitHubSession.setState({
      ...INITIAL,
      ...config,
      status: 'signed-out',
      problem: lapsed || readJson<boolean>(ENDED) ? 'ended' : null,
    });
    return;
  }
  forget(ENDED);
  token = { value: answer.token, expiresAt: answer.expiresAt ?? null };
  forget(targetKey(answer.login));
  useGitHubSession.setState({
    ...config,
    status: 'signed-in',
    login: answer.login,
    problem: null,
    maintainer: answer.maintainer === true,
  });
}

/**
 * Where the session stands, asked with the one this browser keeps; a session the server renews
 * replaces it. `rejected` is a token GitHub turned down, which is renewed at once if the session
 * still hands it out. Called under the lock. Throws, leaving storage alone, when the server or
 * GitHub cannot be reached.
 */
async function renew(rejected?: string): Promise<void> {
  const started = signOutEpoch;
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
  // A browser that had a session and was answered by something that is not the server (a captive
  // portal's page, a proxy's) has not been told there is no sign-in: it is not known.
  if (answer === null && used) throw new Error('the sign-in server did not answer as expected');
  // The user signed out while this was out: its answer is of a session they ended.
  if (started !== signOutEpoch) return;
  if (answer?.available) {
    if (answer.session) keepSession(answer.session);
    else if (!answer.signedIn && used && storedSession() === used) keepSession(null);
  }
  apply(answer, !!used && answer?.available === true && !answer.signedIn);
}

/** How many times the user has signed out in this page: an answer that was out meanwhile is thrown away. */
let signOutEpoch = 0;

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
  await within(
    exclusively(async () => {
      if (!usable(token)) await renew();
    }),
    SIGN_IN_CHECK_MS,
    'the sign-in server did not answer in time',
  );
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
 * Learn whether anyone is signed in: called once, at start, with
 * what `returnFromGitHub` found. One request under the lock either way, so an answer about the
 * session from before signing in cannot land after the new one and undo it.
 */
export async function initGitHubSession(back: SignInReturn | null = null): Promise<void> {
  const check = exclusively(() => (back ? exchange(back) : renew()));
  // An answer that comes late still counts, but nothing waits on it past the limit.
  check.catch(() => {});
  const late = Symbol('late');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<typeof late>((resolve) => {
    timer = setTimeout(() => resolve(late), SIGN_IN_CHECK_MS);
  });
  let reached = false;
  try {
    reached = (await Promise.race([check, limit])) !== late;
  } catch {
    // Reported below, with a check that took too long.
  } finally {
    clearTimeout(timer);
  }
  // The server or GitHub is unreachable: the browser keeps working on its own. A browser that had
  // a session is told it could not be checked; one that had none has nothing to be told.
  if (!reached && useGitHubSession.getState().status === 'unknown') {
    useGitHubSession.setState({
      status: 'signed-out',
      problem: storedSession() ? 'unreachable' : readJson<boolean>(ENDED) ? 'ended' : null,
    });
  }
}

/** Ask again after the sign-in server could not be reached. */
export async function retrySignIn(): Promise<void> {
  useGitHubSession.setState({ status: 'unknown', problem: null });
  await initGitHubSession();
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

/** How a submission went: the pull request, why it was refused, or why it was not sent. */
export type SubmitOutcome =
  | { kind: 'sent'; url: string; reused: boolean; unchanged?: boolean }
  | { kind: 'refused'; reason: string }
  | { kind: 'signed-out' }
  | { kind: 'failed'; error: string };

/** A request to the sign-in server that opens a pull request: how it went. */
async function sendForPull(route: Route, body: Record<string, unknown>): Promise<SubmitOutcome> {
  try {
    await getToken();
  } catch {
    return { kind: 'signed-out' };
  }
  const session = storedSession();
  if (!session) return { kind: 'signed-out' };
  let res: Response;
  try {
    res = await post(route, { session, ...body });
  } catch {
    return { kind: 'failed', error: 'the sign-in server could not be reached' };
  }
  const answer = (await res.json().catch(() => null)) as SubmitAnswer | null;
  if (res.ok && typeof answer?.url === 'string' && answer.url.startsWith('https://github.com/')) {
    const sent = { kind: 'sent' as const, url: answer.url, reused: answer.reused === true };
    return answer.unchanged === true ? { ...sent, unchanged: true } : sent;
  }
  if (res.status === 401) return { kind: 'signed-out' };
  if (typeof answer?.reason === 'string') return { kind: 'refused', reason: answer.reason };
  return { kind: 'failed', error: answer?.error ?? `the sign-in server answered ${res.status}` };
}

/**
 * Propose a layout, as LayerBench saves it, as a community layout: the sign-in server opens a pull
 * request into the community branch that adds it, naming who is signed in. The token is renewed
 * first if it needs to be, so the session sent is one GitHub still honours.
 */
export function submitLayout(doc: object): Promise<SubmitOutcome> {
  return sendForPull('submit', { layout: doc });
}

/** A layout of the Library's, of the community's, or of one's own, by its id. */
export interface LibraryTarget {
  kind: 'bundled' | 'community' | 'custom';
  id: string;
}

/**
 * Propose a change to a bundled or community layout: the layout it should be, as LayerBench saves
 * it, under that layout's id. The sign-in server opens the pull request, naming who is signed in.
 */
export function proposeChange(target: LibraryTarget, doc: object): Promise<SubmitOutcome> {
  return sendForPull('propose', { target, layout: doc });
}

/**
 * A maintainer's change to the Library: delete a bundled or community layout, or promote a custom
 * or community one into it, as LayerBench saves it. Refused unless GitHub lets the user push.
 */
export function maintainLibrary(
  action: 'delete' | 'promote',
  target: LibraryTarget,
  doc?: object,
): Promise<SubmitOutcome> {
  return sendForPull('maintain', { action, target, ...(doc && { layout: doc }) });
}

export async function signOut(): Promise<void> {
  signOutEpoch++;
  forget(ENDED);
  await exclusively(async () => {
    const sent = storedSession();
    keepSession(null);
    token = null;
    // Revoked as a courtesy; signing out does not depend on the server answering.
    if (sent) await post('logout', { session: sent }).catch(() => {});
  }).catch(() => {
    // Signing out does not depend on another tab letting go of the lock either.
    keepSession(null);
    token = null;
  });
  const { clientId } = useGitHubSession.getState();
  useGitHubSession.setState({ ...INITIAL, clientId, status: 'signed-out' });
}
