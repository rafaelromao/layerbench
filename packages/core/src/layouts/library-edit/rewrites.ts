import { languagesFileText } from '../../lang/performance.js';
import { codeOf } from './code.js';
import { LibraryRequestRefused } from './request.js';

/**
 * The changes a Library request makes to the repository's own files, each from a file's text to its
 * new text. They are run by `pnpm library-edit` in CI, on a branch the sign-in server opened a pull
 * request from, never in the app. Each finds what it changes exactly once or refuses, so a file it
 * does not recognise is left for a person rather than half edited.
 */

/** The index of the only line equal to `line` between `start` and `end`, or a refusal. */
function onlyLine(lines: string[], line: string, start: number, end: number, what: string): number {
  const found: number[] = [];
  for (let i = start; i < end; i++) if (lines[i] === line) found.push(i);
  if (found.length !== 1) {
    throw new LibraryRequestRefused(`${what}: found ${found.length} times, not once`);
  }
  return found[0];
}

/** The lines of the block opening on the line `open` and closing on the first `close` after it. */
function block(lines: string[], open: string, close: string, what: string): [number, number] {
  const start = onlyLine(lines, open, 0, lines.length, what);
  const end = lines.indexOf(close, start + 1);
  if (end < 0) throw new LibraryRequestRefused(`${what}: no end`);
  return [start, end];
}

/** `bundled-ids.ts` without one id among those of the layouts written in code. */
export function removeBuiltInId(text: string, id: string): string {
  const lines = text.split('\n');
  const [start, end] = block(lines, 'const BUILT_IN_IDS = [', '];', 'BUILT_IN_IDS');
  lines.splice(onlyLine(lines, `  '${id}',`, start, end, `the id ${id}`), 1);
  return lines.join('\n');
}

/** `languages.json` without one layout's line. */
export function dropLanguages(text: string, id: string): string {
  const languages = JSON.parse(text) as Record<string, string[]>;
  if (!Object.hasOwn(languages, id)) {
    throw new LibraryRequestRefused(`languages.json has no line for ${id}`);
  }
  return languagesFileText(Object.entries(languages).filter(([key]) => key !== id));
}

/** A layout as the landing page names it. */
export interface LandingEntry {
  id: string;
  name: string;
  author?: string;
}

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** The landing page's list of layouts, `<ul class="layouts">`, by line. */
function landingList(lines: string[]): [number, number] {
  const start = onlyLine(
    lines.map((l) => l.trim()),
    '<ul class="layouts">',
    0,
    lines.length,
    'the list of layouts',
  );
  const end = lines.findIndex((l, i) => i > start && l.trim() === '</ul>');
  if (end < 0) throw new LibraryRequestRefused('the list of layouts: no end');
  return [start, end];
}

/** The line of the list that opens `id`, found once. */
function landingLine(lines: string[], id: string, start: number, end: number): number {
  const opens = `<li><a href="/analyze?layout=${id}&amp;`;
  const found: number[] = [];
  for (let i = start + 1; i < end; i++) if (lines[i].trim().startsWith(opens)) found.push(i);
  if (found.length !== 1) {
    throw new LibraryRequestRefused(`the landing page lists ${id} ${found.length} times, not once`);
  }
  return found[0];
}

/** The heading over the list, counting what it lists. */
function recount(lines: string[]): string {
  const [start, end] = landingList(lines);
  const count = lines.slice(start + 1, end).filter((l) => l.trim().startsWith('<li>')).length;
  const heading = lines.findIndex((l) => l.includes('<h3 class="layouts-title">'));
  if (heading < 0) throw new LibraryRequestRefused('the landing page has no layouts heading');
  lines[heading] = lines[heading].replace(/(<h3 class="layouts-title">)\d+/, `$1${count}`);
  return lines.join('\n');
}

/** The landing page naming one layout more, last in its list. */
export function landingAdd(html: string, entry: LandingEntry): string {
  const lines = html.split('\n');
  const [start, end] = landingList(lines);
  if (lines.slice(start, end).some((l) => l.includes(`layout=${entry.id}&amp;`))) {
    throw new LibraryRequestRefused(`the landing page lists ${entry.id} already`);
  }
  const indent = /^\s*/.exec(lines[end - 1])?.[0] ?? '';
  const author = entry.author ? ` <span>${escapeHtml(entry.author)}</span>` : '';
  lines.splice(
    end,
    0,
    `${indent}<li><a href="/analyze?layout=${entry.id}&amp;corpus=en-general">${escapeHtml(entry.name)}${author}</a></li>`,
  );
  return recount(lines);
}

