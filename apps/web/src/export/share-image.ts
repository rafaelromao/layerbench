import type { CompiledLayout, Layout } from '@layerbench/core';
import {
  effectiveHeat,
  HEAT_LABELS,
  type HeatSource,
  heatMap,
  layerShare,
} from '../engine/heat.js';
import type { HeatMode } from '../url/params.js';
import { parseLayoutRef } from '../url/params.js';
import type { ShareBoard, ShareImage } from './ShareImageDialog.js';

/** One layout as Analyze or Compare has it open, with the numbers its heat is drawn from. */
export interface SharedLayout {
  layout: Layout;
  /** As written: the keys. */
  compiled: CompiledLayout;
  /** As typed: the combos. */
  typed: CompiledLayout;
  /** The report whose heat is drawn: the layout's own, on the settings shown. */
  report: HeatSource;
  /** What is shown has changes that are saved nowhere (`unsavedVersion` in Compare). */
  unsaved: boolean;
  /** Whether the combos that type are drawn; Compare draws them always. */
  combos: boolean;
}

const BUSIEST = 'against the busiest key of all layers';

/**
 * The image of the layout open in Analyze: its first layer, coloured as Analyze colours a layer
 * (every layer on the scale of the busiest key of all of them), whatever layer the board is on.
 */
export function analyzeImage(shared: SharedLayout, mode: HeatMode, settings: string): ShareImage {
  return {
    boards: [board(shared, null, mode, undefined)],
    heat: HEAT_LABELS[effectiveHeat(shared.report, mode)],
    heatNote: BUSIEST,
    settings,
  };
}

/**
 * The image of the two layouts of Compare, one over the other: each one's first layer, on the one
 * scale both boards are coloured on (`top`, the busiest key of either layout on any layer), so the
 * same colour is the same amount on both. Both are rated on one rule set, so a rule that is lacking
 * is lacking on both, and either names what is drawn.
 */
export function compareImage(
  a: SharedLayout,
  b: SharedLayout,
  mode: HeatMode,
  top: number,
  settings: string,
): ShareImage {
  return {
    boards: [board(a, 'A', mode, top), board(b, 'B', mode, top)],
    heat: HEAT_LABELS[effectiveHeat(a.report, mode)],
    heatNote: `one scale for both layouts, ${BUSIEST}`,
    settings,
  };
}

function board(
  { layout, compiled, typed, report, unsaved, combos }: SharedLayout,
  tag: string | null,
  mode: HeatMode,
  top: number | undefined,
): ShareBoard {
  return {
    tag,
    layout,
    compiled,
    typed,
    heat: heatMap(report, mode, 0, top),
    share: layerShare(report, 0),
    unsaved,
    combos,
  };
}

/**
 * Whether a layout Compare has opened is a version saved nowhere here: a custom layout carried with
 * changes that are not saved in it, or a layout carried whole that is no saved layout, such as the
 * edits of a bundled layout that Analyze sends along when it opens Compare. A layout named by a
 * bundled, community or custom id is the layout as it is kept.
 */
export function unsavedVersion(opened: {
  ref: string | null;
  storedId: string | null;
  unsaved: boolean;
}): boolean {
  if (opened.unsaved) return true;
  return (
    opened.storedId === null && opened.ref !== null && parseLayoutRef(opened.ref).kind === 'inline'
  );
}
