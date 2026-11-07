import { CODE_LANGUAGES, type CodeLanguage, type Lexicon } from './languages.js';

/**
 * Takes the comments out of source code, and the docstrings of the indentation languages, which
 * is where the names, the addresses and the licence headers of a project are. Strings stay: they
 * are typed. This is a scanner, not a parser: it only has to know where a string ends to tell a
 * `//` inside one from a comment, and a string it takes for something else costs a comment's text
 * left in, which `rejectLine` then judges like any other line.
 */

const IDENT = /[A-Za-z0-9_$]/;
const STRING_PREFIX = /[rRbBuUfF]/;
const RUST_RAW = /b?r(#*)"/y;
const CPP_RAW = /(?:u8|u|U|L)?R"([^()\\\s]{0,16})\(/y;
const VERBATIM = /[$@]{1,2}"/y;
const CHAR_LITERAL = /'(?:\\.[^\n']{0,9}|[^\\'\n])'/y;

/** Past the end of a string quoted by `quote` that opens at `i`; at a line's end if it runs over. */
function endOfQuoted(src: string, i: number, quote: string, lx: Lexicon, escapes = true): number {
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (escapes && ch === '\\') j += 2;
    else if (ch === quote) return j + 1;
    else if (ch === '\n' && !lx.multiline) return j;
    else j++;
  }
  return src.length;
}

/** Past the end of a C# verbatim string, where a doubled quote is a quote. */
function endOfVerbatim(src: string, quoteAt: number): number {
  let j = quoteAt + 1;
  while (j < src.length) {
    if (src[j] !== '"') j++;
    else if (src[j + 1] === '"') j += 2;
    else return j + 1;
  }
  return src.length;
}

/** Past the end of a block comment that opens at `i`. */
function endOfBlock(src: string, i: number, bc: NonNullable<Lexicon['blockComment']>): number {
  let depth = 1;
  let j = i + bc.open.length;
  while (j < src.length) {
    if (bc.nested && src.startsWith(bc.open, j)) {
      depth++;
      j += bc.open.length;
    } else if (src.startsWith(bc.close, j)) {
      depth--;
      j += bc.close.length;
      if (depth === 0) return j;
    } else j++;
  }
  return src.length;
}

/** Past the end of a string with delimiter `end` that starts after `from`, or the source's end. */
function endOfDelimited(src: string, from: number, end: string): number {
  const at = src.indexOf(end, from);
  return at < 0 ? src.length : at + end.length;
}

/** Past the end of the string that opens at `i` in a brace language, or `i` when none does. */
function braceString(src: string, i: number, lx: Lexicon): number {
  const c = src[i];
  const beforeIsWord = i > 0 && IDENT.test(src[i - 1]);
  if (lx.rustRaw && (c === 'r' || c === 'b') && !beforeIsWord) {
    RUST_RAW.lastIndex = i;
    const m = RUST_RAW.exec(src);
    if (m) return endOfDelimited(src, i + m[0].length, `"${m[1]}`);
  }
  if (lx.cppRaw && /[uULR]/.test(c) && !beforeIsWord) {
    CPP_RAW.lastIndex = i;
    const m = CPP_RAW.exec(src);
    if (m) return endOfDelimited(src, i + m[0].length, `)${m[1]}"`);
  }
  if (lx.verbatim && (c === '@' || c === '$')) {
    VERBATIM.lastIndex = i;
    const m = VERBATIM.exec(src);
    if (m?.[0].includes('@')) return endOfVerbatim(src, i + m[0].length - 1);
  }
  if (c === '"' && lx.tripleQuote && src.startsWith('"""', i)) {
    return endOfDelimited(src, i + 3, '"""');
  }
  if (c === '`' && lx.backtick) {
    return endOfQuoted(src, i, '`', { ...lx, multiline: true }, lx.backtick.escapes);
  }
  if (c === '"') return endOfQuoted(src, i, '"', lx);
  if (c === "'") {
    if (!lx.charOnly) return endOfQuoted(src, i, "'", lx);
    CHAR_LITERAL.lastIndex = i;
    const m = CHAR_LITERAL.exec(src);
    if (m) return i + m[0].length;
  }
  return i;
}

