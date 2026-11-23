import { bundledLayout, getPreset, type Layout, toCanonicalJson } from '@layerbench/core';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dragKey } from '../test/analyze-editing.js';
import { showLayer, shownLayer } from '../test/layers.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { RecordingClient } from '../test/recording-client.js';
import { customInLink, openSettings, renderRoute, testClient } from '../test/render.js';
import { decodeInline } from '../url/inline.js';
import { encodeRuleSnapshot } from '../url/rule-snapshot.js';
import { buildPortableTarget } from '../url/share-target.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    const get = vi.spyOn(storage, 'get');
    const client = new RecordingClient();
    const target = new URL(href);
    const source = renderRoute(`${target.pathname}${target.search}${target.hash}`, {
      client,
      storage,
    });
    await screen.findByRole('group', { name: 'Layers of A' }, { timeout: 25_000 });
    await screen.findByRole('group', { name: 'Layers of B' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout A' }), 'custom:mine');

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