/** The landing page without one layout's line. */
export function landingRemove(html: string, id: string): string {
  const lines = html.split('\n');
  const [start, end] = landingList(lines);
  lines.splice(landingLine(lines, id, start, end), 1);
  return recount(lines);
}

/** The landing page naming a layout anew, where it opens and who made it as they were. */
export function landingRename(html: string, entry: LandingEntry): string {
  const lines = html.split('\n');
  const [start, end] = landingList(lines);
  const at = landingLine(lines, entry.id, start, end);
  // A replacer, so a `$` in the name is the name's, not a pattern.
  const name = escapeHtml(entry.name);
  lines[at] = lines[at].replace(
    /(">)[^<]*( <span>|<\/a>)/,
    (_, open: string, close: string) => `${open}${name}${close}`,
  );
  return lines.join('\n');
}

/** Words a document's import cannot be named, besides those the module already uses. */
const RESERVED = new Set(
  [
    'await break case catch class const continue debugger default delete do else enum export',
    'extends false finally for function if import in instanceof let new null return static super',
    'switch this throw true try typeof var void while with yield',
  ]
    .join(' ')
    .split(' '),
);

/** The name a document is imported by: its id in camel case, `layout` before a leading digit. */
function importName(id: string): string {
  const camel = id
    .replace(/-+([A-Za-z0-9_])/g, (_, c: string) => c.toUpperCase())
    .replace(/-/g, '');
  return /^[0-9]/.test(camel) ? `layout${camel}` : camel;
}

const importLine = (name: string, id: string) => `import ${name} from './documents/${id}.json';`;
const entryLine = (name: string, id: string) => (name === id ? `  ${id},` : `  '${id}': ${name},`);
const DOCUMENTS_OPEN = 'const DOCUMENTS: Record<string, unknown> = {';
/** The object with no document left in it, as Biome writes it. */
const DOCUMENTS_EMPTY = `${DOCUMENTS_OPEN}};`;
const opened = (text: string) =>
  text.split('\n').flatMap((l) => (l === DOCUMENTS_EMPTY ? [DOCUMENTS_OPEN, '};'] : [l]));

/** `documents.ts` with one more document: its import among the others', its entry last. */
export function registerDocument(text: string, id: string): string {
  if (text.includes(`'./documents/${id}.json'`)) {
    throw new LibraryRequestRefused(`${id} is registered already`);
  }
  const name = importName(id);
  // Taken by the code, not by a string that holds it, as `'magic-romak'` holds `romak`.
  if (RESERVED.has(name) || new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(codeOf(text))) {
    throw new LibraryRequestRefused(`${id} would be imported as ${name}, a name already taken`);
  }
  const lines = opened(text);
  const imports = lines.flatMap((l, i) => (l.startsWith('import ') ? [i] : []));
  const path = (line: string) => /from '([^']+)'/.exec(line)?.[1] ?? '';
  const documents = imports.filter((i) => path(lines[i]).startsWith('./documents/'));
  const last = documents.at(-1) ?? imports.at(-1);
  if (last === undefined) throw new LibraryRequestRefused('documents.ts imports nothing');
  const after = documents.find((i) => path(lines[i]) > `./documents/${id}.json`);
  lines.splice(after ?? last + 1, 0, importLine(name, id));
  const [, end] = block(lines, DOCUMENTS_OPEN, '};', 'DOCUMENTS');
  lines.splice(end, 0, entryLine(name, id));
  return lines.join('\n');
}

/** `documents.ts` without one document's import and entry. */
export function unregisterDocument(text: string, id: string): string {
  const name = importName(id);
  const lines = opened(text);
  lines.splice(onlyLine(lines, importLine(name, id), 0, lines.length, `the import of ${id}`), 1);
  const [start, end] = block(lines, DOCUMENTS_OPEN, '};', 'DOCUMENTS');
  lines.splice(onlyLine(lines, entryLine(name, id), start, end, `the entry of ${id}`), 1);
  // The last one gone, the object is written empty, as Biome would.
  const at = lines.indexOf(DOCUMENTS_OPEN);
  if (lines[at + 1] === '};') lines.splice(at, 2, DOCUMENTS_EMPTY);
  return lines.join('\n');
}
