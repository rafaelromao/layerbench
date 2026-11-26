import { bundledLayout, getPreset, type Layout, toCanonicalJson } from '@layerbench/core';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '../state/toasts.js';
import { copyDialog, dragKey } from '../test/analyze-editing.js';
import { showLayer, shownLayer } from '../test/layers.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { RecordingClient } from '../test/recording-client.js';
import { customInLink, openSettings, renderRoute, testClient } from '../test/render.js';
import { decodeInline, encodeInline, MAX_INLINE_BYTES } from '../url/inline.js';
import { encodeRuleSnapshot } from '../url/rule-snapshot.js';
import { buildPortableTarget } from '../url/share-target.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function holdNextCompression() {
  const NativeCompressionStream = globalThis.CompressionStream;
  let signalStarted = () => {};
  let release = () => {};
  let signalFinished = () => {};
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const mayFinish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    signalFinished = resolve;
  });
  let held = false;

  class HeldCompressionStream {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<BufferSource>;

    constructor(format: CompressionFormat) {
      const stream = new NativeCompressionStream(format);
      const writer = stream.writable.getWriter();
      this.readable = stream.readable;
      this.writable = new WritableStream({
        async write(chunk) {
          if (!held) {
            held = true;
            signalStarted();
            await mayFinish;
          }
          await writer.write(chunk);
        },
        async close() {
          await writer.close();
          signalFinished();
        },
        abort(reason) {
          return writer.abort(reason);
        },
      });
    }
  }

  vi.stubGlobal('CompressionStream', HeldCompressionStream as unknown as typeof CompressionStream);
  return { started, release, finished };
}

function holdNextDecompression() {
  const NativeDecompressionStream = globalThis.DecompressionStream;
  let signalStarted = () => {};
  let release = () => {};
  let signalFinished = () => {};
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const mayFinish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    signalFinished = resolve;
  });
  let held = false;

  class HeldDecompressionStream {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<BufferSource>;

    constructor(format: CompressionFormat) {
      const stream = new NativeDecompressionStream(format);
      const writer = stream.writable.getWriter();
      this.readable = stream.readable;
      this.writable = new WritableStream({
        async write(chunk) {
          if (!held) {
            held = true;
            signalStarted();
            await mayFinish;
          }
          await writer.write(chunk);
        },
        async close() {
          await writer.close();
          signalFinished();
        },
        abort(reason) {
          return writer.abort(reason);
        },
      });
    }
  }

  vi.stubGlobal(
    'DecompressionStream',
    HeldDecompressionStream as unknown as typeof DecompressionStream,
  );
  return { started, release, finished };
}

