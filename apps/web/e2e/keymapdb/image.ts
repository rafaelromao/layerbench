/**
 * What a picture drawn by keymap-drawer shows, read from its SVG: each layer (`g.layer-<name>`),
 * and on it each key (`g.key.keypos-<n>`) with its centre in the layer, its rotation and its
 * legends. keymap-drawer writes these the same way every time, so a small tag reader is enough.
 */

export interface ImageKey {
  /** The key's index in the file's layer: keymap-drawer's `keypos`. */
  pos: number;
  x: number;
  y: number;
  rotation: number;
  tap: string;
  hold: string;
  shifted: string;
  /** keymap-drawer's own marks on the key: `trans`, `held`, `ghost`. */
  marks: string[];
}

export interface ImageLayer {
  name: string;
  keys: ImageKey[];
}

export interface KeymapImage {
  layers: ImageLayer[];
  /** Combos drawn: the distinct `combopos-<n>` on the layers. */
  combos: number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name] ?? whole;
    const code = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return String.fromCodePoint(code);
  });
}

function attrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = decode(m[2]);
  return out;
}

function transform(value: string | undefined): { dx: number; dy: number; rotation: number } {
  const t = value?.match(/translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/);
  const r = value?.match(/rotate\(\s*([-\d.e]+)/);
  return { dx: t ? Number(t[1]) : 0, dy: t ? Number(t[2]) : 0, rotation: r ? Number(r[1]) : 0 };
}

/** The legend a `text` or glyph `use` of a key stands for, as keymap-drawer's file writes it. */
function slotOf(classes: string[]): 'tap' | 'hold' | 'shifted' | null {
  if (classes.includes('tap')) return 'tap';
  if (classes.includes('hold')) return 'hold';
  if (classes.includes('shifted')) return 'shifted';
  return null;
}

export function readKeymapImage(svg: string): KeymapImage {
  const layers: ImageLayer[] = [];
  const combos = new Set<string>();
  // Each open `g`: its offset from the layer's origin, and what it is.
  const stack: { dx: number; dy: number; layer?: ImageLayer; key?: ImageKey }[] = [];
  let text: { slot: 'tap' | 'hold' | 'shifted'; parts: string[] } | null = null;
  let layer: ImageLayer | null = null;
  let key: ImageKey | null = null;

  for (const m of svg.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, closing, tag, rest, selfClosing, chars] = m;
    if (chars !== undefined) {
      if (text) text.parts.push(decode(chars));
      continue;
    }
    if (tag === 'g' && closing) {
      const top = stack.pop();
      if (top?.layer) layer = null;
      if (top?.key) key = null;
      continue;
    }
    if (tag === 'g') {
      const a = attrs(rest);
      const classes = (a.class ?? '').split(/\s+/).filter(Boolean);
      const t = transform(a.transform);
      const parent = stack.at(-1);
      const isLayer = a.class?.startsWith('layer-');
      const base = isLayer || !parent ? { dx: 0, dy: 0 } : parent;
      const frame: (typeof stack)[number] = { dx: base.dx + t.dx, dy: base.dy + t.dy };
      if (isLayer) {
        const name = (a.class ?? '').slice('layer-'.length);
        frame.dx = 0;
        frame.dy = 0;
        // keymap-drawer draws each combo of a "separate" drawing as a layer of its own.
        if (!name.startsWith('combopos-')) {
          frame.layer = { name, keys: [] };
          layer = frame.layer;
          layers.push(layer);
        }
      } else if (layer && classes.includes('key')) {
        const pos = classes.find((c) => c.startsWith('keypos-'));
        if (pos) {
          frame.key = {
            pos: Number(pos.slice('keypos-'.length)),
            x: frame.dx,
            y: frame.dy,
            rotation: t.rotation,
            tap: '',
            hold: '',
            shifted: '',
            marks: classes.filter((c) => c === 'trans' || c === 'held' || c === 'ghost'),
          };
          key = frame.key;
          layer.keys.push(key);
        }
      } else if (layer && classes.includes('combo')) {
        const pos = classes.find((c) => c.startsWith('combopos-'));
        if (pos) combos.add(pos);
      }
      if (!selfClosing) stack.push(frame);
      continue;
    }
    if (!key) continue;
    if (tag === 'text' && !closing) {
      const slot = slotOf((attrs(rest).class ?? '').split(/\s+/));
      text = slot ? { slot, parts: [] } : null;
      if (selfClosing) text = null;
    } else if (tag === 'text' && closing) {
      if (text) key[text.slot] = text.parts.join(' ').replace(/\s+/g, ' ').trim();
      text = null;
    } else if (tag === 'tspan' && !closing && text && text.parts.length > 0) {
      text.parts.push(' ');
    } else if (tag === 'use') {
      const a = attrs(rest);
      const slot = slotOf((a.class ?? '').split(/\s+/));
      const glyph = (a.href ?? a['xlink:href'] ?? '').replace(/^#/, '');
      if (slot && glyph) key[slot] = `$$${glyph}$$`;
    }
  }
  return { layers, combos: combos.size };
}
