import { bundledLayout, type Layout, toCanonicalJson } from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisClient } from '../engine/protocol.js';
import { tabDrafts } from '../layout-session/drafts.js';
import { freshStorage, key } from '../test/analyze-editing.js';
import { showLayer, shownLayer } from '../test/layers.js';
import { renderRoute, testClient } from '../test/render.js';
import { encodeInline } from '../url/inline.js';
import { inlineRef } from '../url/params.js';

// There is no canvas under jsdom: the PNG is a stand-in, the card is real.
vi.mock('./share-card.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./share-card.js')>();
  return { ...real, renderPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) };
});

/**
 * The engine, but for analyses it is told to hold: from `hold()` on, each waits until `release()`.
 * In-thread, an analysis of a small sample lands in a few milliseconds, too soon for a test to see
 * what the page says while it is still being made.
 */
function gatedEngine(): { client: AnalysisClient; hold: () => void; release: () => void } {
  const engine = testClient();
  let holding = false;
  let waiting: (() => void)[] = [];
  const client = new Proxy(engine, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === 'analyze') {
        return async (...args: Parameters<AnalysisClient['analyze']>) => {
          if (holding) await new Promise<void>((resolve) => waiting.push(resolve));
          return target.analyze(...args);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    client,
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const resolve of waiting) resolve();
      waiting = [];
    },
  };
}

// A draft is this tab's own record; one test's must not be the next one's.
afterEach(() => sessionStorage.clear());

const exportButton = () => screen.getByRole('button', { name: 'Export image' });
const dialog = () => screen.getByRole('dialog', { name: 'Export image' });

/** The card the dialog previews, as the SVG text it is made of. */
async function previewSvg(): Promise<string> {
  const img = await within(dialog()).findByRole('img', { name: /Preview of the image/ });
  const src = img.getAttribute('src') ?? '';
  return decodeURIComponent(src.slice(src.indexOf(',') + 1));
}

describe('Export image in Analyze', () => {
  it('waits for the layout to be scored, then opens its image with its credits and heat', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=en-general&sample=1000&heat=usage', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    const svg = await previewSvg();
    expect(svg).toContain('Magic Romak');
    expect(svg).toContain('by Rafael Romão');
    expect(svg).toContain('Usage');
    expect(svg).toContain('% of presses');
    // The page's Summary of the real report, under the board: its captions, in the page's order.
    const captions = [...svg.matchAll(/>(Effort|SFB|SFS|LSB|FSB|HSB|Alt|Rolls)</g)].map(
      (m) => m[1],
    );
    expect(captions.slice(0, 3)).toEqual(['Effort', 'SFB', 'SFS']);
    expect(svg.indexOf('>Effort<')).toBeGreaterThan(svg.indexOf('% of presses'));
    // The layout is as it was opened: no edits to name anyone for.
    expect(within(dialog()).queryByLabelText('Unsaved edits by')).toBeNull();
    expect(svg).not.toContain('Unsaved edits');
  }, 60_000);

  it('is the first layer, with its own heat, whichever layer the board is showing', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=en-general&sample=1000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await showLayer(user, 'Numbers');
    expect(shownLayer()).toBe('Numbers');
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    const svg = await previewSvg();
    // The card says it is the base layer, and carries the keys of that layer, not the digits.
    expect(svg).toContain('Alpha 1');
    expect(svg).not.toContain('>Numbers<');
    expect(svg).toContain('>e<');
    expect(svg).not.toContain('>7<');
  }, 60_000);

  it('credits only the author of a layout opened whole from a link that is no draft of this tab', async () => {
    const user = userEvent.setup();
    const qwerty = bundledLayout('qwerty') as Layout;
    const { id: _id, ...rest } = qwerty;
    const link = inlineRef(await encodeInline({ ...rest, name: 'Qwerty, theirs' } as Layout));
    const search = new URLSearchParams({ layout: link });
    renderRoute(`/analyze?${search}&corpus=en-general&sample=1000`, { storage: freshStorage() });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    // Analyze marks no such layout unsaved either: nothing here was edited by whoever opened it.
    expect(screen.queryByTitle('Unsaved changes', { exact: true })).toBeNull();
    expect(within(dialog()).queryByLabelText('Unsaved edits by')).toBeNull();
    expect(await previewSvg()).toContain('Qwerty, theirs');
  }, 60_000);

  it('asks who made the edits of a layout opened from a link that carries changes not saved', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const mine = { ...(bundledLayout('colemak') as Layout), id: 'mine', name: 'Mine' };
    await storage.put('layouts', 'mine', toCanonicalJson(mine));
    // A link someone sent: Mine with an edit in it, which is not what is saved here.
    const edited = inlineRef(await encodeInline({ ...mine, description: 'edited' }));
    const search = new URLSearchParams({ layout: edited });
    renderRoute(`/analyze?${search}&corpus=en-general&sample=1000`, { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await screen.findByTitle('Unsaved changes', { exact: true });
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    // Whoever opened the link is the one sharing the image: the field says so, and they can change
    // or clear it.
    expect(within(dialog()).getByLabelText('Unsaved edits by')).toBeInTheDocument();
    expect(await previewSvg()).toContain('Unsaved edits');
  }, 60_000);

  it('asks who made the edits once the layout has changes that are not saved, and names them', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=1000', {
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    key('Key LHM: d').focus();
    await user.keyboard('{Delete}');
    await screen.findByTitle('Unsaved changes', { exact: true });
    // Until the analysis has caught up with the edit, its numbers are not this layout's.
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    const field = within(dialog()).getByLabelText('Unsaved edits by');
    await user.type(field, '@someone');
    await waitFor(async () => expect(await previewSvg()).toContain('Unsaved edits by @someone'));
    // The layout's author is still credited, beside the editor.
    expect(await previewSvg()).toContain('unsaved');
  }, 60_000);

  it('holds the button back while the numbers are of the layout before the edit', async () => {
    const user = userEvent.setup();
    const engine = gatedEngine();
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=1000', {
      client: engine.client,
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    engine.hold();
    key('Key LHM: d').focus();
    await user.keyboard('{Delete}');
    // The report on show is the layout's before the edit: an image of it would be of the wrong
    // keys. The button says so until the new numbers land.
    await waitFor(() => expect(exportButton()).toBeDisabled());
    expect(exportButton()).toHaveAttribute('title', expect.stringMatching(/caught up/));
    engine.release();
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });
  }, 60_000);
});