describe('portable Analyze links', () => {
  it('copies a same-site target that restores the bundled layout and analysis settings', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const sourceClient = new RecordingClient();
    const source = renderRoute(
      '/analyze?layout=qwerty&corpus=en-general&corpus2=pt-br-general&mix=65&rules=cyanophage&case=model&text=sym&space=1&heat=effort&sample=10000&off=adaptive,combos',
      {
        client: sourceClient,
        storage: new MemoryStorage(),
      },
    );

    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());

    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect(target.origin).toBe(window.location.origin);
    expect(target.pathname).toBe('/analyze');
    expect(target.searchParams.get('share')).toBe('1');
    expect(target.searchParams.get('layout')).toBe('qwerty');
    expect(target.searchParams.get('corpus')).toBe('en-general');
    expect(target.searchParams.get('corpus2')).toBe('pt-br-general');
    expect(target.searchParams.get('mix')).toBe('65');
    expect(target.searchParams.get('rules')).toBe('cyanophage');
    expect(target.searchParams.get('case')).toBe('model');
    expect(target.searchParams.get('text')).toBe('sym');
    expect(target.searchParams.get('space')).toBe('1');
    expect(target.searchParams.get('heat')).toBe('effort');
    expect(target.searchParams.get('sample')).toBe('10000');
    expect(target.searchParams.get('off')).toBe('adaptive,combos');

    source.unmount();
    const reloadClient = new RecordingClient();
    renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client: reloadClient,
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(reloadClient.analyses.length).toBeGreaterThan(0));
    expect(reloadClient.analyses[0]?.layout.name).toBe('Qwerty');
    expect(reloadClient.analyses[0]?.settings).toMatchObject({
      corpus: 'en-general',
      corpus2: 'pt-br-general',
      share: 65,
      rules: expect.objectContaining({ id: 'cyanophage' }),
      caseMode: 'model',
      textClass: 'letters+digits+symbols',
      universe: 'with_space',
      sample: 10_000,
      without: ['adaptive', 'combos'],
    });
  }, 60_000);

  it('follows same-layout layer history and shares the layer currently shown', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const target = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'magic-romak',
        corpus: 'pt-br-general',
        sample: '10000',
        layer: '1',
      },
    });
    const source = renderRoute(target.replace(window.location.origin, ''), {
      client: new RecordingClient(),
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await waitFor(() =>
      expect(new URLSearchParams(source.currentSearch()).get('layout')).toMatch(/^inline:/),
    );

    const layerTarget = async (layer: number | null) => {
      const search = Object.fromEntries(new URLSearchParams(source.currentSearch()));
      if (layer === null) delete search.layer;
      else search.layer = String(layer);
      return (
        await buildPortableTarget({
          baseHref: '/analyze',
          origin: window.location.origin,
          route: 'analyze',
          search,
        })
      ).replace(window.location.origin, '');
    };
    const alpha1 = await layerTarget(null);
    const alpha2 = await layerTarget(1);
    source.push(alpha1);
    await waitFor(() => expect(shownLayer()).toBe('Alpha 1'));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    source.push(alpha2);
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    source.back();
    await waitFor(() => expect(shownLayer()).toBe('Alpha 1'));
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    let shared = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect(new URLSearchParams(shared.hash.slice(1)).get('layout')).toMatch(/^inline:/);
    expect(shared.searchParams.has('layer')).toBe(false);

    source.forward();
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    shared = new URL(writeText.mock.calls[1]?.[0] ?? '');
    expect(new URLSearchParams(shared.hash.slice(1)).get('layout')).toMatch(/^inline:/);
    expect(shared.searchParams.get('layer')).toBe('1');

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  }, 60_000);

  it('clamps an unavailable history layer while the Combos panel is open', async () => {
    const user = userEvent.setup();
    const source = renderRoute('/analyze?layout=magic-romak&corpus=en-general&sample=10000', {
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    expect(screen.getByRole('region', { name: 'Combos' })).toBeInTheDocument();
    const lastLayer = bundledLayout('magic-romak')?.layers.at(-1)?.name;
    expect(lastLayer).toBeDefined();

    source.push('/analyze?layout=magic-romak&corpus=en-general&sample=10000&layer=31');

    await waitFor(() => expect(shownLayer()).toBe(lastLayer));
    expect(screen.getByRole('region', { name: 'Combos' })).toBeInTheDocument();
    expect(new URLSearchParams(source.currentSearch()).get('layer')).toBe(
      String((bundledLayout('magic-romak')?.layers.length ?? 1) - 1),
    );
  }, 60_000);

  it('normalizes an invalid history layer when the last layer is already selected', async () => {
    const user = userEvent.setup();
    const layerCount = bundledLayout('magic-romak')?.layers.length ?? 1;
    const lastLayer = layerCount - 1;
    const source = renderRoute(
      `/analyze?layout=magic-romak&corpus=en-general&sample=10000&layer=${lastLayer}`,
      { storage: new MemoryStorage() },
    );
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    expect(shownLayer()).toBe(bundledLayout('magic-romak')?.layers.at(-1)?.name);

    source.push('/analyze?layout=magic-romak&corpus=en-general&sample=10000&layer=31');

    await waitFor(() =>
      expect(new URLSearchParams(source.currentSearch()).get('layer')).toBe(String(lastLayer)),
    );
    expect(screen.getByRole('region', { name: 'Combos' })).toBeInTheDocument();
  }, 60_000);

  it('shares the editor layer selected while its edited layout is being compressed', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const target = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'magic-romak',
        corpus: 'pt-br-general',
        sample: '10000',
        layer: '1',
      },
    });
    renderRoute(target.replace(window.location.origin, ''), {
      client: new RecordingClient(),
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    const compression = holdNextCompression();

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Share link' }));
      await user.click(screen.getByRole('button', { name: 'Next layer' }));
      await waitFor(() => expect(shownLayer()).not.toBe('Alpha 2'));
    } finally {
      compression.release();
    }
    await compression.finished;
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const shared = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect(shared.searchParams.get('layer')).toBe('2');
  }, 60_000);

  it('does not share an old opening after Back during draft compression', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const previous = '/analyze?layout=qwerty&corpus=en-general&sample=10000';
    const current = '/analyze?layout=magic-romak&corpus=pt-br-general&sample=10000&layer=1';
    const source = renderRoute(current, {
      historyEntries: [previous, current],
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    const compression = holdNextCompression();

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Share link' }));
      source.back();
      await waitFor(() => {
        expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');
        expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('en-general');
      });
    } finally {
      compression.release();
    }
    await compression.finished;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share link' })).toBeEnabled());

    expect(source.currentPath()).toBe('/analyze');
    expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');
    expect(writeText).not.toHaveBeenCalled();
  }, 60_000);

  it('cancels Share when Back happens while its inline target is being validated', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const previous = '/analyze?layout=qwerty&corpus=en-general&sample=10000';
    const current = '/analyze?layout=magic-romak&corpus=pt-br-general&sample=10000&layer=1';
    const source = renderRoute(current, {
      historyEntries: [previous, current],
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    const compression = holdNextCompression();
    const decompression = holdNextDecompression();

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Share link' }));
      compression.release();
      await compression.finished;
      await decompression.started;
      source.back();
      await waitFor(() => {
        expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');
        expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('en-general');
      });
    } finally {
      compression.release();
      decompression.release();
    }
    await decompression.finished;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(source.currentPath()).toBe('/analyze');
    expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');
    expect(writeText).not.toHaveBeenCalled();
  }, 60_000);

  it('cancels Share on same-layout Back during target validation', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const previous = '/analyze?layout=magic-romak&corpus=en-general&sample=10000';
    const current = '/analyze?layout=magic-romak&corpus=pt-br-general&sample=10000&layer=1';
    const source = renderRoute(current, {
      historyEntries: [previous, current],
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    const compression = holdNextCompression();
    const decompression = holdNextDecompression();

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Share link' }));
      compression.release();
      await compression.finished;
      await decompression.started;
      source.back();
      await waitFor(() => {
        const search = new URLSearchParams(source.currentSearch());
        expect(search.get('corpus')).toBe('en-general');
        expect(search.has('layer')).toBe(false);
      });
    } finally {
      compression.release();
      decompression.release();
    }
    await decompression.finished;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(source.currentPath()).toBe('/analyze');
    expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('en-general');
    expect(writeText).not.toHaveBeenCalled();
  }, 60_000);

  it('does not compare an old opening after Back during draft compression', async () => {
    const user = userEvent.setup();
    const previous = '/analyze?layout=qwerty&corpus=en-general&sample=10000';
    const current = '/analyze?layout=magic-romak&corpus=pt-br-general&sample=10000&layer=1';
    const source = renderRoute(current, {
      historyEntries: [previous, current],
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    const compression = holdNextCompression();

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Compare' }));
      source.back();
      await waitFor(() => {
        expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');
        expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('en-general');
      });
    } finally {
      compression.release();
    }
    await compression.finished;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(source.currentPath()).toBe('/analyze');
    expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');
    expect(screen.getByRole('region', { name: 'Layout' })).toBeInTheDocument();
  }, 60_000);

  it('cancels Compare on same-layout Back during draft compression', async () => {
    const user = userEvent.setup();
    const previous = '/analyze?layout=magic-romak&corpus=en-general&sample=10000';
    const current = '/analyze?layout=magic-romak&corpus=pt-br-general&sample=10000&layer=1';
    const source = renderRoute(current, {
      historyEntries: [previous, current],
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    const compression = holdNextCompression();

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Compare' }));
      source.back();
      await waitFor(() => {
        const search = new URLSearchParams(source.currentSearch());
        expect(search.get('corpus')).toBe('en-general');
        expect(search.has('layer')).toBe(false);
      });
    } finally {
      compression.release();
    }
    await compression.finished;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(source.currentPath()).toBe('/analyze');
    expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('en-general');
  }, 60_000);

  it('cancels Share on same-layout Back during draft compression', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const previous = '/analyze?layout=magic-romak&corpus=en-general&sample=10000';
    const current = '/analyze?layout=magic-romak&corpus=pt-br-general&sample=10000&layer=1';
    const source = renderRoute(current, {
      historyEntries: [previous, current],
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(shownLayer()).toBe('Alpha 2'));
    const compression = holdNextCompression();

    await dragKey('LTR', 'LTM');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Share link' }));
      source.back();
      await waitFor(() => {
        const search = new URLSearchParams(source.currentSearch());
        expect(search.get('corpus')).toBe('en-general');
        expect(search.has('layer')).toBe(false);
      });
    } finally {
      compression.release();
    }
    await compression.finished;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share link' })).toBeEnabled());

    expect(source.currentPath()).toBe('/analyze');
    expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('en-general');
    expect(writeText).not.toHaveBeenCalled();
  }, 60_000);

  it.each(['Share link', 'Compare'])(
    'cancels %s after analysis settings change',
    async (action) => {
      const user = userEvent.setup();
      const writeText = vi.fn(async (_text: string) => {});
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      const source = renderRoute(
        '/analyze?layout=magic-romak&corpus=pt-br-general&sample=10000&layer=1',
        { storage: new MemoryStorage() },
      );
      await waitFor(() => expect(shownLayer()).toBe('Alpha 2'), { timeout: 25_000 });
      const compression = holdNextCompression();
      await dragKey('LTR', 'LTM');
      await compression.started;
      try {
        await user.click(screen.getByRole('button', { name: action }));
        const settings = await openSettings();
        await user.selectOptions(
          within(settings).getByRole('combobox', { name: 'Corpus' }),
          'en-general',
        );
        await user.click(within(settings).getByRole('button', { name: 'Done' }));
        await user.click(screen.getByRole('button', { name: 'Next layer' }));
      } finally {
        compression.release();
      }
      await compression.finished;
      await waitFor(() => expect(screen.getByRole('button', { name: 'Share link' })).toBeEnabled());
      expect(source.currentPath()).toBe('/analyze');
      expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('en-general');
      expect(writeText).not.toHaveBeenCalled();
    },
    60_000,
  );

  it('captures an edit made immediately before the share action', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const sourceClient = new RecordingClient();
    const source = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=10000', {
      client: sourceClient,
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });

    await dragKey('LTP', 'LTR');
    await screen.findByText('unsaved');
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const edited = sourceClient.analyses.at(-1)?.layout;
    expect(edited).toBeDefined();

    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    const inline = new URLSearchParams(target.hash.slice(1)).get('layout');
    const { id: _id, ...portableLayout } = edited ?? {};
    source.unmount();
    const reloadClient = new RecordingClient();
    renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client: reloadClient,
      storage: new MemoryStorage(),
    });
    await waitFor(() => expect(reloadClient.analyses.length).toBeGreaterThan(0));
    const decoded = await decodeInline((inline ?? '').slice('inline:'.length));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(toCanonicalJson(decoded.layout)).toEqual(
        toCanonicalJson(portableLayout as unknown as Layout),
      );
      expect(reloadClient.analyses[0]?.layout).toEqual(toCanonicalJson(decoded.layout));
    }
  }, 60_000);

  it('does not share a draft whose edit was undone while compression was pending', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const source = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=10000', {
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    const compression = holdNextCompression();

    await dragKey('LTP', 'LTR');
    await screen.findByText('unsaved');
    await compression.started;
    try {
      await user.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() =>
        expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty'),
      );
    } finally {
      compression.release();
    }
    await compression.finished;
    expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');

    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    const layoutRef =
      target.searchParams.get('layout') ?? new URLSearchParams(target.hash.slice(1)).get('layout');
    expect(layoutRef).toBe('qwerty');
  }, 60_000);

  it('keeps an async generated link selectable when clipboard writing fails', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {
      throw new Error('clipboard access denied');
    });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const source = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=10000', {
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });

    await dragKey('LTP', 'LTR');
    await screen.findByText('unsaved');
    await user.click(screen.getByRole('button', { name: 'Share link' }));

    const link = (await screen.findByRole('textbox', {
      name: 'Share link to copy manually',
    })) as HTMLInputElement;
    await waitFor(() => expect(link.value).toContain('#layout=inline%3A'));
    expect(writeText).toHaveBeenCalledOnce();
    expect(link).toHaveFocus();
    expect(link.selectionStart).toBe(0);
    expect(link.selectionEnd).toBe(link.value.length);

    source.unmount();
  }, 60_000);

  it('shares a custom rule snapshot and prefers it over a same-named local set', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const sourceStorage = new MemoryStorage();
    await sourceStorage.put('rulesets', 'strict', {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    });
    const source = renderRoute(
      '/analyze?layout=qwerty&corpus=en-general&sample=10000&rules=custom:strict',
      {
        storage: sourceStorage,
      },
    );
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());

    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect(target.searchParams.get('rules')).toBe('custom:strict');
    const fragment = new URLSearchParams(target.hash.slice(1));
    expect(fragment.get('rulesSnapshot')).toMatch(/^v1\./);
    source.unmount();

    const targetStorage = new MemoryStorage();
    await targetStorage.put('rulesets', 'strict', {
      ...getPreset('layouts_doc'),
      id: 'strict',
      name: 'Different Local Strict',
    });
    const get = vi.spyOn(targetStorage, 'get');
    const reloadClient = new RecordingClient();
    const reloaded = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client: reloadClient,
      storage: targetStorage,
    });
    await waitFor(() => expect(reloadClient.analyses.length).toBeGreaterThan(0));
    expect(reloadClient.analyses[0]?.settings.rules.name).toBe('Shared Strict');
    expect(
      get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
    ).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /^Compare$/ }));
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    await waitFor(() => expect(reloadClient.analyses).toHaveLength(3));
    expect(reloadClient.analyses.map((request) => request.settings.rules.name)).toEqual([
      'Shared Strict',
      'Shared Strict',
      'Shared Strict',
    ]);
    expect(reloaded.currentPath()).toBe('/compare');
    expect(new URLSearchParams(reloaded.currentSearch()).get('share')).toBe('1');
    expect(new URLSearchParams(reloaded.currentSearch()).get('rulesSnapshot')).toMatch(/^v1\./);
  }, 60_000);

  it('keeps a large carried rule snapshot out of the Library request and restores it on reload', async () => {
    const sharedRules = {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Large shared rules',
      description: 'A'.repeat(40_000),
    };
    const snapshot = encodeRuleSnapshot(sharedRules);
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'qwerty',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const source = renderRoute(href.replace(window.location.origin, ''), {
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });

    const libraryLink = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: 'Library',
    });
    const libraryHref = new URL(libraryLink.getAttribute('href') ?? '', window.location.origin);
    expect((libraryHref.pathname + libraryHref.search).length).toBeLessThan(7_900);
    expect(libraryHref.search).not.toContain('rulesSnapshot');
    expect(libraryHref.searchParams.has('share')).toBe(false);
    expect(new URLSearchParams(libraryHref.hash.slice(1)).get('rulesSnapshot')).toBe(snapshot);
    source.unmount();

    const storage = new MemoryStorage();
    const get = vi.spyOn(storage, 'get');
    const client = new RecordingClient();
    const reloaded = renderRoute(
      `${libraryHref.pathname}${libraryHref.search}${libraryHref.hash}`,
      { client, storage },
    );
    await screen.findByRole('heading', { name: 'Layouts' });
    await waitFor(() => expect(client.analyses.length).toBeGreaterThan(0));
    expect(client.analyses[0]?.settings.rules.name).toBe('Large shared rules');
    expect(
      get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
    ).toHaveLength(0);
    expect(reloaded.currentPath()).toBe('/library');
  }, 60_000);

  it('keeps embedded custom rules when opening a Library card in Analyze', async () => {
    const user = userEvent.setup();
    const sharedRules = {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    };
    const snapshot = encodeRuleSnapshot(sharedRules);
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'qwerty',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const storage = new MemoryStorage();
    const get = vi.spyOn(storage, 'get');
    const client = new RecordingClient();
    const source = renderRoute(href.replace(window.location.origin, ''), { client, storage });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Library',
      }),
    );
    await screen.findByRole('heading', { name: 'Layouts' });

    const card = (await screen.findByRole('heading', { name: 'Qwerty', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    const analyzeLink = within(card).getByRole('link', { name: 'Analyze Qwerty' });
    const analyzeHref = new URL(analyzeLink.getAttribute('href') ?? '', window.location.origin);
    expect(analyzeHref.search).not.toContain('rulesSnapshot');
    expect(new URLSearchParams(analyzeHref.hash.slice(1)).get('rulesSnapshot')).toMatch(/^v1\./);

    const previousAnalyses = client.analyses.length;
    await user.click(analyzeLink);
    await waitFor(() => expect(source.currentPath()).toBe('/analyze'));
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => {
      expect(client.analyses.length).toBeGreaterThan(previousAnalyses);
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
    });
    expect(source.currentSearch()).toContain('rulesSnapshot');
    expect(
      get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
    ).toHaveLength(0);
  }, 60_000);

  it('does not offer a Library card link beyond the Pages request budget', async () => {
    const id = 'r'.repeat(7_830);
    const snapshot = encodeRuleSnapshot({ ...getPreset('cyanophage'), id, rules: [] });
    const query = new URLSearchParams({
      corpus: 'en-general',
      sample: '10000',
      rules: `custom:${id}`,
    });
    renderRoute(`/library?${query}#rulesSnapshot=${snapshot}`, {
      client: new RecordingClient(),
      storage: new MemoryStorage(),
    });
    const name = 'Analyze Hands Down Promethium';
    const title = await screen.findByRole('heading', { name: 'Hands Down Promethium', level: 3 });
    const card = within(title.closest('article')!);
    expect(card.queryByRole('link', { name })).not.toBeInTheDocument();
    fireEvent.click(card.getByRole('button', { name }));
    expect(useToasts.getState().toasts.map(({ text }) => text)).toEqual(
      expect.arrayContaining([expect.stringMatching(/choose a smaller custom rule set/i)]),
    );
  }, 60_000);

  it('keeps embedded custom rules when a Library analysis setting changes', async () => {
    const user = userEvent.setup();
    const sharedRules = {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    };
    const snapshot = encodeRuleSnapshot(sharedRules);
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'qwerty',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const storage = new MemoryStorage();
    const get = vi.spyOn(storage, 'get');
    const client = new RecordingClient();
    const source = renderRoute(href.replace(window.location.origin, ''), { client, storage });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Library',
      }),
    );
    await screen.findByRole('heading', { name: 'Layouts' });
    await user.click(screen.getByRole('button', { name: 'Rank and filter' }));
    const corpus = await screen.findByRole('combobox', { name: 'Corpus' });
    await waitFor(() => expect(within(corpus).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(corpus, 'pt-br-general');
    await waitFor(() =>
      expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('pt-br-general'),
    );
    expect(new URLSearchParams(source.currentSearch()).get('rulesSnapshot')).toMatch(/^v1\./);

    const card = (await screen.findByRole('heading', { name: 'Qwerty', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    const analyzeLink = within(card).getByRole('link', { name: 'Analyze Qwerty' });
    const analyzeHref = new URL(analyzeLink.getAttribute('href') ?? '', window.location.origin);
    expect(analyzeHref.search).not.toContain('rulesSnapshot');
    expect(new URLSearchParams(analyzeHref.hash.slice(1)).get('rulesSnapshot')).toMatch(/^v1\./);

    const previousAnalyses = client.analyses.length;
    await user.click(analyzeLink);
    await waitFor(() => expect(source.currentPath()).toBe('/analyze'));
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => {
      expect(client.analyses.length).toBeGreaterThan(previousAnalyses);
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
    });
    expect(new URLSearchParams(source.currentSearch()).get('corpus')).toBe('pt-br-general');
    expect(
      get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
    ).toHaveLength(0);
  }, 60_000);

  it('drops embedded custom rules when the Library selects another rule set', async () => {
    const user = userEvent.setup();
    const snapshot = encodeRuleSnapshot({
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    });
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'qwerty',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const client = new RecordingClient();
    const source = renderRoute(href.replace(window.location.origin, ''), {
      client,
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Library',
      }),
    );
    await screen.findByRole('heading', { name: 'Layouts' });
    await user.click(screen.getByRole('button', { name: 'Rank and filter' }));
    const ruleSet = await screen.findByRole('combobox', { name: 'Rule set' });
    await user.selectOptions(ruleSet, 'cyanophage');
    await waitFor(() =>
      expect(new URLSearchParams(source.currentSearch()).get('rules')).toBe('cyanophage'),
    );
    expect(new URLSearchParams(source.currentSearch()).has('rulesSnapshot')).toBe(false);

    const card = (await screen.findByRole('heading', { name: 'Qwerty', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    const analyzeLink = within(card).getByRole('link', { name: 'Analyze Qwerty' });
    const analyzeHref = new URL(analyzeLink.getAttribute('href') ?? '', window.location.origin);
    expect(analyzeHref.searchParams.get('rules')).toBe('cyanophage');
    expect(new URLSearchParams(analyzeHref.hash.slice(1)).has('rulesSnapshot')).toBe(false);

    const previousAnalyses = client.analyses.length;
    await user.click(analyzeLink);
    await waitFor(() => expect(source.currentPath()).toBe('/analyze'));
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => {
      expect(client.analyses.length).toBeGreaterThan(previousAnalyses);
      expect(client.analyses.at(-1)?.settings.rules.id).toBe('cyanophage');
    });
  }, 60_000);

  it('drops an inherited snapshot when Rules explicitly selects another set', async () => {
    const user = userEvent.setup();
    const snapshot = encodeRuleSnapshot({
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    });
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'qwerty',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const client = new RecordingClient();
    const source = renderRoute(href.replace(window.location.origin, ''), {
      client,
      storage: new MemoryStorage(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Rules',
      }),
    );

    const rulePicker = await screen.findByRole('combobox', { name: 'Rule set' });
    await user.selectOptions(rulePicker, 'cyanophage');
    await waitFor(() => expect(rulePicker).toHaveValue('cyanophage'));
    const analyzeLink = screen.getByRole('link', { name: 'Analyze with this set' });
    const analyzeHref = new URL(analyzeLink.getAttribute('href') ?? '', window.location.origin);
    expect(analyzeHref.searchParams.get('rules')).toBe('cyanophage');
    expect(new URLSearchParams(analyzeHref.hash.slice(1)).has('rulesSnapshot')).toBe(false);

    await user.click(analyzeLink);
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    await waitFor(() => expect(client.analyses.at(-1)?.settings.rules.id).toBe('cyanophage'));
    expect(new URLSearchParams(source.currentSearch()).has('rulesSnapshot')).toBe(false);
  }, 60_000);

  it('keeps shared custom rules when a custom Analyze layout is selected', async () => {
    const user = userEvent.setup();
    const sharedRules = {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    };
    const snapshot = encodeRuleSnapshot(sharedRules);
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'qwerty',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const storage = new MemoryStorage();
    await storage.put('rulesets', 'strict', {
      ...getPreset('layouts_doc'),
      id: 'strict',
      name: 'Different Local Strict',
    });
    await storage.put('layouts', 'mine', {
      ...toCanonicalJson(bundledLayout('colemak')!),
      id: 'mine',
      name: 'My Layout',
    });
    const get = vi.spyOn(storage, 'get');
    const client = new RecordingClient();
    const target = new URL(href);
    const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client,
      storage,
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });

    const picker = screen.getByRole('combobox', { name: 'Layout' });
    await user.selectOptions(picker, 'custom:mine');

    await waitFor(async () => {
      expect(await customInLink(source.currentSearch())).toBe('mine');
      const search = new URLSearchParams(source.currentSearch());
      expect(search.get('share')).toBe('1');
      expect(search.get('rulesSnapshot')).toBe(snapshot);
    });
    await waitFor(() => expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict'));
    expect(
      get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
    ).toHaveLength(0);
  }, 60_000);

  it.each(['Heat', 'Layout', 'Saved layout'])(
    'keeps Analyze open when changing %s exceeds the URL limit',
    async (field) => {
      useToasts.setState({ toasts: [] });
      const rule = { ...getPreset('cyanophage'), id: 'strict', name: 'Shared Strict' };
      const target = {
        baseHref: '/analyze',
        origin: window.location.origin,
        route: 'analyze' as const,
        search: { layout: 'qwerty', corpus: 'en-general', sample: '10000', rules: 'custom:strict' },
      };
      const baseline = await buildPortableTarget({
        ...target,
        rulesSnapshot: encodeRuleSnapshot({ ...rule, description: 'x' }),
      });
      const snapshot = (size: number) =>
        encodeRuleSnapshot({
          ...rule,
          description: 'x'.repeat(size),
        });
      const prefix = baseline.slice(0, baseline.indexOf('#'));
      const href = `${prefix}#rulesSnapshot=${snapshot(Math.floor(((2_097_150 - baseline.length) * 3) / 4) + 1)}`;
      expect(href.length).toBeGreaterThanOrEqual(2_097_149);
      expect(href.length).toBeLessThan(2_097_152);
      const url = new URL(href);
      const storage = new MemoryStorage();
      const id = 'oversized-saved-colemak';
      if (field === 'Saved layout')
        await storage.put('layouts', id, {
          ...toCanonicalJson(bundledLayout('colemak')!),
          id,
          name: 'Oversized saved Colemak',
          description: 'x'.repeat(2_000_001),
        });
      const source = renderRoute(`${url.pathname}${url.search}${url.hash}`, {
        client: new RecordingClient(),
        storage,
      });
      await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
      const picker = screen.getByRole('combobox', { name: field === 'Heat' ? 'Heat' : 'Layout' });
      const before = source.currentSearch();
      const next =
        field === 'Heat' ? 'effort' : field === 'Layout' ? 'magic-romak' : `custom:${id}`;
      if (field === 'Saved layout')
        await within(picker).findByRole('option', { name: 'Oversized saved Colemak' });
      await userEvent.selectOptions(picker, next);
      await waitFor(
        () =>
          expect(useToasts.getState().toasts.map(({ text }) => text)).toEqual(
            expect.arrayContaining([expect.stringMatching(/analysis URL too long/i)]),
          ),
        { container: document.createElement('div') },
      );
      expect(source.currentSearch()).toBe(before);
      expect(picker).toHaveValue(field === 'Heat' ? 'usage' : 'qwerty');
    },
    60_000,
  );

  it.each(['URL limit', '2 MB limit'])(
    'keeps oversized layouts usable after %s fallback',
    async (limit) => {
      const user = userEvent.setup();
      useToasts.setState({ toasts: [] });
      const snapshot = encodeRuleSnapshot({
        ...getPreset('cyanophage'),
        id: 'strict',
        name: 'Shared Strict',
        description: limit === '2 MB limit' ? '' : 'x'.repeat(1_450_000),
      });
      const href = await buildPortableTarget({
        baseHref: '/analyze',
        origin: window.location.origin,
        route: 'analyze',
        search: {
          layout: 'qwerty',
          corpus: 'en-general',
          sample: '10000',
          rules: 'custom:strict',
        },
        rulesSnapshot: snapshot,
      });
      if (limit === 'URL limit') expect(href.length).toBeGreaterThan(1_900_000);
      expect(href.length).toBeLessThan(2_097_152);

      let seed = 17;
      const chars = new Array<string>(360_000);
      for (let i = 0; i < chars.length; i++) {
        seed = (seed * 48_271) % 2_147_483_647;
        chars[i] = String.fromCharCode(32 + (seed % 95));
      }
      const customLayout: Layout = {
        ...bundledLayout('magic-romak')!,
        id: 'mine',
        name: 'My Large Layout',
        description: limit === '2 MB limit' ? 'x'.repeat(MAX_INLINE_BYTES + 1) : chars.join(''),
      };
      const inline = `inline:${await encodeInline(customLayout)}`;
      await expect(
        buildPortableTarget({
          baseHref: '/analyze',
          origin: window.location.origin,
          route: 'analyze',
          search: {
            layout: inline,
            corpus: 'en-general',
            sample: '10000',
            rules: 'custom:strict',
          },
          rulesSnapshot: snapshot,
        }),
      ).rejects.toThrow(limit === '2 MB limit' ? /2 MB limit/i : /too long for browsers to open/i);

      const storage = new MemoryStorage();
      await storage.put('layouts', 'mine', toCanonicalJson(customLayout));
      const client = new RecordingClient();
      const target = new URL(href);
      const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
        client,
        storage,
      });
      await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });

      await user.selectOptions(screen.getByRole('combobox', { name: 'Layout' }), 'custom:mine');

      await waitFor(() =>
        expect(source.currentSearch()).toMatch(/layout=(?:custom%3Amine|inline%3A)/),
      );
      await waitFor(() => {
        expect(client.analyses.at(-1)?.layout.name).toBe('My Large Layout');
        expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
      });
      expect(source.currentPath()).toBe('/analyze');
      expect(await screen.findByRole('region', { name: 'Layout' })).toBeInTheDocument();
      const initialSearch = new URLSearchParams(source.currentSearch());
      expect(initialSearch.get('share')).toBeNull();
      expect(initialSearch.get('layout')).toBe('custom:mine');
      expect(initialSearch.get('rulesSnapshot')).toBe(snapshot);
      const warning = await screen.findByRole('alert');
      expect(warning).toHaveTextContent(
        limit === '2 MB limit'
          ? /2 MB limit.*shorten/i
          : /open on this device.*shorten.*layout description.*smaller custom rule set/i,
      );
      await user.click(within(warning).getByRole('button', { name: 'close' }));

      const layoutRegion = screen.getByRole('region', { name: 'Layout' });
      const name = within(layoutRegion).getByLabelText('Name');
      await user.clear(name);
      await user.type(name, 'Renamed Large Layout');
      await user.click(within(layoutRegion).getByRole('button', { name: 'Save' }));
      await waitFor(async () => {
        const search = new URLSearchParams(source.currentSearch());
        expect(search.get('layout')).toBe('custom:renamed-large-layout');
        expect(search.get('share')).toBeNull();
        expect(search.get('rulesSnapshot')).toBe(snapshot);
        expect((await storage.list('layouts')).map(({ id }) => id)).toEqual([
          'renamed-large-layout',
        ]);
      });

      const localUrl = new URL('/analyze', window.location.origin);
      const localSearch = new URLSearchParams(source.currentSearch());
      localSearch.delete('rulesSnapshot');
      localUrl.search = localSearch.toString();
      localUrl.hash = new URLSearchParams({ rulesSnapshot: snapshot }).toString();
      expect(localUrl.href.length).toBeLessThan(2_097_152);

      await openSettings();
      const description = screen.getByRole('textbox', { name: 'Description' });
      await user.clear(description);
      await user.type(description, 'short');
      await user.click(screen.getByRole('button', { name: 'Done' }));
      await waitFor(() =>
        expect(new URLSearchParams(source.currentSearch()).get('share')).toBe('1'),
      );

      await user.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => {
        const search = new URLSearchParams(source.currentSearch());
        expect(search.get('layout')).toBe('custom:renamed-large-layout');
        expect(search.get('share')).toBeNull();
        expect(search.get('rulesSnapshot')).toBe(snapshot);
      });
      expect(await screen.findByRole('region', { name: 'Layout' })).toBeInTheDocument();

      const fallbackSearch = new URLSearchParams(source.currentSearch());
      const fallbackSnapshot = fallbackSearch.get('rulesSnapshot');
      fallbackSearch.delete('rulesSnapshot');
      localUrl.search = fallbackSearch.toString();
      localUrl.hash = new URLSearchParams({
        rulesSnapshot: fallbackSnapshot ?? '',
      }).toString();
      expect(localUrl.href.length).toBeLessThan(2_097_152);
      source.unmount();

      const reloaded = renderRoute(`${localUrl.pathname}${localUrl.search}${localUrl.hash}`, {
        client: new RecordingClient(),
        storage,
      });
      await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
      await waitFor(() => {
        const search = new URLSearchParams(reloaded.currentSearch());
        expect(search.get('layout')).toBe('custom:renamed-large-layout');
        expect(search.get('share')).toBeNull();
        expect(search.get('rulesSnapshot')).toBe(snapshot);
      });
      expect(await screen.findByRole('region', { name: 'Layout' })).toBeInTheDocument();

      await showLayer(user, 'Alpha 2');
      await user.click(screen.getByRole('button', { name: 'Compare' }));
      await screen.findByRole('group', { name: 'Layers of A' }, { timeout: 25_000 });
      expect(shownLayer('Layers of A')).toBe('Alpha 2');
      await waitFor(
        () =>
          expect(useToasts.getState().toasts.map(({ text }) => text)).toEqual(
            expect.arrayContaining([
              expect.stringMatching(
                limit === '2 MB limit'
                  ? /2 MB limit.*shorten/i
                  : /comparison URL too long.*shorten the layout description/i,
              ),
            ]),
          ),
        { timeout: 25_000, container: document.createElement('div') },
      );
      await waitFor(() => {
        const compareSearch = new URLSearchParams(reloaded.currentSearch());
        expect(reloaded.currentPath()).toBe('/compare');
        expect(compareSearch.get('layout')).toBe('custom:renamed-large-layout');
        expect(compareSearch.get('share')).toBeNull();
        expect(compareSearch.get('rulesSnapshot')).toBe(snapshot);
      });
    },
    60_000,
  );

  it.each(['URL limit', '2 MB limit'])(
    'uses the compact ID on the first save when the snapshot exceeds the %s',
    async (limit) => {
      const user = userEvent.setup();
      const snapshot = encodeRuleSnapshot({
        ...getPreset('cyanophage'),
        id: 'strict',
        name: 'Shared Strict',
        description: 'x'.repeat(1_450_000),
      });
      const href = await buildPortableTarget({
        baseHref: '/analyze',
        origin: window.location.origin,
        route: 'analyze',
        search: { layout: 'qwerty', corpus: 'en-general', sample: '10000', rules: 'custom:strict' },
        rulesSnapshot: snapshot,
      });
      const target = new URL(href);
      const storage = new MemoryStorage();
      const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
        client: new RecordingClient(),
        storage,
      });
      const region = await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
      await openSettings();
      let seed = 17;
      const description =
        limit === '2 MB limit'
          ? 'x'.repeat(2_000_001)
          : Array.from({ length: 360_000 }, () => {
              seed = (seed * 48_271) % 2_147_483_647;
              return String.fromCharCode(32 + (seed % 95));
            }).join('');
      const field = screen.getByRole('textbox', { name: 'Description' });
      fireEvent.change(field, { target: { value: description } });
      fireEvent.blur(field);
      await user.click(screen.getByRole('button', { name: 'Done' }));
      if (limit === '2 MB limit') {
        await user.click(screen.getByRole('button', { name: 'Compare' }));
        await waitFor(
          () => {
            expect(
              useToasts
                .getState()
                .toasts.some(({ text }) => /too large to open in Compare/i.test(text)),
            ).toBe(true);
            expect(source.currentPath()).toBe('/analyze');
          },
          { container: document.createElement('div') },
        );
      }
      await user.click(within(region).getByRole('button', { name: 'Save' }));
      const choice = await screen.findByRole('dialog', { name: 'Save Qwerty' });
      await user.click(within(choice).getByRole('button', { name: 'Save a copy' }));
      const dialog = within(copyDialog());
      const name = dialog.getByLabelText('Name of the copy');
      await user.clear(name);
      await user.type(name, 'My First Copy');
      await user.click(dialog.getByRole('button', { name: 'Save copy' }));
      await waitFor(
        () =>
          expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe(
            'custom:my-first-copy',
          ),
        { timeout: 25_000, container: document.createElement('div') },
      );
      const search = new URLSearchParams(source.currentSearch());
      expect(search.get('share')).toBeNull();
      expect(search.get('rulesSnapshot')).toBe(snapshot);
      search.delete('rulesSnapshot');
      source.unmount();
      const client = new RecordingClient();
      renderRoute(`/analyze?${search}#rulesSnapshot=${snapshot}`, { client, storage });
      await waitFor(
        () => {
          expect(client.analyses.at(-1)?.layout.name).toBe('My First Copy');
          expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
        },
        { timeout: 25_000, container: document.createElement('div') },
      );
    },
    60_000,
  );

  it('opens a saved layout over the 2 MB limit in Analyze by its local ID', async () => {
    const snapshot = encodeRuleSnapshot({
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    });
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: { layout: 'qwerty', corpus: 'en-general', sample: '10000', rules: 'custom:strict' },
      rulesSnapshot: snapshot,
    });
    const storage = new MemoryStorage();
    await storage.put(
      'layouts',
      'mine',
      toCanonicalJson({
        ...bundledLayout('colemak')!,
        id: 'mine',
        name: 'My Large Layout',
        description: 'x'.repeat(2_000_001),
      }),
    );
    const client = new RecordingClient();
    const target = new URL(href);
    const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client,
      storage,
    });
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Layout' }),
      'custom:mine',
    );
    await waitFor(() => {
      const search = new URLSearchParams(source.currentSearch());
      expect(search.get('layout')).toBe('custom:mine');
      expect(search.get('share')).toBeNull();
      expect(search.get('rulesSnapshot')).toBe(snapshot);
      expect(client.analyses.at(-1)?.layout.name).toBe('My Large Layout');
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
    });
  }, 60_000);

  it('does not let a pending Analyze pick survive Back and Forward before effects run', async () => {
    const user = userEvent.setup();
    const snapshot = encodeRuleSnapshot({
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    });
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: window.location.origin,
      route: 'analyze',
      search: {
        layout: 'qwerty',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const target = new URL(href);
    const ordinary = '/analyze?corpus=en-general&layout=qwerty&rules=cyanophage&sample=10000';
    const storage = new MemoryStorage();
    await storage.put('layouts', 'mine', {
      ...toCanonicalJson(bundledLayout('colemak')!),
      id: 'mine',
      name: 'My Layout',
    });
    let releaseRead = () => {};
    let signalReadStarted = () => {};
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve;
    });
    const readMayFinish = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const originalGet = storage.get.bind(storage);
    vi.spyOn(storage, 'get').mockImplementation(async (collection, id) => {
      if (collection === 'layouts' && id === 'mine') {
        signalReadStarted();
        await readMayFinish;
      }
      return originalGet(collection, id);
    });
    const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client: new RecordingClient(),
      storage,
      historyEntries: [ordinary, `${target.pathname}${target.search}${target.hash}`],
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout' }), 'custom:mine');
    await readStarted;

    source.backAndForward();
    releaseRead();
    await waitFor(() => {
      expect(source.currentPath()).toBe('/analyze');
      const search = new URLSearchParams(source.currentSearch());
      expect(search.get('rules')).toBe('custom:strict');
      expect(search.get('layout')).toBe('qwerty');
      expect(search.get('rulesSnapshot')).toBe(snapshot);
      expect(search.get('share')).toBe('1');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const search = new URLSearchParams(source.currentSearch());
    expect(search.get('layout')).toBe('qwerty');
    expect(search.get('rules')).toBe('custom:strict');
    expect(search.get('rulesSnapshot')).toBe(snapshot);
    expect(search.get('share')).toBe('1');
    expect(screen.queryByRole('alert')).toBeNull();
  }, 60_000);

  it('keeps shared custom rules when a custom Compare layout is selected', async () => {
    const user = userEvent.setup();
    const sharedRules = {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    };
    const snapshot = encodeRuleSnapshot(sharedRules);
    const href = await buildPortableTarget({
      baseHref: '/compare',
      origin: window.location.origin,
      route: 'compare',
      search: {
        layout: 'qwerty',
        b: 'colemak',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      },
      rulesSnapshot: snapshot,
    });
    const storage = new MemoryStorage();
    await storage.put('rulesets', 'strict', {
      ...getPreset('layouts_doc'),
      id: 'strict',
      name: 'Different Local Strict',
    });
    await storage.put('layouts', 'mine', {
      ...toCanonicalJson(bundledLayout('dvorak')!),
      id: 'mine',
      name: 'My Layout',
    });
    await storage.put('layouts', 'theirs', {
      ...toCanonicalJson(bundledLayout('colemak')!),
      id: 'theirs',
      name: 'Their Layout',
    });
    let releaseRead = () => {};
    let signalReadStarted = () => {};
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve;
    });
    const readMayFinish = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const originalGet = storage.get.bind(storage);
    const get = vi.spyOn(storage, 'get').mockImplementation(async (collection, id) => {
      if (collection === 'layouts' && id === 'mine') {
        signalReadStarted();
        await readMayFinish;
      }
      return originalGet(collection, id);
    });
    const client = new RecordingClient();
    const target = new URL(href);
    const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client,
      storage,
    });
    await screen.findByRole('group', { name: 'Layers of A' }, { timeout: 25_000 });
    await screen.findByRole('group', { name: 'Layers of B' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout A' }), 'custom:mine');

    await readStarted;
    try {
      expect(new URLSearchParams(source.currentSearch().split('#')[0]).get('share')).toBe('1');
    } finally {
      releaseRead();
    }

    await waitFor(async () => {
      expect(await customInLink(source.currentSearch())).toBe('mine');
      const search = new URLSearchParams(source.currentSearch());
      expect(search.get('share')).toBe('1');
      expect(search.get('rulesSnapshot')).toBe(snapshot);
    });
    await waitFor(() => {
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout B' }), 'custom:theirs');
    await waitFor(async () => {
      const search = new URLSearchParams(source.currentSearch());
      expect(search.get('share')).toBe('1');
      expect(search.get('rulesSnapshot')).toBe(snapshot);
      const refB = search.get('b') ?? '';
      expect(refB).toMatch(/^inline:/);
      const decodedB = await decodeInline(refB.slice('inline:'.length));
      expect(decodedB).toMatchObject({ ok: true, layout: { id: 'theirs' } });
    });
    expect(
      get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
    ).toHaveLength(0);
  }, 60_000);

  it.each(['layout change', 'oversized draft'])(
    'keeps shared Analyze rules after switching to private text: %s',
    async (action) => {
      const user = userEvent.setup();
      const engine = testClient();
      const privateCorpus = await engine.buildCustomCorpus(
        'private notes stay local for analysis',
        'Private notes',
        'en',
      );
      const rule = {
        ...getPreset('cyanophage'),
        id: 'strict',
        name: 'Shared Strict',
        description: '',
      };
      const input = {
        baseHref: '/analyze',
        origin: window.location.origin,
        route: 'analyze' as const,
        search: {
          layout: 'qwerty',
          corpus: 'en-general',
          sample: '10000',
          rules: 'custom:strict',
        },
      };
      const baseline = await buildPortableTarget({
        ...input,
        rulesSnapshot: encodeRuleSnapshot(rule),
      });
      const snapshot = encodeRuleSnapshot({
        ...rule,
        description:
          action === 'oversized draft'
            ? 'x'.repeat(Math.floor(((2_097_020 - baseline.length) * 3) / 4))
            : '',
      });
      const href = await buildPortableTarget({ ...input, rulesSnapshot: snapshot });
      const storage = new MemoryStorage();
      await storage.put('corpora', 'private-notes', await engine.corpusDocument(privateCorpus.id));
      await storage.put('rulesets', 'strict', {
        ...getPreset('layouts_doc'),
        id: 'strict',
        name: 'Different Local Strict',
      });
      const get = vi.spyOn(storage, 'get');
      const client = new RecordingClient(engine);
      const target = new URL(href);
      const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
        client,
        storage,
      });
      await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });

      const settings = await openSettings();
      await user.selectOptions(
        within(settings).getByRole('combobox', { name: 'Corpus' }),
        'custom:private-notes',
      );
      await user.click(within(settings).getByRole('button', { name: 'Done' }));

      expect(new URLSearchParams(source.currentSearch()).has('share')).toBe(false);
      await waitFor(() =>
        expect(
          client.analyses.some(
            (analysis) =>
              analysis.settings.corpus.startsWith('custom:private-notes@') &&
              analysis.settings.rules.name === 'Shared Strict',
          ),
        ).toBe(true),
      );

      if (action === 'oversized draft') {
        useToasts.setState({ toasts: [] });
        const before = source.currentSearch();
        const edit = await openSettings();
        const description = within(edit).getByRole('textbox', { name: 'Description' });
        const original = (description as HTMLTextAreaElement).value;
        await user.type(description, 'Private draft');
        await user.click(within(edit).getByRole('button', { name: 'Done' }));
        await waitFor(
          () =>
            expect(
              useToasts.getState().toasts.some(({ text }) => /URL would be too long/i.test(text)),
            ).toBe(true),
          { container: document.createElement('div') },
        );
        expect(
          within(await openSettings()).getByRole('textbox', { name: 'Description' }),
        ).toHaveValue(`${original}Private draft`);
        expect(source.currentSearch()).toBe(before);
        expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
        return;
      }
      await user.selectOptions(screen.getByRole('combobox', { name: 'Layout' }), 'colemak');
      await waitFor(() => expect(client.analyses.at(-1)?.layout.name).toBe('Colemak'));
      await waitFor(() => {
        const search = new URLSearchParams(source.currentSearch());
        expect(search.has('share')).toBe(false);
        expect(search.get('rulesSnapshot')).toBe(snapshot);
      });
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
      expect(
        get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
      ).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'Share link' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /custom corpus text stays on this device/i,
      );

      const nav = screen.getByRole('navigation', { name: 'Main' });
      await user.click(within(nav).getByRole('link', { name: 'Compare' }));
      await screen.findByRole('group', { name: 'Layers of A' });
      await screen.findByRole('group', { name: 'Layers of B' });
      await waitFor(() => {
        expect(source.currentPath()).toBe('/compare');
        const search = new URLSearchParams(source.currentSearch());
        expect(search.has('share')).toBe(false);
        expect(search.get('rulesSnapshot')).toBe(snapshot);
      });
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
      expect(
        get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
      ).toHaveLength(0);

      await user.click(within(nav).getByRole('link', { name: 'Analyze' }));
      await screen.findByRole('region', { name: 'Layout' });
      await waitFor(() => {
        expect(source.currentPath()).toBe('/analyze');
        const search = new URLSearchParams(source.currentSearch());
        expect(search.has('share')).toBe(false);
        expect(search.get('rulesSnapshot')).toBe(snapshot);
      });
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
      expect(
        get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
      ).toHaveLength(0);
    },
    60_000,
  );

  it.each(['fits', 'overflows', 'request overflows'])(
    'keeps Compare rules when a private corpus %s',
    async (budget) => {
      useToasts.setState({ toasts: [] });
      const user = userEvent.setup();
      const engine = testClient();
      const privateCorpus = await engine.buildCustomCorpus(
        'private notes stay local for comparison',
        'Private notes',
        'en',
      );
      const rule = {
        ...getPreset('cyanophage'),
        id: budget === 'request overflows' ? 'x'.repeat(7_740) : 'strict',
        name: 'Shared Strict',
        description: '',
      };
      const input = {
        baseHref: '/compare',
        origin: window.location.origin,
        route: 'compare' as const,
        search: {
          layout: 'qwerty',
          b: 'colemak',
          corpus: 'en-general',
          corpus2: 'pt-br-general',
          mix: '60',
          sample: '10000',
          rules: `custom:${rule.id}`,
        },
      };
      const baseline = await buildPortableTarget({
        ...input,
        rulesSnapshot: encodeRuleSnapshot(rule),
      });
      const snapshot = encodeRuleSnapshot({
        ...rule,
        ...(budget === 'overflows' && {
          description: 'x'.repeat(Math.floor(((2_097_130 - baseline.length) * 3) / 4)),
        }),
      });
      const href = await buildPortableTarget({ ...input, rulesSnapshot: snapshot });
      const storage = new MemoryStorage();
      const privateId = budget !== 'fits' ? `private-notes-${'x'.repeat(128)}` : 'private-notes';
      await storage.put('corpora', privateId, await engine.corpusDocument(privateCorpus.id));
      await storage.put('rulesets', 'strict', {
        ...getPreset('layouts_doc'),
        id: 'strict',
        name: 'Different Local Strict',
      });
      const get = vi.spyOn(storage, 'get');
      const client = new RecordingClient(engine);
      const target = new URL(href);
      const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
        client,
        storage,
      });
      await screen.findByRole('group', { name: 'Layers of A' }, { timeout: 25_000 });
      await screen.findByRole('group', { name: 'Layers of B' });

      const settings = await openSettings();
      const before = source.currentSearch();
      const destination = new URL(href);
      destination.searchParams.delete('share');
      destination.searchParams.set('corpus2', `custom:${privateId}`);
      expect(
        destination.href.length >= 2_097_152,
        `${href.length} → ${destination.href.length}`,
      ).toBe(budget === 'overflows');
      await user.selectOptions(
        within(settings).getByRole('combobox', { name: 'Mix with' }),
        `custom:${privateId}`,
      );

      if (budget === 'request overflows')
        expect(destination.pathname.length + destination.search.length).toBeGreaterThan(7_898);
      if (budget !== 'fits') {
        await waitFor(
          () =>
            expect(
              useToasts.getState().toasts.some(({ text }) => /comparison URL too long/i.test(text)),
            ).toBe(true),
          { container: document.createElement('div') },
        );
        expect(source.currentSearch() === before).toBe(true);
        expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
        return;
      }
      await user.click(within(settings).getByRole('button', { name: 'Done' }));
      expect(new URLSearchParams(source.currentSearch()).has('share')).toBe(false);
      await waitFor(() =>
        expect(
          client.analyses.some(
            (analysis) =>
              analysis.settings.corpus2?.startsWith('custom:private-notes@') &&
              analysis.settings.rules.name === 'Shared Strict',
          ),
        ).toBe(true),
      );
      await user.click(screen.getByRole('button', { name: 'Share link' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /custom corpus text stays on this device/i,
      );
      expect(
        client.analyses.some(
          (analysis) => analysis.settings.rules.name === 'Different Local Strict',
        ),
      ).toBe(false);

      await user.click(screen.getByRole('link', { name: 'Analyze A' }));
      await screen.findByRole('region', { name: 'Layout' });
      await waitFor(() => {
        expect(source.currentPath()).toBe('/analyze');
        const search = new URLSearchParams(source.currentSearch());
        expect(search.has('share')).toBe(false);
        expect(search.get('rulesSnapshot')).toBe(snapshot);
      });
      expect(client.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
      expect(
        get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
      ).toHaveLength(0);
    },
    60_000,
  );

  it('shows an error instead of loading a local custom set when a portable snapshot is missing', async () => {
    const storage = new MemoryStorage();
    await storage.put('rulesets', 'strict', {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Local Strict',
    });
    const get = vi.spyOn(storage, 'get');
    const client = new RecordingClient();
    renderRoute('/analyze?corpus=en-general&layout=qwerty&rules=custom%3Astrict&share=1', {
      client,
      storage,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /missing its custom rule-set snapshot/i,
    );
    expect(client.analyses).toHaveLength(0);
    expect(
      get.mock.calls.filter(([collection, id]) => collection === 'rulesets' && id === 'strict'),
    ).toHaveLength(0);
  });

  it('refuses a hand-edited portable target that names a custom corpus', async () => {
    const client = new RecordingClient();
    renderRoute('/analyze?corpus=custom%3Aprivate-notes&layout=qwerty&share=1', {
      client,
      storage: new MemoryStorage(),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /custom corpus text stays on this device/i,
    );
    expect(client.analyses).toHaveLength(0);
  });

  it.each([
    ['Layout A', 'URL too long'],
    ['Layout B', 'URL too long'],
    ['Layout A', '2 MB limit'],
  ] as const)(
    'keeps Compare unchanged when selecting a local layout for %s exceeds the %s budget',
    async (side, limit) => {
      const user = userEvent.setup();
      useToasts.setState({ toasts: [] });
      const snapshot = encodeRuleSnapshot({
        ...getPreset('cyanophage'),
        id: 'strict',
        name: 'Shared Strict',
        description: 'x'.repeat(1_450_000),
      });
      const initialSearch = {
        layout: 'qwerty',
        b: 'rsthd',
        corpus: 'en-general',
        sample: '10000',
        rules: 'custom:strict',
      };
      const href = await buildPortableTarget({
        baseHref: '/compare',
        origin: window.location.origin,
        route: 'compare',
        search: initialSearch,
        rulesSnapshot: snapshot,
      });
      expect(href.length).toBeGreaterThan(1_900_000);
      expect(href.length).toBeLessThan(2_097_152);

      let seed = 29;
      const chars = new Array<string>(360_000);
      for (let i = 0; i < chars.length; i++) {
        seed = (seed * 48_271) % 2_147_483_647;
        chars[i] = String.fromCharCode(32 + (seed % 95));
      }
      const customLayout: Layout = {
        ...bundledLayout('colemak')!,
        id: 'mine',
        name: 'My Large Layout',
        description: limit === '2 MB limit' ? 'x'.repeat(2_000_001) : chars.join(''),
      };
      const inline = `inline:${await encodeInline(customLayout)}`;
      await expect(
        buildPortableTarget({
          baseHref: '/compare',
          origin: window.location.origin,
          route: 'compare',
          search: {
            ...initialSearch,
            ...(side === 'Layout A' ? { layout: inline } : { b: inline }),
          },
          rulesSnapshot: snapshot,
        }),
      ).rejects.toThrow(limit === '2 MB limit' ? /2 MB limit/i : /too long for browsers to open/i);

      const storage = new MemoryStorage();
      await storage.put('layouts', 'mine', toCanonicalJson(customLayout));
      const client = new RecordingClient();
      const target = new URL(href);
      const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
        client,
        storage,
      });
      await screen.findByRole('group', { name: 'Layers of A' }, { timeout: 25_000 });
      await screen.findByRole('group', { name: 'Layers of B' }, { timeout: 25_000 });

      await user.selectOptions(screen.getByRole('combobox', { name: side }), 'custom:mine');

      const warning = await screen.findByRole('alert');
      expect(warning).toHaveTextContent(
        limit === '2 MB limit'
          ? /2 MB limit.*shorten/i
          : /shared comparison URL too long.*current comparison is unchanged/i,
      );
      const currentSearch = new URLSearchParams(source.currentSearch());
      expect(source.currentPath()).toBe('/compare');
      expect(currentSearch.get('share')).toBe('1');
      expect(currentSearch.get('layout')).toBe('qwerty');
      expect(currentSearch.get('b')).toBe('rsthd');
      expect(currentSearch.get('rulesSnapshot')).toBe(snapshot);
      expect(screen.getByRole('group', { name: 'Layers of A' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Layers of B' })).toBeInTheDocument();
    },
    60_000,
  );

  it('shares Compare layouts in their original order with each selected layer restored', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const source = renderRoute(
      '/compare?layout=magic-romak&b=rsthd&corpus=pt-br-general&sample=10000&layer=2',
      { storage: new MemoryStorage() },
    );
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    await showLayer(user, 'Alpha 2', 'Layers of A');
    await showLayer(user, 'Symbols', 'Layers of B');

    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect(target.searchParams.get('layout')).toBe('magic-romak');
    expect(target.searchParams.get('b')).toBe('rsthd');
    expect(target.searchParams.get('layerA')).toBe('1');
    expect(target.searchParams.get('layerB')).toBe('1');
    expect(target.searchParams.has('layer')).toBe(false);
    source.unmount();

    renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      storage: new MemoryStorage(),
    });
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    await waitFor(() => expect(shownLayer('Layers of A')).toBe('Alpha 2'));
    expect(shownLayer('Layers of B')).toBe('Symbols');
  }, 60_000);

  it('snapshots both currently loaded custom Compare layouts without using stale local references', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const storage = new MemoryStorage();
    const left = {
      ...toCanonicalJson(bundledLayout('qwerty')!),
      id: 'left-layout',
      name: 'Left custom',
      description: `Left snapshot ${'a'.repeat(1_100_000)}`,
    };
    const right = {
      ...toCanonicalJson(bundledLayout('colemak')!),
      id: 'right-layout',
      name: 'Right custom',
      description: `Right snapshot ${'b'.repeat(1_100_000)}`,
    };
    await storage.put('layouts', 'left-layout', left);
    await storage.put('layouts', 'right-layout', right);
    const source = renderRoute(
      '/compare?layout=custom%3Aleft-layout&b=custom%3Aright-layout&corpus=en-general&sample=10000',
      { storage },
    );
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    await screen.findByText('A: Left custom');
    await screen.findByText('B: Right custom');

    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect((target.pathname + target.search).length).toBeLessThan(7_900);
    expect(target.search).not.toContain('inline');
    const fragment = new URLSearchParams(target.hash.slice(1));
    const refA = fragment.get('layout') ?? '';
    const refB = fragment.get('b') ?? '';
    expect(refA).toMatch(/^inline:/);
    expect(refB).toMatch(/^inline:/);
    const [decodedA, decodedB] = await Promise.all([
      decodeInline(refA.slice('inline:'.length)),
      decodeInline(refB.slice('inline:'.length)),
    ]);
    expect(decodedA).toMatchObject({ ok: true, layout: { name: 'Left custom' } });
    expect(decodedB).toMatchObject({ ok: true, layout: { name: 'Right custom' } });
    if (decodedA.ok) expect(decodedA.layout.description).toHaveLength(1_100_014);
    if (decodedB.ok) expect(decodedB.layout.description).toHaveLength(1_100_015);
    source.unmount();

    renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      storage: new MemoryStorage(),
    });
    expect(await screen.findByText('A: Left custom')).toBeInTheDocument();
    expect(await screen.findByText('B: Right custom')).toBeInTheDocument();
  }, 60_000);

  it('shares the loaded layouts while their local refs are being replaced by inline refs', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    const blockDecompression = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const NativeDecompressionStream = globalThis.DecompressionStream;
    vi.stubGlobal(
      'DecompressionStream',
      class {
        constructor() {
          blockDecompression();
        }

        readable = new ReadableStream<Uint8Array>({ start() {} });
        writable = new WritableStream<Uint8Array>({
          write: () => new Promise<void>(() => {}),
        });
      },
    );

    const storage = new MemoryStorage();
    await storage.put('layouts', 'left-layout', {
      ...toCanonicalJson(bundledLayout('qwerty')!),
      id: 'left-layout',
      name: 'Left custom',
    });
    await storage.put('layouts', 'right-layout', {
      ...toCanonicalJson(bundledLayout('colemak')!),
      id: 'right-layout',
      name: 'Right custom',
    });
    const source = renderRoute(
      '/compare?layout=custom%3Aleft-layout&b=custom%3Aright-layout&corpus=en-general&sample=10000',
      { storage },
    );
    await screen.findByText('A: Left custom');
    await screen.findByText('B: Right custom');
    await waitFor(() => {
      expect(new URLSearchParams(source.currentSearch()).get('layout')).toMatch(/^inline:/);
      expect(new URLSearchParams(source.currentSearch()).get('b')).toMatch(/^inline:/);
      expect(blockDecompression).toHaveBeenCalled();
    });

    vi.stubGlobal('DecompressionStream', NativeDecompressionStream);
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect(new URLSearchParams(target.hash.slice(1)).get('layout')).toMatch(/^inline:/);
    expect(new URLSearchParams(target.hash.slice(1)).get('b')).toMatch(/^inline:/);
    expect(await screen.findByRole('alert')).toHaveTextContent(/copied the link/i);

    source.unmount();
    renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      storage: new MemoryStorage(),
    });
    expect(await screen.findByText('A: Left custom')).toBeInTheDocument();
    expect(await screen.findByText('B: Right custom')).toBeInTheDocument();
  }, 60_000);

  it('carries a custom rule snapshot through Compare into clean storage', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const sourceStorage = new MemoryStorage();
    await sourceStorage.put('rulesets', 'strict', {
      ...getPreset('cyanophage'),
      id: 'strict',
      name: 'Shared Strict',
    });
    const source = renderRoute(
      '/compare?layout=qwerty&b=colemak&corpus=en-general&sample=10000&rules=custom%3Astrict',
      { storage: sourceStorage },
    );
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    const dialog = await openSettings();
    expect(
      await within(dialog).findAllByRole('option', { name: 'Shared Strict' }),
    ).not.toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));

    await user.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const target = new URL(writeText.mock.calls[0]?.[0] ?? '');
    expect(target.searchParams.get('rules')).toBe('custom:strict');
    expect(new URLSearchParams(target.hash.slice(1)).get('rulesSnapshot')).toMatch(/^v1\./);
    source.unmount();

    const reloadClient = new RecordingClient();
    const reloaded = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client: reloadClient,
      storage: new MemoryStorage(),
    });
    await waitFor(() => expect(reloadClient.analyses).toHaveLength(2));
    expect(reloadClient.analyses.map((request) => request.settings.rules.name)).toEqual([
      'Shared Strict',
      'Shared Strict',
    ]);

    for (const name of ['Analyze A', 'Analyze B']) {
      const link = screen.getByRole('link', { name });
      const href = new URL(link.getAttribute('href') ?? '', window.location.origin);
      expect(href.searchParams.get('share')).toBe('1');
      expect(new URLSearchParams(href.hash.slice(1)).get('rulesSnapshot')).toMatch(/^v1\./);
    }

    await user.click(screen.getByRole('link', { name: 'Analyze A' }));
    await screen.findByRole('region', { name: 'Layout' });
    await waitFor(() => expect(reloadClient.analyses).toHaveLength(3));
    expect(reloadClient.analyses.at(-1)?.settings.rules.name).toBe('Shared Strict');
    expect(reloaded.currentPath()).toBe('/analyze');
  }, 60_000);

  it('refuses to copy a target when either corpus in a mix is custom', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const engine = testClient();
    const built = await engine.buildCustomCorpus('private notes stay local', 'Private notes', 'en');
    const storage = new MemoryStorage();
    await storage.put('corpora', 'private-notes', await engine.corpusDocument(built.id));
    renderRoute(
      '/analyze?layout=qwerty&corpus=en-general&corpus2=custom%3Aprivate-notes&mix=60&sample=10000',
      { storage },
    );
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    const settings = await openSettings();
    expect(
      await within(settings).findAllByRole('option', { name: 'Private notes' }),
    ).not.toHaveLength(0);
    await user.click(within(settings).getByRole('button', { name: 'Done' }));

    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /custom corpus text stays on this device/i,
    );
    expect(writeText).not.toHaveBeenCalled();
  }, 60_000);

  it('refuses a custom corpus in Compare before copying any target', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const engine = testClient();
    const built = await engine.buildCustomCorpus('private notes stay local', 'Private notes', 'en');
    const storage = new MemoryStorage();
    await storage.put('corpora', 'private-notes', await engine.corpusDocument(built.id));
    renderRoute('/compare?layout=qwerty&b=colemak&corpus=custom%3Aprivate-notes&sample=10000', {
      client: engine,
      storage,
    });
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    const settings = await openSettings();
    expect(
      await within(settings).findAllByRole('option', { name: 'Private notes' }),
    ).not.toHaveLength(0);
    await user.click(within(settings).getByRole('button', { name: 'Done' }));

    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /custom corpus text stays on this device/i,
    );
    expect(writeText).not.toHaveBeenCalled();
  }, 60_000);
});
