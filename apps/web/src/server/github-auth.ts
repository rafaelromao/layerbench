/**
 * Sign-in with GitHub, the one part of the app that runs on a server: a Cloudflare Pages Function in
 * production (`functions/api/auth/[[path]].ts`) and the dev server's middleware locally.
 *
 * It exists because GitHub hands out tokens only to whoever knows the app's client secret, and a
 * page cannot keep a secret. It stores nothing: the tokens travel in an encrypted, HttpOnly cookie
 * the page cannot read, and the page gets only the short-lived access token, from `session`.
 *
 * Built on Web APIs only (`fetch`, `crypto.subtle`), which both runtimes provide.
 */

export interface AuthEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** The app's URL name, for the link that installs it on a fork. */
  GITHUB_APP_SLUG?: string;
  /** 32 random bytes in base64: the key the cookies are encrypted with. */
  SESSION_SECRET?: string;
  /** `owner/name` of the repository whose forks documents are saved to. */
  UPSTREAM_REPO?: string;
}

export const DEFAULT_UPSTREAM = 'rafaelromao/layoutmaster';

/** What `POST /api/auth/session` answers. */
export interface SessionAnswer {
  available: boolean;
  signedIn: boolean;
  login?: string;
  token?: string;
  /** Epoch milliseconds; null for a token that does not expire. */
  expiresAt?: number | null;
  appSlug?: string;
  upstream?: string;
}

interface Session {
  access: string;
  accessExpiresAt: number | null;
  refresh: string | null;
  refreshExpiresAt: number | null;
  login: string;
}

interface OAuthState {
  state: string;
  verifier: string;
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
const USER_AGENT = 'LayoutMaster';
/** The page is handed a token only while it has this long left; otherwise it is renewed first. */
const RENEW_MARGIN_MS = 5 * 60_000;
const OAUTH_MAX_AGE_S = 600;
/** A session whose tokens never expire is still forgotten after half a year. */
const SESSION_FALLBACK_MAX_AGE_S = 180 * 24 * 3600;

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

function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
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

/** The value, or null for anything not sealed with this key: a forged or stale cookie. */
async function unseal<T>(key: CryptoKey, text: string | undefined): Promise<T | null> {
  if (!text) return null;
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
// Cookies

/** `__Host-` needs HTTPS; the dev server on plain `http://localhost` goes without the prefix. */
function cookieName(request: Request, name: string): string {
  return new URL(request.url).protocol === 'https:' ? `__Host-${name}` : name;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

function setCookie(
  request: Request,
  name: string,
  value: string,
  opts: { maxAge: number; sameSite: 'Lax' | 'Strict' },
): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request, name)}=${value}; Path=/; HttpOnly${secure}; SameSite=${opts.sameSite}; Max-Age=${opts.maxAge}`;
}

const SESSION = 'lm-session';
const OAUTH = 'lm-oauth';

// ---------------------------------------------------------------------------------------------
// Responses

function headers(extra: Record<string, string> = {}): Headers {
  // `_headers` does not reach a Function's responses, so what matters here is set here.
  return new Headers({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
}

function respond(
  status: number,
  body: string | null,
  extra: Record<string, string>,
  cookies: string[],
): Response {
  const h = headers(extra);
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(body, { status, headers: h });
}

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  return respond(status, JSON.stringify(body), { 'Content-Type': 'application/json' }, cookies);
}

/** Back to the app. Never to an address taken from the request, so this is no open redirect. */
function home(request: Request, failed: boolean, cookies: string[] = []): Response {
  const location = new URL(failed ? '/?signin=failed' : '/', request.url).href;
  return respond(302, null, { Location: location }, cookies);
}

// ---------------------------------------------------------------------------------------------
// GitHub

function callbackUrl(request: Request): string {
  return new URL('/api/auth/callback', request.url).href;
}

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

function sessionFrom(grant: TokenGrant, login: string): Session {
  const now = Date.now();
  return {
    access: grant.access_token,
    accessExpiresAt: grant.expires_in ? now + grant.expires_in * 1000 : null,
    refresh: grant.refresh_token ?? null,
    refreshExpiresAt: grant.refresh_token_expires_in
      ? now + grant.refresh_token_expires_in * 1000
      : null,
    login,
  };
}

async function sessionCookie(request: Request, config: Config, session: Session): Promise<string> {
  const maxAge = session.refreshExpiresAt
    ? Math.max(0, Math.floor((session.refreshExpiresAt - Date.now()) / 1000))
    : SESSION_FALLBACK_MAX_AGE_S;
  return setCookie(request, SESSION, await seal(config.key, session), {
    maxAge,
    sameSite: 'Strict',
  });
}

function clearCookie(request: Request, name: string): string {
  return setCookie(request, name, '', { maxAge: 0, sameSite: 'Lax' });
}

// ---------------------------------------------------------------------------------------------
// Endpoints

async function login(request: Request, config: Config): Promise<Response> {
  const state = randomToken();
  const verifier = randomToken();
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const authorize = new URL(`${GITHUB}/login/oauth/authorize`);
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', callbackUrl(request));
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  const sealed = await seal(config.key, {
    state,
    verifier,
    expiresAt: Date.now() + OAUTH_MAX_AGE_S * 1000,
  } satisfies OAuthState);
  // Lax, not Strict: it has to come back with GitHub's redirect, a navigation from another site.
  const cookie = setCookie(request, OAUTH, sealed, { maxAge: OAUTH_MAX_AGE_S, sameSite: 'Lax' });
  return respond(302, null, { Location: authorize.href }, [cookie]);
}

async function callback(request: Request, config: Config): Promise<Response> {
  const url = new URL(request.url);
  const clear = clearCookie(request, OAUTH);
  const pending = await unseal<OAuthState>(
    config.key,
    readCookie(request, cookieName(request, OAUTH)),
  );
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!pending || pending.expiresAt < Date.now() || !code || !state || state !== pending.state) {
    return home(request, true, [clear]);
  }

  try {
    const grant = await requestToken({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: callbackUrl(request),
      code_verifier: pending.verifier,
    });
    if (!grant) return home(request, true, [clear]);

    const user = await fetch(`${API}/user`, {
      headers: {
        Authorization: `Bearer ${grant.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
    });
    if (!user.ok) return home(request, true, [clear]);
    const { login } = (await user.json()) as { login?: unknown };
    if (typeof login !== 'string') return home(request, true, [clear]);

    const cookie = await sessionCookie(request, config, sessionFrom(grant, login));
    return home(request, false, [clear, cookie]);
  } catch {
    return home(request, true, [clear]);
  }
}