describe('Export image in Compare', () => {
  it('is off until both layouts are scored, and says why', async () => {
    renderRoute('/compare?layout=qwerty&b=magic-romak&corpus=en-general&sample=1000', {
      storage: freshStorage(),
    });
    // The button is there from the first render, and nothing is scored until after it.
    await screen.findByRole('button', { name: 'Export image' });
    expect(exportButton()).toBeDisabled();
    expect(exportButton()).toHaveAttribute(
      'title',
      expect.stringMatching(/both layouts are scored/),
    );
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });
  }, 60_000);

  it('opens one image of both layouts, each credited, once both are scored', async () => {
    const user = userEvent.setup();
    renderRoute('/compare?layout=qwerty&b=magic-romak&corpus=en-general&sample=1000', {
      storage: freshStorage(),
    });
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    const svg = await previewSvg();
    expect(svg).toContain('A · Qwerty');
    expect(svg).toContain('B · Magic Romak');
    expect(svg).toContain('by Rafael Romão');
    expect(svg).toContain('one scale for both layouts');
    // The Summary of each layout, under its own board: Effort once for A and once for B.
    expect(svg.match(/>Effort</g)).toHaveLength(2);
    // Both are bundled layouts as they come: nobody has edits to be named for.
    expect(within(dialog()).queryByLabelText('Unsaved edits by')).toBeNull();
  }, 60_000);

  it('asks who made the edits of a layout carried with changes saved nowhere, and only for that one', async () => {
    const user = userEvent.setup();
    const qwerty = bundledLayout('qwerty') as Layout;
    // The edits of a bundled layout, as Analyze sends them along: carried whole, with no id.
    const { id: _id, ...rest } = qwerty;
    const draft = inlineRef(await encodeInline({ ...rest, name: 'Qwerty, my way' } as Layout));
    // Analyze writes the draft and the tab remembers it, so Compare knows these edits are this tab's.
    tabDrafts().remember(draft, null);
    const search = new URLSearchParams({ layout: draft, b: 'magic-romak' });
    renderRoute(`/compare?${search}&corpus=en-general&sample=1000`, { storage: freshStorage() });
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    await user.type(within(dialog()).getByLabelText('Unsaved edits by'), '@someone');
    await waitFor(async () => expect(await previewSvg()).toContain('Unsaved edits by @someone'));
    const svg = await previewSvg();
    expect(svg).toContain('A · Qwerty, my way');
    expect(svg).toContain('B · Magic Romak');
    // One line of it, for A: Magic Romak as it comes is nobody's edit.
    expect(svg.match(/Unsaved edits/g)).toHaveLength(1);
  }, 60_000);

  it('credits only the author of a layout carried whole in a link that is no draft of this tab', async () => {
    const user = userEvent.setup();
    const qwerty = bundledLayout('qwerty') as Layout;
    const { id: _id, ...rest } = qwerty;
    // Someone else's link: the layout whole, with no record in this tab of anyone editing it.
    const link = inlineRef(await encodeInline({ ...rest, name: 'Qwerty, theirs' } as Layout));
    const search = new URLSearchParams({ layout: link, b: 'magic-romak' });
    renderRoute(`/compare?${search}&corpus=en-general&sample=1000`, { storage: freshStorage() });
    await waitFor(() => expect(exportButton()).toBeEnabled(), { timeout: 25_000 });

    await user.click(exportButton());
    expect(within(dialog()).queryByLabelText('Unsaved edits by')).toBeNull();
    expect(await previewSvg()).not.toContain('Unsaved edits');
  }, 60_000);

  it('names the edits of a custom layout carried with changes that are not saved in it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const mine = { ...(bundledLayout('colemak') as Layout), id: 'mine', name: 'Mine' };
    await storage.put('layouts', 'mine', toCanonicalJson(mine));
    const edited = inlineRef(await encodeInline({ ...mine, description: 'edited' }));
    const search = new URLSearchParams({ layout: edited, b: 'custom:mine' });
    renderRoute(`/compare?${search}&corpus=en-general&sample=1000`, { storage });
    // Compare puts the custom layout in the link whole, as it opens, and opens both again from it:
    // the button is for the layouts once they have settled.
    await waitFor(
      () =>
        expect(
          screen
            .getAllByRole('link', { name: 'Compare' })
            .some((link) => /b=inline/.test(link.getAttribute('href') ?? '')),
        ).toBe(true),
      { timeout: 25_000 },
    );
    // Once the layouts re-open from the link they are scored again, and the button is off for that
    // moment: a click on it then does nothing, so click until the dialog is there.
    await waitFor(
      async () => {
        await user.click(exportButton());
        expect(dialog()).toBeInTheDocument();
      },
      { timeout: 25_000 },
    );
    expect(within(dialog()).getByLabelText('Unsaved edits by')).toBeInTheDocument();
    // The saved copy beside it is not an edit.
    expect((await previewSvg()).match(/Unsaved edits/g)).toHaveLength(1);
  }, 60_000);
});
