import type { Binding, ComboDef, Layout } from '../layout/types.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'á', 'à', 'ã', 'â', 'é', 'ê', 'í', 'ó', 'õ', 'ô', 'ú'];

/** Accented letter: one physical press (dead key + letter sent to the host), then the ALTREP2 one-shot is armed. */
const accent = (symbol: string): Binding => ({
  kind: 'macro',
  symbols: symbol,
  then: [{ kind: 'sl', layer: 'altrep2' }],
});

function rowBindings(map: Record<string, string | Binding>): Record<string, Binding> {
  const out: Record<string, Binding> = {};
  for (const [k, v] of Object.entries(map)) out[k] = typeof v === 'string' ? kp(v) : v;
  return out;
}

function upperCopy(
  bindings: Record<string, Binding>,
  only?: (id: string) => boolean,
): Record<string, Binding> {
  const out: Record<string, Binding> = { '*': { kind: 'trans' } };
  for (const [k, b] of Object.entries(bindings)) {
    if (k === '*') continue;
    if (only && !only(k)) continue;
    if (b.kind === 'kp' && b.symbol && /\p{L}/u.test(b.symbol)) out[k] = kp(b.symbol.toUpperCase());
    else if (b.kind === 'macro' && b.symbols && /\p{L}/u.test(b.symbols))
      out[k] = { ...b, symbols: b.symbols.toUpperCase() };
  }
  return out;
}

const behaviors: Record<string, Binding> = {
  magic: {
    kind: 'adaptive',
    default: kp('h'),
    triggers: [{ afterAny: VOWELS, binding: kp('v') }],
  },
  reversedMagic: {
    kind: 'adaptive',
    default: kp('v'),
    triggers: [{ afterAny: VOWELS, binding: kp('h') }],
  },
  altRepeat: {
    kind: 'adaptive',
    default: { kind: 'key_repeat' },
    triggers: [
      { afterAny: ['a'], binding: kp('h') },
      { afterAny: ['y'], binding: kp('d') },
      { afterAny: ['h'], binding: { kind: 'macro', symbols: 'ões' } },
      { afterAny: ['v', 'x', 'j'], binding: { kind: 'sl', layer: 'alpha2' } },
      { afterAny: ["'"], binding: kp('v') },
      { afterAny: ['I'], binding: kp("'") },
    ],
  },
  a2AltRepeat: {
    kind: 'adaptive',
    default: { kind: 'adaptive', ref: 'altRepeat' },
    triggers: [
      { afterAny: ['á', 'à', 'ã', 'â', 'ó', 'õ', 'ô', 'é', 'ê'], binding: kp('x') },
      { afterAny: ['í'], binding: kp('e') },
      { afterAny: ['u', 'ú'], binding: accent('ê') },
    ],
  },
  sentenceSpace: {
    kind: 'adaptive',
    default: kp(' '),
    triggers: [
      {
        afterAny: ['.', '?', '!'],
        binding: { kind: 'macro', steps: [kp(' '), { kind: 'sl', layer: 'sen_case' }] },
      },
    ],
  },
  shiftOrCaps: {
    kind: 'mod_morph',
    mods: ['LSHIFT', 'RSHIFT'],
    default: { kind: 'sk', mod: 'LSHIFT' },
    morphed: { kind: 'auto_layer', layer: 'case_a1' },
  },
  alpha2OrShifted: {
    kind: 'mod_morph',
    mods: ['LSHIFT', 'RSHIFT'],
    default: { kind: 'sl', layer: 'alpha2' },
    morphed: { kind: 'sl', layer: 'sft_a2' },
  },
};

const CCEDIL_BINDINGS: Record<string, Binding> = {
  '*': { kind: 'trans' },
  LHI: { kind: 'macro', symbols: 'ão' },
  LBI: { kind: 'macro', symbols: 'ões' },
  RHI: kp('ã'),
  RBI: kp('õ'),
  L1: { kind: 'sl', layer: 'alpha2' },
};

const ALTREP2_BINDINGS: Record<string, Binding> = {
  '*': { kind: 'trans' },
  L1: { kind: 'ref', ref: 'a2AltRepeat' },
};

// ---------------------------------------------------------------- Romak 24

const ROMAK24_ALPHA1 = rowBindings({
  LHP: 'd',
  LTR: 'b',
  LHR: 'n',
  LBR: 'f',
  LTM: 'm',
  LHM: 's',
  LBM: 'c',
  LTI: 'g',
  LHI: 't',
  LBI: 'p',
  RTI: 'l',
  RHI: 'r',
  RBI: 'h',
  RTM: 'o',
  RHM: 'a',
  RBM: ',',
  RTR: 'u',
  RHR: 'e',
  RBR: '.',
  RHP: 'i',
});

