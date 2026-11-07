/**
 * The keymaps of keymapdb.com (github.com/precondition/keymapdb, `src/posts/keymaps/*.md`) whose
 * repositories commit a keymap-drawer YAML file: 16 of its 152 entries, found on 2026-11-07 by
 * listing the git tree of every entry hosted on GitHub. Each file is read at a pinned commit, and
 * so is the image keymapdb shows for it, where the image is in the repository.
 *
 * Nothing here is committed but the addresses: `refresh.ts` downloads the files into `.cache/`,
 * which git ignores, since most of these repositories carry no licence.
 *
 * `board` is the keyboard's own layout file, found the way keymap-drawer finds it for the name
 * the file gives (`resources/zmk_keyboard_layouts.yaml`, `qmk_keyboard_mappings.yaml`, then
 * `resources/extra_layouts/`), at keymap-drawer's commit `KEYMAP_DRAWER`.
 */

import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where `refresh.ts` puts the files, which git ignores. */
export const CACHE = fileURLToPath(new URL('.cache', import.meta.url));

/** keymap-drawer's commit whose layout files stand in for the keyboards the files name. */
export const KEYMAP_DRAWER = '467abe2a2fee3a1ec1658d8c3fe33d1cc562b53c';

const layoutFile = (name: string) =>
  `https://raw.githubusercontent.com/caksoylar/keymap-drawer/${KEYMAP_DRAWER}/resources/extra_layouts/${name}.json`;

