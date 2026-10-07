import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from './theme.js';

/** Resolved from the working directory, as the test corpora are: a jsdom module has an http URL. */
const PUBLIC = resolve(process.cwd(), 'public');

describe('the tab icon', () => {
  let link: HTMLLinkElement;

  beforeEach(() => {
    link = document.createElement('link');
    link.rel = 'icon';
    link.setAttribute('href', '/favicon.svg');
    document.head.append(link);
  });

  afterEach(() => {
    link.remove();
    vi.restoreAllMocks();
  });

  it('takes the colours of the theme chosen', () => {
    applyTheme('dark');
    expect(link.getAttribute('href')).toBe('/favicon-dark.svg');
    applyTheme('light');
    expect(link.getAttribute('href')).toBe('/favicon-light.svg');
  });

  it("follows the system's theme when that is the choice", () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: query === '(prefers-color-scheme: dark)' }) as MediaQueryList,
    );
    applyTheme('system');
    expect(link.getAttribute('href')).toBe('/favicon-dark.svg');
  });

  it('is drawn in the accent of each theme', () => {
    for (const theme of ['light', 'dark']) {
      expect(existsSync(resolve(PUBLIC, `favicon-${theme}.svg`)), theme).toBe(true);
    }
    // The one the page starts with follows the system, in the same two sets of colours.
    const adaptive = readFileSync(resolve(PUBLIC, 'favicon.svg'), 'utf8');
    for (const theme of ['light', 'dark']) {
      const fixed = readFileSync(resolve(PUBLIC, `favicon-${theme}.svg`), 'utf8');
      for (const colour of fixed.match(/#[0-9a-f]{6}/g) ?? []) {
        expect(adaptive, `${theme} ${colour}`).toContain(colour);
      }
    }
  });
});
