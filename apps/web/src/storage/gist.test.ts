import { type Collection, NameTakenError, StorageConflictError } from '@layerbench/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentFile, GistAdapter, type GistIds, indexFile } from './gist.js';
import { sha1Hex } from './indexeddb.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

let calls: Call[];
let responder: (call: Call) => Response;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function memoryIds(initial: Partial<Record<Collection, string>> = {}): GistIds {
  const ids = new Map(Object.entries(initial)) as Map<Collection, string>;
  return {
    get: (c) => ids.get(c),
    set: (c, id) => (id ? ids.set(c, id) : ids.delete(c)),
  };
}

const access = { token: async () => 'secret-token' };

const INDEX = [{ id: 'mine', name: 'Mine', updatedAt: '2026-01-01T00:00:00Z' }];
const MINE = JSON.stringify({ name: 'Mine' });

function layoutsGist(extra: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    files: {
      [indexFile('layouts')]: { content: JSON.stringify(INDEX) },
      [documentFile('layouts', 'mine')]: { content: MINE },
      ...extra,
    },
  };
}

beforeEach(() => {
  calls = [];
  responder = () => json(404, { message: 'Not Found' });
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null,
    };
    calls.push(call);
    return responder(call);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gists as storage', () => {
  it('finds each collection’s gist among the user’s by its index file, and remembers it', async () => {
    const ids = memoryIds();
    responder = (call) => {
      if (call.url.includes('/gists?')) {
        return json(200, [
          { id: 'other', files: { 'notes.md': {} } },
          { id: 'g1', files: { [indexFile('layouts')]: {} } },
          { id: 'g2', files: { [indexFile('rulesets')]: {} } },
        ]);
      }
      return json(200, layoutsGist());
    };
    const adapter = new GistAdapter(access, ids);

    expect((await adapter.list('layouts')).map((e) => e.id)).toEqual(['mine']);
    expect(ids.get('layouts')).toBe('g1');
    expect(ids.get('rulesets')).toBe('g2');
    expect(calls.at(-1)?.url).toBe('https://api.github.com/gists/g1');
    expect(calls[0].headers.Authorization).toBe('Bearer secret-token');
  });

  it('drops index rows that are not index rows, including ids that are not ids', async () => {
    const rows = [
      { id: 'mine', name: 'Mine', updatedAt: '2026-01-01T00:00:00Z' },
      { id: '../../../user', name: 'Evil', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'index', name: 'Index', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'noname', updatedAt: '2026-01-01T00:00:00Z' },
      'not a row',
      null,
    ];
    responder = () =>
      json(200, layoutsGist({ [indexFile('layouts')]: { content: JSON.stringify(rows) } }));
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    expect((await adapter.list('layouts')).map((e) => e.id)).toEqual(['mine']);
  });

  it('reads an index that is not JSON as an empty one', async () => {
    responder = () => json(200, layoutsGist({ [indexFile('layouts')]: { content: '{' } }));
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    expect(await adapter.list('layouts')).toEqual([]);
  });

  it('lists nothing, and creates nothing, before the first save', async () => {
    responder = () => json(200, []);
    const adapter = new GistAdapter(access, memoryIds());
    expect(await adapter.list('layouts')).toEqual([]);
    expect(await adapter.get('layouts', 'mine')).toBeNull();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('reads every document of a collection from one request, revalidated', async () => {
    let gets = 0;
    responder = (call) => {
      gets++;
      return call.headers['If-None-Match'] === '"v1"'
        ? new Response(null, { status: 304 })
        : json(200, layoutsGist(), { etag: '"v1"' });
    };
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));

    const first = await adapter.get('layouts', 'mine');
    expect(first?.doc).toEqual({ name: 'Mine' });
    expect(first?.meta.sha).toBe(await sha1Hex(MINE));
    await adapter.list('layouts');
    expect(gets).toBe(2);
    expect(calls[1].headers['If-None-Match']).toBe('"v1"');
  });

  it('creates a secret gist on the first save, with the document and its index', async () => {
    const ids = memoryIds();
    responder = (call) =>
      call.method === 'POST' ? json(201, { id: 'new', files: {} }) : json(200, []);
    const adapter = new GistAdapter(access, ids);
    await adapter.put('layouts', 'mine', { name: 'Mine' });

    const create = calls.find((c) => c.method === 'POST');
    expect(create?.url).toBe('https://api.github.com/gists');
    expect(create?.body?.public).toBe(false);
    expect(create?.body?.description).toBe('LayerBench: saved layouts');
    const files = create?.body?.files as Record<string, { content: string }>;
    expect(JSON.parse(files[documentFile('layouts', 'mine')].content)).toEqual({ name: 'Mine' });
    expect(
      JSON.parse(files[indexFile('layouts')].content).map((e: { id: string }) => e.id),
    ).toEqual(['mine']);
    expect(ids.get('layouts')).toBe('new');
  });

  it('keeps the changes proposed to the Library in a gist of their own', async () => {
    const ids = memoryIds();
    responder = (call) =>
      call.method === 'POST' ? json(201, { id: 'proposed', files: {} }) : json(200, []);
    const adapter = new GistAdapter(access, ids);
    const proposal = {
      name: 'Colemak',
      target: { kind: 'bundled', id: 'colemak' },
      url: 'https://github.com/rafaelromao/layerbench/pull/100',
    };
    await adapter.put('proposals', 'colemak', proposal);
    const create = calls.find((c) => c.method === 'POST');
    expect(create?.body?.description).toBe('LayerBench: proposed changes');
    const files = create?.body?.files as Record<string, { content: string }>;
    expect(JSON.parse(files[documentFile('proposals', 'colemak')].content)).toEqual(proposal);
    expect(ids.get('proposals')).toBe('proposed');
  });

  it('writes a document and its index together in one edit', async () => {
    responder = (call) =>
      json(200, call.method === 'PATCH' ? { id: 'g1', files: {} } : layoutsGist());
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    await adapter.put('layouts', 'other', { name: 'Another' });

    const edits = calls.filter((c) => c.method === 'PATCH');
    expect(edits).toHaveLength(1);
    const files = edits[0].body?.files as Record<string, { content: string }>;
    expect(Object.keys(files).sort()).toEqual(
      [documentFile('layouts', 'other'), indexFile('layouts')].sort(),
    );
    const index = JSON.parse(files[indexFile('layouts')].content) as { name: string }[];
    expect(index.map((e) => e.name)).toEqual(['Another', 'Mine']);
  });

  it('refuses a second layout under a name one already has, before any edit', async () => {
    responder = () => json(200, layoutsGist());
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    const refused = adapter.put('layouts', 'mine-2', { name: ' mine ' });
    await expect(refused).rejects.toBeInstanceOf(NameTakenError);
    await expect(refused).rejects.toMatchObject({ taken: { id: 'mine', name: 'Mine' } });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('overwrites the layout that has the name, in place, with one row in the index', async () => {
    responder = (call) =>
      json(200, call.method === 'PATCH' ? { id: 'g1', files: {} } : layoutsGist());
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    await adapter.put('layouts', 'mine', { name: 'Mine', description: 'newer' });

    const files = calls.find((c) => c.method === 'PATCH')?.body?.files as Record<
      string,
      { content: string }
    >;
    expect(JSON.parse(files[documentFile('layouts', 'mine')].content)).toEqual({
      name: 'Mine',
      description: 'newer',
    });
    const index = JSON.parse(files[indexFile('layouts')].content) as { id: string }[];
    expect(index.map((e) => e.id)).toEqual(['mine']);
  });

  it('saves a layout renamed to a name nobody has, and refuses one renamed to a name taken', async () => {
    const other = { id: 'other', name: 'Other', updatedAt: '2026-01-01T00:00:00Z' };
    responder = (call) =>
      json(
        200,
        call.method === 'PATCH'
          ? { id: 'g1', files: {} }
          : layoutsGist({ [indexFile('layouts')]: { content: JSON.stringify([...INDEX, other]) } }),
      );
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    await expect(adapter.put('layouts', 'mine', { name: 'Other' })).rejects.toMatchObject({
      taken: { id: 'other' },
    });
    await adapter.put('layouts', 'mine', { name: 'Yours' });
    const files = calls.find((c) => c.method === 'PATCH')?.body?.files as Record<
      string,
      { content: string }
    >;
    const index = JSON.parse(files[indexFile('layouts')].content) as { name: string }[];
    expect(index.map((e) => e.name)).toEqual(['Other', 'Yours']);
  });

  it('still saves a layout that shares its name with a duplicate made before', async () => {
    const twice = [...INDEX, { id: 'mine-6', name: 'Mine', updatedAt: '2026-01-01T00:00:00Z' }];
    responder = (call) =>
      json(
        200,
        call.method === 'PATCH'
          ? { id: 'g1', files: {} }
          : layoutsGist({ [indexFile('layouts')]: { content: JSON.stringify(twice) } }),
      );
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    await adapter.put('layouts', 'mine-6', { name: 'Mine' });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });

  it('refuses to overwrite a document that changed since it was read', async () => {
    responder = () => json(200, layoutsGist());
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    await expect(
      adapter.put('layouts', 'mine', { name: 'Mine 2' }, { expectedSha: 'stale' }),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('deletes a document by emptying its file, and only a file that is there', async () => {
    responder = (call) =>
      json(200, call.method === 'PATCH' ? { id: 'g1', files: {} } : layoutsGist());
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));

    await adapter.delete('layouts', 'mine');
    let files = calls.at(-1)?.body?.files as Record<string, unknown>;
    expect(files[documentFile('layouts', 'mine')]).toBeNull();
    expect(JSON.parse((files[indexFile('layouts')] as { content: string }).content)).toEqual([]);

    await adapter.delete('layouts', 'gone');
    files = calls.at(-1)?.body?.files as Record<string, unknown>;
    expect(documentFile('layouts', 'gone') in files).toBe(false);
  });

  it('forgets a gist deleted on GitHub and looks for another', async () => {
    const ids = memoryIds({ layouts: 'deleted' });
    responder = (call) => {
      if (call.url.endsWith('/gists/deleted')) return json(404, {});
      if (call.url.includes('/gists?'))
        return json(200, [{ id: 'g1', files: layoutsGist().files }]);
      return json(200, layoutsGist());
    };
    const adapter = new GistAdapter(access, ids);
    expect((await adapter.list('layouts')).map((e) => e.id)).toEqual(['mine']);
    expect(ids.get('layouts')).toBe('g1');
  });

  it('reports a file too large to read instead of returning part of it', async () => {
    responder = () =>
      json(
        200,
        layoutsGist({ [documentFile('layouts', 'big')]: { content: '{', truncated: true } }),
      );
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    await expect(adapter.get('layouts', 'big')).rejects.toThrow('too large');
  });

  it('tells the session when GitHub no longer accepts the token', async () => {
    const onUnauthorized = vi.fn();
    responder = () => json(401, { message: 'Bad credentials' });
    const adapter = new GistAdapter({ ...access, onUnauthorized }, memoryIds({ layouts: 'g1' }));
    await expect(adapter.list('layouts')).rejects.toThrow('GitHub responded 401');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('refuses an id that could name another file, before any request', async () => {
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    for (const id of ['index', 'a.b', '../x', '']) {
      await expect(adapter.put('layouts', id, { name: 'x' })).rejects.toThrow(
        'invalid document id',
      );
    }
    expect(calls).toEqual([]);
  });

  it('never puts the token anywhere but the authorization header', async () => {
    responder = (call) =>
      call.method === 'POST' ? json(201, { id: 'n', files: {} }) : json(200, []);
    const adapter = new GistAdapter(access, memoryIds());
    await adapter.put('layouts', 'mine', { name: 'Mine' });
    for (const call of calls) {
      expect(call.url).not.toContain('secret-token');
      expect(JSON.stringify(call.body)).not.toContain('secret-token');
    }
  });
});
