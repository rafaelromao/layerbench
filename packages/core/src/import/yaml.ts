/**
 * A reader for the YAML that keymap-drawer writes and that people write for it: block and flow
 * collections (flow ones may run over several lines), plain, single- and double-quoted scalars,
 * comments, anchors and aliases, literal and folded block scalars, and the "indentless" sequence
 * PyYAML emits under a mapping key. Scalars resolve by the YAML 1.2 core schema, so `on`, `yes`
 * and `no` stay strings — which is what a key legend means by them.
 *
 * It is not a general YAML implementation: explicit `?` keys, complex keys, merge keys and more
 * than one document are not supported, and are reported rather than guessed at.
 */

export class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
    this.name = 'YamlError';
  }
}

export function parseYaml(source: string): unknown {
  return new Reader(source).document();
}

const FLOW_INDICATORS = new Set([',', '[', ']', '{', '}']);

function resolvePlain(text: string): unknown {
  if (text === '' || text === '~' || /^(null|Null|NULL)$/.test(text)) return null;
  if (/^(true|True|TRUE)$/.test(text)) return true;
  if (/^(false|False|FALSE)$/.test(text)) return false;
  if (/^[-+]?[0-9]+$/.test(text)) return Number.parseInt(text, 10);
  if (/^0x[0-9a-fA-F]+$/.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^0o[0-7]+$/.test(text)) return Number.parseInt(text.slice(2), 8);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(text)) {
    return Number.parseFloat(text);
  }
  if (/^[-+]?\.(inf|Inf|INF)$/.test(text)) return text.startsWith('-') ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(text)) return Number.NaN;
  return text;
}

const ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  '\t': '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\u0085',
  _: ' ',
  L: ' ',
  P: ' ',
};

/** Node properties: an anchor to record the node under, and whether a tag forces it to a string. */
interface Props {
  anchor: string | null;
  str: boolean;
}

class Reader {
  private readonly s: string;
  private i = 0;
  private readonly anchors = new Map<string, unknown>();

  constructor(source: string) {
    this.s = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  }

  // ------------------------------------------------------------------ positions

  private peek(offset = 0): string {
    return this.s[this.i + offset] ?? '';
  }

  private line(at = this.i): number {
    let n = 1;
    for (let j = 0; j < at && j < this.s.length; j++) if (this.s[j] === '\n') n++;
    return n;
  }

  private col(at = this.i): number {
    return at - (this.s.lastIndexOf('\n', at - 1) + 1);
  }

  private fail(message: string, at = this.i): never {
    throw new YamlError(message, this.line(at));
  }

  /**
   * Move to the first character of the next line with content, past blank lines and comments.
   * Returns its column, or -1 at the end of the text.
   */
  private nextContent(): number {
    for (;;) {
      if (this.i >= this.s.length) return -1;
      const atLineStart = this.col() === 0;
      while (this.peek() === ' ') this.i++;
      const c = this.peek();
      // A tab may sit in a blank line, but it cannot indent content.
      if (c === '\t' && atLineStart && !this.restOfLineEmpty()) {
        this.fail('a tab cannot indent YAML; use spaces');
      }
      if (c === '\t') {
        this.i++;
        continue;
      }
      if (c === '\n') {
        this.i++;
        continue;
      }
      if (c === '#') {
        while (this.i < this.s.length && this.peek() !== '\n') this.i++;
        continue;
      }
      if (c === '') return -1;
      return this.col();
    }
  }

  /** What may follow a value on its line: spaces and a comment. */
  private endLine(): void {
    while (this.peek() === ' ' || this.peek() === '\t') this.i++;
    if (this.peek() === '#') while (this.i < this.s.length && this.peek() !== '\n') this.i++;
    if (this.peek() === '\n') {
      this.i++;
      return;
    }
    if (this.i < this.s.length) this.fail(`unexpected ${JSON.stringify(this.peek())}`);
  }

  private restOfLineEmpty(): boolean {
    let j = this.i;
    while (this.s[j] === ' ' || this.s[j] === '\t') j++;
    return j >= this.s.length || this.s[j] === '\n' || this.s[j] === '#';
  }

  private isDash(): boolean {
    const next = this.peek(1);
    return this.peek() === '-' && (next === ' ' || next === '\n' || next === '');
  }

  private isMarker(marker: '---' | '...'): boolean {
    if (this.col() !== 0 || !this.s.startsWith(marker, this.i)) return false;
    const next = this.s[this.i + 3];
    return next === undefined || next === ' ' || next === '\n';
  }

  /** A document marker ends every block node, whatever its indentation. */
  private atMarker(): boolean {
    return this.isMarker('---') || this.isMarker('...');
  }

