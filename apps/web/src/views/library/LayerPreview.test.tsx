import { bundledLayout, compileLayout, type Layout } from '@layerbench/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { HeatSource } from '../../engine/heat.js';
import type { HeatMode } from '../../url/params.js';
import { LayerPreview } from './LayerPreview.js';

afterEach(cleanup);

const compiled = compileLayout(bundledLayout('qwerty') as Layout);
const positions = compiled.positions.length;

/** Presses on the first two keys of the base layer, and none on any other. */
const source: HeatSource = {
  usageByLayer: compiled.layers.map((_, layer) =>
    Array.from({ length: positions }, (_, i) => (layer === 0 ? ([8, 4][i] ?? 0) : 0)),
  ),
  usageAll: Array.from({ length: positions }, (_, i) => [8, 4][i] ?? 0),
  layerTapsByLayer: compiled.layers.map(() => new Array<number>(positions).fill(0)),
  results: [],
};

function show(heat: HeatSource | null | undefined, heatMode: HeatMode | null) {
  return render(
    <LayerPreview id="kb-test" compiled={compiled} name="Qwerty" heat={heat} heatMode={heatMode} />,
  );
}

/** What the board's keys say when pointed at, for the keys coloured by heat. */
function heatedTitles(): string[] {
  return [...document.querySelectorAll('.lb-key')]
    .filter((key) =>
      /--lb-heat\) [1-9]/.test(key.querySelector('.lb-key-cap')?.getAttribute('style') ?? ''),
    )
    .map((key) => key.querySelector('title')?.textContent ?? '');
}

const note = () => document.querySelector('.lb-heat-note')?.textContent ?? null;

describe('A card’s board with heat', () => {
  it('stays plain, and says nothing, while heat is off', () => {
    show(source, null);
    expect(heatedTitles()).toEqual([]);
    expect(note()).toBeNull();
  });

  it('colours the keys of the layer on show, each saying how hot it is as well', () => {
    show(source, 'usage');
    const titles = heatedTitles();
    expect(titles).toHaveLength(2);
    expect(titles.some((t) => t.includes('Usage: 100% of the busiest key'))).toBe(true);
    expect(titles.some((t) => t.includes('Usage: 50% of the busiest key'))).toBe(true);
    expect(note()).toBeNull();
    // A screen reader reads the key's name with it.
    expect(
      [...document.querySelectorAll('.lb-key')].some((key) =>
        /Usage: 100% of the busiest key$/.test(key.getAttribute('aria-label') ?? ''),
      ),
    ).toBe(true);
  });

  it('draws usage, and says so, where the rule set has no rule for the mode asked', () => {
    show(source, 'effort');
    expect(heatedTitles().every((t) => t.includes('Usage: '))).toBe(true);
  });

  it('draws the heat of whichever layer is shown, and says when that has none', async () => {
    show(source, 'usage');
    expect(note()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next layer' }));
    expect(heatedTitles()).toEqual([]);
    expect(note()).toBe('Nothing on this layer is coloured by Usage.');
  });

  it('says why it is plain while its layout is not scored, or could not be', () => {
    const view = show(undefined, 'usage');
    expect(heatedTitles()).toEqual([]);
    expect(note()).toBe('Heat appears once the layout is scored.');
    view.rerender(
      <LayerPreview id="kb-test" compiled={compiled} name="Qwerty" heat={null} heatMode="usage" />,
    );
    expect(note()).toBe('No heat: the layout could not be scored.');
  });

  it('names the mode drawn in what a layer lacks', () => {
    show(source, 'layer_taps');
    expect(heatedTitles()).toEqual([]);
    expect(note()).toBe('Nothing on this layer is coloured by Layer taps.');
  });
});