const ROMAK24_ALPHA2: Record<string, Binding> = {
  '*': { kind: 'trans' },
  LHP: kp('y'),
  LTR: kp('q'),
  LHR: kp('z'),
  LBR: kp('j'),
  LTM: { kind: 'macro', symbols: 'qu', then: [{ kind: 'sl', layer: 'altrep2' }] },
  LHM: kp('x'),
  LBM: { kind: 'macro', symbols: 'ç', then: [{ kind: 'sl', layer: 'ccedil' }] },
  LTI: kp('k'),
  LHI: kp('w'),
  LBI: kp('v'),
  RTI: accent('ô'),
  RHI: accent('ã'),
  RBI: accent('õ'),
  RTM: accent('ó'),
  RHM: accent('á'),
  RBM: accent('â'),
  RTR: accent('ú'),
  RHR: accent('é'),
  RBR: accent('ê'),
  RHP: accent('í'),
  L1: kp("'"),
  R1: kp("'"),
};

const ROMAK24_COMBOS: ComboDef[] = [
  {
    id: 'ns',
    keys: ['LHR', 'LHM'],
    binding: kp('q'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'mg',
    keys: ['LTM', 'LTI'],
    binding: kp('k'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'st',
    keys: ['LHM', 'LHI'],
    binding: kp('w'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'cp',
    keys: ['LBM', 'LBI'],
    binding: kp('v'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'lo',
    keys: ['RTI', 'RTM'],
    binding: kp('x'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'ra',
    keys: ['RHI', 'RHM'],
    binding: kp('z'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'hcomma',
    keys: ['RBI', 'RBM'],
    binding: kp('j'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'ae',
    keys: ['RHM', 'RHR'],
    binding: kp('y'),
    layers: ['alpha1'],
    role: 'command',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'question',
    keys: ['RHI', 'RHM'],
    binding: kp('?'),
    layers: ['alpha2'],
    role: 'typing',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'exclamation',
    keys: ['RBI', 'RBM'],
    binding: kp('!'),
    layers: ['alpha2'],
    role: 'typing',
    timeoutMs: 30,
    slowRelease: false,
  },
  {
    id: 'agrave',
    keys: ['RHM', 'RHR'],
    binding: accent('à'),
    layers: ['alpha2'],
    role: 'typing',
    timeoutMs: 30,
    slowRelease: false,
  },
];

function romak24Base(name: string, id: string, description: string): Layout {
  return {
    format: 'layoutmaster/layout@1',
    id,
    name,
    author: 'Rafael Romão',
    description,
    languages: ['pt-BR', 'en'],
    hostLocale: 'symbols',
    geometry: { preset: '1333+2' },
    keys: { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
    behaviorDefaults: {
      sl: { quickRelease: true, ignoreModifiers: false, releaseAfterMs: 1000 },
      sk: { quickRelease: true, ignoreModifiers: true, releaseAfterMs: 1500 },
    },
    behaviors,
    layers: [
      {
        id: 'alpha1',
        name: 'Alpha 1',
        bindings: {
          ...ROMAK24_ALPHA1,
          L1: { kind: 'key_repeat' },
          L0: kp(' '),
          R0: { kind: 'sl', layer: 'alpha2' },
          R1: { kind: 'sk', mod: 'LSHIFT' },
        },
      },
      { id: 'alpha2', name: 'Alpha 2', bindings: ROMAK24_ALPHA2 },
      { id: 'ccedil', name: 'Ç extension', bindings: CCEDIL_BINDINGS },
      { id: 'altrep2', name: 'Alt repeat 2', bindings: ALTREP2_BINDINGS },
    ],
    combos: ROMAK24_COMBOS,
    repeatPolicy: { doubledLetters: 'repeatKey' },
  };
}

export const romak24: Layout = romak24Base(
  'Romak 24',
  'romak-24',
  'Romak for 24 keys (1333+2): two alpha layers, Ç extension, one-shot shift.',
);

export const magicRomak: Layout = (() => {
  const base = romak24Base(
    'Magic Romak',
    'magic-romak',
    'Romak 24 with adaptive magic keys (h/v), alt-repeat, sentence case, caps word and shifted twin layers.',
  );
  const alpha1: Record<string, Binding> = {
    ...ROMAK24_ALPHA1,
    RBI: { kind: 'ref', ref: 'magic' },
    L1: { kind: 'ref', ref: 'altRepeat' },
    L0: { kind: 'ref', ref: 'sentenceSpace' },
    R0: { kind: 'ref', ref: 'alpha2OrShifted' },
    R1: { kind: 'ref', ref: 'shiftOrCaps' },
  };
  const alpha2: Record<string, Binding> = {
    ...ROMAK24_ALPHA2,
    LBI: { kind: 'ref', ref: 'reversedMagic' },
  };
  const letterKeys = (id: string) => !['L0', 'L1', 'R0', 'R1'].includes(id);
  return {
    ...base,
    layers: [
      { id: 'alpha1', name: 'Alpha 1', shiftedTwin: 'sen_case', bindings: alpha1 },
      { id: 'alpha2', name: 'Alpha 2', shiftedTwin: 'sft_a2', bindings: alpha2 },
      { id: 'ccedil', name: 'Ç extension', bindings: CCEDIL_BINDINGS },
      { id: 'altrep2', name: 'Alt repeat 2', bindings: ALTREP2_BINDINGS },
      { id: 'sen_case', name: 'Sentence case', bindings: upperCopy(alpha1, letterKeys) },
      { id: 'case_a1', name: 'Caps word', bindings: upperCopy(alpha1, letterKeys) },
      { id: 'sft_a2', name: 'Shifted Alpha 2', bindings: upperCopy(alpha2, letterKeys) },
    ],
    activators: {
      alpha2: [
        { from: 'alpha1', via: 'key:alpha1/R0' },
        { from: 'ccedil', via: 'key:ccedil/L1' },
      ],
    },
  };
})();

// ---------------------------------------------------------------- Romak 34

const ROMAK34_ALPHA1 = rowBindings({
  LTP: 'q',
  LTR: 'b',
  LTM: 'm',
  LTI: 'g',
  LTC: 'k',
  LHP: 'd',
  LHR: 'n',
  LHM: 's',
  LHI: 't',
  LHC: 'w',
  LBP: 'y',
  LBR: 'f',
  LBM: 'c',
  LBI: 'p',
  LBC: 'v',
  RTC: 'x',
  RTI: 'l',
  RTM: 'o',
  RTR: 'u',
  RTP: ';',
  RHC: 'z',
  RHI: 'r',
  RHM: 'a',
  RHR: 'e',
  RHP: 'i',
  RBC: 'j',
  RBI: 'h',
  RBM: ',',
  RBR: '.',
  RBP: '/',
  L1: { kind: 'key_repeat' },
  L0: ' ',
  R0: { kind: 'sl', layer: 'alpha2' },
  R1: { kind: 'sk', mod: 'LSHIFT' },
});

const ROMAK34_ALPHA2: Record<string, Binding> = {
  '*': { kind: 'trans' },
  LTM: { kind: 'macro', symbols: 'qu', then: [{ kind: 'sl', layer: 'altrep2' }] },
  LBM: { kind: 'macro', symbols: 'ç', then: [{ kind: 'sl', layer: 'ccedil' }] },
  RTI: accent('ô'),
  RTM: accent('ó'),
  RTR: accent('ú'),
  RHI: accent('ã'),
  RHM: accent('á'),
  RHR: accent('é'),
  RHP: accent('í'),
  RBI: accent('õ'),
  RBM: accent('â'),
  RBR: accent('ê'),
  L1: kp("'"),
  R1: kp("'"),
};

export const romak34: Layout = {
  format: 'layoutmaster/layout@1',
  id: 'romak-34',
  name: 'Romak 34',
  author: 'Rafael Romão',
  description: 'Romak for 34 keys (3x5+2): accented vowels on a one-shot second alpha layer.',
  languages: ['pt-BR', 'en'],
  hostLocale: 'symbols',
  geometry: { preset: '3x5+2' },
  keys: { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
  behaviorDefaults: {
    sl: { quickRelease: true, ignoreModifiers: false, releaseAfterMs: 1000 },
    sk: { quickRelease: true, ignoreModifiers: true, releaseAfterMs: 1500 },
  },
  behaviors,
  layers: [
    { id: 'alpha1', name: 'Alpha 1', bindings: ROMAK34_ALPHA1 },
    { id: 'alpha2', name: 'Alpha 2', bindings: ROMAK34_ALPHA2 },
    { id: 'ccedil', name: 'Ç extension', bindings: CCEDIL_BINDINGS },
    { id: 'altrep2', name: 'Alt repeat 2', bindings: ALTREP2_BINDINGS },
  ],
  combos: [
    {
      id: 'question',
      keys: ['RHI', 'RHM'],
      binding: kp('?'),
      layers: ['alpha2'],
      role: 'typing',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'exclamation',
      keys: ['RBI', 'RBM'],
      binding: kp('!'),
      layers: ['alpha2'],
      role: 'typing',
      timeoutMs: 30,
      slowRelease: false,
    },
  ],
  repeatPolicy: { doubledLetters: 'repeatKey' },
};