  /** Whether the current line, from the cursor, is a `key: value` entry. */
  private isKeyAhead(): boolean {
    let j = this.i;
    const c = this.s[j];
    if (c === '"' || c === "'") {
      j = this.skipQuoted(j);
      while (this.s[j] === ' ') j++;
      return this.s[j] === ':' && /[\s]|^$/.test(this.s[j + 1] ?? '');
    }
    if (c === '[' || c === '{' || c === '*' || c === '#') return false;
    for (; j < this.s.length && this.s[j] !== '\n'; j++) {
      if (this.s[j] === '#' && (this.s[j - 1] === ' ' || this.s[j - 1] === '\t')) return false;
      if (this.s[j] === ':') {
        const next = this.s[j + 1];
        if (next === undefined || next === ' ' || next === '\n' || next === '\t') return true;
      }
    }
    return false;
  }

  private skipQuoted(from: number): number {
    const q = this.s[from];
    let j = from + 1;
    for (; j < this.s.length; j++) {
      if (q === '"' && this.s[j] === '\\') {
        j++;
        continue;
      }
      if (this.s[j] === q) {
        if (q === "'" && this.s[j + 1] === "'") {
          j++;
          continue;
        }
        return j + 1;
      }
    }
    return j;
  }

  // ------------------------------------------------------------------ document and block nodes

  document(): unknown {
    let c = this.nextContent();
    while (c === 0 && this.peek() === '%') {
      while (this.i < this.s.length && this.peek() !== '\n') this.i++;
      c = this.nextContent();
    }
    if (c === 0 && this.isMarker('---')) {
      this.i += 3;
      if (!this.restOfLineEmpty()) {
        while (this.peek() === ' ') this.i++;
        return this.finish(this.nodeAt(-1));
      }
      this.endLine();
    }
    return this.finish(this.blockNode(-1));
  }

  private finish(value: unknown): unknown {
    const c = this.nextContent();
    if (c === -1) return value;
    if (c === 0 && (this.isMarker('...') || this.isMarker('---'))) {
      if (this.isMarker('---')) {
        this.fail('more than one YAML document; keep one layout per file');
      }
      return value;
    }
    return this.fail(`unexpected ${JSON.stringify(this.peek())} after the document`);
  }

  /** The node under a parent at `parent` indentation, or null when there is none. */
  private blockNode(parent: number, indentlessSequence = false): unknown {
    const c = this.nextContent();
    if (c === -1) return null;
    if (this.atMarker()) return null;
    if (c > parent) return this.nodeAt(parent);
    // PyYAML writes a mapping's sequence at the mapping's own indentation.
    if (indentlessSequence && c === parent && this.isDash()) return this.sequence(c);
    return null;
  }

  private props(): Props {
    const props: Props = { anchor: null, str: false };
    for (;;) {
      while (this.peek() === ' ' || this.peek() === '\t') this.i++;
      const c = this.peek();
      if (c !== '&' && c !== '!') return props;
      const start = ++this.i;
      while (this.i < this.s.length && !/[\s,[\]{}]/.test(this.peek())) this.i++;
      const name = this.s.slice(start, this.i);
      if (c === '&') props.anchor = name;
      else if (name === '!str' || name === '<tag:yaml.org,2002:str>') props.str = true;
    }
  }

  /** A node that starts at the cursor, inside a parent at `parent` indentation. */
  private nodeAt(parent: number): unknown {
    const props = this.props();
    let value: unknown;
    if (this.restOfLineEmpty()) {
      // Properties alone on their line describe the node on the lines below.
      this.endLine();
      value = this.blockNode(parent, true);
    } else if (this.isDash()) {
      value = this.sequence(this.col());
    } else if (this.isKeyAhead()) {
      value = this.mapping(this.col());
    } else {
      value = this.inline(parent, props.str);
    }
    if (props.anchor) this.anchors.set(props.anchor, value);
    return value;
  }

  private sequence(col: number): unknown[] {
    const items: unknown[] = [];
    for (;;) {
      const c = this.nextContent();
      if (c !== col || !this.isDash() || this.atMarker()) return items;
      this.i++;
      if (this.restOfLineEmpty()) {
        this.endLine();
        items.push(this.blockNode(col));
        continue;
      }
      while (this.peek() === ' ') this.i++;
      items.push(this.nodeAt(col));
    }
  }

  private mapping(col: number): Record<string, unknown> {
    const map: Record<string, unknown> = {};
    for (;;) {
      const c = this.nextContent();
      if (c !== col || this.isDash() || this.atMarker()) return map;
      if (this.peek() === '?') this.fail('explicit `?` keys are not supported');
      const key = this.key();
      const props = this.props();
      let value: unknown;
      if (this.restOfLineEmpty()) {
        this.endLine();
        value = this.blockNode(col, true);
      } else if (this.peek() === '|' || this.peek() === '>') {
        value = this.blockScalar(col);
      } else {
        value = this.inline(col, props.str);
      }
      if (props.anchor) this.anchors.set(props.anchor, value);
      map[key] = value;
    }
  }

