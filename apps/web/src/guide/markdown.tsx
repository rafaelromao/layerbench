import type { ReactNode } from 'react';

/**
 * The Markdown the guide is written in, read into blocks and drawn as React elements: headings,
 * paragraphs, lists, tables, code, quotes, emphasis and links. Nothing in a page is ever taken as
 * HTML, so a page cannot run or style anything, and the guide needs no dependency to be shown.
 *
 * It reads what the pages use, the way GitHub reads it, and no more: a page that renders well on
 * GitHub renders the same here.
 */

export type Align = 'left' | 'center' | 'right' | null;

export type Block =
  | { kind: 'heading'; level: number; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'table'; head: string[]; align: Align[]; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const ITEM = /^\s*([-*+]|\d{1,9}[.)])\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** A heading's text without its inline markup, as GitHub reads it to make the anchor. */
function plain(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '');
}

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens. */
export function headingId(text: string): string {
  return plain(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** A table row's cells. A `\|` is a pipe inside a cell, not the edge of one. */
function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cell = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (s[i] === '|') {
      out.push(cell.trim());
      cell = '';
    } else cell += s[i];
  }
  out.push(cell.trim());
  return out;
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
}

const ordered = (marker: string) => /\d/.test(marker);

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blank = (i: number) => i >= lines.length || lines[i].trim() === '';
  const tableAt = (i: number) =>
    lines[i].includes('|') && i + 1 < lines.length && DELIMITER.test(lines[i + 1]);
  /** Lines that end a paragraph by starting something else. */
  const interrupts = (i: number) =>
    HEADING.test(lines[i]) ||
    FENCE.test(lines[i]) ||
    ITEM.test(lines[i]) ||
    lines[i].startsWith('>') ||
    tableAt(i);

  const blocks: Block[] = [];
  const ids = new Map<string, number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(i)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // GitHub numbers a repeated anchor, so the second "Presets" is `presets-1`.
      const base = headingId(heading[2]);
      const seen = ids.get(base) ?? 0;
      ids.set(base, seen + 1);
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        text: heading[2],
        id: seen === 0 ? base : `${base}-${seen}`,
      });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }

    if (tableAt(i)) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map(alignOf);
      i += 2;
      const rows: string[][] = [];
      while (!blank(i) && lines[i].includes('|')) rows.push(cells(lines[i++]));
      blocks.push({ kind: 'table', head, align, rows });
      continue;
    }

    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        body.push(lines[i++].replace(/^>\s?/, '').trim());
      }
      blocks.push({ kind: 'quote', text: body.join(' ') });
      continue;
    }

    const first = ITEM.exec(line);
    if (first) {
      const isOrdered = ordered(first[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const item = ITEM.exec(lines[i]);
        if (item && ordered(item[1]) === isOrdered) {
          items.push(item[2].trim());
          i++;
        } else if (!blank(i) && /^\s/.test(lines[i]) && !item) {
          // An indented line carries on the item above it.
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else if (blank(i) && i + 1 < lines.length) {
          // A blank line between two items of the same kind leaves the list going.
          const next = ITEM.exec(lines[i + 1]);
          if (!next || ordered(next[1]) !== isOrdered) break;
          i++;
        } else break;
      }
      blocks.push({
        kind: 'list',
        ordered: isOrdered,
        start: isOrdered ? Number.parseInt(first[1], 10) : 1,
        items,
      });
      continue;
    }

    const text: string[] = [line.trim()];
    i++;
    while (!blank(i) && !interrupts(i)) text.push(lines[i++].trim());
    blocks.push({ kind: 'paragraph', text: text.join(' ') });
  }
  return blocks;
}

// ------------------------------------------------------------------ the page as sections

export interface Section {
  heading: Extract<Block, { kind: 'heading' }>;
  /** What comes before the first subsection. */
  blocks: Block[];
  subsections: Section[];
}

/**
 * A page as a reader unfolds it: the title and the text before the first `##` are always shown;
 * each `##` is a section that opens on request, and each `###` a subsection inside it. Anything
 * deeper stays a heading inside its subsection.
 */
export interface GuideDocument {
  title: string;
  intro: Block[];
  sections: Section[];
}

export function parseGuide(source: string): GuideDocument {
  const doc: GuideDocument = { title: '', intro: [], sections: [] };
  let section: Section | null = null;
  let subsection: Section | null = null;
  for (const block of parseBlocks(source)) {
    if (block.kind === 'heading' && block.level === 1 && doc.title === '') {
      doc.title = block.text;
    } else if (block.kind === 'heading' && block.level === 2) {
      section = { heading: block, blocks: [], subsections: [] };
      subsection = null;
      doc.sections.push(section);
    } else if (block.kind === 'heading' && block.level === 3 && section) {
      subsection = { heading: block, blocks: [], subsections: [] };
      section.subsections.push(subsection);
    } else if (subsection) subsection.blocks.push(block);
    else if (section) section.blocks.push(block);
    else doc.intro.push(block);
  }
  return doc;
}

/** Every anchor on a page, each with the sections that have to be open for it to be seen. */
export function anchorsOf(doc: GuideDocument): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const headings = (blocks: Block[], open: string[]) => {
    for (const b of blocks) if (b.kind === 'heading') out.set(b.id, open);
  };
  headings(doc.intro, []);
  for (const s of doc.sections) {
    out.set(s.heading.id, [s.heading.id]);
    headings(s.blocks, [s.heading.id]);
    for (const sub of s.subsections) {
      out.set(sub.heading.id, [s.heading.id, sub.heading.id]);
      headings(sub.blocks, [s.heading.id, sub.heading.id]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ inline text

export interface InlineContext {
  /** Draws a link; the page decides where each one goes. */
  link: (href: string, children: ReactNode[], key: string) => ReactNode;
}

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;

/** Where a code span that opens at `from` closes, or -1: a run of as many backticks. */
function codeEnd(text: string, from: number, run: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] !== '`') continue;
    let n = 0;
    while (text[j + n] === '`') n++;
    if (n === run) return j;
    j += n - 1;
  }
  return -1;
}

