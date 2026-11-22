import { bundledLayout, compileLayout } from '@layerbench/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitHubSession } from '../auth/github-session.js';
import { useToasts } from '../state/toasts.js';
import { type ShareBoard, type ShareImage, ShareImageDialog } from './ShareImageDialog.js';
import * as card from './share-card.js';
import type { SummaryCell } from './summary.js';

// A canvas and a clipboard are what jsdom lacks: the card and the preview are real, the PNG is a
// stand-in, and what is done with it is watched.
vi.mock('./share-card.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./share-card.js')>();
  return {
    ...real,
    inlineBoard: vi.fn(real.inlineBoard),
    composeCard: vi.fn(real.composeCard),
    renderPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    downloadBlob: vi.fn(),
    copyImage: vi.fn(async () => {}),
    canCopyImage: vi.fn(() => true),
  };
});

const qwerty = bundledLayout('qwerty');
if (!qwerty) throw new Error('no Qwerty');
const compiled = compileLayout(qwerty);

/** The two numbers a layout is judged by, as the page's Summary starts. */
const SUMMARY: SummaryCell[] = [
  { id: 'effort', label: 'Effort', value: '6.55', band: 'good', quality: 'good' },
  { id: 'sfb', label: 'SFB', value: '0.84%', band: 'very good', quality: 'good' },
];

function board(over: Partial<ShareBoard> = {}): ShareBoard {
  return {
    tag: null,
    layout: { name: 'Qwerty', author: 'Ana', link: 'https://example.com/qwerty' },
    compiled,
    typed: compiled,
    layers: [{ name: 'Base', heat: { 0: 1, 1: 0.25 }, share: 0.9 }],
    layerTotal: 1,
    summary: SUMMARY,
    unsaved: false,
    combos: true,
    ...over,
  };
}

function image(boards: ShareBoard[] = [board()]): ShareImage {
  return {
    boards,
    heat: 'Usage',
    heatNote: 'against the busiest key of all layers',
    settings: 'English · Layouts Doc',
  };
}

/** The card the preview shows, as the SVG text it is made of. */
async function previewSvg(): Promise<string> {
  const img = await screen.findByRole('img', { name: /Preview of the image/ });
  const src = img.getAttribute('src') ?? '';
  return decodeURIComponent(src.slice(src.indexOf(',') + 1));
}

/** Type @bia into the field of unsaved edits. */
async function typeEditorName() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Unsaved edits by'), '@bia');
}

const download = () => screen.getByRole('button', { name: 'Download PNG' });

beforeEach(() => {
  vi.mocked(card.inlineBoard).mockClear();
  vi.mocked(card.composeCard).mockClear();
  vi.mocked(card.renderPng).mockClear();
  vi.mocked(card.downloadBlob).mockClear();
  vi.mocked(card.copyImage).mockClear();
  vi.mocked(card.canCopyImage).mockReturnValue(true);
});
afterEach(() => useGitHubSession.setState({ login: null }));

