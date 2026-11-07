import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from './theme.js';

/** Resolved from the working directory, as the test corpora are: a jsdom module has an http URL. */
const PUBLIC = resolve(process.cwd(), 'public');

describe('the tab icon', () => {
  let link: HTMLLinkElement;

  beforeEach(() => {
    link = document.createElement('link');
    link.rel = 'icon';
    link.setAttribute('href', '/favicon.svg');
    document.head.append(link);
  });

  afterEach(() => {
    link.remove();
    vi.restoreAllMocks();
  });

  it('takes the colours of the theme chosen', () => {
    applyTheme('dark');
    expect(link.getAttribute('href')).toBe('/favicon-dark.svg');
    applyTheme('light');
    expect(link.getAttribute('href')).toBe('/favicon-light.svg');
  });

  it("follows the system's theme when that is the choice", () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: query === '(prefers-color-scheme: dark)' }) as MediaQueryList,
    );
    applyTheme('system');
    expect(link.getAttribute('href')).toBe('/favicon-dark.svg');
  });

  it('is drawn in the accent of each theme', () => {
    for (const theme of ['light', 'dark']) {
      expect(existsSync(resolve(PUBLIC, `favicon-${theme}.svg`)), theme).toBe(true);
    }
    // The one the page starts with follows the system, in the same two sets of colours.
    const adaptive = readFileSync(resolve(PUBLIC, 'favicon.svg'), 'utf8');
    for (const theme of ['light', 'dark']) {
      const fixed = readFileSync(resolve(PUBLIC, `favicon-${theme}.svg`), 'utf8');
      for (const colour of fixed.match(/#[0-9a-f]{6}/g) ?? []) {
        expect(adaptive, `${theme} ${colour}`).toContain(colour);
      }
    }
  });
});

/**
 * The dark theme's surfaces are tuned by their lightness, and lighter ones take contrast from
 * everything drawn in light colours on them. These are the pairs that held when the page was
 * raised, as WCAG 2.x ratios of the colours the screen shows; nudging the surfaces further fails
 * the pair that stops holding, which is then the token to move with them.
 */
describe('the dark theme keeps its contrast', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const tokens = new Map<string, string>();
  const blocks = [
    css.match(/name: "dark";([\s\S]*?)\n\}/)?.[1],
    css.match(/\n:root \{([\s\S]*?)\n\}/)?.[1],
  ];
  for (const block of blocks) {
    for (const m of (block ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g))
      tokens.set(m[1] ?? '', (m[2] ?? '').trim());
  }

  const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  type Rgb = [number, number, number];

  /** A token as 8-bit sRGB, clipped to the gamut as a browser draws it. */
  function rgb(token: string): Rgb {
    const value = tokens.get(token) ?? '';
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (ref) return rgb(ref[1] ?? '');
    const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
    if (!m) throw new Error(`${token} is not an oklch() colour: ${value}`);
    const L = Number(m[1]) / (m[2] ? 100 : 1);
    const hue = (Number(m[4]) * Math.PI) / 180;
    const a = Number(m[3]) * Math.cos(hue);
    const b = Number(m[3]) * Math.sin(hue);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [
      4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
    ];
    const [r = 0, g = 0, bl = 0] = linear.map((c) =>
      Math.round(encode(Math.min(1, Math.max(0, c))) * 255),
    );
    return [r, g, bl];
  }
  const luminance = ([r, g, b]: Rgb) =>
    0.2126 * decode(r / 255) + 0.7152 * decode(g / 255) + 0.0722 * decode(b / 255);
  const ratio = (x: Rgb, y: Rgb) => {
    const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  /** Text at an opacity over its ground, mixed in gamma-encoded sRGB as a browser composites it. */
  const faded = (fg: Rgb, bg: Rgb, opacity: number) =>
    fg.map((c, i) => Math.round(opacity * c + (1 - opacity) * (bg[i] ?? 0))) as Rgb;

  const page = () => rgb('--color-base-100');
  const key = () => rgb('--lb-key-bg');
  const text = () => rgb('--color-base-content');
  const LAYERS = [1, 2, 3, 4, 5, 6, 7].map((n) => `--lb-layer-${n}`);

  it('keeps body text at 7:1 on every surface', () => {
    for (const ground of [
      '--color-base-100',
      '--color-base-200',
      '--color-base-300',
      '--lb-key-bg',
    ]) {
      expect(ratio(text(), rgb(ground)), ground).toBeGreaterThanOrEqual(7);
    }
  });

  it('keeps the muted text steps at 4.5:1', () => {
    for (const opacity of [0.8, 0.75, 0.7, 0.6]) {
      expect(
        ratio(faded(text(), page(), opacity), page()),
        `${opacity} on the page`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const opacity of [0.6, 0.55]) {
      expect(
        ratio(faded(text(), key(), opacity), key()),
        `${opacity} on a key`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps each layer colour readable: a name on the page, a mark on a key, its number inside', () => {
    for (const layer of LAYERS) {
      expect(ratio(rgb(layer), page()), `${layer} name on the page`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb(layer), key()), `${layer} on a key`).toBeGreaterThanOrEqual(3);
      expect(ratio(rgb('--lb-layer-ink'), rgb(layer)), `ink on ${layer}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps rings and edges drawn in primary at 3:1 on every surface', () => {
    for (const ground of [
      '--color-base-100',
      '--color-base-200',
      '--color-base-300',
      '--lb-key-bg',
    ]) {
      expect(ratio(rgb('--lb-ring'), rgb(ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the colours drawn on the surfaces readable: badges as text, the rest as marks', () => {
    for (const colour of ['--color-secondary', '--color-accent']) {
      expect(ratio(rgb(colour), page()), colour).toBeGreaterThanOrEqual(4.5);
    }
    for (const colour of ['--color-info', '--color-success', '--color-warning', '--color-error']) {
      for (const ground of ['--color-base-200', '--color-base-300']) {
        expect(ratio(rgb(colour), rgb(ground)), `${colour} on ${ground}`).toBeGreaterThanOrEqual(3);
      }
    }
    for (const colour of ['--color-info', '--color-success', '--color-warning']) {
      expect(ratio(rgb(colour), page()), colour).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(rgb('--color-info-content'), rgb('--color-info'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the surfaces apart: cards, hover and borders, and a key against the page', () => {
    expect(ratio(rgb('--color-base-100'), rgb('--color-base-200'))).toBeGreaterThanOrEqual(1.15);
    expect(ratio(rgb('--color-base-200'), rgb('--color-base-300'))).toBeGreaterThanOrEqual(1.15);
    expect(ratio(page(), key())).toBeGreaterThanOrEqual(1.3);
    expect(ratio(page(), rgb('--color-neutral'))).toBeGreaterThanOrEqual(1.3);
  });
});
