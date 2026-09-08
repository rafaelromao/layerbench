import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { renderRoute, testClient } from '../test/render.js';

let counter = 0;
const freshStorage = () => new IndexedDbAdapter(`layoutmaster-edit-${++counter}`);

/** Drag one key onto another, the way a pointer does it. */
async function dragKey(from: string, to: string): Promise<void> {
  const svg = document.getElementById('kb-edit') as unknown as SVGSVGElement;
  const source = svg.querySelector(`g[data-key="${from}"]`) as Element;
  const target = svg.querySelector(`g[data-key="${to}"]`) as Element;

  // jsdom has no layout, so hit testing has to be told what is under the pointer.
  const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => target);

  svg.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }) as Event &
      PointerEvent,
  );
  source.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }) as Event &
      PointerEvent,
  );
  svg.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 20, clientY: 20 }) as Event &
      PointerEvent,
  );
  svg.dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, clientX: 20, clientY: 20 }) as Event &
      PointerEvent,
  );
  elementFromPoint.mockRestore();
}

describe('Edit', () => {
  it('swaps two keys by dragging, estimates while the analysis runs, then settles on it', async () => {
    // Re-scoring an existing run is milliseconds; simulating the edited layout is not. Slowing the
    // analysis down makes that gap observable, which is exactly the gap the estimate fills.
    const client = testClient();
    const analyze = client.analyze.bind(client);
    let release: (() => void) | null = null;
    vi.spyOn(client, 'analyze').mockImplementation(async (request, opts) => {
      const report = await analyze(request, opts);
      if (release)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return report;
    });

    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', {
      client,
      storage: freshStorage(),
    });

    // The summary only appears once an analysis has completed, and that report is what the
    // estimate is derived from.
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    // From here on, the next analysis parks until released.
    release = () => {};
    await dragKey('LTP', 'LTR');

    expect(await screen.findByText('unsaved')).toBeInTheDocument();
    expect(await screen.findByText(/estimate after swap/)).toBeInTheDocument();

    // Letting the real analysis finish replaces the estimate.
    release = null;
    vi.mocked(client.analyze).mockImplementation(analyze);
    await dragKey('LTR', 'LTM');
    await waitFor(() => expect(screen.queryByText(/estimate after swap/)).toBeNull(), {
      timeout: 25_000,
    });
  });

  it('saves the edited layout under a slug of its name', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', { storage });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(screen.getByRole('tab', { name: 'Save' }));
    const panel = screen
      .getByRole('button', { name: 'Save to library' })
      .closest('form') as HTMLElement;
    const name = within(panel).getByLabelText('Layout name');
    await user.clear(name);
    await user.type(name, 'Qwerty swapped');
    await user.click(within(panel).getByRole('button', { name: 'Save to library' }));

    expect(await screen.findByText('Saved as qwerty-swapped')).toBeInTheDocument();
    const stored = await storage.get('layouts', 'qwerty-swapped');
    expect(stored?.doc.name).toBe('Qwerty swapped');
  });

  it('selects a key and edits its binding', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', { storage: freshStorage() });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    expect(screen.getByText('Select a key on the keyboard.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Key LHM: d' }));
    const symbol = await screen.findByLabelText('Symbol');
    expect(symbol).toHaveValue('d');

    await user.clear(symbol);
    await user.type(symbol, 'ç');
    await user.click(screen.getByRole('button', { name: 'Apply to LHM' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Key LHM: ç' })).toBeInTheDocument();
    });
    expect(screen.getByText('unsaved')).toBeInTheDocument();
  });

  it('adds and removes a layer', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=qwerty&corpus=en-work&sample=20000', { storage: freshStorage() });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    await user.type(screen.getByLabelText('New layer name'), 'Symbols');
    await user.click(screen.getByRole('button', { name: '+ layer' }));

    expect(await screen.findByRole('tab', { name: 'Symbols' })).toBeInTheDocument();

    // The base layer is the one layer that cannot go.
    const baseName = screen.getByLabelText('Name of layer base');
    const row = baseName.closest('div') as HTMLElement;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(within(row).getByRole('button', { name: '✕' }));
    expect(await screen.findByText('cannot remove the base layer')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("shows Magic Romak's special features and lets one be turned off", async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    // The four behaviours firmware needs extra layers for are no longer layers.
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.getByLabelText('Name of layer alpha1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name of layer sen_case')).toBeNull();
    expect(screen.queryByLabelText('Name of layer sft_a2')).toBeNull();
    expect(screen.queryByLabelText('Name of layer altrep2')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Features' }));
    expect(screen.getByLabelText('Sentence case')).toBeChecked();
    expect(screen.getByLabelText('Caps word')).toBeChecked();
    expect(screen.getByLabelText('Magic key')).toBeChecked();

    // The adaptive triggers are visible without opening the JSON panel.
    const magic = screen.getByRole('table', { name: 'Magic key triggers' });
    expect(within(magic).getByText('v')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Sentence case'));
    expect(screen.getByLabelText('Sentence case')).not.toBeChecked();
    expect(await screen.findByText('unsaved')).toBeInTheDocument();
  });

  it('builds a macro that types text and then arms a layer', async () => {
    const user = userEvent.setup();
    renderRoute('/edit?layout=magic-romak&corpus=pt-br-work&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByText(/Quick analysis/, undefined, { timeout: 25_000 });

    await user.click(screen.getByRole('button', { name: /^Key LTR/ }));
    await user.selectOptions(screen.getByLabelText('Binding kind'), 'macro');

    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.type(screen.getByLabelText('Step 1 text'), 'ão');
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.selectOptions(screen.getByLabelText('Step 2 kind'), 'sl');
    await user.selectOptions(screen.getByLabelText('Step 2 layer'), 'alpha2');
    await user.type(screen.getByLabelText('Binding tag'), 'alpha2');
    await user.click(screen.getByRole('button', { name: /^Apply to LTR/ }));

    // The key now types the text and arms the layer, and says so on its legend.
    expect(await screen.findByRole('button', { name: /^Key LTR: ão/ })).toBeInTheDocument();
    expect(await screen.findByText('unsaved')).toBeInTheDocument();
  });
});
