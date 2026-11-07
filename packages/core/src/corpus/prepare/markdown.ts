import { tidy } from './lines.js';

/**
 * The lines of a Markdown file as they are typed to an agent or into its instructions: headings,
 * lists, tables, links and prose, with the pictures, the HTML and the long code listings taken out
 * (the code corpora hold code). The lines are judged by `keptLines` afterwards, like any other.
 */

/** A fenced block of at most this many lines, its fences included, is a command or a snippet. */
export const MAX_FENCED_LINES = 8;

const IMAGE = /\[?!\[[^\]]*\]\([^)]*\)\]?(?:\([^)]*\))?/g;
const REFERENCE = /^\s*\[[^\]]+\]:\s*\S+/;
const HTML_TAG = /^\s*<\/?[A-Za-z!]/;
const FENCE = /^\s*(`{3,}|~{3,})/;
/** A line that starts with markup stays whole; prose is cut into sentences like news text. */
const MARKUP_START = /^(?:#|\||>|[-*+] |\d+[.)] |---|\[)/;

function closes(line: string, marker: string): boolean {
  const fence = FENCE.exec(line);
  return fence !== null && fence[1][0] === marker[0] && fence[1].length >= marker.length;
}

function sentences(line: string): string[] {
  return MARKUP_START.test(line) ? [line] : line.split(/(?<=[.!?])\s+(?=[A-Z`"'([*_])/);
}

export function markdownLines(text: string, options: { mdx?: boolean } = {}): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i]);
    if (fence) {
      let j = i + 1;
      while (j < lines.length && !closes(lines[j], fence[1])) j++;
      const block = lines.slice(i, j + 1);
      if (block.length <= MAX_FENCED_LINES) out.push(...block.map(tidy));
      i = j;
      continue;
    }
    if (REFERENCE.test(lines[i]) || HTML_TAG.test(lines[i])) continue;
    if (options.mdx && /^\s*(?:import|export)\s/.test(lines[i])) continue;
    const line = tidy(lines[i].replace(IMAGE, ''));
    if (line.length > 0) out.push(...sentences(line));
  }
  return out;
}
