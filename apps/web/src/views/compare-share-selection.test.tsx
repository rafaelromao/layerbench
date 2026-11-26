import { bundledLayout, toCanonicalJson } from '@layerbench/core';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../test/memory-storage.js';
import { RecordingClient } from '../test/recording-client.js';
import { openSettings, renderRoute } from '../test/render.js';
import { buildPortableTarget } from '../url/share-target.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function beginBlockedCustomPick() {
  const user = userEvent.setup();
  const target = await buildPortableTarget({
    baseHref: '/compare',
    origin: window.location.origin,
    route: 'compare',
    search: {
      layout: 'qwerty',
      b: 'colemak',
      corpus: 'en-general',
      sample: '10000',
    },
  });
  const storage = new MemoryStorage();
  await storage.put('layouts', 'mine', {
    ...toCanonicalJson(bundledLayout('dvorak')!),
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
  let releaseSecondRead = () => {};
  const secondReadMayFinish = new Promise<void>((resolve) => {
    releaseSecondRead = resolve;
  });
  let signalFirstReadFinished = () => {};
  const firstReadFinished = new Promise<void>((resolve) => {
    signalFirstReadFinished = resolve;
  });
  let reads = 0;
  const originalGet = storage.get.bind(storage);
  vi.spyOn(storage, 'get').mockImplementation(async (collection, id) => {
    if (collection === 'layouts' && id === 'mine') {
      signalReadStarted();
      const first = ++reads === 1;
      await (first ? readMayFinish : secondReadMayFinish);
      const result = await originalGet(collection, id);
      if (first) signalFirstReadFinished();
      return result;
    }
    return originalGet(collection, id);
  });
  const NativeCompressionStream = globalThis.CompressionStream;
  const compressionStarted = vi.fn();
  vi.stubGlobal(
    'CompressionStream',
    class extends NativeCompressionStream {
      constructor(format: CompressionFormat) {
        super(format);
        compressionStarted();
      }
    },
  );
  const client = new RecordingClient();
  const source = renderRoute(target.replace(window.location.origin, ''), { client, storage });
  await screen.findByRole('group', { name: 'Layers of A' });
  await screen.findByRole('group', { name: 'Layers of B' });

  await user.selectOptions(screen.getByRole('combobox', { name: 'Layout A' }), 'custom:mine');
  await readStarted;

  const finishFirstRead = () =>
    act(async () => {
      releaseRead();
      await firstReadFinished;
    });
  return {
    user,
    source,
    client,
    releaseRead,
    releaseSecondRead,
    finishFirstRead,
    compressionStarted,
  };
}

describe('asynchronous custom Compare layout picks', () => {
  it.each(['older', 'newer'])(
    'keeps the latest pick across both sides when the %s read finishes first',
    async (first) => {
      const { user, source, finishFirstRead, releaseSecondRead, compressionStarted } =
        await beginBlockedCustomPick();

      await user.selectOptions(screen.getByRole('combobox', { name: 'Layout B' }), 'custom:mine');
      if (first === 'older') {
        await finishFirstRead();
        expect(compressionStarted).not.toHaveBeenCalled();
      }
      releaseSecondRead();

      await waitFor(() => {
        expect(new URLSearchParams(source.currentSearch()).get('b')).toMatch(/^inline:/);
      });
      if (first === 'newer') await finishFirstRead();
      expect(new URLSearchParams(source.currentSearch()).get('layout')).toBe('qwerty');
    },
    60_000,
  );

  it('does not apply a pending pick after navigating to Analyze', async () => {
    const { user, source, client, releaseRead, compressionStarted } =
      await beginBlockedCustomPick();

    await user.click(screen.getByRole('link', { name: 'Analyze B' }));
    await screen.findByRole('region', { name: 'Layout' });
    expect(source.currentPath()).toBe('/analyze');

    releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(compressionStarted).not.toHaveBeenCalled();
    expect(source.currentPath()).toBe('/analyze');
    await waitFor(() => expect(client.analyses.at(-1)?.layout.name).toBe('Colemak'));
  }, 60_000);

  it('cancels a pending pick when the compared layouts are replaced', async () => {
    const { user, source, releaseRead, compressionStarted } = await beginBlockedCustomPick();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout B' }), 'dvorak');
    await waitFor(() => {
      const search = new URLSearchParams(source.currentSearch());
      expect(search.get('layout')).toBe('qwerty');
      expect(search.get('b')).toBe('dvorak');
    });

    releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const search = new URLSearchParams(source.currentSearch());
    expect(compressionStarted).not.toHaveBeenCalled();
    expect(source.currentPath()).toBe('/compare');
    expect(search.get('layout')).toBe('qwerty');
    expect(search.get('b')).toBe('dvorak');
  }, 60_000);

  it('does not revive a pending pick when the comparison returns to its earlier URL', async () => {
    const { user, source, releaseRead, compressionStarted } = await beginBlockedCustomPick();

    const layoutB = screen.getByRole('combobox', { name: 'Layout B' });
    await user.selectOptions(layoutB, 'dvorak');
    await waitFor(() => {
      expect(new URLSearchParams(source.currentSearch()).get('b')).toBe('dvorak');
    });
    await user.selectOptions(layoutB, 'colemak');
    await waitFor(() => {
      expect(new URLSearchParams(source.currentSearch()).get('b')).toBe('colemak');
    });

    releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const search = new URLSearchParams(source.currentSearch());
    expect(compressionStarted).not.toHaveBeenCalled();
    expect(source.currentPath()).toBe('/compare');
    expect(search.get('layout')).toBe('qwerty');
    expect(search.get('b')).toBe('colemak');
  }, 60_000);

  it('cancels a pending pick when comparison settings change', async () => {
    const { user, source, releaseRead, compressionStarted } = await beginBlockedCustomPick();

    const settings = await openSettings();
    await user.selectOptions(
      within(settings).getByRole('combobox', { name: 'Sample size' }),
      '300000',
    );
    await waitFor(() => {
      expect(new URLSearchParams(source.currentSearch()).get('sample')).toBe('300000');
    });

    releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const search = new URLSearchParams(source.currentSearch());
    expect(compressionStarted).not.toHaveBeenCalled();
    expect(source.currentPath()).toBe('/compare');
    expect(search.get('layout')).toBe('qwerty');
    expect(search.get('b')).toBe('colemak');
    expect(search.get('sample')).toBe('300000');
  }, 60_000);
});