describe('the image to share', () => {
  it('previews the card: the layout, its credits, the heat, the settings and whose tool it is', async () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    const svg = await previewSvg();
    for (const part of [
      'Qwerty',
      'by Ana · example.com/qwerty',
      compiled.layers[0]?.name ?? '',
      '90% of presses',
      'Usage',
      'English · Layouts Doc',
      'Made with LayerBench',
    ]) {
      expect(svg).toContain(part);
    }
  });

  it('shows the Summary under the board: each number with its value and its band', async () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    const svg = await previewSvg();
    for (const part of ['Effort', '6.55', 'SFB', '0.84%', 'very good']) expect(svg).toContain(part);
    // Under the board, after the layer's caption.
    expect(svg.indexOf('6.55')).toBeGreaterThan(svg.indexOf('% of presses'));
  });

  it('says the headline numbers to a screen reader, which a picture does not say', async () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    await previewSvg();
    const alt = screen.getByRole('img', { name: /Preview of the image/ }).getAttribute('alt');
    expect(alt).toContain('Effort 6.55 good, SFB 0.84% very good');
  });

  it('has no Summary to show for a layout with none', async () => {
    render(<ShareImageDialog image={image([board({ summary: [] })])} onClose={() => {}} />);
    const svg = await previewSvg();
    expect(svg).not.toContain('6.55');
    const alt = screen.getByRole('img', { name: /Preview of the image/ }).getAttribute('alt');
    expect(alt).not.toContain('Effort');
  });

  it('draws the board as the page does, from its first layer', async () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    const svg = await previewSvg();
    // The keys of Qwerty's first layer, each a cap with a legend, not a placeholder.
    expect(svg).toContain('>q<');
    expect(svg).toContain('>p<');
    // The page's classes and tooltips stay behind: the image carries its look itself.
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<title');
  });

  it('opens as a modal dialog, named Export image', async () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    expect(await screen.findByRole('dialog', { name: 'Export image' })).toBeInTheDocument();
  });

  it('leaves the buttons until the PNG is made, then offers it', async () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    expect(download()).toBeDisabled();
    await waitFor(() => expect(download()).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Copy image' })).toBeEnabled();
  });

  it('downloads the PNG under a name made of the layout’s', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    await waitFor(() => expect(download()).toBeEnabled());
    await user.click(download());
    expect(card.downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(card.downloadBlob).mock.calls[0] ?? [];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe('layerbench-qwerty.png');
  });

  it('names both layouts in the file of a comparison', async () => {
    const user = userEvent.setup();
    const two = image([board({ tag: 'A' }), board({ tag: 'B', layout: { name: 'Colemak DH' } })]);
    render(<ShareImageDialog image={two} onClose={() => {}} />);
    await waitFor(() => expect(download()).toBeEnabled());
    await user.click(download());
    expect(vi.mocked(card.downloadBlob).mock.calls[0]?.[1]).toBe(
      'layerbench-qwerty-vs-colemak-dh.png',
    );
    const svg = await previewSvg();
    expect(svg).toContain('A · Qwerty');
    expect(svg).toContain('B · Colemak DH');
  });

  it('copies the image, and says so', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy image' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Copy image' }));
    expect(card.copyImage).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.text)).toEqual([
        expect.stringMatching(/Copied the image/),
      ]),
    );
  });

  it('says when the browser would not copy it, and points to the download', async () => {
    vi.mocked(card.copyImage).mockRejectedValueOnce(new Error('denied'));
    const user = userEvent.setup();
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy image' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Copy image' }));
    await waitFor(() =>
      expect(useToasts.getState().toasts).toEqual([
        expect.objectContaining({ kind: 'error', text: expect.stringMatching(/download it/) }),
      ]),
    );
  });

  it('has no Copy where the browser cannot put an image on the clipboard', async () => {
    vi.mocked(card.canCopyImage).mockReturnValue(false);
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    await waitFor(() => expect(download()).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Copy image' })).toBeNull();
  });

  it('closes, and tells the page', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShareImageDialog image={image()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says why when the image could not be made, and offers nothing to save', async () => {
    vi.mocked(card.renderPng).mockRejectedValueOnce(new Error('The browser could not draw it.'));
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The browser could not draw it.');
    expect(download()).toBeDisabled();
  });

  it('says what it shows to a screen reader: the credits, the layer and what the colours measure', async () => {
    render(<ShareImageDialog image={image([board({ unsaved: true })])} onClose={() => {}} />);
    await typeEditorName();
    const alt = (await screen.findByRole('img', { name: /Preview of the image/ })).getAttribute(
      'alt',
    );
    expect(alt).toContain('Qwerty');
    expect(alt).toContain('by Ana');
    expect(alt).toContain('Unsaved edits by @bia');
    expect(alt).toContain(`first layer, ${compiled.layers[0]?.name}`);
    expect(alt).toContain('coloured by Usage');
  });

  it('says so, instead of breaking the page, when a board cannot be copied', async () => {
    vi.mocked(card.inlineBoard).mockImplementationOnce(() => {
      throw new Error('The board could not be drawn.');
    });
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The board could not be drawn.');
    expect(download()).toBeDisabled();
    expect(screen.queryByRole('img', { name: /Preview of the image/ })).toBeNull();
  });

  it('says so, instead of breaking the page, when the card cannot be made', async () => {
    vi.mocked(card.composeCard).mockImplementationOnce(() => {
      throw new Error('The card could not be made.');
    });
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The card could not be made.');
    expect(download()).toBeDisabled();
  });

  it('makes one PNG for a name typed, not one for each letter', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image([board({ unsaved: true })])} onClose={() => {}} />);
    await waitFor(() => expect(download()).toBeEnabled());
    vi.mocked(card.renderPng).mockClear();
    await user.type(screen.getByLabelText('Unsaved edits by'), 'Bia');
    await waitFor(() => expect(download()).toBeEnabled());
    expect(card.renderPng).toHaveBeenCalledTimes(1);
  });
});