function stripBrace(src: string, lx: Lexicon): string {
  const starters = new Set(lx.lineComment.map((m) => m[0]));
  if (lx.blockComment) starters.add(lx.blockComment.open[0]);
  let out = '';
  let start = 0;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (starters.has(c)) {
      // A block comment is looked for first: Lua's `--[[` also starts with its line comment.
      if (lx.blockComment && src.startsWith(lx.blockComment.open, i)) {
        out += `${src.slice(start, i)} `;
        i = endOfBlock(src, i, lx.blockComment);
        start = i;
        continue;
      }
      // `#[` opens a PHP attribute, not a comment.
      const line = lx.lineComment.some((m) => src.startsWith(m, i)) && src.slice(i, i + 2) !== '#[';
      if (line) {
        out += src.slice(start, i);
        const eol = src.indexOf('\n', i);
        i = eol < 0 ? src.length : eol;
        start = i;
        continue;
      }
    }
    if (lx.strings === false) {
      i++;
      continue;
    }
    const end = braceString(src, i, lx);
    i = end > i ? end : i + 1;
  }
  return out + src.slice(start);
}

/** How many letters of a string prefix (`r`, `rb`, `f`…) start at `i`, or -1 if no string does. */
function prefixLength(src: string, i: number): number {
  const c = src[i];
  if (c === '"' || c === "'") return 0;
  if (!STRING_PREFIX.test(c) || (i > 0 && IDENT.test(src[i - 1]))) return -1;
  for (let k = 1; k <= 2; k++) {
    const next = src[i + k];
    if (next === '"' || next === "'") return k;
    if (!STRING_PREFIX.test(next ?? '')) return -1;
  }
  return -1;
}

function stripIndent(src: string, lx: Lexicon): string {
  let out = '';
  let start = 0;
  let i = 0;
  while (i < src.length) {
    if (src[i] === '#') {
      if (lx.blockComment && src.startsWith(lx.blockComment.open, i)) {
        out += `${src.slice(start, i)} `;
        i = endOfBlock(src, i, lx.blockComment);
      } else {
        out += src.slice(start, i);
        const eol = src.indexOf('\n', i);
        i = eol < 0 ? src.length : eol;
      }
      start = i;
      continue;
    }
    const prefix = prefixLength(src, i);
    if (prefix < 0) {
      i++;
      continue;
    }
    const quoteAt = i + prefix;
    const quote = src[quoteAt];
    const triple = quote.repeat(3);
    if (lx.tripleQuote && src.startsWith(triple, quoteAt)) {
      let j = quoteAt + 3;
      while (j < src.length && !src.startsWith(triple, j)) j += src[j] === '\\' ? 2 : 1;
      const end = Math.min(j + 3, src.length);
      // A string that is a statement of its own, a docstring or a block comment, is dropped.
      const lineStart = src.lastIndexOf('\n', i - 1) + 1;
      const before = src.slice(lineStart, i);
      const eol = src.indexOf('\n', end);
      const after = src.slice(end, eol < 0 ? src.length : eol);
      const discard = lx.discardComment && /^\s*discard\s+$/.test(before);
      if ((/^\s*$/.test(before) || discard) && /^\s*(#.*)?$/.test(after)) {
        out += src.slice(start, discard ? lineStart + before.indexOf('discard') : i);
        start = end;
      }
      i = end;
      continue;
    }
    if (quote === "'" && lx.charOnly) {
      CHAR_LITERAL.lastIndex = quoteAt;
      const m = CHAR_LITERAL.exec(src);
      i = m ? quoteAt + m[0].length : quoteAt + 1;
      continue;
    }
    i = endOfQuoted(src, quoteAt, quote, lx);
  }
  return out + src.slice(start);
}

/** The source of one file with its comments taken out by the rules of a lexicon; lines are kept. */
export function stripWith(source: string, lexicon: Lexicon): string {
  const src = source.replace(/\r\n?/g, '\n');
  return lexicon.family === 'brace' ? stripBrace(src, lexicon) : stripIndent(src, lexicon);
}

/** The source of one file with its comments taken out; line breaks are kept. */
export function stripComments(source: string, language: CodeLanguage): string {
  return stripWith(source, CODE_LANGUAGES[language]);
}
