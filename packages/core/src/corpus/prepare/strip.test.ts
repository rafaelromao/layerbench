import { describe, expect, it } from 'vitest';
import type { Lexicon } from './languages.js';
import { stripComments, stripWith } from './strip.js';

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

describe('the comments of the brace languages', () => {
  it('takes out line and block comments and keeps the code around them', () => {
    const src = 'int a; // one\n/* two\n three */ int b;\nint c = 1; /* four */ int d;\n';
    expect(lines(stripComments(src, 'c'))).toEqual(['int a;', 'int b;', 'int c = 1; int d;']);
  });

  it('keeps a comment marker that is inside a string', () => {
    const src = 'const u = "http://x.test/*"; // gone\nchar c = \'"\'; /* gone */ int e;';
    expect(lines(stripComments(src, 'java'))).toEqual([
      'const u = "http://x.test/*";',
      "char c = '\"'; int e;",
    ]);
  });

  it('keeps template literals and Go raw strings, which run over lines', () => {
    const js = 'const t = `a // b\n/* c */`; // gone\nlet z;';
    expect(lines(stripComments(js, 'jsts'))).toEqual(['const t = `a // b', '/* c */`;', 'let z;']);
    const go = 'x := `C:\\`; // gone\ny := 1';
    expect(lines(stripComments(go, 'go'))).toEqual(['x := `C:\\`;', 'y := 1']);
  });

  it('nests block comments where the language does, and not where it does not', () => {
    const rust = 'a; /* x /* y */ z */ b;';
    expect(stripComments(rust, 'rust').replace(/\s+/g, ' ')).toBe('a; b;');
    const c = 'a; /* x /* y */ z */ b;';
    expect(stripComments(c, 'c').replace(/\s+/g, ' ')).toContain('z */ b;');
  });

  it('tells a Rust lifetime from a character, and reads raw strings', () => {
    const src =
      'fn f<\'a>(x: &\'a str) -> char { \'x\' } // gone\nlet s = r#"// kept "quoted""#; // gone';
    expect(lines(stripComments(src, 'rust'))).toEqual([
      "fn f<'a>(x: &'a str) -> char { 'x' }",
      'let s = r#"// kept "quoted""#;',
    ]);
  });

  it('reads C++ raw strings and C# verbatim strings', () => {
    const cpp = 'auto s = R"x(// kept)x"; // gone';
    expect(stripComments(cpp, 'cpp').trim()).toBe('auto s = R"x(// kept)x";');
    const cs = 'var p = @"C:\\dir\\""// kept"; // gone\nint q;';
    expect(lines(stripComments(cs, 'csharp'))).toEqual([
      'var p = @"C:\\dir\\""// kept";',
      'int q;',
    ]);
  });

  it('reads triple-quoted strings of Kotlin and Java', () => {
    const src = 'val s = """\n// kept\n"""; // gone\nval t = 1';
    expect(lines(stripComments(src, 'kotlin'))).toEqual([
      'val s = """',
      '// kept',
      '""";',
      'val t = 1',
    ]);
  });

  it('takes out a PHP hash comment but not an attribute', () => {
    const src = '#[Route("/x")]\n$a = 1; # gone\n$b = 2; // gone';
    expect(lines(stripComments(src, 'php'))).toEqual(['#[Route("/x")]', '$a = 1;', '$b = 2;']);
  });

  it('copes with an unterminated string and a comment at the end of the file', () => {
    expect(stripComments('a = "open // x\nb; // end', 'java')).toBe('a = "open // x\nb; ');
    expect(stripComments('x /* never closed', 'c')).toBe('x  ');
    expect(stripComments('r#"never closed', 'rust')).toBe('r#"never closed');
  });

  it('reads Windows line ends', () => {
    expect(stripComments('a; // x\r\nb;\r\n', 'c')).toBe('a; \nb;\n');
  });
});

