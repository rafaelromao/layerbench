export const API = 'https://api.github.com';

/**
 * How a request to GitHub gets its credentials. The token comes from the sign-in session, which
 * renews it before it expires; a 401 still tells the session which token GitHub turned down, so it
 * can have that one renewed, or find out the session is over.
 */
export interface GitHubAccess {
  token: () => Promise<string>;
  onUnauthorized?: (rejected: string) => void;
}

/**
 * A request to the GitHub API. The token goes in the authorization header and nowhere else: never
 * in a URL, a body or an error message.
 */
export async function gitHubFetch(
  access: GitHubAccess,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  const token = await access.token();
  const res = await fetch(url, {
    method: init.method,
    body: init.body,
    headers: {
      // The browser sets its own user agent; GitHub accepts that.
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
  if (res.status === 401) access.onUnauthorized?.(token);
  return res;
}
