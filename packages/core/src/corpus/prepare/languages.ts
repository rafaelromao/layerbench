/**
 * The programming languages the code corpora are made of, and how each one writes a comment or a
 * string, which is all `stripComments` needs to know to take the comments out of its source.
 *
 * A language here is a way of writing, not a compiler: JavaScript and TypeScript are one, `jsts`,
 * since they comment and quote alike, and a `.h` header belongs to whichever of `c` or `cpp` the
 * repository it comes from is written in.
 */

export type CodeLanguage =
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'java'
  | 'jsts'
  | 'go'
  | 'rust'
  | 'php'
  | 'kotlin'
  | 'swift'
  | 'python'
  | 'nim'
  | 'gdscript';

export interface Lexicon {
  /** Braces and semicolons, or indentation and colons: how the source is walked. */
  family: 'brace' | 'indent';
  /** What starts a comment that runs to the end of the line. */
  lineComment: string[];
  /** What opens and closes a comment that may run over lines, and whether it nests. */
  blockComment?: { open: string; close: string; nested: boolean };
  /** A backtick opens a string that runs over lines (a template literal, a Go raw string). */
  backtick?: { escapes: boolean };
  /** `"""` opens a string that runs over lines. */
  tripleQuote?: boolean;
  /** `r"…"`, `r#"…"#`: a Rust raw string. */
  rustRaw?: boolean;
  /** `R"x(…)x"`: a C++ raw string. */
  cppRaw?: boolean;
  /** `@"…"`, `$@"…"`: a C# verbatim string, a quote inside it doubled. */
  verbatim?: boolean;
  /** A `"` or `'` string may run over lines. */
  multiline?: boolean;
  /** `'` opens a string only if a character literal closes it, as in Rust lifetimes `'a`. */
  charOnly?: boolean;
  /** `discard """…"""` is a comment, as in Nim. */
  discardComment?: boolean;
  /** False where a quote is only a quote (HTML, LaTeX prose), so none opens a string. */
  strings?: boolean;
  extensions: string[];
}

const SLASHES = { lineComment: ['//'], blockComment: { open: '/*', close: '*/', nested: false } };

export const CODE_LANGUAGES: Record<CodeLanguage, Lexicon> = {
  c: { family: 'brace', ...SLASHES, extensions: ['.c', '.h'] },
  cpp: {
    family: 'brace',
    ...SLASHES,
    cppRaw: true,
    extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.h', '.ipp'],
  },
  csharp: { family: 'brace', ...SLASHES, verbatim: true, multiline: true, extensions: ['.cs'] },
  java: { family: 'brace', ...SLASHES, tripleQuote: true, extensions: ['.java'] },
  jsts: {
    family: 'brace',
    ...SLASHES,
    backtick: { escapes: true },
    extensions: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'],
  },
  go: { family: 'brace', ...SLASHES, backtick: { escapes: false }, extensions: ['.go'] },
  rust: {
    family: 'brace',
    lineComment: ['//'],
    blockComment: { open: '/*', close: '*/', nested: true },
    rustRaw: true,
    multiline: true,
    charOnly: true,
    extensions: ['.rs'],
  },
  php: {
    family: 'brace',
    lineComment: ['//', '#'],
    blockComment: { open: '/*', close: '*/', nested: false },
    multiline: true,
    extensions: ['.php'],
  },
  kotlin: {
    family: 'brace',
    lineComment: ['//'],
    blockComment: { open: '/*', close: '*/', nested: true },
    tripleQuote: true,
    backtick: { escapes: false },
    extensions: ['.kt', '.kts'],
  },
  swift: {
    family: 'brace',
    lineComment: ['//'],
    blockComment: { open: '/*', close: '*/', nested: true },
    tripleQuote: true,
    extensions: ['.swift'],
  },
  python: { family: 'indent', lineComment: ['#'], tripleQuote: true, extensions: ['.py'] },
  nim: {
    family: 'indent',
    lineComment: ['#'],
    blockComment: { open: '#[', close: ']#', nested: true },
    tripleQuote: true,
    charOnly: true,
    discardComment: true,
    extensions: ['.nim'],
  },
  gdscript: { family: 'indent', lineComment: ['#'], tripleQuote: true, extensions: ['.gd'] },
};

/** Whether a name is one of the languages above. */
export function isCodeLanguage(name: string): name is CodeLanguage {
  return Object.hasOwn(CODE_LANGUAGES, name);
}
