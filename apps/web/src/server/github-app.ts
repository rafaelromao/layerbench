/**
 * The GitHub App acting as itself, rather than as a signed-in user: what Submit opens its pull
 * request with (`submit.ts`). GitHub hands an App's installation a token for the repositories it is
 * installed on in exchange for a JWT signed with the App's private key, which only the server has.
 *
 * Built on Web APIs only (`fetch`, `crypto.subtle`), as the rest of the server is.
 */

export interface AppCredentials {
  /** The App's numeric id, from its settings page; not the client id. */
  appId: string;
  /** The private key GitHub generated for the App, as the PEM file it downloads. */
  privateKey: string;
}

const API = 'https://api.github.com';
const USER_AGENT = 'LayerBench';

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let rest = n; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

/** `AlgorithmIdentifier` for rsaEncryption, with its NULL parameters. */
const RSA_ALGORITHM = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
];

/**
 * A PKCS#1 RSA key, which is what GitHub downloads, wrapped as the PKCS#8 one Web Crypto imports:
 * `SEQUENCE { INTEGER 0, AlgorithmIdentifier, OCTET STRING pkcs1 }`.
 */
function pkcs8FromPkcs1(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const inner = [0x02, 0x01, 0x00, ...RSA_ALGORITHM, 0x04, ...derLength(pkcs1.length), ...pkcs1];
  return new Uint8Array([0x30, ...derLength(inner.length), ...inner]);
}

/**
 * The key's DER bytes, as PKCS#8, from a PEM file of either kind. A secret pasted with its line
 * breaks written as `\n` reads the same.
 */
function pkcs8Der(pem: string): Uint8Array<ArrayBuffer> | null {
  const text = pem.replace(/\\n/g, '\n');
  const match = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]*?)-----END (RSA )?PRIVATE KEY-----/.exec(
    text,
  );
  if (!match) return null;
  try {
    const binary = atob((match[2] ?? '').replace(/\s+/g, ''));
    const der = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
    return match[1] ? pkcs8FromPkcs1(der) : der;
  } catch {
    return null;
  }
}

/**
 * The App's JWT: good for nine minutes, from a minute ago, as GitHub allows ten and the clocks may
 * differ. Null when the key will not import.
 */
export async function appJwt(
  credentials: AppCredentials,
  now = Date.now(),
): Promise<string | null> {
  const der = pkcs8Der(credentials.privateKey);
  if (!der) return null;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    return null;
  }
  const seconds = Math.floor(now / 1000);
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: seconds - 60,
    exp: seconds + 540,
    iss: credentials.appId,
  })}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

async function asApp(jwt: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Answers that say the App is not set up for this: its key refused, or not installed there. */
const NOT_SET_UP = [401, 403, 404];

function refused(res: Response): null {
  if (NOT_SET_UP.includes(res.status)) return null;
  throw new Error(`GitHub answered ${res.status}`);
}

/**
 * A token for the App's installation on `repo` (`owner/name`), good for an hour, for that
 * repository alone and only what Submit needs: its contents and pull requests. Null when the App is
 * not installed there or its key is refused, which is how it is not set up; throws when GitHub
 * cannot be reached or fails, so that is not mistaken for it.
 */
export async function installationToken(
  credentials: AppCredentials,
  repo: string,
): Promise<string | null> {
  const jwt = await appJwt(credentials);
  if (!jwt) return null;
  const installation = await asApp(jwt, 'GET', `/repos/${repo}/installation`);
  if (!installation.ok) return refused(installation);
  const { id } = (await installation.json()) as { id?: unknown };
  if (typeof id !== 'number') return null;
  const res = await asApp(jwt, 'POST', `/app/installations/${id}/access_tokens`, {
    repositories: [repo.slice(repo.indexOf('/') + 1)],
    permissions: { contents: 'write', pull_requests: 'write' },
  });
  if (!res.ok) return refused(res);
  const { token } = (await res.json()) as { token?: unknown };
  return typeof token === 'string' ? token : null;
}