describe('names as long as a link can carry', () => {
  it('opens the dialog at once, and keeps its description and its card to a line of each', async () => {
    const huge = 'L'.repeat(200_000);
    const longLayers = compileLayout({
      ...(qwerty as NonNullable<typeof qwerty>),
      layers: (qwerty as NonNullable<typeof qwerty>).layers.map((layer, i) =>
        i === 0 ? { ...layer, name: huge } : layer,
      ),
    });
    const started = performance.now();
    render(
      <ShareImageDialog
        image={image([
          board({
            compiled: longLayers,
            typed: longLayers,
            layout: { name: huge, author: huge, link: `https://example.com/${huge}` },
            unsaved: true,
          }),
        ])}
        onClose={() => {}}
      />,
    );
    const alt = (await screen.findByRole('img', { name: /Preview of the image/ })).getAttribute(
      'alt',
    );
    expect(performance.now() - started).toBeLessThan(5000);
    expect((alt ?? '').length).toBeLessThan(10_000);
    expect(await previewSvg()).not.toContain('L'.repeat(500));
    await waitFor(() => expect(download()).toBeEnabled());
  }, 30_000);
});

describe('all layers', () => {
  const romak = compileLayout(bundledLayout('magic-romak') as NonNullable<typeof qwerty>);
  const layers = romak.layers.map((layer, i) => ({
    name: layer.name,
    heat: { 0: i === 0 ? 1 : 0.2 },
    share: i === 0 ? 0.9 : 0.025,
  }));
  /** Magic Romak: a layout of several layers, as the builders give it. */
  const several = (over: Partial<ShareBoard> = {}) =>
    board({
      compiled: romak,
      typed: romak,
      layout: { name: 'Magic Romak', author: 'Rafael' },
      layers,
      layerTotal: layers.length,
      ...over,
    });
  const option = () => screen.getByRole('checkbox', { name: 'All layers' });

  it('is not offered for a layout of one layer, which has no others to draw', () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    expect(screen.queryByRole('checkbox', { name: 'All layers' })).toBeNull();
  });

  it('is offered where a layout has more than one, and starts off: the first layer alone', async () => {
    render(<ShareImageDialog image={image([several()])} onClose={() => {}} />);
    expect(option()).not.toBeChecked();
    const svg = await previewSvg();
    expect(svg).toContain(`${romak.layers[0]?.name} · 90% of presses`);
    expect(svg).not.toContain('2 / ');
    expect(
      screen.getByText(/Draws every layer of the layout, one under another \(5 layers\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/^The first layer/)).toBeInTheDocument();
  });

  it('draws every layer, in order, once it is ticked', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image([several()])} onClose={() => {}} />);
    await previewSvg();
    await user.click(option());
    await waitFor(async () => expect(await previewSvg()).toContain('5 / 5'));
    const svg = await previewSvg();
    romak.layers.forEach((layer, i) => {
      expect(svg).toContain(`${i + 1} / ${romak.layers.length} · ${layer.name}`);
    });
    expect(screen.getByText(/^Every layer/)).toBeInTheDocument();
  });

  it('says every layer to a screen reader, by name', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image([several()])} onClose={() => {}} />);
    await previewSvg();
    await user.click(option());
    await waitFor(() => {
      const alt = screen.getByRole('img', { name: /Preview of the image/ }).getAttribute('alt');
      expect(alt).toContain(`${romak.layers.length} layers: ${romak.layers[0]?.name}`);
    });
  });

  it('names the file for it, so a download of every layer is not taken for the first', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image([several()])} onClose={() => {}} />);
    await waitFor(() => expect(download()).toBeEnabled());
    await user.click(download());
    expect(vi.mocked(card.downloadBlob).mock.calls.at(-1)?.[1]).toBe('layerbench-magic-romak.png');

    await user.click(option());
    // The PNG is made again for the new card, and is not there until it is.
    await waitFor(() => expect(download()).toBeDisabled());
    await waitFor(() => expect(download()).toBeEnabled());
    await user.click(download());
    expect(vi.mocked(card.downloadBlob).mock.calls.at(-1)?.[1]).toBe(
      'layerbench-magic-romak-all-layers.png',
    );
  });

  it('goes back to the first layer once it is unticked', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image([several()])} onClose={() => {}} />);
    await previewSvg();
    await user.click(option());
    await waitFor(async () => expect(await previewSvg()).toContain('5 / 5'));
    await user.click(option());
    await waitFor(async () => expect(await previewSvg()).not.toContain('2 / '));
    expect(await previewSvg()).toContain(`${romak.layers[0]?.name} · 90% of presses`);
  });

  it('is never an error to change it: the card follows the choice it was drawn for', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image([several()])} onClose={() => {}} />);
    await previewSvg();
    for (let i = 0; i < 4; i++) await user.click(option());
    await waitFor(() => expect(download()).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('holds a card to 32 layers and says how many it left out', async () => {
    const user = userEvent.setup();
    const thirtyTwo = Array.from({ length: 32 }, (_, i) => ({
      ...(layers[0] as (typeof layers)[0]),
      name: `L${i + 1}`,
    }));
    render(
      <ShareImageDialog
        image={image([several({ layers: thirtyTwo, layerTotal: 40 })])}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/A card holds the first 32 of each/)).toBeInTheDocument();
    await user.click(option());
    await waitFor(async () => expect(await previewSvg()).toContain('32 / 32 · L32'));
    const svg = await previewSvg();
    expect(svg).toContain('8 more layers not drawn');
    expect(svg).not.toContain('33 / ');
  }, 30_000);

  it('draws each layout’s layers when two are compared, one layer stays one', async () => {
    const user = userEvent.setup();
    const two = image([several({ tag: 'A' }), board({ tag: 'B', layout: { name: 'Qwerty' } })]);
    render(<ShareImageDialog image={two} onClose={() => {}} />);
    expect(
      screen.getByText(/each layout's layers, one under another \(A has 5 layers, B has 1 layer\)/),
    ).toBeInTheDocument();
    await user.click(option());
    await waitFor(async () => expect(await previewSvg()).toContain('5 / 5'));
    const svg = await previewSvg();
    // B has one layer: no heading over it, its name and share under it as ever.
    expect(svg).not.toContain('1 / 1');
    expect(svg).toContain('Base · 90% of presses');
  });

  it('scrolls the preview when every layer is drawn, and shows one layer whole', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={image([several()])} onClose={() => {}} />);
    await previewSvg();
    expect(screen.queryByRole('region', { name: 'Preview of every layer' })).toBeNull();
    await user.click(option());
    expect(
      await screen.findByRole('region', { name: 'Preview of every layer' }),
    ).toBeInTheDocument();
  });
});

