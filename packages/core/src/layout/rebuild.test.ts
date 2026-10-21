import { describe, expect, it } from 'vitest';
import { buildGoldenReport, goldenMatrix } from '../golden/report.js';
import { bundledLayout } from '../layouts/index.js';
import { applyEdit, type Edit } from './edit.js';
import { toCanonicalJson } from './json.js';
import type { Layout } from './types.js';

/**
 * Magic Romak is written in code, but nothing in it is out of an author's reach: every part of it
 * can be made in the editor, on a new layout, by the same edits a person makes there. Rebuilt so,
 * it is the same layout, and it is analyzed the same.
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

/** The edits, in the order a person would make them, that turn the new layout into Magic Romak. */
function edits(target: Layout): Edit[] {
  const out: Edit[] = [];
  const [base, ...others] = target.layers;
  out.push({ kind: 'setLayerId', layer: 'base', id: base.id });
  out.push({ kind: 'renameLayer', layer: base.id, name: base.name ?? base.id });
  for (const l of others) {
    // A new layer's id follows its name; then it is given the one the keymap has.
    out.push({ kind: 'addLayer', name: l.name ?? l.id });
  }
  const made = applyAll(blank, out);
  others.forEach((l, i) => {
    const id = made.layers[i + 1].id;
    if (id !== l.id) out.push({ kind: 'setLayerId', layer: id, id: l.id });
  });
  for (const l of target.layers) {
    const fallback = l.bindings['*'];
    if (fallback?.kind === 'none' || fallback?.kind === 'trans') {
      out.push({ kind: 'setLayerFallback', layer: l.id, fallback: fallback.kind });
    }
    for (const [key, binding] of Object.entries(l.bindings)) {
      if (key !== '*') out.push({ kind: 'bind', layer: l.id, keys: [key], binding });
    }
  }
  for (const [i, c] of (target.combos ?? []).entries()) {
    out.push({
      kind: 'addCombo',
      layer: c.layers?.[0] ?? base.id,
      keys: c.keys,
      binding: c.binding,
      role: c.role ?? 'command',
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
  return doc;
}

describe('Magic Romak, rebuilt in the editor', () => {
  const rebuilt = applyAll(blank, edits(magicRomak));

  it('is the same layout, but for its id, the ids of its combos and the ways in it declares', () => {
    expect(chosen(rebuilt)).toEqual(chosen(magicRomak));
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
