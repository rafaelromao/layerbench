import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  dropLanguages,
  LibraryEditRefused,
  landingAdd,
  landingRemove,
  landingRename,
  registerDocument,
  removeBuiltInId,
  unregisterDocument,
} from './edits.js';

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const landing = readFileSync(
  new URL('../../../../../docs/site/index.html', import.meta.url),
  'utf8',
);

/** The ids the landing page lists, and the count its heading gives. */
function listed(html: string): { ids: string[]; count: number } {
  const ids = [...html.matchAll(/<li><a href="\/analyze\?layout=([\w-]+)&amp;/g)].map((m) => m[1]);
  const count = Number(/<h3 class="layouts-title">(\d+) layouts/.exec(html)?.[1]);
  return { ids, count };
}

describe('the landing page', () => {
  const before = listed(landing);

  it('lists one layout more, last, its name and author escaped, and counts it', () => {
    const after = landingAdd(landing, { id: 'magic-breeze', name: "Breeze <'&'>", author: 'Ana' });
    expect(listed(after)).toEqual({
      ids: [...before.ids, 'magic-breeze'],
      count: before.count + 1,
    });
    expect(after).toContain(
      '<li><a href="/analyze?layout=magic-breeze&amp;corpus=en-general">Breeze &lt;&#39;&amp;&#39;&gt; <span>Ana</span></a></li>',
    );
    expect(landingAdd(landing, { id: 'anon', name: 'Anon' })).toContain(
      '<li><a href="/analyze?layout=anon&amp;corpus=en-general">Anon</a></li>',
    );
  });

  it('lists one layout fewer, and counts that', () => {
    const after = landingRemove(landing, 'qwerty');
    expect(listed(after)).toEqual({
      ids: before.ids.filter((id) => id !== 'qwerty'),
      count: before.count - 1,
    });
  });

  it("renames a layout's line, keeping where it opens and who it names", () => {
    const after = landingRename(landing, { id: 'romak', name: 'Romak 2' });
    expect(after).toContain(
      '<li><a href="/analyze?layout=romak&amp;corpus=pt-br-general">Romak 2 <span>Rafael Romão</span></a></li>',
    );
    expect(landingRename(landing, { id: 'qwerty', name: 'QWERTY' })).toContain(
      '<li><a href="/analyze?layout=qwerty&amp;corpus=en-general">QWERTY</a></li>',
    );
  });

  it('refuses a layout it lists already, or one it does not', () => {
    expect(() => landingAdd(landing, { id: 'qwerty', name: 'Qwerty' })).toThrow(LibraryEditRefused);
    expect(() => landingRemove(landing, 'magic-breeze')).toThrow(LibraryEditRefused);
    expect(() => landingRename(landing, { id: 'magic-breeze', name: 'X' })).toThrow(
      LibraryEditRefused,
    );
  });
});

describe('the ids of the layouts written in code', () => {
  const text = read('bundled-ids.ts');

  it('lose exactly the one asked for', () => {
    const after = removeBuiltInId(text, 'qwerty');
    expect(after).not.toContain("'qwerty'");
    expect(after.split('\n')).toHaveLength(text.split('\n').length - 1);
    expect(after).toContain("  'dvorak',\n");
  });

  it('refuse an id they do not list', () => {
    expect(() => removeBuiltInId(text, 'nordwind')).toThrow(LibraryEditRefused);
    expect(() => removeBuiltInId(text, 'qwert')).toThrow(LibraryEditRefused);
  });
});

describe('the languages file', () => {
  const text = read('languages.json');

  it('loses the one layout, keeping one a line as the writer keeps it', () => {
    const after = dropLanguages(text, 'qwerty');
    expect(JSON.parse(after)).not.toHaveProperty('qwerty');
    const lines = after.split('\n');
    expect(lines).toHaveLength(text.split('\n').length - 1);
    expect(lines).toContain('  "romak": ["en", "pt-BR", "es", "fr", "it", "de"],');
    expect(after.endsWith('}\n')).toBe(true);
  });

  it('refuses a layout it has no line for', () => {
    expect(() => dropLanguages(text, 'nordwind')).toThrow(LibraryEditRefused);
  });
});

describe('the documents module', () => {
  const text = read('documents.ts');

  it('registers a document: its import among the others, its entry last', () => {
    const after = registerDocument(text, 'magic-breeze');
    expect(after).toContain("import magicBreeze from './documents/magic-breeze.json';\n");
    expect(after.indexOf('./documents/magic-breeze.json')).toBeLessThan(
      after.indexOf('./documents/nordwind.json'),
    );
    expect(after).toMatch(/ {2}nordwind,\n {2}'magic-breeze': magicBreeze,\n\};/);
    const plain = registerDocument(text, 'zed');
    expect(plain).toMatch(/ {2}nordwind,\n {2}zed,\n\};/);
    expect(plain.indexOf('./documents/zed.json')).toBeGreaterThan(
      plain.indexOf('./documents/nordwind.json'),
    );
  });

  it('names a document whose id starts with a digit so it is still an identifier', () => {
    expect(registerDocument(text, '3l')).toContain("import layout3l from './documents/3l.json';");
  });

  it('unregisters a document it registered, back to the text it had', () => {
    expect(unregisterDocument(registerDocument(text, 'magic-breeze'), 'magic-breeze')).toBe(text);
    expect(unregisterDocument(text, 'nordwind')).not.toContain('nordwind');
  });

  it('refuses one already there, and one that is not', () => {
    expect(() => registerDocument(text, 'nordwind')).toThrow(LibraryEditRefused);
    expect(() => unregisterDocument(text, 'magic-breeze')).toThrow(LibraryEditRefused);
  });
});
