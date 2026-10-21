import { DOCUMENT_IDS } from './documents.js';

/**
 * The ids of the layouts written in code, which `BUNDLED_LAYOUTS` builds, in the order the Library
 * lists them. Listed apart, so the sign-in server can refuse a submitted layout that takes one
 * without building every layout; a test keeps the list equal to what is built.
 */
const BUILT_IN_IDS = [
  'magic-romak',
  'romak',
  'qwerty',
  'dvorak',
  'colemak',
  'colemak-dh',
  'graphite',
  'gallium',
  'canary',
  'sturdy',
  'aptv3',
  'hands-down-neu',
  'night',
  'dusk',
  'recurva',
  'focal',
  'nerps',
  'engram',
  'sunlight',
  'snth',
  'aptmak',
  'bird',
  'bird-30',
  'hands-down-gold',
  'hands-down-promethium',
  'hands-down-vibranium',
  'rsthd',
  't-34',
  'magic-sturdy',
  'enthium',
  'nordrassil',
  'finch',
  'caksoylar',
  'uno',
  'ben-vallack-piano',
];

/** The id of every bundled layout: those written in code, and those added as documents. */
export const BUNDLED_IDS: readonly string[] = [...BUILT_IN_IDS, ...DOCUMENT_IDS];

/** The layout a visit that names none opens: the one the app was made for. */
export const DEFAULT_LAYOUT_ID = 'magic-romak';