  private key(): string {
    let key: string;
    if (this.peek() === '"') key = this.doubleQuoted();
    else if (this.peek() === "'") key = this.singleQuoted();
    else {
      const start = this.i;
      while (
        this.i < this.s.length &&
        !(this.peek() === ':' && /^[\s]?$/.test(this.peek(1)) && this.peek(1) !== ' ')
      ) {
        if (this.peek() === '\n') this.fail('a mapping key must end with `:`');
        this.i++;
      }
      key = this.s.slice(start, this.i).trim();
    }
    while (this.peek() === ' ') this.i++;
    if (this.peek() !== ':') this.fail('expected `:` after a mapping key');
    this.i++;
    return key;
  }

  /** A scalar, flow collection or alias on the current line (a flow collection may run on). */
  private inline(parent: number, str: boolean): unknown {
    const c = this.peek();
    let value: unknown;
    if (c === '[' || c === '{') value = this.flow();
    else if (c === '"') value = this.doubleQuoted();
    else if (c === "'") value = this.singleQuoted();
    else if (c === '*') value = this.alias();
    else if (c === '|' || c === '>') return this.blockScalar(parent);
    else {
      const text = this.plainBlock(parent);
      return str ? text : resolvePlain(text);
    }
    this.endLine();
    return value;
  }

  /** A plain scalar in block context, which may continue on more-indented lines. */
  private plainBlock(parent: number): string {
    const parts: string[] = [this.plainLine()];
    this.endLine();
    for (;;) {
      const save = this.i;
      const c = this.nextContent();
      if (c === -1 || c <= parent || this.isDash() || this.isKeyAhead() || this.atMarker()) {
        this.i = save;
        break;
      }
      parts.push(this.plainLine());
      this.endLine();
    }
    return parts.join(' ');
  }

  private plainLine(): string {
    const start = this.i;
    while (this.i < this.s.length && this.peek() !== '\n') {
      if (this.peek() === '#' && (this.peek(-1) === ' ' || this.peek(-1) === '\t')) break;
      this.i++;
    }
    return this.s.slice(start, this.i).trim();
  }