describe('the comments of the indentation languages', () => {
  it('takes out hash comments, and docstrings that are statements of their own', () => {
    const src = [
      '#!/usr/bin/env python',
      'def f(x):',
      '    """Does a thing.',
      '',
      '    More text."""',
      '    return x  # gone',
      '',
      'y = """kept"""',
      "s = '# kept'",
    ].join('\n');
    expect(lines(stripComments(src, 'python'))).toEqual([
      'def f(x):',
      'return x',
      'y = """kept"""',
      "s = '# kept'",
    ]);
  });

  it('keeps a triple-quoted string that is an argument, and reads prefixes', () => {
    const src = 'f(\n    """kept""",\n)\nx = rb"# kept"  # gone\nr"""doc"""  # gone too';
    expect(lines(stripComments(src, 'python'))).toEqual([
      'f(',
      '"""kept""",',
      ')',
      'x = rb"# kept"',
    ]);
  });

  it('reads Nim block comments, discard strings and character literals', () => {
    const src = [
      '#[ gone',
      '  #[ nested ]#',
      ']#',
      "let c = 'x' ## gone",
      "let n = 1'u8 # gone",
      'discard """',
      'gone',
      '"""',
      'echo "# kept"',
    ].join('\n');
    expect(lines(stripComments(src, 'nim'))).toEqual([
      "let c = 'x'",
      "let n = 1'u8",
      'echo "# kept"',
    ]);
  });

  it('reads GDScript', () => {
    expect(lines(stripComments('extends Node # gone\nvar s = "#kept"', 'gdscript'))).toEqual([
      'extends Node',
      'var s = "#kept"',
    ]);
  });
});

describe('the comments of other languages, by their own rules', () => {
  const lisp: Lexicon = {
    family: 'brace',
    lineComment: [';'],
    blockComment: { open: '#|', close: '|#', nested: true },
    charOnly: true,
    extensions: [],
  };
  const lua: Lexicon = {
    family: 'brace',
    lineComment: ['--'],
    blockComment: { open: '--[[', close: ']]', nested: false },
    multiline: true,
    extensions: [],
  };
  const prose: Lexicon = { family: 'brace', lineComment: ['%'], strings: false, extensions: [] };

  it('reads Lisp quotes as quotes, and block comments that nest', () => {
    const src = '(define x \'(1 2)) ; gone\n#| a #| b |# c |# (f "; kept")';
    expect(lines(stripWith(src, lisp))).toEqual(["(define x '(1 2))", '(f "; kept")']);
  });

  it('tells a Lua block comment from a line comment that starts the same way', () => {
    const src = 'local a = 1 --[[ one\ntwo ]] local b = 2 -- gone\nlocal s = "-- kept"';
    expect(lines(stripWith(src, lua))).toEqual([
      'local a = 1',
      'local b = 2',
      'local s = "-- kept"',
    ]);
  });

  it('can leave quotes alone, as in the prose of a LaTeX file', () => {
    const src = "It's text % gone\nIt's more 'text' % gone too";
    expect(lines(stripWith(src, prose))).toEqual(["It's text", "It's more 'text'"]);
  });
});

describe('what a scanner must not mistake', () => {
  it('keeps the line breaks of a block comment, so lines stay lines', () => {
    expect(stripComments('int a; /* x\ny */ int b;', 'c')).toBe('int a; \n int b;');
    expect(stripComments('int a; /* x */ int b;', 'c')).toBe('int a;   int b;');
  });

  it('reads an escaped slash in a regular expression as part of it', () => {
    const src = "s.replace(/^https?:\\/\\//, ''); // gone\nt.replace(/\\/*/g, ''); /* gone */ u();";
    expect(lines(stripComments(src, 'jsts'))).toEqual([
      "s.replace(/^https?:\\/\\//, '');",
      "t.replace(/\\/*/g, ''); u();",
    ]);
  });

  it('takes out the whole of a Nim documentation block', () => {
    const src = '##[ Doc\nmore text ]##\nvar x = 1 ## gone';
    expect(lines(stripComments(src, 'nim'))).toEqual(['var x = 1']);
  });

  it('reads a PHP heredoc as text, however many quotes it has', () => {
    const src = "$t = <<<EOT\nit's $u = 'http://x';\nEOT;\n$a = 1; // gone";
    expect(lines(stripComments(src, 'php'))).toEqual([
      '$t = <<<EOT',
      "it's $u = 'http://x';",
      'EOT;',
      '$a = 1;',
    ]);
  });

  it('does not let an apostrophe in a preprocessor line or a digit separator swallow a comment', () => {
    expect(lines(stripComments("#region Don't touch\nint a; // gone", 'csharp'))).toEqual([
      "#region Don't touch",
      'int a;',
    ]);
    expect(lines(stripComments("int n = 1'000'0; // gone\nint m = 1'0; // gone", 'cpp'))).toEqual([
      "int n = 1'000'0;",
      "int m = 1'0;",
    ]);
  });
});
