import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../../vite.config.js';
import { keymapUrl, RAW_ORIGIN } from './keymap-url.js';

const AUTH = 'https://auth.example.com';

/** The sources a directive of the policy lists. */
function sources(directive: string): string[] {
  const found = contentSecurityPolicy(AUTH)
    .split('; ')
    .find((d) => d.startsWith(`${directive} `));
  return found ? found.split(' ').slice(1) : [];
}

describe("the built page's content security policy", () => {
  it('lets the page ask the host an address is fetched from, so Import works there', () => {
    // The dev server sends no policy, so nothing else shows the browser blocking a fetch.
    const asked = keymapUrl('https://github.com/someone/zmk-config/blob/main/board.yaml');
    expect(sources('connect-src')).toContain(asked.origin);
    expect(asked.origin).toBe(RAW_ORIGIN);
  });

  it('lets it ask nowhere else but its own origin, the GitHub API, that host and the sign-in server', () => {
    // The token and the session are in the page; this list is what keeps injected code from
    // sending them anywhere else. Widening it is a decision, and must change this test with it.
    expect(sources('connect-src')).toEqual(["'self'", 'https://api.github.com', RAW_ORIGIN, AUTH]);
    expect(contentSecurityPolicy('')).not.toMatch(/connect-src[^;]*(\*|https:(?!\/\/))/);
  });
});
