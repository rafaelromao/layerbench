/**
 * Sign-in with GitHub, the one part of the app that runs on a server: a Cloudflare Worker in
 * production (`worker/auth.ts`), on a domain of its own, and the dev server's middleware locally.
 *
 * It exists because GitHub hands out tokens only to whoever knows the app's client secret, and a
 * page cannot keep a secret. It stores nothing. The page makes the trip to GitHub itself and hands
 * over the code it comes back with; it gets the short-lived access token, and the session: both
 * tokens sealed with a key only this side has, which the page keeps and sends back to have the
 * access token renewed.
 *
 * The page is on another site (github.io is a public suffix), where cookies would be third-party
 * ones that browsers block, so none are used: every endpoint is a POST with a JSON body, answered
 * only to the origins it is told to serve.
 *
 * Built on Web APIs only (`fetch`, `crypto.subtle`), which both runtimes provide.
 */

export interface AuthEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** The app's URL name, for the link that installs it on a fork. */
  GITHUB_APP_SLUG?: string;
  /** 32 random bytes in base64: the key sessions are sealed with. A new one signs everyone out. */
  SESSION_SECRET?: string;
  /** `owner/name` of the repository whose forks documents are saved to. */
  UPSTREAM_REPO?: string;
  /** Comma-separated origins of the pages that may sign in here, besides this host's own. */
  ALLOWED_ORIGINS?: string;
}

export const DEFAULT_UPSTREAM = 'rafaelromao/layerbench';

/** What `session` and `token` answer. */
export interface SessionAnswer {
  available: boolean;
  signedIn: boolean;
  /** Public: the page names the app with it when it sends the browser to GitHub. */
  clientId?: string;
  appSlug?: string;
  upstream?: string;
  login?: string;
  token?: string;
  /** Epoch milliseconds; null for a token that does not expire. */
  expiresAt?: number | null;
  /** A new sealed session, for the page to keep in place of the one it sent. */
  session?: string;
}

interface Session {
  access: string;
  accessExpiresAt: number | null;
  refresh: string | null;
  refreshExpiresAt: number | null;
  login: string;
  /** Epoch milliseconds after which the session is refused, wherever the page kept it. */
  expiresAt: number;
}