const raw = (repo: string, sha: string, path: string) =>
  `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;

export interface Entry {
  /** keymapdb's name for the entry: its file name and the end of its page's address. */
  slug: string;
  repo: string;
  sha: string;
  /** The keymap-drawer file, in the repository. */
  yaml: string;
  /**
   * keymapdb's picture: drawn by keymap-drawer (and so read by machine), or a raster image. One
   * no commit pins carries the SHA-256 it had when the findings were measured.
   */
  image: { url: string; kind: 'kd-svg' | 'raster'; pinned: boolean; sha256?: string };
  /** The keyboard's layout file, as keymap-drawer would find it; null where it has none. */
  board: { url: string; why: string } | null;
  note?: string;
  known?: Known;
}

/**
 * What an entry shows of the findings of docs/research/keymapdb-import.md, pinned as it stands:
 * the test fails when it changes, fixed or not, so the pin goes with the fix.
 */
export interface Known {
  /** F6, F7: no key of the base layer types a space, on the board the test takes to Analyze. */
  noSpace?: string;
  /** F8: what the dialog says it cannot read of the base layer. */
  unread?: { finding: string; says: string };
  /**
   * F1–F4: on the keyboard's own layout file, what the dialog says of the board, and the base
   * layer's characters the board lacks against the picture.
   */
  ownFile?: { finding: string; board: string; missing?: string[] };
}

export const ENTRIES: Entry[] = [
  {
    slug: 'AlaaSaadAbdo',
    repo: 'AlaaSaadAbdo/zmk-config',
    sha: '78e3b0d59169be6b95629da405312c67f5907256',
    yaml: 'keymap-drawer.yml',
    image: { url: 'layout.svg', kind: 'kd-svg', pinned: true },
    board: { url: layoutFile('berylline'), why: 'zmk rommana → hummingbird_splay → berylline' },
  },
  {
    slug: 'MattSturgeon',
    repo: 'MattSturgeon/glove80-config',
    sha: 'fc2322743c4ee0232ff71771e17ba472fa506ba9',
    yaml: 'img/glove80.yaml',
    image: {
      url: raw(
        'MattSturgeon/glove80-config',
        '6be8debed9bba1107392ef65004dc75df97ac9f2',
        'img/glove80_ColmakDH.svg',
      ),
      kind: 'kd-svg',
      pinned: true,
    },
    board: { url: layoutFile('glove80'), why: 'zmk glove80 → glove80' },
    note: 'keymapdb pins an older image, of one layer (ColmakDH); the file has moved on.',
    known: {
      noSpace: 'F6',
      ownFile: {
        finding: 'F2',
        board: '48 keys; 32 keys the model has no place for',
        missing: [...'1234567890qwfpluy', "'"],
      },
    },
  },
  {
    slug: 'ScriBanana',
    repo: 'ScriBanana/OptiCorne',
    sha: 'c8ce49b82b8b5244b8d9b6817d8b5ff1bf8f8500',
    yaml: 'Illustrations/VisualLayout.yaml',
    image: { url: 'Illustrations/CorneOptimot.webp', kind: 'raster', pinned: true },
    board: { url: layoutFile('corne_rotated'), why: 'zmk corne → corne_rotated' },
  },
  {
    slug: 'akioweh',
    repo: 'akioweh/zmk-config',
    sha: 'c44c5a46abe6ca2008bbe423f13dca6a94637f18',
    yaml: 'keymap-drawer/kyria_rev3.yaml',
    image: { url: 'keymap-drawer/kyria_rev3.svg', kind: 'kd-svg', pinned: true },
    board: {
      url: layoutFile('kyria_rotated'),
      why: 'zmk kyria_rev3 → splitkb/kyria/rev1 → kyria_rotated',
    },
    known: {
      ownFile: {
        finding: 'F1',
        board: '34 keys; 16 keys the model has no place for',
        missing: [...'weruiosdfjklxcm,'],
      },
    },
  },
  {
    slug: 'caksoylar',
    repo: 'caksoylar/zmk-config',
    sha: '83a27b5b313c63299af90b788ecbd00f531dafd9',
    yaml: 'keymap-drawer/keymapdb/keymap.yaml',
    // Built by the repository's workflow onto GitHub Pages; the copy in the repository differs.
    image: {
      url: 'https://caksoylar.github.io/zmk-config/keymapdb.svg',
      kind: 'kd-svg',
      pinned: false,
      sha256: '739c376475c722afb156bbf3eb164a2ae885bd196ba08e5e1caf33b9fb224074',
    },
    board: { url: layoutFile('berylline'), why: 'qmk rufous → berylline' },
    known: { noSpace: 'F6' },
  },
  {
    slug: 'casuanoob',
    repo: 'casuanoob/qmk_userspace',
    sha: 'e627af2105d886b8430b2186fb21bd1ddf0450bb',
    yaml: 'users/casuanoob/assets/split34_keymap_qmk.yaml',
    image: { url: 'users/casuanoob/assets/split34_keymap_qmk.svg', kind: 'kd-svg', pinned: true },
    board: { url: layoutFile('bastardkb@dilemma@3x5_3'), why: 'qmk bastardkb/dilemma/3x5_3' },
    known: { noSpace: 'F7' },
  },
  {
    slug: 'godalming123',
    repo: 'godalming123/qmk-keymap',
    sha: '5ccf28cda99f3970cb7e812bbdc41c07f1ca2f09',
    yaml: 'keymap.yaml',
    image: { url: 'keymap.svg', kind: 'kd-svg', pinned: true },
    board: { url: layoutFile('corne_rotated'), why: 'qmk corne_rotated' },
  },
  {
    slug: 'indianpojken',
    repo: 'indianpojken/qmk-config',
    sha: 'ac5b6b1954e0c2e890c07a2311f35d2f62f00b4a',
    yaml: 'ferris/assets/visualization.keymap.yml',
    image: { url: 'ferris/assets/visualization.png', kind: 'raster', pinned: true },
    board: { url: layoutFile('ferris_rotated'), why: 'qmk ferris/sweep → ferris_rotated' },
    known: { noSpace: 'F6' },
  },
  {
    slug: 'jcmkk3',
    repo: 'jcmkk3/zmk-config',
    sha: 'e9a3312f4f64932fd34e3a63e1e52294e66ce39c',
    yaml: 'keymap-drawer.yaml',
    image: { url: 'keymap-drawer.svg', kind: 'kd-svg', pinned: true },
    board: null,
    note: 'The file describes its board (ortho_layout), so nothing is chosen.',
    known: { unread: { finding: 'F8', says: 'not read: upper, sym' } },
  },
  {
    slug: 'justinmklam',
    repo: 'justinmklam/corne-keyboard',
    sha: 'cef2e86a4ec9fd6d32eeba1187c3007f53fbc676',
    yaml: 'keymap_drawer/keymap.yaml',
    image: { url: 'keymap_drawer/keymap.svg', kind: 'kd-svg', pinned: true },
    board: {
      url: layoutFile('corne_rotated'),
      why: 'qmk crkbd/rev4_0/standard → corne_rotated, LAYOUT_split_3x6_3_ex2',
    },
    known: {
      ownFile: {
        finding: 'F4',
        board: '40 keys; 6 keys the model has no place for',
        missing: ["'"],
      },
    },
  },
  {
    slug: 'minusfive',
    repo: 'minusfive/knucklehead',
    sha: 'de472287a3e67c4384c48440e946ecaa6be960a3',
    yaml: 'img/corneish_zen.yaml',
    // keymapdb links minusfive.com's copy, which is byte for byte this one.
    image: { url: 'img/corneish_zen.svg', kind: 'kd-svg', pinned: true },
    board: { url: layoutFile('corne_rotated'), why: 'zmk corneish_zen → corne_rotated' },
    known: { noSpace: 'F6' },
  },
  {
    slug: 'phaberest',
    repo: 'phaberest/qmk_firmware',
    sha: '0539214b8c3fa54bccc1880ffda8f79934ec0cab',
    yaml: 'keyboards/crkbd/keymaps/phaberest/keymap_drawer.yaml',
    image: { url: 'keyboards/crkbd/keymaps/phaberest/keymap.svg', kind: 'kd-svg', pinned: true },
    board: { url: layoutFile('corne_rotated'), why: 'qmk crkbd/rev1 → corne_rotated' },
  },
  {
    slug: 'rafaelromao',
    repo: 'rafaelromao/keyboards',
    sha: '5443a459ebd324050477077fcd6445e1e6136f10',
    yaml: 'docs/img/diagrams/keymap-drawer/keymap-drawer.yaml',
    image: { url: 'docs/img/diagrams/overview.png', kind: 'raster', pinned: true },
    board: {
      url: raw(
        'rafaelromao/keyboards',
        '5443a459ebd324050477077fcd6445e1e6136f10',
        'docs/img/diagrams/keymap-drawer/diamond-layout.json',
      ),
      why: 'qmk_info_json, a file in the repository',
    },
    known: {
      noSpace: 'F6',
      ownFile: { finding: 'F3', board: '14 keys; 10 keys the model has no place for' },
    },
  },
  {
    slug: 'rearman',
    repo: 'rearman/zmk-config',
    sha: 'f8a99f1f257c89d8caede4bb0315da7d4bcbe1a7',
    yaml: 'corne_keymap_drawer.yaml',
    image: { url: 'corne.svg', kind: 'kd-svg', pinned: true },
    board: { url: layoutFile('corne_rotated'), why: 'qmk corne_rotated' },
  },
  {
    slug: 'valdirjunior011',
    repo: 'valdirjunior011/zmk-config-temper',
    sha: '1e3f473306b466c1e1d9d696a5d25a0d99eec0b3',
    yaml: 'keymap_img/temper.yaml',
    image: { url: 'keymap_img/temper.svg', kind: 'kd-svg', pinned: true },
    board: null,
    note: 'Neither keymap-drawer nor QMK has a layout for a keyboard named temper.',
  },
  {
    slug: 'waffle87',
    repo: 'waffle87/qmk.me',
    sha: 'fa88d5be24179e2a9db165ca4ff794be2ee02276',
    yaml: 'util/keymap.yaml',
    image: { url: 'util/layout.svg', kind: 'kd-svg', pinned: true },
    board: { url: layoutFile('ferris_rotated'), why: 'qmk ferris/sweep → ferris_rotated' },
    known: { noSpace: 'F6' },
  },
];

/** The image's address: a path is in the entry's repository, at its commit. */
export const imageUrl = (e: Entry) =>
  e.image.url.startsWith('https://') ? e.image.url : raw(e.repo, e.sha, e.image.url);

export const yamlUrl = (e: Entry) => raw(e.repo, e.sha, e.yaml);

/** Where an entry's files are kept. */
export const entryDir = (e: Entry) => join(CACHE, e.slug);

/**
 * Files next to those keymaps that someone could choose by mistake, each with what the dialog
 * should say. A pattern of null means the file reads: it is a keymap, if not the one pictured.
 */
export interface Mistake {
  slug: string;
  url: string;
  what: string;
  says: RegExp | null;
}

const NOT_A_KEYMAP = /not a keymap-drawer file/;

export const MISTAKES: Mistake[] = [
  {
    slug: 'caksoylar-config',
    url: raw(
      'caksoylar/zmk-config',
      '83a27b5b313c63299af90b788ecbd00f531dafd9',
      'keymap-drawer/config.yaml',
    ),
    what: "keymap-drawer's own configuration",
    says: NOT_A_KEYMAP,
  },
  {
    slug: 'akioweh-config',
    url: raw(
      'akioweh/zmk-config',
      'c44c5a46abe6ca2008bbe423f13dca6a94637f18',
      'keymap_drawer.config.yaml',
    ),
    what: "keymap-drawer's own configuration",
    says: NOT_A_KEYMAP,
  },
  {
    slug: 'urob-config',
    url: raw('urob/zmk-config', 'ef2095c2da74a7d213cd457c0b54d04a9d901131', 'draw/config.yaml'),
    what: "keymap-drawer's own configuration",
    says: NOT_A_KEYMAP,
  },
  {
    slug: 'minusfive-combos',
    url: raw(
      'minusfive/knucklehead',
      'de472287a3e67c4384c48440e946ecaa6be960a3',
      'keymap-drawer/combos.yaml',
    ),
    what: 'combos alone, merged into the keymap by its build',
    says: NOT_A_KEYMAP,
  },
  {
    slug: 'AlaaSaadAbdo-build',
    url: raw('AlaaSaadAbdo/zmk-config', '78e3b0d59169be6b95629da405312c67f5907256', 'build.yaml'),
    what: "ZMK's build matrix",
    says: NOT_A_KEYMAP,
  },
  {
    slug: 'AlaaSaadAbdo-west',
    url: raw(
      'AlaaSaadAbdo/zmk-config',
      '78e3b0d59169be6b95629da405312c67f5907256',
      'config/west.yml',
    ),
    what: "ZMK's west manifest",
    says: NOT_A_KEYMAP,
  },
  {
    slug: 'sunaku-world',
    url: raw('sunaku/glove80-keymaps', 'f3594ac0f04d9de478a980340abd7f6692181424', 'world.yaml'),
    what: 'a table of characters for a keymap generator',
    says: NOT_A_KEYMAP,
  },
  {
    slug: 'zeitlinger-after-n',
    url: raw(
      'zeitlinger/keyboard',
      '571eeb971e117fe75253555519ca05abf8436fd2',
      'blog/after-n.yaml',
    ),
    what: 'a one-layer keymap drawn for a blog post',
    says: null,
  },
  {
    slug: 'jcmkk3-image',
    url: raw('jcmkk3/zmk-config', 'e9a3312f4f64932fd34e3a63e1e52294e66ce39c', 'keymap-drawer.svg'),
    what: "the keymap's SVG picture instead of its YAML",
    says: /line \d+: /,
  },
  {
    slug: 'indianpojken-image',
    url: raw(
      'indianpojken/qmk-config',
      'ac5b6b1954e0c2e890c07a2311f35d2f62f00b4a',
      'ferris/assets/visualization.png',
    ),
    what: "the keymap's PNG picture instead of its YAML",
    says: /line \d+: /,
  },
];

/** Where a file chosen by mistake is kept: by its slug, with the extension it has. */
export const mistakePath = (m: Mistake) =>
  join(CACHE, 'mistakes', `${m.slug}${extname(new URL(m.url).pathname)}`);