/** Where emphasis opened with `mark` at `from` closes, skipping code spans, or -1. */
function emphasisEnd(text: string, mark: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '`') {
      let run = 0;
      while (text[j + run] === '`') run++;
      const end = codeEnd(text, j + run, run);
      if (end > 0) j = end + run - 1;
      continue;
    }
    if (!text.startsWith(mark, j) || /\s/.test(text[j - 1] ?? ' ')) continue;
    // A single mark is not the first of a double one, and `_` only closes at the end of a word.
    if (mark.length === 1 && text[j + 1] === mark) {
      j++;
      continue;
    }
    if (mark === '_' && WORD.test(text[j + 1] ?? '')) continue;
    return j;
  }
  return -1;
}

/** The `]` that closes the link text opened at `from`, counting nested brackets, or -1. */
function bracketEnd(text: string, from: number): number {
  let depth = 0;
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '[') depth++;
    else if (text[j] === ']' && --depth === 0) return j;
  }
  return -1;
}

/**
 * Code with a place to break after each `_` and `/`, so a rule id such as `layer_distribution`
 * can wrap in a narrow table column instead of holding the table wider than a phone.
 */
function breakable(code: string): ReactNode {
  const parts = code.split(/(?<=[_/])/);
  if (parts.length === 1) return code;
  // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one static string, in order
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}

export function renderInline(text: string, ctx: InlineContext, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = '';
  };
  const next = () => `${key}.${out.length}`;

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && PUNCTUATION.test(text[i + 1] ?? '')) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }
    if (c === '`') {
      let run = 0;
      while (text[i + run] === '`') run++;
      const end = codeEnd(text, i + run, run);
      if (end < 0) {
        buffer += text.slice(i, i + run);
        i += run;
        continue;
      }
      let code = text.slice(i + run, end);
      if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') {
        code = code.slice(1, -1);
      }
      flush();
      out.push(<code key={next()}>{breakable(code)}</code>);
      i = end + run;
      continue;
    }
    if (c === '*' || c === '_') {
      const mark = text[i + 1] === c ? c + c : c;
      const opens =
        !/\s/.test(text[i + mark.length] ?? ' ') && (c === '*' || !WORD.test(text[i - 1] ?? ''));
      const end = opens ? emphasisEnd(text, mark, i + mark.length) : -1;
      if (end > i + mark.length) {
        flush();
        const k = next();
        const inner = renderInline(text.slice(i + mark.length, end), ctx, k);
        out.push(mark.length === 2 ? <strong key={k}>{inner}</strong> : <em key={k}>{inner}</em>);
        i = end + mark.length;
        continue;
      }
    }
    if (c === '[') {
      const close = bracketEnd(text, i);
      const paren = close > 0 && text[close + 1] === '(' ? text.indexOf(')', close + 2) : -1;
      if (paren > 0) {
        flush();
        const k = next();
        const label = renderInline(text.slice(i + 1, close), ctx, k);
        out.push(ctx.link(text.slice(close + 2, paren).trim(), label, k));
        i = paren + 1;
        continue;
      }
    }
    buffer += c;
    i++;
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ blocks

function alignClass(align: Align): string | undefined {
  return align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : undefined;
}

export function MarkdownBlocks({ blocks, ctx }: { blocks: Block[]; ctx: InlineContext }) {
  return (
    <>
      {blocks.map((b, i) => {
        // Blocks are identified by their place: a page is static text, never reordered.
        const key = `b${i}`;
        const inline = (text: string, k = key) => renderInline(text, ctx, k);
        switch (b.kind) {
          case 'heading': {
            const Tag = `h${Math.min(6, Math.max(2, b.level))}` as 'h2';
            return (
              <Tag key={key} id={b.id}>
                {inline(b.text)}
              </Tag>
            );
          }
          case 'paragraph':
            return <p key={key}>{inline(b.text)}</p>;
          case 'list': {
            const items = b.items.map((item, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: list items are static text in order
              <li key={j}>{inline(item, `${key}.${j}`)}</li>
            ));
            return b.ordered ? (
              <ol key={key} start={b.start === 1 ? undefined : b.start}>
                {items}
              </ol>
            ) : (
              <ul key={key}>{items}</ul>
            );
          }
          case 'table':
            return (
              <div key={key} className="lm-guide-table">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((cell, j) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: columns are static and in order
                        <th key={j} className={alignClass(b.align[j] ?? null)}>
                          {inline(cell, `${key}.h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: rows are static and in order
                      <tr key={r}>
                        {b.head.map((_, j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: columns are static and in order
                          <td key={j} className={alignClass(b.align[j] ?? null)}>
                            {inline(row[j] ?? '', `${key}.${r}.${j}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'code':
            return (
              <pre key={key}>
                <code>{b.text}</code>
              </pre>
            );
          case 'quote':
            return <blockquote key={key}>{inline(b.text)}</blockquote>;
          case 'rule':
            return <hr key={key} />;
          default:
            return null;
        }
      })}
    </>
  );
}