describe('the combos on the image', () => {
  const romak = compileLayout(bundledLayout('magic-romak') as NonNullable<typeof qwerty>);
  /** The boxes of the combos on a board: each is a rect in the group the board draws them in. */
  const rects = (svg: string) => (svg.match(/<rect/g) ?? []).length;

  it('draws the combos that type on the first layer when the page does, and not when it does not', async () => {
    const withCombos = render(
      <ShareImageDialog
        image={image([board({ compiled: romak, typed: romak, combos: true })])}
        onClose={() => {}}
      />,
    );
    const drawn = rects(await previewSvg());
    withCombos.unmount();
    render(
      <ShareImageDialog
        image={image([board({ compiled: romak, typed: romak, combos: false })])}
        onClose={() => {}}
      />,
    );
    expect(drawn).toBeGreaterThan(rects(await previewSvg()));
  });
});

describe('who made the unsaved edits', () => {
  const unsaved = () => image([board({ unsaved: true })]);

  it('asks for no one, and says nothing of edits, for a version that is saved', async () => {
    render(<ShareImageDialog image={image()} onClose={() => {}} />);
    const svg = await previewSvg();
    expect(screen.queryByLabelText('Unsaved edits by')).toBeNull();
    expect(svg).not.toMatch(/Unsaved edits|unsaved/);
  });

  it('asks who made them for a version that is not, and credits the author beside them', async () => {
    render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    const svg = await previewSvg();
    expect(screen.getByLabelText('Unsaved edits by')).toHaveValue('');
    expect(svg).toContain('by Ana');
    expect(svg).toContain('Unsaved edits');
    expect(svg).not.toContain('Unsaved edits by');
  });

  it('starts from whoever is signed in', async () => {
    useGitHubSession.setState({ login: 'bia' });
    render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    expect(screen.getByLabelText('Unsaved edits by')).toHaveValue('@bia');
    expect(await previewSvg()).toContain('Unsaved edits by @bia');
  });

  it('follows what is typed, and keeps it for the next image', async () => {
    const user = userEvent.setup();
    useGitHubSession.setState({ login: 'bia' });
    const first = render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    const field = screen.getByLabelText('Unsaved edits by');
    await user.clear(field);
    await user.type(field, 'Caio');
    await waitFor(async () => expect(await previewSvg()).toContain('Unsaved edits by Caio'));
    first.unmount();

    // A name typed wins over the login the next time, signed in or not.
    render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    expect(screen.getByLabelText('Unsaved edits by')).toHaveValue('Caio');
  });

  it('names no one when the field is emptied, and keeps that choice too', async () => {
    const user = userEvent.setup();
    useGitHubSession.setState({ login: 'bia' });
    const first = render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    await user.clear(screen.getByLabelText('Unsaved edits by'));
    await waitFor(async () => {
      const svg = await previewSvg();
      expect(svg).toContain('Unsaved edits');
      expect(svg).not.toContain('Unsaved edits by');
    });
    first.unmount();
    render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    expect(screen.getByLabelText('Unsaved edits by')).toHaveValue('');
  });

  it('holds the name to a line of the card', async () => {
    const user = userEvent.setup();
    render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    const field = screen.getByLabelText('Unsaved edits by');
    await user.type(field, 'x'.repeat(80));
    expect((field as HTMLInputElement).value).toHaveLength(40);
  });

  it('says which layout the hint is about when only one of two is unsaved', () => {
    const two = image([
      board({ tag: 'A' }),
      board({ tag: 'B', unsaved: true, layout: { name: 'Colemak DH' } }),
    ]);
    render(<ShareImageDialog image={two} onClose={() => {}} />);
    expect(screen.getByText(/Layout B has changes that are not saved/)).toBeInTheDocument();
  });

  it('says so of both when both are unsaved, and of the one when one is shown', () => {
    const both = image([board({ tag: 'A', unsaved: true }), board({ tag: 'B', unsaved: true })]);
    const first = render(<ShareImageDialog image={both} onClose={() => {}} />);
    expect(screen.getByText(/These layouts have changes that are not saved/)).toBeInTheDocument();
    first.unmount();
    render(<ShareImageDialog image={unsaved()} onClose={() => {}} />);
    expect(screen.getByText(/This layout has changes that are not saved/)).toBeInTheDocument();
  });

  it('marks only the layout that is unsaved, when two are compared', async () => {
    const two = image([
      board({ tag: 'A', unsaved: true }),
      board({ tag: 'B', layout: { name: 'Colemak DH', author: 'Dan' } }),
    ]);
    render(<ShareImageDialog image={two} onClose={() => {}} />);
    const svg = await previewSvg();
    expect(svg.match(/Unsaved edits/g)).toHaveLength(1);
    expect(svg).toContain('by Dan');
  });
});
