import { BUNDLED_LAYOUTS, bundledLayout, type Layout } from '@layerbench/core';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useSession } from '../state/session.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { layerNames, showLayer } from '../test/layers.js';
import { LIBRARY, renderRoute } from '../test/render.js';

let counter = 0;

function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-same-board-${++counter}`);
}

/** The board a layout is on, as the Library's board filter names it. */
const boardOf = (l: Layout | undefined) => (l && 'preset' in l.geometry ? l.geometry.preset : '');

/**
 * What a board shows on the layer drawn: each key's legends (tap, hold, shifted legend, badge,
 * number), each combo box with what it types and where it sits, and the button for the combos it
 * does not draw. Heat, a selection and what a click does are left out: only Analyze has them.
 */
function drawn(svg: Element, tools: HTMLElement) {
  const keys = [...svg.querySelectorAll('g.lb-key')].map((g) =>
    [...g.querySelectorAll('text')]
      .map((t) => `${t.getAttribute('class')}:${t.textContent}@${t.getAttribute('font-size')}`)
      .join(' '),
  );
  const combos = [...svg.querySelectorAll('g.lb-combos > g')].map((g) =>
    [
      (g.getAttribute('class') ?? '').replace(' lb-combo-pickable', ''),
      g.textContent,
      ...[...g.querySelectorAll('rect')].map((r) =>
        ['x', 'y', 'width', 'height'].map((a) => r.getAttribute(a)).join(','),
      ),
    ].join(' '),
  );
  const apart =
    within(tools)
      .queryByRole('button', { name: /more combos? on/ })
      ?.getAttribute('aria-label') ?? null;
  // The board's own box: the same classes on the drawing and the boxes it pans in, nothing dimmed.
  const frame = [svg, svg.parentElement, svg.parentElement?.parentElement].map((el) =>
    el?.getAttribute('class')?.trim(),
  );
  return { viewBox: svg.getAttribute('viewBox'), frame, keys, combos, apart };
}

/** How many keys on the board shown are coloured by heat. */
const heated = (svg: Element) =>
  [...svg.querySelectorAll('.lb-key-cap')].filter((c) =>
    /--lb-heat\) [1-9]/.test(c.getAttribute('style') ?? ''),
  ).length;

/** Every layer of the board under the navigator `label`, as `drawn` reads it, first to last. */
async function everyLayer(label: string, boardId: () => string) {
  const user = userEvent.setup();
  const names = await layerNames(user, label);
  const out = [];
  for (const name of names) {
    await showLayer(user, name, label);
    const svg = document.getElementById(boardId());
    if (!svg) throw new Error(`no board ${boardId()}`);
    // The row under the navigator, where the combos button is.
    const nav = screen.getByRole('group', { name: label });
    const row = nav.parentElement as HTMLElement;
    out.push({
      name,
      ...drawn(svg, row),
      // The navigator in the middle of its row, the Combos button at the row's right end.
      row: [row.className, nav.className],
      heated: heated(svg),
    });
  }
  return out;
}

const shownLayerId = (prefix: string) => () => {
  const svg = [...document.querySelectorAll('svg.lb-keyboard')].find((s) =>
    s.id.startsWith(prefix),
  );
  return svg?.id ?? '';
};

describe('The board is the same on Analyze, a Library card and Compare', () => {
  // T-34 has combos on and off the board and thumbs that only hold; Magic Romak has adaptive
  // keys, numbered and listed, and a combo box on its base layer.
  it.each(['t-34', 'magic-romak'])('%s', { timeout: 120_000 }, async (id) => {
    const name = bundledLayout(id)?.name ?? id;

    renderRoute(`/analyze?layout=${id}&corpus=en-general&sample=1000`, {
      storage: freshStorage(),
    });
    await waitFor(() => expect(document.getElementById('kb-analyze')).toBeTruthy());
    const analyze = await everyLayer('Layers', () => 'kb-analyze');
    cleanup();

    // Only the layout's own board, so the Library scores a handful of layouts, not all of them.
    const boards = [...new Set(BUNDLED_LAYOUTS.map(boardOf))];
    useSession.setState({
      hiddenBoards: boards.filter((b) => b !== boardOf(bundledLayout(id))),
      hiddenCategories: [],
      hideCustom: true,
      hideCommunity: true,
    });
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name, level: 3 });
    const card = await everyLayer(`${name} layers`, shownLayerId(`kb-${id}-l`));
    cleanup();

    renderRoute(`/compare?layout=${id}&b=qwerty&corpus=en-general&sample=1000`, {
      storage: freshStorage(),
    });
    await waitFor(() => expect(document.getElementById('kb-A')).toBeTruthy());
    const compare = await everyLayer('Layers of A', () => 'kb-A');

    expect(analyze.length).toBeGreaterThan(1);
    expect(analyze.some((l) => l.combos.length > 0)).toBe(true);
    expect(analyze[0]?.row).toEqual([
      expect.stringContaining('grid-cols-[1fr_auto_1fr]'),
      expect.stringContaining('col-start-2'),
    ]);
    expect(analyze[0]?.frame).toEqual([
      expect.stringMatching(/^lb-keyboard /),
      'lb-board-scroll',
      'lb-board relative',
    ]);
    // Heat is Analyze's alone.
    const noHeat = analyze.map((l) => ({ ...l, heated: 0 }));
    expect(card).toEqual(noHeat);
    expect(compare).toEqual(noHeat);
  });
});
