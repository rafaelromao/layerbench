import { LibraryRequestRefused } from './request.js';

/**
 * Changes to the text of the files the layouts written in code live in, `classic.ts` and
 * `small.ts`, as Biome formats them: a definition is an object in its list, opening on a line `  {`
 * and closing on one `  },`, with its `id` on a line of its own; and every top-level statement
 * starts a line. A definition that is not written so is refused, not guessed at.
 */

/**
 * The text with every string, template literal and comment blanked out, newlines kept, so that what
 * is left is code: names and brackets in a string or a comment are not counted. A template
 * literal's `${…}` is code. The files edited here have no regular-expression literals.
 */
export function codeOf(text: string): string {
  const out = [...text];
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  // A stack of what is open: a template literal waiting for its closing backtick, or one of its
  // `${` expressions waiting for the brace that closes it.
  const stack: ('template' | number)[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const top = stack.at(-1);
    if (top === 'template') {
      if (c === '\\') {
        blank(i, i + 2);
        i += 2;
      } else if (c === '`') {
        stack.pop();
        i++;
      } else if (c === '$' && text[i + 1] === '{') {
        stack.push(0);
        i += 2;
      } else {
        blank(i, i + 1);
        i++;
      }
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      const to = end < 0 ? text.length : end;
      blank(i, to);
      i = to;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const to = end < 0 ? text.length : end + 2;
      blank(i, to);
      i = to;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else if (c === '`') {
      stack.push('template');
      i++;
    } else {
      if (typeof top === 'number') {
        if (c === '{') stack[stack.length - 1] = top + 1;
        else if (c === '}') {
          if (top === 0) stack.pop();
          else stack[stack.length - 1] = top - 1;
        }
      }
      i++;
    }
  }
  return out.join('');
}

/** A top-level statement: its lines, the comments right above it included. */
interface Statement {
  /** First line, its leading comment's if it has one. */
  from: number;
  /** The line its code starts on. */
  code: number;
  /** One past its last line. */
  to: number;
}

/**
 * The top-level statements, by line. One starts on a line that starts outside every bracket with
 * code that is not a closing bracket; the comment lines right above it, with no blank line between,
 * are its own. Blank lines and comments standing alone belong to no statement.
 */
function statements(text: string): Statement[] {
  const code = codeOf(text);
  const lines = text.split('\n');
  const codeLines = code.split('\n');
  const starts: number[] = [];
  let depth = 0;
  for (let n = 0; n < lines.length; n++) {
    const first = codeLines[n][0];
    if (depth === 0 && first !== undefined && first !== ' ' && !'})]'.includes(first)) {
      starts.push(n);
    }
    for (const ch of codeLines[n]) {
      if ('{[('.includes(ch)) depth++;
      else if ('}])'.includes(ch)) depth--;
    }
  }
  return starts.map((start, k) => {
    let from = start;
    while (from > 0 && lines[from - 1].trim() !== '' && codeLines[from - 1].trim() === '') from--;
    let to = k + 1 < starts.length ? starts[k + 1] : lines.length;
    while (to > start + 1 && codeLines[to - 1].trim() === '') to--;
    return { from, code: start, to };
  });
}

/** The name a statement declares, unless it is exported or declares none this can read. */
function declared(line: string): string | undefined {
  return /^(?:const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(
    line,
  )?.[1];
}

/** How often `name` is used: not a property after one dot, but after a spread's three it is. */
const uses = (code: string, name: string) =>
  (
    code.match(
      new RegExp(`(?<![\\w$])(?<!(?:^|[^.])\\.)${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'gm'),
    ) ?? []
  ).length;

/** The code of the whole text but the lines of one statement. */
function codeWithout(text: string, s: Statement): string {
  const lines = codeOf(text).split('\n');
  return [...lines.slice(0, s.from), ...lines.slice(s.to)].join('\n');
}

/** The names declared at the top level, not exported, that nothing else uses. */
export function unusedNames(text: string): string[] {
  const lines = text.split('\n');
  return statements(text).flatMap((s) => {
    const name = declared(lines[s.code]);
    return name && uses(codeWithout(text, s), name) === 0 ? [name] : [];
  });
}

/** One import statement with the specifiers nothing else uses taken out, or nothing left. */
function prunedImport(statement: string, rest: string): string | null {
  const m = /^import (type )?\{([^}]*)\} from ('[^']+');$/.exec(
    statement.replace(/\s*\n\s*/g, ' '),
  );
  if (!m) return statement;
  const [, typeOnly = '', list, from] = m;
  const specifiers = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = specifiers.filter((s) =>
    uses(
      rest,
      s
        .replace(/^type /, '')
        .split(' as ')
        .at(-1) ?? s,
    ),
  );
  if (kept.length === specifiers.length) return statement;
  if (kept.length === 0) return null;
  return `import ${typeOnly}{ ${kept.join(', ')} } from ${from};`;
}

/**
 * The text without the top-level statements nothing uses any more, and the imports they alone
 * used, until there are none left: what a removed definition leaves behind. An exported statement
 * is used from outside, and stays.
 */
export function pruneUnused(text: string): string {
  let current = text;
  for (;;) {
    const lines = current.split('\n');
    const all = statements(current);
    const dead = all.find((s) => {
      const name = declared(lines[s.code]);
      return name !== undefined && uses(codeWithout(current, s), name) === 0;
    });
    if (dead) {
      lines.splice(dead.from, dead.to - dead.from);
      // A blank line left on either side of where it was, not two.
      if (lines[dead.from - 1]?.trim() === '' && lines[dead.from]?.trim() === '') {
        lines.splice(dead.from, 1);
      }
      current = lines.join('\n');
      continue;
    }
    const imports = all.filter((s) => lines[s.code].startsWith('import '));
    let changed = false;
    for (const s of [...imports].reverse()) {
      const statement = lines.slice(s.code, s.to).join('\n');
      const pruned = prunedImport(statement, codeWithout(current, s));
      if (pruned === statement) continue;
      lines.splice(s.code, s.to - s.code, ...(pruned === null ? [] : [pruned]));
      changed = true;
    }
    if (!changed) return current;
    current = lines.join('\n');
  }
}

/**
 * The text without one definition of a list of them, the comment right above it included: the
 * object whose `id` line is `    id: '<id>',` inside `export const <list>: ClassicDef[] = [`.
 */
export function removeDef(text: string, list: string, id: string): string {
  const lines = text.split('\n');
  const open = lines.indexOf(`export const ${list}: ClassicDef[] = [`);
  const close = lines.indexOf('];', open + 1);
  if (open < 0 || close < 0) throw new LibraryRequestRefused(`no ${list} to take ${id} out of`);
  const idLine = `    id: '${id}',`;
  const at = lines.slice(open + 1, close).flatMap((l, k) => (l === idLine ? [open + 1 + k] : []));
  if (at.length !== 1) {
    throw new LibraryRequestRefused(`${list} defines ${id} ${at.length} times, not once`);
  }
  let start = at[0] - 1;
  while (start > open && lines[start] !== '  {') start--;
  let end = at[0] + 1;
  while (end < close && lines[end] !== '  },') end++;
  if (lines[start] !== '  {' || lines[end] !== '  },') {
    throw new LibraryRequestRefused(`${id} is not written as an object of its own in ${list}`);
  }
  const body = codeOf(lines.slice(start, end + 1).join('\n'));
  const balance = (a: string, b: string) => body.split(a).length - body.split(b).length;
  if (balance('{', '}') !== 0 || balance('[', ']') !== 0 || balance('(', ')') !== 0) {
    throw new LibraryRequestRefused(`${id}'s definition does not close where it should`);
  }
  // The comment right above it is its own.
  while (start - 1 > open && /^ {2}(\/\/|\/\*\*|\*|\s\*)/.test(lines[start - 1])) start--;
  lines.splice(start, end + 1 - start);
  return lines.join('\n');
}
