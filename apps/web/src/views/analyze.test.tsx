import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { layerNames, layerShareIn, showLayer, shownLayer } from '../test/layers.js';
import { openSettings, renderRoute, testClient } from '../test/render.js';

/** Hold a cyanophage analysis until the test releases it, so stale numbers have a stable lifetime. */
function holdCyanophageAnalysis() {
  const real = testClient();
  let requestStarted!: () => void;
  const cyanophageStarted = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let releaseRequest!: () => void;
  const client = new Proxy(real, {
    get(target, prop) {
      if (prop === 'peek') return async () => null;
      if (prop === 'analyze') {
        return (request: AnalyzeRequest, opts?: { signal?: AbortSignal }) =>
          request.settings.rules.id === 'cyanophage'
            ? new Promise<void>((resolve, reject) => {
                const abort = () => reject(new DOMException('left', 'AbortError'));
                opts?.signal?.addEventListener('abort', abort, { once: true });
                releaseRequest = () => {
                  opts?.signal?.removeEventListener('abort', abort);
                  resolve();
                };
                requestStarted();
              }).then(() => target.analyze(request, opts))
            : target.analyze(request, opts);
      }
      const member = Reflect.get(target, prop);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  return {
    client,
    cyanophageStarted,
    releaseCyanophage: () => releaseRequest(),
  };
}

/** Each key of the board as it is named and described: what it says of its share of the presses. */
const shown = () =>
  [...document.querySelectorAll<SVGGElement>('#kb-analyze g[data-key]')].map((g) => ({
    id: g.getAttribute('data-key') as string,
    label: g.getAttribute('aria-label') ?? '',
    tooltip: g.querySelector('title')?.textContent ?? '',
    share: Number(/([\d.]+)% of presses/.exec(g.getAttribute('aria-label') ?? '')?.[1] ?? NaN),
  }));

/**
 * The Analyze view, exercised end to end: a real analysis over a small sample, then the numbers and
 * the typing trace it produces.
 */
describe('Analyze', () => {
  it('renders Magic Romak and completes the analysis', async () => {
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');

    // The layers come from the compiled layout, so they are there before any analysis finishes.
    expect(await screen.findByRole('group', { name: 'Layers' })).toHaveTextContent('Alpha 1');
    expect(await layerNames(userEvent.setup())).toEqual([
      'Alpha 1',
      'Alpha 2',
      'Ç extension',
      'Numbers',
      'Symbols',
    ]);

    expect(await screen.findByText('Same finger bigrams')).toBeInTheDocument();
    expect(screen.getByText('Layer taps per 100 symbols')).toBeInTheDocument();
    expect(screen.getByText('every character in the text can be typed')).toBeInTheDocument();
  });

  it('writes the share of the typing on the layer the board shows, turning with it', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=en-general&sample=20000');
    await screen.findByText('Same finger bigrams');
    const board = screen.getByRole('region', { name: 'Board' });
    const nav = within(board).getByRole('group', { name: 'Layers' });
    const next = within(nav).getByRole('button', { name: 'Next layer' });
    const shares: Record<string, number> = {};
    for (;;) {
      const share = await waitFor(() => {
        const v = layerShareIn(board);
        expect(v).not.toBeNull();
        return v as number;
      });
      shares[shownLayer()] = share;
      if (next.getAttribute('aria-disabled') === 'true') break;
      await user.click(next);
    }
    expect(Object.keys(shares)).toEqual([
      'Alpha 1',
      'Alpha 2',
      'Ç extension',
      'Numbers',
      'Symbols',
    ]);
    // Letters only, by default: Alpha 1 types most of them, and Numbers none.
    expect(shares['Alpha 1']).toBeGreaterThan(85);
    expect(shares.Numbers).toBe(0);
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05 * 5 + 1e-9);
  });

  it('writes no share while the numbers on show are those of the layout before an edit', async () => {
    const real = testClient();
    let hold = false;
    const client = new Proxy(real, {
      get(target, prop) {
        if (prop === 'peek') return async () => null;
        if (prop === 'analyze') {
          return (request: AnalyzeRequest, opts?: { signal?: AbortSignal }) =>
            // Once held, the analysis of the edited layout never lands: the last there was stands.
            hold
              ? new Promise<ReportDTO>((_, reject) =>
                  opts?.signal?.addEventListener('abort', () =>
                    reject(new DOMException('left', 'AbortError')),
                  ),
                )
              : target.analyze(request, opts);
        }
        const member = Reflect.get(target, prop);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=en-general&sample=20000', { client });
    await screen.findByText('Same finger bigrams');
    const board = screen.getByRole('region', { name: 'Board' });
    await waitFor(() => expect(layerShareIn(board)).not.toBeNull());
    const row = within(board).getByRole('group', { name: 'Layers' }).parentElement as HTMLElement;
    const columns = row.className;

    // An edit the last analysis does not know: its numbers stay up until the new ones land, and
    // an edit can move a layer to another index, so no share is written meanwhile.
    hold = true;
    fireEvent.keyDown(within(board).getByRole('button', { name: 'Alpha 1' }), { key: 'F2' });
    const field = await within(board).findByRole('textbox', { name: 'Rename Alpha 1' });
    await user.clear(field);
    await user.type(field, 'First{Enter}');
    expect(await screen.findByText('updating…')).toBeInTheDocument();
    expect(layerShareIn(board)).toBeNull();
    // Its room is kept, so the arrows do not move while the share is away.
    expect(row.className).toBe(columns);
  }, 60_000);

  it('writes the share of the layer a word being played is on, not the one chosen', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');
    await screen.findByText('Same finger bigrams');
    const board = screen.getByRole('region', { name: 'Board' });
    const next = within(board).getByRole('button', { name: 'Next layer' });
    const shares = new Map<string, number>();
    for (;;) {
      const share = await waitFor(() => {
        const v = layerShareIn(board);
        expect(v).not.toBeNull();
        return v as number;
      });
      shares.set(shownLayer(), share);
      if (next.getAttribute('aria-disabled') === 'true') break;
      await user.click(next);
    }
    await showLayer(user, 'Alpha 1');
    expect(shares.get('Alpha 1')).not.toBe(shares.get('Alpha 2'));

    // The word plays on its own; its ç is on Alpha 2 while Alpha 1 stays the layer chosen.
    await user.type(screen.getByLabelText('How is this typed?'), 'ação');
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'), { timeout: 15_000, interval: 5 });
    expect(screen.queryByRole('button', { name: '▶ Play' })).toBeNull();
    expect(layerShareIn(board)).toBe(shares.get('Alpha 2'));
  }, 60_000);

  it('leads the badges of Effort and SFB to the guide’s ruler for the rules in the link', async () => {
    // Four of them: Effort and SFB in the summary and on their cards, none on another metric.
    for (const [rules, section] of [
      ['', 'the-layouts-doc-rule-set'],
      ['&rules=cyanophage', 'the-cyanophage-like-rule-set'],
    ] as const) {
      const { unmount } = renderRoute(
        `/analyze?layout=qwerty&corpus=en-general&sample=20000${rules}`,
      );
      await screen.findByText('Same finger bigrams');
      const links = await screen.findAllByRole('link', { name: /how it is rated/ });
      expect(links, rules).toHaveLength(4);
      for (const link of links) {
        expect(link.getAttribute('href'), rules).toMatch(
          new RegExp(`/guide/analyzing#${section}$`),
        );
        expect(link).toHaveAttribute('target', '_blank');
      }
      unmount();
    }
  }, 60_000);

  it('drops the link to a ruler while the numbers on screen are of the rules it no longer names', async () => {
    const { client } = holdCyanophageAnalysis();
    const user = userEvent.setup();
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', { client });
    await screen.findByText('Same finger bigrams');
    expect(await screen.findAllByRole('link', { name: /how it is rated/ })).toHaveLength(4);

    const dialog = await openSettings();
    await user.selectOptions(within(dialog).getByLabelText('Rules'), 'cyanophage');
    // Their pills are still there, rated on the Layouts Doc's ruler; a link to cyanophage-like's
    // would misname it.
    await waitFor(() => expect(document.querySelectorAll('.lb-band-link')).toHaveLength(0));
    expect(document.querySelectorAll('.lb-band').length).toBeGreaterThan(0);
  }, 60_000);

  it('explains how a word is typed', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');
    await screen.findByText('Same finger bigrams');

    await user.type(screen.getByLabelText('How is this typed?'), 'ação');

    expect(await screen.findByText('4 presses')).toBeInTheDocument();
    // The trace names the keys pressed, in order; R0 is in the legend under the board too.
    const presses = await screen.findByRole('list', { name: 'Presses' });
    for (const key of ['RHM', 'R0', 'LBM', 'LHI']) {
      expect(within(presses).getByText(key)).toBeInTheDocument();
    }
  });

  it('plays a word on the board, press by press, on the layer each press lands on', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');
    await screen.findByText('Same finger bigrams');
    await user.type(screen.getByLabelText('How is this typed?'), 'ação');

    // It starts on its own.
    const presses = await screen.findByRole('list', { name: 'Presses' });
    expect(await within(presses).findByRole('button', { current: 'step' })).toBeInTheDocument();

    // Stepping to the ç stops it there, on Alpha 2, with that key pressed.
    await user.click(within(presses).getByRole('button', { name: /LBM/ }));
    expect(screen.getByRole('button', { name: '▶ Play' })).toBeInTheDocument();
    expect(shownLayer()).toBe('Alpha 2');
    const key = screen.getByRole('button', { name: /^Key LBM:/ });
    expect(key.querySelector('.lb-key-pressed')).not.toBeNull();
    // The keys say the shares they have on that layer, though the navigator still stands on the
    // first: the same as when the layer is chosen on it.
    const played = shown().map((k) => k.label);
    expect(played.some((label) => /% of presses/.test(label))).toBe(true);
    await showLayer(user, 'Alpha 1');
    await showLayer(user, 'Alpha 2');
    expect(shown().map((k) => k.label)).toEqual(played);
    // The board shows the press, not a path of arrows.
    expect(document.querySelectorAll('#kb-analyze .lb-arc path')).toHaveLength(0);
  });

  it('shows the combos that type, and lights one as it is played', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');
    await screen.findByText('Same finger bigrams');
    await user.type(screen.getByLabelText('How is this typed?'), 'à');

    const presses = await screen.findByRole('list', { name: 'Presses' });
    await user.click(within(presses).getByRole('button', { name: /RHM\+RHR/ }));
    const names = () =>
      [...document.querySelectorAll('#kb-analyze .lb-combo title')].map((t) => t.textContent);
    // The à and the dead keys type on Alpha 2: the others the keymap draws there are commands.
    expect(names()).toEqual([
      'Combo LTM + LTI: ¨, dead key',
      'Combo LHR + LHM: ^, dead key',
      'Combo LHM + LHI: ´, dead key',
      'Combo RHM + RHR: à',
      'Combo LBR + LBM: `, dead key',
      'Combo LBM + LBI: ~, dead key',
    ]);
    const lit = document.querySelector('#kb-analyze .lb-combo-active title');
    expect(lit?.textContent).toBe('Combo RHM + RHR: à');

    // Hidden, from Settings, the combos give way, except the one being played.
    const board = within(await openSettings()).getByRole('group', { name: 'On the board' });
    await user.click(within(board).getByRole('checkbox', { name: 'Combos' }));
    expect(names()).toEqual(['Combo RHM + RHR: à']);
  });

  it('lists the combos the board does not draw beside it, and opens one in the editor', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=t-34&corpus=pt-br-general&sample=20000');
    await screen.findByText('Same finger bigrams');
    // T-34's base layer has combos on keys apart, which the board leaves to the button.
    await user.click(await screen.findByRole('button', { name: /^\d+ more combos? on Base$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Combos on Base' });
    const pipe = within(dialog).getByRole('button', { name: 'Edit combo L0 + LHP: |' });
    // The editor names a combo by its keys, as `LHM+LHI`; the dialog, as `LHM + LHI`.
    await user.click(pipe);
    expect(screen.queryByRole('dialog', { name: 'Combos on Base' })).toBeNull();
    expect(await screen.findByRole('group', { name: 'Edit combo L0+LHP' })).toBeInTheDocument();

    // Hidden, from Settings, the combos go, and the button with them.
    const board = within(await openSettings()).getByRole('group', { name: 'On the board' });
    await user.click(within(board).getByRole('checkbox', { name: 'Combos' }));
    expect(screen.queryByRole('button', { name: /more combos? on/ })).toBeNull();
  });

  it('keeps the link canonical as parameters change', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000');
    await screen.findByText('Same finger bigrams');

    await user.selectOptions(screen.getByLabelText('Sample size'), '300000');
    await waitFor(() => {
      expect(currentSearch()).toContain('sample=300000');
    });
    // Keys stay in a stable order.
    expect(currentSearch()).toBe('?corpus=en-general&layout=qwerty&sample=300000');

    // The default, 100,000 symbols, never appears in the link.
    await user.selectOptions(screen.getByLabelText('Sample size'), '100000');
    await waitFor(() => {
      expect(currentSearch()).toBe('?corpus=en-general&layout=qwerty');
    });
  });

  it('analyzes a layout without the features a Library link leaves out', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(
      '/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000&off=macros',
    );
    await screen.findByText('Same finger bigrams');
    expect(screen.getByRole('status')).toHaveTextContent('Typed without multi-letter macros.');

    // `ão` after `ç` is one press with the macro; without it, `ã` and then `o`.
    await user.type(screen.getByLabelText('How is this typed?'), 'ção');
    expect(await screen.findByText('4 presses')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use every feature' }));
    await waitFor(() => expect(currentSearch()).not.toContain('off='));
    expect(await screen.findByText('3 presses')).toBeInTheDocument();
  });

  it('switches features off from its Settings, as the Library and Compare do', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(
      '/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000',
    );
    await screen.findByText('Same finger bigrams');
    const switches = within(await openSettings()).getByRole('group', { name: 'Analyze with' });
    const macros = within(switches).getByRole('checkbox', { name: 'Multi-letter macros' });
    expect(macros).toBeChecked();

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).toContain('off=macros'));
    expect(screen.getByRole('status')).toHaveTextContent('Typed without multi-letter macros.');
    await user.type(screen.getByLabelText('How is this typed?'), 'ção');
    expect(await screen.findByText('4 presses')).toBeInTheDocument();
  });

  it('turns the board to the layer a listed pair happens on when it is clicked', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(
      '/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000',
    );
    await screen.findByText('Same finger bigrams');
    expect(shownLayer()).toBe('Alpha 1');

    // The thumb that reaches Alpha 2 is pressed on Alpha 1, the letter after it on Alpha 2.
    const row = [...document.querySelectorAll<HTMLButtonElement>('.lb-items li button')].find((b) =>
      /^→A2./.test(b.textContent ?? ''),
    );
    expect(row, 'a listed pair that goes up to Alpha 2').toBeDefined();
    await user.click(row as HTMLButtonElement);
    await waitFor(() => expect(currentSearch()).toContain('layer=1'));
    expect(shownLayer()).toBe('Alpha 2');
  });

  it('turns the board to the next layer when it is swiped, and stops a word playing', async () => {
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');
    await screen.findByText('Same finger bigrams');
    expect(shownLayer()).toBe('Alpha 1');

    const board = document.querySelector('.lb-board') as HTMLElement;
    const finger = (x: number) => ({ clientX: x, clientY: 10 });
    fireEvent.touchStart(board, { touches: [finger(220)] });
    fireEvent.touchEnd(board, { changedTouches: [finger(100)] });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    fireEvent.touchStart(board, { touches: [finger(100)] });
    fireEvent.touchEnd(board, { changedTouches: [finger(220)] });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 1'));
  });

  it('shows what a layer key ending a pair was pressed for when the pair is clicked', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');
    await screen.findByText('Same finger bigrams');

    // A pair whose last key is the thumb that reaches Alpha 2 opens a popup; one that starts there
    // and ends on a letter does not.
    const rows = [...document.querySelectorAll<HTMLButtonElement>('.lb-items li button')];
    const ending = rows.find(
      (b) => b.getAttribute('aria-haspopup') === 'dialog' && /→A2$/.test(b.textContent ?? ''),
    );
    expect(ending, 'a listed pair that ends on a layer key').toBeDefined();
    // Its tooltip names the keys the label's letters came from, the last the thumb for Alpha 2.
    expect(ending?.getAttribute('title')).toMatch(/\n.+ → R0 \(A2 \/ Symb\)$/);
    expect(
      rows
        .filter((b) => /^→A2[^→]/.test(b.textContent ?? ''))
        .every((b) => !b.hasAttribute('aria-haspopup')),
    ).toBe(true);

    await user.click(ending as HTMLButtonElement);
    const dialog = await screen.findByRole('dialog', {
      name: new RegExp(`^${ending?.textContent}`),
    });
    expect(within(dialog).getByText(/the key typed next on Alpha 2/)).toBeInTheDocument();
    const next = within(dialog).getByRole('list', { name: 'Keys pressed next' });
    expect(within(next).getAllByRole('listitem').length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Keys pressed next' })).toBeNull(),
    );
  });

  it('shows the metrics for a single-layer layout without layer costs', async () => {
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000');
    await screen.findByText('Same finger bigrams');

    const strip = screen.getByRole('list', { name: 'Summary metrics' });
    expect(strip).toBeInTheDocument();
    // Effort leads the strip with its band, Qwerty's being the worst.
    const effort = within(strip).getByText('Effort').closest('li');
    expect(effort?.querySelector('.lb-band')).toHaveTextContent('max');
    // Qwerty never leaves its base layer.
    expect(screen.getByText('Layer taps per 100 symbols')).toBeInTheDocument();
  });

  describe("a key's share of the presses", () => {
    it('is in every key’s tooltip and name, whatever the heat measures, and is the share its numbers give', async () => {
      const user = userEvent.setup();
      renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000');
      await screen.findByText('Same finger bigrams');

      for (const heat of ['usage', 'effort']) {
        await user.selectOptions(screen.getByLabelText('Heat'), heat);
        const keys = shown();
        expect(keys.length).toBeGreaterThan(0);
        for (const k of keys) {
          // An empty key, as Qwerty's thumbs are, has nothing to share.
          if (k.label.endsWith(': empty')) {
            expect(k.tooltip, `${heat} ${k.id}`).not.toMatch(/ of presses/);
            continue;
          }
          // The space is not counted by default: its key says so, below.
          if (k.tooltip.includes('space not counted')) continue;
          expect(k.tooltip, `${heat} ${k.id}`).toMatch(/(?:\d+\.\d\d%|0%|under 0\.01%) of presses/);
          expect(k.label, `${heat} ${k.id}`).toMatch(/ of presses/);
        }
        // The space is not counted unless the Space setting keeps it in, so its key says that and
        // not a share, which would read 0% for the key pressed most.
        const space = keys.find((k) => k.tooltip.startsWith('types a space'));
        expect(space?.tooltip, heat).toBe('types a space; space not counted (Space is off)');
        expect(space?.label, heat).not.toMatch(/% of presses/);
        // Qwerty has one layer and no combos, so its keys have every press between them.
        const sum = keys.reduce((a, k) => a + (Number.isNaN(k.share) ? 0 : k.share), 0);
        expect(sum, heat).toBeGreaterThan(99.5);
        expect(sum, heat).toBeLessThan(100.5);
      }

      const busiest = shown().reduce((a, b) => (b.share > a.share ? b : a));
      await user.click(screen.getByRole('button', { name: new RegExp(`^Key ${busiest.id}: `) }));
      const numbers = await screen.findByRole('region', { name: 'Key numbers' });
      expect(numbers.querySelector('.lb-key-stats p')?.textContent).toContain(
        `${busiest.share.toFixed(2)}% of the presses`,
      );
    }, 60_000);

    it('says it is updating while the numbers on screen are of an analysis since changed', async () => {
      const user = userEvent.setup();
      const { client, cyanophageStarted, releaseCyanophage } = holdCyanophageAnalysis();
      renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
        client,
      });
      await screen.findByText('Same finger bigrams');
      // The share is there once the report has landed, a moment after the metrics are.
      await waitFor(() =>
        expect(shown().filter((k) => !Number.isNaN(k.share)).length).toBeGreaterThan(0),
      );
      // The metrics render before the effect records the report as landed. Wait for that observable
      // transition before changing settings rather than assuming it happened in the same turn.
      await waitFor(() => expect(shown().some((k) => /\(updating\)/.test(k.label))).toBe(false));

      const dialog = await openSettings();
      await user.selectOptions(within(dialog).getByLabelText('Rules'), 'cyanophage');
      // The last report stands, but it is of what the keys were: each share says so in its name
      // and tooltip, as the key's numbers say they are updating.
      await cyanophageStarted;
      await waitFor(() => {
        const oldNumbers = shown().filter((k) => !Number.isNaN(k.share));
        expect(oldNumbers.length).toBeGreaterThan(0);
        for (const k of oldNumbers) {
          expect(k.label, k.id).toMatch(/% of presses \(updating\)/);
          expect(k.tooltip, k.id).toMatch(/% of presses \(updating\)/);
        }
      });

      releaseCyanophage();
      await waitFor(() => {
        const currentNumbers = shown().filter((k) => !Number.isNaN(k.share));
        expect(currentNumbers.length).toBeGreaterThan(0);
        for (const k of currentNumbers) {
          expect(k.label, k.id).not.toMatch(/\(updating\)/);
          expect(k.tooltip, k.id).not.toMatch(/\(updating\)/);
        }
      });
    }, 60_000);

    it('adds up to 100% over the keys of every layer', async () => {
      const user = userEvent.setup();
      renderRoute('/analyze?layout=romak&corpus=pt-br-general&sample=20000');
      await screen.findByText('Same finger bigrams');

      let sum = 0;
      const names = await layerNames(user);
      expect(names.length).toBeGreaterThan(1);
      for (const name of names) {
        await showLayer(user, name);
        // A key that types nothing here says nothing; the others say their share, 0% included.
        for (const k of shown()) {
          if (/transparent|empty/.test(k.label)) expect(k.label).not.toMatch(/ of presses/);
          else if (/space not counted/.test(k.label)) expect(k.share).toBeNaN();
          else expect(k.label, `${name} ${k.id}`).toMatch(/ of presses/);
          if (!Number.isNaN(k.share)) sum += k.share;
        }
      }
      expect(sum).toBeGreaterThan(99);
      expect(sum).toBeLessThan(101);
    }, 90_000);
  });
});
