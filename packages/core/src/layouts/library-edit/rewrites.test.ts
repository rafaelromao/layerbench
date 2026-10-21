import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LibraryRequestRefused } from './request.js';
import {
  dropLanguages,
  landingAdd,
  landingRemove,
  landingRename,
  registerDocument,
  removeBuiltInId,
  unregisterDocument,
} from './rewrites.js';

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
    const after = landingAdd(landing, { id: 'new-layout', name: "Breeze <'&'>", author: 'Ana' });
    expect(listed(after)).toEqual({
      ids: [...before.ids, 'new-layout'],
      count: before.count + 1,
    });
    expect(after).toContain(
      '<li><a href="/analyze?layout=new-layout&amp;corpus=en-general">Breeze &lt;&#39;&amp;&#39;&gt; <span>Ana</span></a></li>',
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
    expect(() => landingAdd(landing, { id: 'qwerty', name: 'Qwerty' })).toThrow(
      LibraryRequestRefused,
    );
    expect(() => landingRemove(landing, 'new-layout')).toThrow(LibraryRequestRefused);
    expect(() => landingRename(landing, { id: 'new-layout', name: 'X' })).toThrow(
      LibraryRequestRefused,
    );
  });
});

describe('the ids of the layouts written in code', () => {
  const text = read('bundled-ids.ts');
  // Read from the file, so the cases hold on a branch a request has changed.
  const [first, second] = [...text.matchAll(/^ {2}'([\w-]+)',$/gm)].map((m) => m[1]);

  it('lose exactly the one asked for', () => {
    const after = removeBuiltInId(text, first);
    expect(after).not.toContain(`  '${first}',\n`);
    expect(after.split('\n')).toHaveLength(text.split('\n').length - 1);
    expect(after).toContain(`  '${second}',\n`);
  });

  it('refuse an id they do not list', () => {
    expect(() => removeBuiltInId(text, 'new-layout')).toThrow(LibraryRequestRefused);
    expect(() => removeBuiltInId(text, 'qwert')).toThrow(LibraryRequestRefused);
  });
});

describe('the languages file', () => {
  const text = read('languages.json');

  it('loses the one layout, keeping one a line as the writer keeps it', () => {
    const languages = JSON.parse(text) as Record<string, string[]>;
    const [first, second] = Object.keys(languages);
    const after = dropLanguages(text, first);
    expect(JSON.parse(after)).not.toHaveProperty(first);
    const lines = after.split('\n');
    expect(lines).toHaveLength(text.split('\n').length - 1);
    const kept = JSON.stringify(languages[second]).replaceAll(',', ', ');
    expect(lines).toContain(`  "${second}": ${kept},`);
    expect(after.endsWith('}\n')).toBe(true);
  });

  it('refuses a layout it has no line for', () => {
    expect(() => dropLanguages(text, 'new-layout')).toThrow(LibraryRequestRefused);
  });
});

/** `documents.ts` as it is written, with one document, so the cases hold whatever the Library has. */
const DOCUMENTS_TS = [
  "import { toCanonicalJson } from '../layout/json.js';",
  "import nordwind from './documents/nordwind.json';",
  '',
  'const DOCUMENTS: Record<string, unknown> = {',
  '  nordwind,',
  '};',
  '',
].join('\n');

describe('the documents module', () => {
  const text = DOCUMENTS_TS;

  it('takes one more as it is, and gives it back', () => {
    const live = read('documents.ts');
    const after = registerDocument(live, 'new-layout');
    expect(after).toContain("import newLayout from './documents/new-layout.json';\n");
    expect(after).toMatch(/ {2}'new-layout': newLayout,\n\};/);
    expect(unregisterDocument(after, 'new-layout')).toBe(live);
  });

  it('registers a document: its import among the others, its entry last', () => {
    const after = registerDocument(text, 'new-layout');
    expect(after).toContain("import newLayout from './documents/new-layout.json';\n");
    expect(after.indexOf('./documents/new-layout.json')).toBeLessThan(
      after.indexOf('./documents/nordwind.json'),
    );
    expect(after).toMatch(/ {2}nordwind,\n {2}'new-layout': newLayout,\n\};/);
    const plain = registerDocument(text, 'zed');
    expect(plain).toMatch(/ {2}nordwind,\n {2}zed,\n\};/);
    expect(plain.indexOf('./documents/zed.json')).toBeGreaterThan(
      plain.indexOf('./documents/nordwind.json'),
    );
  });

  it('takes a name a string holds, as Magic Romak registered holds Romak', () => {
    const both = registerDocument(registerDocument(text, 'magic-romak'), 'romak');
    expect(both).toContain("import romak from './documents/romak.json';");
    expect(both).toMatch(/ {2}'magic-romak': magicRomak,\n {2}romak,\n\};/);
    expect(() => registerDocument(both, 'romak')).toThrow(LibraryRequestRefused);
  });

  it('writes the object empty once its last document goes, and takes one again', () => {
    const none = unregisterDocument(text, 'nordwind');
    expect(none).toContain('const DOCUMENTS: Record<string, unknown> = {};');
    expect(registerDocument(none, 'new-layout')).toMatch(/= \{\n {2}'new-layout': newLayout,\n\};/);
  });

  it('names a document whose id starts with a digit so it is still an identifier', () => {
    expect(registerDocument(text, '3l')).toContain("import layout3l from './documents/3l.json';");
  });

  it('unregisters a document it registered, back to the text it had', () => {
    expect(unregisterDocument(registerDocument(text, 'new-layout'), 'new-layout')).toBe(text);
    expect(unregisterDocument(text, 'nordwind')).not.toContain('nordwind');
  });

  it('refuses one already there, and one that is not', () => {
    expect(() => registerDocument(text, 'nordwind')).toThrow(LibraryRequestRefused);
    expect(() => unregisterDocument(text, 'new-layout')).toThrow(LibraryRequestRefused);
  });
});
