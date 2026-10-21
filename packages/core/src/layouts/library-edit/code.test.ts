import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLASSIC_DEFS } from '../classic.js';
import { SMALL_DEFS } from '../small.js';
import { codeOf, pruneUnused, removeDef, unusedNames } from './code.js';
import { LibraryRequestRefused } from './request.js';

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const FILES = [
  { file: 'classic.ts', list: 'CLASSIC_DEFS', ids: CLASSIC_DEFS.map((d) => d.id) },
  { file: 'small.ts', list: 'SMALL_DEFS', ids: SMALL_DEFS.map((d) => d.id) },
] as const;

/** The ids a definitions file still defines, read from its text. */
const idsIn = (text: string) => [...text.matchAll(/^ {4}id: '([\w-]+)',$/gm)].map((m) => m[1]);

/** The names a file declares or imports at its top level. */
function topNames(text: string): Set<string> {
  const names = new Set(
    [...text.matchAll(/^(?:export )?(?:const|function|let|class|type|interface) (\w+)/gm)].map(
      (m) => m[1],
    ),
  );
  for (const m of text.matchAll(/^import (?:type )?\{([^}]*)\}/gm)) {
    for (const s of m[1].split(',')) if (s.trim()) names.add(s.trim().replace(/^type /, ''));
  }
  return names;
}

/** The names of `before` that `after` still uses but no longer declares or imports. */
function dangling(before: string, after: string): string[] {
  const kept = topNames(after);
  const code = codeOf(after);
  return [...topNames(before)].filter(
    (n) =>
      !kept.has(n) && new RegExp(`(?<![\\w$])(?<!(?:^|[^.])\\.)${n}(?![\\w$])`, 'm').test(code),
  );
}

describe('a layout written in code, taken out of its file', () => {
  for (const { file, list, ids } of FILES) {
    const text = read(file);

    it(`${file} as it is leaves no top-level name unused`, () => {
      expect(unusedNames(text)).toEqual([]);
      expect(pruneUnused(text)).toBe(text);
    });

    it.each(ids)(`${file} without %s keeps every other layout and no helper only it used`, (id) => {
      const after = pruneUnused(removeDef(text, list, id));
      expect(idsIn(after)).toEqual(ids.filter((other) => other !== id));
      expect(unusedNames(after)).toEqual([]);
      expect(dangling(text, after)).toEqual([]);
      // Nothing is left half open.
      const code = codeOf(after);
      for (const [open, close] of ['{}', '[]', '()']) {
        const count = (c: string) => code.split(c).length;
        expect(count(open), `${open}${close}`).toBe(count(close));
      }
    });
  }

  // While Magic Romak is written in code: a change to it makes it a document.
  it.runIf(SMALL_DEFS.some((d) => d.id === 'magic-romak'))(
    'takes Magic Romak out with the helpers it alone used, and its imports with them',
    () => {
      const after = pruneUnused(removeDef(read('small.ts'), 'SMALL_DEFS', 'magic-romak'));
      for (const helper of ['ALT_REPEAT', 'alpha2Combos', 'taggedAccent', 'CCEDIL_BINDINGS']) {
        expect(after).not.toMatch(new RegExp(`\\b${helper}\\b`));
      }
      expect(after).not.toContain('ComboDef');
    },
  );

  it('refuses an id the list does not define, or a list the file does not have', () => {
    const text = read('classic.ts');
    expect(() => removeDef(text, 'CLASSIC_DEFS', 'nordwind')).toThrow(LibraryRequestRefused);
    expect(() => removeDef(text, 'SMALL_DEFS', 'qwerty')).toThrow(LibraryRequestRefused);
  });
});
