import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * From the working directory, as the landing page's test reads it: a jsdom module has an http
 * URL.
 */
const root = (rel: string) => resolve(process.cwd(), '../..', rel);
const guide = readdirSync(root('docs/guide')).filter((f) => f.endsWith('.md'));

/**
 * What only the Library's maintainers can do in the app, deleting a layout from it and promoting
 * one into it, is shown to nobody else, and the pages people read say nothing of it: the guide, the
 * README, the landing page, the glossary and the agents' notes.
 */
const READ = [
  ...guide.map((f) => `docs/guide/${f}`),
  'README.md',
  'GLOSSARY.md',
  'AGENTS.md',
  'docs/site/index.html',
];

describe("the maintainers' tools, in what people read", () => {
  it.each(READ)('%s says nothing of promoting or of deleting from the Library', (path) => {
    const text = readFileSync(root(path), 'utf8');
    expect(text).not.toMatch(/\bpromot(e|es|ed|ing|ion)\b/i);
    expect(text).not.toMatch(/delet\w*[^.\n]*from the Library/i);
    expect(text).not.toMatch(/\/api\/auth\/maintain|`maintain`|maintainLibrary/);
  });

  it('reads the guide, every page of it', () => {
    expect(guide.length).toBeGreaterThan(3);
  });
});
