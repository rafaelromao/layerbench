import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { buildGoldenReport, goldenMatrix } from '../golden/report.js';
import { bundledLayout } from '../layouts/index.js';
import { applyEdit, type Edit } from './edit.js';
import { toCanonicalJson } from './json.js';
import type { Layout } from './types.js';

/**
 * Magic Romak is written in code, but nothing in it is out of an author's reach: every part of it
 * can be made in the editor, on a new layout, by the same edits a person makes there. Rebuilt so,
 * it is the same layout, key for key, and it is analyzed the same.
 */
const magicRomak = bundledLayout('magic-romak') as Layout;

/** A new layout on Magic Romak's board, as the Library's New layout makes one. */
const blank: Layout = {
  format: 'layerbench/layout@1',
  name: 'New layout',
  hostLocale: 'symbols',
  geometry: { preset: '1333+2' },
  keys: { space: 'L0' },
  layers: [{ id: 'base', name: 'Base', bindings: {} }],
};

const KEY_IDS = getGeometryPreset('1333+2').keys.map((k) => k.id);

/**
 * Each key of a layer, as a keymap writes it: one the layer lists nothing for shows the layer below
 * through, or on the base layer does nothing, unless the layer says otherwise for all of them.
 */
function everyKey(bindings: Layout['layers'][number]['bindings'], base: boolean) {
  const unlisted = bindings['*'] ?? { kind: base ? 'none' : 'trans' };
  return Object.fromEntries(KEY_IDS.map((id) => [id, bindings[id] ?? unlisted]));
}

/** The edits, in the order a person would make them, that turn the new layout into Magic Romak. */
function edits(target: Layout): Edit[] {
  const out: Edit[] = [];
  const [base, ...others] = target.layers;
  out.push({ kind: 'renameLayer', layer: 'base', name: base.name ?? base.id });
  const renamed = applyAll(blank, out).layers[0].id;
  out.push({ kind: 'setLayerId', layer: renamed, id: base.id });
  for (const l of others) {
    // IDs stay internal; match the fixture's IDs before comparing its references.
    out.push({ kind: 'addLayer', name: l.name ?? l.id });
  }
  const made = applyAll(blank, out);
  others.forEach((l, i) => {
    const id = made.layers[i + 1].id;
    if (id !== l.id) out.push({ kind: 'setLayerId', layer: id, id: l.id });
  });
  // Every key as the keymap has it: those Magic Romak's layers list nothing for are made Nothing
  // one by one, as ZMK writes `&none`.
  for (const [i, l] of target.layers.entries()) {
    const fresh = i === 0 ? 'none' : 'trans';
    for (const [key, binding] of Object.entries(everyKey(l.bindings, i === 0))) {
      if (l.bindings[key] || binding.kind !== fresh) {
        out.push({ kind: 'bind', layer: l.id, keys: [key], binding });
      }
    }
  }
  for (const [i, c] of (target.combos ?? []).entries()) {
    out.push({
      kind: 'addCombo',
      layer: c.layers?.[0] ?? base.id,
      keys: c.keys,
      binding: c.binding,
    });
    out.push({ kind: 'updateCombo', combo: i, layers: c.layers, timeoutMs: c.timeoutMs });
  }
  const { keys, repeatPolicy } = target;
  out.push({
    kind: 'setKeys',
    space: keys.space,
    shift: keys.shift?.key ?? null,
    shiftKind: keys.shift?.kind,
    repeat: repeatPolicy?.doubledLetters,
  });
  if (target.features) out.push({ kind: 'setFeatures', features: target.features });
  if (target.behaviorDefaults) {
    out.push({ kind: 'setBehaviorDefaults', defaults: target.behaviorDefaults });
  }
  out.push({
    kind: 'setMeta',
    name: target.name,
    author: target.author,
    description: target.description,
    link: target.link,
    languages: target.languages,
  });
  return out;
}

function applyAll(from: Layout, list: Edit[]): Layout {
  let layout = from;
  for (const edit of list) {
    const o = applyEdit(layout, edit);
    if (o.status === 'refused') throw new Error(`${edit.kind} was refused: ${o.message}`);
    if (o.status === 'landed') layout = o.layout;
  }
  return layout;
}

/**
 * The document, but for what an author does not choose: its id, which saving gives it, the ids of
 * its combos, and the ways into layers it declares, which the analysis finds without being told.
 */
function chosen(layout: Layout) {
  const doc = JSON.parse(JSON.stringify(toCanonicalJson(layout)));
  for (const c of doc.combos ?? []) delete c.id;
  delete doc.id;
  delete doc.activators;
  // A layer that does nothing where it lists nothing is one whose keys each do nothing.
  doc.layers = doc.layers.map((l: Layout['layers'][number], i: number) => ({
    ...l,
    bindings: everyKey(l.bindings, i === 0),
  }));
  return doc;
}

describe('Magic Romak, rebuilt in the editor', () => {
  const rebuilt = applyAll(blank, edits(magicRomak));

  it('is the same layout, but for its id, the ids of its combos and the ways in it declares', () => {
    expect(chosen(rebuilt)).toEqual(chosen(magicRomak));
    // Nothing bound off the board, where the comparison key by key would not look.
    for (const l of [...magicRomak.layers, ...rebuilt.layers]) {
      for (const key of Object.keys(l.bindings)) expect([...KEY_IDS, '*']).toContain(key);
    }
  });

  it.each(goldenMatrix().filter((c) => c.layout === 'magic-romak'))(
    'is analyzed the same: %o',
    (c) => {
      const values = (layout: Layout) => {
        const r = buildGoldenReport(c, layout);
        return { results: r.results.map((x) => [x.id, x.value]), stats: r.stats };
      };
      expect(values(rebuilt)).toEqual(values(magicRomak));
    },
  );
});