interface TokenGrant {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

const GITHUB = 'https://github.com';
const API = 'https://api.github.com';
/** GitHub refuses API requests without one, and a server's fetch sends none of its own. */
const USER_AGENT = 'LayerBench';
/** The page is handed a token only while it has this long left; otherwise it is renewed first. */
const RENEW_MARGIN_MS = 5 * 60_000;
/** A session whose tokens never expire is still forgotten after half a year. */
const SESSION_FALLBACK_MAX_AGE_MS = 180 * 24 * 3600_000;

/**
 * What a request may carry. Anything else is turned away before GitHub is asked, since every call
 * made there is made with the app's secret.
 */
const MAX_BODY_BYTES = 8 * 1024;
const MAX_SESSION_LENGTH = 2048;
/** RFC 7636's alphabet and lengths. */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CODE = /^[\w-]{1,128}$/;

interface Config {
  clientId: string;
  clientSecret: string;
  key: CryptoKey;
  appSlug: string;
  upstream: string;
}

// ---------------------------------------------------------------------------------------------
// Encoding and encryption

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey | null> {
  try {
    const raw = fromBase64(secret.trim());
    if (raw.length !== 32) return null;
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

async function seal(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return base64url(out);
}

/** The value, or null for anything not sealed with this key: a forged or stale session. */
async function unseal<T>(key: CryptoKey, text: string): Promise<T | null> {
  try {
    const bytes = fromBase64(text);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Responses

type Extra = Record<string, string>;

function respond(status: number, body: string | null, extra: Extra): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

/** Error bodies say what kind of failure it was and nothing more: never what GitHub answered. */
function json(body: unknown, status: number, cors: Extra): Response {
  return respond(status, JSON.stringify(body), { 'Content-Type': 'application/json', ...cors });
}

// ---------------------------------------------------------------------------------------------
// GitHub

/** GitHub answers a refused exchange with 200 and an `error` field, so both are checked. */
async function requestToken(params: Record<string, string>): Promise<TokenGrant | null> {
  const res = await fetch(`${GITHUB}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as Partial<TokenGrant> & { error?: string };
  if (body.error || typeof body.access_token !== 'string') return null;
  return body as TokenGrant;
}

async function loginOf(access: string): Promise<string | null> {
  const res = await fetch(`${API}/user`, {
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const { login } = (await res.json()) as { login?: unknown };
  return typeof login === 'string' ? login : null;
}

function sessionFrom(grant: TokenGrant, login: string): Session {
  const now = Date.now();
  const refreshExpiresAt = grant.refresh_token_expires_in
    ? now + grant.refresh_token_expires_in * 1000
    : null;
  return {
    access: grant.access_token,
    accessExpiresAt: grant.expires_in ? now + grant.expires_in * 1000 : null,
    refresh: grant.refresh_token ?? null,
    refreshExpiresAt,
    login,
    expiresAt: refreshExpiresAt ?? now + SESSION_FALLBACK_MAX_AGE_MS,
  };
}

/** The session the page sent, while it is good: sealed with this key and not past its time. */
async function sessionOf(body: Record<string, unknown>, config: Config): Promise<Session | null> {
  const sealed = body.session;
  if (typeof sealed !== 'string' || sealed.length > MAX_SESSION_LENGTH) return null;
  const session = await unseal<Session>(config.key, sealed);
  if (!session || typeof session.expiresAt !== 'number' || session.expiresAt < Date.now()) {
    return null;
  }
  return session;
}

function signedIn(base: SessionAnswer, session: Session): SessionAnswer {
  return {
    ...base,
    signedIn: true,
    login: session.login,
    token: session.access,
    expiresAt: session.accessExpiresAt,
  };
}

// ---------------------------------------------------------------------------------------------
// Endpoints

function baseAnswer(config: Config): SessionAnswer {
  return {
    available: true,
    signedIn: false,
    clientId: config.clientId,
    appSlug: config.appSlug,
    upstream: config.upstream,
  };
}

/** The page's way back from GitHub, traded for tokens. */
async function token(
  body: Record<string, unknown>,
  origin: string,
  config: Config,
  cors: Extra,
): Promise<Response> {
  const { code, verifier, redirectUri } = body;
  if (
    typeof code !== 'string' ||
    !CODE.test(code) ||
    typeof verifier !== 'string' ||
    !VERIFIER.test(verifier) ||
    typeof redirectUri !== 'string' ||
    originOf(redirectUri) !== origin
  ) {
    return json({ error: 'bad request' }, 400, cors);
  }

  const base = baseAnswer(config);
  try {
    const grant = await requestToken({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    if (!grant) return json(base, 200, cors);
    const login = await loginOf(grant.access_token);
    if (!login) return json(base, 200, cors);
    const started = sessionFrom(grant, login);
    return json(
      { ...signedIn(base, started), session: await seal(config.key, started) },
      200,
      cors,
    );
  } catch {
    return json({ error: 'GitHub could not be reached' }, 502, cors);
  }
}

/**
 * The page's access token, renewed first when it is about to expire, or at once when the page says
 * GitHub turned it down (`renew: true`): revoked, it would otherwise be handed back until it
 * expired. GitHub's refresh tokens work once, so the page asks one tab at a time (see
 * `src/auth/github-session.ts`), and keeps the new session this hands back in place of the one it
 * sent. A session that cannot be renewed is over.
 */
async function session(
  body: Record<string, unknown>,
  config: Config,
  cors: Extra,
): Promise<Response> {
  const base = baseAnswer(config);
  const current = await sessionOf(body, config);
  if (!current) return json(base, 200, cors);

  const now = Date.now();
  const fresh =
    body.renew !== true &&
    (current.accessExpiresAt === null || current.accessExpiresAt - now > RENEW_MARGIN_MS);
  if (fresh) return json(signedIn(base, current), 200, cors);
  if (!current.refresh || (current.refreshExpiresAt !== null && current.refreshExpiresAt < now)) {
    return json(base, 200, cors);
  }

  let grant: TokenGrant | null;
  try {
    grant = await requestToken({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: current.refresh,
    });
  } catch {
    // GitHub could not be reached: the session may still be good, so the page keeps it for a retry.
    return json({ error: 'GitHub could not be reached' }, 502, cors);
  }
  if (!grant) return json(base, 200, cors);

  const renewed = sessionFrom(grant, current.login);
  return json({ ...signedIn(base, renewed), session: await seal(config.key, renewed) }, 200, cors);
}

async function logout(
  body: Record<string, unknown>,
  config: Config,
  cors: Extra,
): Promise<Response> {
  const current = await sessionOf(body, config);
  if (current) {
    // Revoked as a courtesy; the page forgets the session whether or not GitHub answers.
    await fetch(`${API}/applications/${encodeURIComponent(config.clientId)}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ access_token: current.access }),
    }).catch(() => {});
  }
  return respond(204, null, cors);
}

async function configFrom(env: AuthEnv): Promise<Config | null> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET) return null;
  const key = await importKey(env.SESSION_SECRET);
  if (!key) return null;
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    key,
    appSlug: env.GITHUB_APP_SLUG ?? '',
    upstream: env.UPSTREAM_REPO || DEFAULT_UPSTREAM,
  };
}

// ---------------------------------------------------------------------------------------------
// Who may ask

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The calling page's origin, when it may sign in here: one of `ALLOWED_ORIGINS`, or this host's
 * own, which is how the dev server's pages call it. Browsers name the origin of every request this
 * gets (each is a POST or a preflight), so a request without one did not come from a page.
 */
function allowedOrigin(request: Request, env: AuthEnv): string | null {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return null;
  if (origin === new URL(request.url).origin) return origin;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim());
  return allowed.includes(origin) ? origin : null;
}

/** The JSON object a request carries, or null for anything else. */
async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Everything under `/api/auth/`. */
export async function handleAuth(request: Request, env: AuthEnv): Promise<Response> {
  const origin = allowedOrigin(request, env);
  // No CORS headers: the browser keeps the answer from the page that asked.
  if (!origin) return json({ error: 'forbidden' }, 403, {});
  // On every answer, errors too, so the page can tell "GitHub is down" from "no sign-in here".
  const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };

  const route = new URL(request.url).pathname.replace(/^\/api\/auth\/?/, '');
  if (request.method === 'OPTIONS') {
    return respond(204, null, {
      ...cors,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      // Chromium's ceiling; without it a page load would send a preflight before nearly every call.
      'Access-Control-Max-Age': '7200',
    });
  }
  if (request.method !== 'POST' || !['session', 'token', 'logout'].includes(route)) {
    return json({ error: 'not found' }, 404, cors);
  }
  // A JSON body is what makes the browser ask first, so other sites cannot post blind.
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    return json({ error: 'expected JSON' }, 415, cors);
  }
  const body = await bodyOf(request);
  if (!body) return json({ error: 'bad request' }, 400, cors);

  const config = await configFrom(env);
  if (route === 'logout') return config ? logout(body, config, cors) : respond(204, null, cors);
  if (!config)
    return json({ available: false, signedIn: false } satisfies SessionAnswer, 200, cors);
  return route === 'token' ? token(body, origin, config, cors) : session(body, config, cors);
}
