/**
 * The layouts held to cyanophage's playground, each by the string his own index links it with
 * (`https://cyanophage.github.io/index.html`, read 2026-11-10): ten characters a row and a right
 * outer key on the top and home rows, then the bottom row, `\` for the left outer key and `^` for a
 * thumb that only shifts. LayerBench reads the same string onto a row-stagger board, which has those
 * outer keys, so both type the same keys with the same fingers. Only layouts whose thumb only
 * shifts are here: a letter on a thumb costs 1 in LayerBench's Effort and nothing in his.
 */
export interface PlaygroundLayout {
  name: string;
  layout: string;
}

export const LAYOUTS: readonly PlaygroundLayout[] = [
  { name: 'qwerty', layout: "qwertyuiop-asdfghjkl;'zxcvbnm,./\\^" },
  { name: 'dvorak', layout: "',.pyfgcrl/aoeuidhtns-;qjkxbmwvz\\^" },
  { name: 'colemak', layout: "qwfpgjluy;-arstdhneio'zxcvbkm,./\\^" },
  { name: 'colemak-dh', layout: "qwfpbjluy;-arstgmneio'zxcdvkh,./\\^" },
  { name: 'graphite', layout: "bldwz'fouj;nrtsgyhaei,qxmcvkp.-/\\^" },
  { name: 'gallium', layout: "bldcvzyou,-nrtsgphaei/qxmwjkf';.\\^" },
  { name: 'aptv3', layout: "wgdfbqluoy-rsthkjneai;xcmpvz,.'/\\^" },
  { name: 'sturdy', layout: "vmlcpxfouj-strdy.naei/zkqgwbh';,\\^" },
  { name: 'recurva', layout: "frdpvqjuoy-sntcb.heai/zxkgwml;',\\^" },
  { name: 'focal', layout: "vlhgkqfouj-srntbycaei/zxmdp'w.;,\\^" },
];

/** The board LayerBench reads the strings onto: ANSI has both right outer keys his strings fill. */
export const BOARD = 'ansi';

export const PLAYGROUND = 'https://cyanophage.github.io/playground.html';

/** His playground with a layout, as his index links it: the ergo board, English, thumb on the left. */
export function playgroundUrl(layout: string): string {
  const url = new URL(PLAYGROUND);
  url.searchParams.set('layout', layout);
  url.searchParams.set('mode', 'ergo');
  url.searchParams.set('lan', 'english');
  url.searchParams.set('thumb', 'l');
  return url.toString();
}

/**
 * The numbers compared, by LayerBench's rule id, each as his page prints it: two decimals. His
 * redirects are left out: he prints redirects and weak redirects apart, and LayerBench's one rule is
 * their sum, which two rounded numbers cannot be held to.
 */
export const METRICS = ['effort', 'sfb', 'sfb_2u', 'lsb', 'sfs', 'fsb'] as const;
export type Metric = (typeof METRICS)[number];
export type Shown = Record<Metric, string>;