/**
 * The page's access token, renewed first when it is about to expire. GitHub's refresh tokens work
 * once, so the page asks one tab at a time (see `src/auth/github-session.ts`).
 */
async function session(request: Request, config: Config): Promise<Response> {
  const base = { available: true, appSlug: config.appSlug, upstream: config.upstream };
  const name = cookieName(request, SESSION);
  const raw = readCookie(request, name);
  const current = await unseal<Session>(config.key, raw);
  if (!current) {
    return json({ ...base, signedIn: false }, 200, raw ? [clearCookie(request, SESSION)] : []);
  }

  const now = Date.now();
  const fresh = current.accessExpiresAt === null || current.accessExpiresAt - now > RENEW_MARGIN_MS;
  if (fresh) {
    return json({
      ...base,
      signedIn: true,
      login: current.login,
      token: current.access,
      expiresAt: current.accessExpiresAt,
    } satisfies SessionAnswer);
  }

  const signedOut = json({ ...base, signedIn: false }, 200, [clearCookie(request, SESSION)]);
  if (!current.refresh || (current.refreshExpiresAt !== null && current.refreshExpiresAt < now)) {
    return signedOut;
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
    // GitHub could not be reached: the session may still be good, so it is kept for a retry.
    return json({ error: 'GitHub could not be reached' }, 502);
  }
  if (!grant) return signedOut;

  const renewed = sessionFrom(grant, current.login);
  return json(
    {
      ...base,
      signedIn: true,
      login: renewed.login,
      token: renewed.access,
      expiresAt: renewed.accessExpiresAt,
    } satisfies SessionAnswer,
    200,
    [await sessionCookie(request, config, renewed)],
  );
}

async function logout(request: Request, config: Config): Promise<Response> {
  const current = await unseal<Session>(
    config.key,
    readCookie(request, cookieName(request, SESSION)),
  );
  if (current) {
    // Revoked as a courtesy; signing out does not depend on GitHub answering.
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
  return respond(204, null, {}, [clearCookie(request, SESSION)]);
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

/**
 * `POST` endpoints answer only the app's own pages. The session cookie is SameSite=Strict already;
 * this also turns away a request another site's page makes, which browsers label.
 */
function crossSite(request: Request): boolean {
  const site = request.headers.get('Sec-Fetch-Site');
  return site !== null && site !== 'same-origin';
}

/** Everything under `/api/auth/`. */
export async function handleAuth(request: Request, env: AuthEnv): Promise<Response> {
  const route = new URL(request.url).pathname.replace(/^\/api\/auth\/?/, '');
  const method = request.method;
  const config = await configFrom(env);

  if (route === 'session' && method === 'POST') {
    if (crossSite(request)) return json({ error: 'forbidden' }, 403);
    if (!config) return json({ available: false, signedIn: false } satisfies SessionAnswer);
    return session(request, config);
  }
  if (route === 'logout' && method === 'POST') {
    if (crossSite(request)) return json({ error: 'forbidden' }, 403);
    if (!config) return respond(204, null, {}, []);
    return logout(request, config);
  }
  if (route === 'login' && method === 'GET') {
    return config ? login(request, config) : home(request, true);
  }
  if (route === 'callback' && method === 'GET') {
    return config ? callback(request, config) : home(request, true);
  }
  return json({ error: 'not found' }, 404);
}