  private blockScalar(parent: number): string {
    const literal = this.peek() === '|';
    this.i++;
    let chomp: 'clip' | 'strip' | 'keep' = 'clip';
    let explicit = 0;
    while (/[-+0-9]/.test(this.peek())) {
      const c = this.peek();
      if (c === '-') chomp = 'strip';
      else if (c === '+') chomp = 'keep';
      else explicit = Number(c);
      this.i++;
    }
    this.endLine();
    const lines: string[] = [];
    let indent = explicit > 0 ? Math.max(parent, 0) + explicit : -1;
    while (this.i < this.s.length) {
      const end = this.s.indexOf('\n', this.i);
      const raw = this.s.slice(this.i, end === -1 ? this.s.length : end);
      const spaces = raw.length - raw.trimStart().length;
      if (raw.trim() === '') {
        lines.push('');
      } else {
        if (indent === -1) indent = spaces;
        if (spaces < indent || spaces <= parent) break;
        lines.push(raw.slice(indent));
      }
      this.i = end === -1 ? this.s.length : end + 1;
    }
    // Trailing blank lines belong to the chomping, not to the text.
    let trailing = 0;
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
      trailing++;
    }
    let text: string;
    if (literal) text = lines.join('\n');
    else {
      text = '';
      lines.forEach((l, k) => {
        if (k === 0) text = l;
        else if (
          l === '' ||
          l.startsWith(' ') ||
          lines[k - 1] === '' ||
          lines[k - 1].startsWith(' ')
        )
          text += `\n${l}`;
        else text += ` ${l}`;
      });
    }
    if (lines.length === 0) return chomp === 'keep' ? '\n'.repeat(trailing) : '';
    if (chomp === 'strip') return text;
    if (chomp === 'keep') return `${text}\n${'\n'.repeat(trailing)}`;
    return `${text}\n`;
  }

  // ------------------------------------------------------------------ flow

  /** Whitespace, line breaks and comments between the parts of a flow collection. */
  private flowSpace(): void {
    for (;;) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\n') this.i++;
      else if (c === '#' && /\s/.test(this.peek(-1) || ' ')) {
        while (this.i < this.s.length && this.peek() !== '\n') this.i++;
      } else return;
    }
  }

  private flow(): unknown {
    const open = this.peek();
    const close = open === '[' ? ']' : '}';
    const start = this.i;
    this.i++;
    const seq: unknown[] = [];
    const map: Record<string, unknown> = {};
    for (;;) {
      this.flowSpace();
      if (this.i >= this.s.length) this.fail(`unclosed ${open}`, start);
      if (this.peek() === close) {
        this.i++;
        break;
      }
      const first = this.flowNode(close);
      this.flowSpace();
      if (this.peek() === ':') {
        this.i++;
        this.flowSpace();
        const value = this.peek() === ',' || this.peek() === close ? null : this.flowNode(close);
        if (open === '{') map[String(first)] = value;
        else seq.push({ [String(first)]: value });
      } else if (open === '{') map[String(first)] = null;
      else seq.push(first);
      this.flowSpace();
      if (this.peek() === ',') {
        this.i++;
        continue;
      }
      if (this.peek() === close) {
        this.i++;
        break;
      }
      if (this.i >= this.s.length) this.fail(`unclosed ${open}`, start);
      this.fail(`expected \`,\` or \`${close}\` in a flow collection`);
    }
    return open === '[' ? seq : map;
  }

  private flowNode(close: string): unknown {
    const props = this.props();
    const c = this.peek();
    let value: unknown;
    if (c === '[' || c === '{') value = this.flow();
    else if (c === '"') value = this.doubleQuoted();
    else if (c === "'") value = this.singleQuoted();
    else if (c === '*') value = this.alias();
    else {
      const text = this.plainFlow(close);
      value = props.str ? text : resolvePlain(text);
    }
    if (props.anchor) this.anchors.set(props.anchor, value);
    return value;
  }

  private plainFlow(close: string): string {
    const start = this.i;
    while (this.i < this.s.length) {
      const c = this.peek();
      if (FLOW_INDICATORS.has(c) || c === '\n') break;
      if (c === ':' && /^[\s,\]}]?$/.test(this.peek(1))) break;
      if (c === '#' && (this.peek(-1) === ' ' || this.peek(-1) === '\t')) break;
      this.i++;
    }
    const text = this.s.slice(start, this.i).trim();
    if (text === '' && this.peek() !== ',' && this.peek() !== close && this.peek() !== ':') {
      this.fail(`unexpected ${JSON.stringify(this.peek())} in a flow collection`);
    }
    return text;
  }

  // ------------------------------------------------------------------ scalars

  private alias(): unknown {
    const at = this.i;
    this.i++;
    const start = this.i;
    while (this.i < this.s.length && !/[\s,[\]{}]/.test(this.peek())) this.i++;
    const name = this.s.slice(start, this.i);
    if (!this.anchors.has(name)) this.fail(`unknown alias *${name}`, at);
    return this.anchors.get(name);
  }

  /** A line break inside a quoted scalar folds to a space; blank lines keep their breaks. */
  private fold(out: string): string {
    let text = out.replace(/[ \t]+$/, '');
    this.i++;
    let breaks = 0;
    for (;;) {
      while (this.peek() === ' ' || this.peek() === '\t') this.i++;
      if (this.peek() !== '\n') break;
      breaks++;
      this.i++;
    }
    text += breaks > 0 ? '\n'.repeat(breaks) : ' ';
    return text;
  }

  private singleQuoted(): string {
    const start = this.i;
    this.i++;
    let out = '';
    for (;;) {
      const c = this.peek();
      if (c === '') this.fail('unclosed quote', start);
      if (c === "'") {
        if (this.peek(1) === "'") {
          out += "'";
          this.i += 2;
          continue;
        }
        this.i++;
        return out;
      }
      if (c === '\n') {
        out = this.fold(out);
        continue;
      }
      out += c;
      this.i++;
    }
  }

  private doubleQuoted(): string {
    const start = this.i;
    this.i++;
    let out = '';
    for (;;) {
      const c = this.peek();
      if (c === '') this.fail('unclosed quote', start);
      if (c === '"') {
        this.i++;
        return out;
      }
      if (c === '\n') {
        out = this.fold(out);
        continue;
      }
      if (c !== '\\') {
        out += c;
        this.i++;
        continue;
      }
      const e = this.peek(1);
      if (e === '\n') {
        // An escaped line break joins the lines with nothing between them.
        this.i += 2;
        while (this.peek() === ' ' || this.peek() === '\t') this.i++;
        continue;
      }
      const hex = e === 'x' ? 2 : e === 'u' ? 4 : e === 'U' ? 8 : 0;
      if (hex > 0) {
        const digits = this.s.slice(this.i + 2, this.i + 2 + hex);
        if (!/^[0-9a-fA-F]+$/.test(digits) || digits.length !== hex) {
          this.fail(`bad \\${e} escape`);
        }
        out += String.fromCodePoint(Number.parseInt(digits, 16));
        this.i += 2 + hex;
        continue;
      }
      const mapped = ESCAPES[e];
      if (mapped === undefined) this.fail(`unknown escape \\${e}`);
      out += mapped;
      this.i += 2;
    }
  }
}
