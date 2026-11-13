import {
  type Collection,
  isDocumentId,
  NameTakenError,
  StorageConflictError,
} from '@layerbench/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deletedFile,
  documentFile,
  GistAdapter,
  type GistIds,
  indexFile,
  MAX_DELETIONS,
} from './gist.js';
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

  it('looks through the user’s gists once however many ask at the same time', async () => {
    const ids = memoryIds();
    responder = (call) =>
      call.url.includes('/gists?')
        ? json(200, [{ id: 'g1', files: { [indexFile('layouts')]: {} } }])
        : json(200, layoutsGist());
    const adapter = new GistAdapter(access, ids);

    // Two asks before the first has an answer: neither may conclude there is no gist, or a save
    // sent at that moment would start a second one.
    const [one, two] = await Promise.all([adapter.list('layouts'), adapter.list('layouts')]);
    expect(one.map((e) => e.id)).toEqual(['mine']);
    expect(two.map((e) => e.id)).toEqual(['mine']);
    expect(calls.filter((c) => c.url.includes('/gists?'))).toHaveLength(1);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('does not take a look that failed for one that found nothing, and makes it again', async () => {
    const ids = memoryIds();
    let down = true;
    responder = (call) => {
      if (!call.url.includes('/gists?')) return json(200, layoutsGist());
      return down
        ? json(503, { message: 'Unavailable' })
        : json(200, [{ id: 'g1', files: { [indexFile('layouts')]: {} } }]);
    };
    const adapter = new GistAdapter(access, ids);

    await expect(adapter.list('layouts')).rejects.toThrow('503');
    // Not an empty answer, which a save would take for leave to start a gist of its own.
    await expect(adapter.put('layouts', 'new', { name: 'New' })).rejects.toThrow('503');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    down = false;
    expect((await adapter.list('layouts')).map((e) => e.id)).toEqual(['mine']);
  });

  it('writes one at a time: two saves at once make one gist, and neither drops the other from its index', async () => {
    const files: Record<string, { content: string }> = {};
    let created = 0;
    responder = (call) => {
      if (call.url.includes('/gists?')) return json(200, []);
      const sent = (call.body?.files ?? {}) as Record<string, { content: string } | null>;
      if (call.method === 'POST') {
        created++;
        Object.assign(files, sent);
        return json(201, { id: 'g1', files });
      }
      if (call.method === 'PATCH') {
        for (const [name, file] of Object.entries(sent)) {
          if (file) files[name] = file;
          else delete files[name];
        }
      }
      return json(200, { id: 'g1', files });
    };
    const adapter = new GistAdapter(access, memoryIds());

    await Promise.all([
      adapter.put('layouts', 'a', { name: 'A' }),
      adapter.put('layouts', 'b', { name: 'B' }),
      adapter.put('layouts', 'c', { name: 'C' }),
    ]);

    expect(created).toBe(1);
    const index = JSON.parse(files[indexFile('layouts')].content) as { id: string }[];
    expect(index.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('looks for a gist it made for the first time though the answer never came, rather than making a second', async () => {
    const files: Record<string, { content: string }> = {};
    let made = false;
    let created = 0;
    let cutOff = true;
    responder = (call) => {
      const sent = (call.body?.files ?? {}) as Record<string, { content: string } | null>;
      if (call.url.includes('/gists?')) {
        return json(200, made ? [{ id: 'g1', files: { [indexFile('layouts')]: {} } }] : []);
      }
      if (call.method === 'POST') {
        created++;
        made = true;
        Object.assign(files, sent);
        // The gist is made, and the answer is lost.
        if (cutOff) throw new Error('GitHub did not answer in time');
        return json(201, { id: 'g1', files });
      }
      if (call.method === 'PATCH') {
        for (const [name, file] of Object.entries(sent)) {
          if (file) files[name] = file;
        }
      }
      return json(200, { id: 'g1', files });
    };
    const adapter = new GistAdapter(access, memoryIds());

    await expect(adapter.put('layouts', 'a', { name: 'A' })).rejects.toThrow('did not answer');
    cutOff = false;
    await adapter.put('layouts', 'b', { name: 'B' });

    expect(created).toBe(1);
    const index = JSON.parse(files[indexFile('layouts')].content) as { id: string }[];
    expect(index.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('goes on with the writes after one that failed', async () => {
    responder = (call) => {
      if (call.url.includes('/gists?')) return json(200, []);
      const sent = (call.body?.files ?? {}) as Record<string, unknown>;
      // The first save's gist is refused; the second finds none, and makes its own.
      return documentFile('layouts', 'a') in sent
        ? json(500, { message: 'Server Error' })
        : json(201, { id: 'g1', files: {} });
    };
    const adapter = new GistAdapter(access, memoryIds());
    const results = await Promise.allSettled([
      adapter.put('layouts', 'a', { name: 'A' }),
      adapter.put('layouts', 'b', { name: 'B' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  });

  it('gives a document the same version however its text is written, so a hand edit is no change', async () => {
    const doc = { name: 'Mine', description: 'a' };
    const pretty = JSON.stringify(doc, null, 2);
    responder = (call) =>
      call.url.includes('/gists?')
        ? json(200, [{ id: 'g1', files: { [indexFile('layouts')]: {} } }])
        : json(200, {
            id: 'g1',
            files: {
              [indexFile('layouts')]: {
                content: JSON.stringify([
                  { id: 'mine', name: 'Mine', updatedAt: '2026-01-01T00:00:00Z' },
                ]),
              },
              [documentFile('layouts', 'mine')]: { content: pretty },
            },
          });
    const adapter = new GistAdapter(access, memoryIds());
    const read = await adapter.get('layouts', 'mine');
    // The version a browser holding the same document gives it: the hash of its compact text.
    expect(read?.meta.sha).toBe(await sha1Hex(JSON.stringify(doc)));
    // And a write that names it is not refused as a change.
    await expect(
      adapter.put('layouts', 'mine', { ...doc, description: 'b' }, { expectedSha: read?.meta.sha }),
    ).resolves.toBeDefined();
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

  it('records a delete, with the version deleted, in the same edit, for other browsers to follow', async () => {
    responder = (call) =>
      json(200, call.method === 'PATCH' ? { id: 'g1', files: {} } : layoutsGist());
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));

    await adapter.delete('layouts', 'mine');
    const edits = calls.filter((c) => c.method === 'PATCH');
    expect(edits).toHaveLength(1);
    const files = edits[0].body?.files as Record<string, { content: string } | null>;
    expect(files[documentFile('layouts', 'mine')]).toBeNull();
    expect(JSON.parse(files[deletedFile('layouts')]?.content ?? '')).toEqual([
      { id: 'mine', sha: await sha1Hex(MINE), deletedAt: expect.any(String) },
    ]);

    // A document that is not there was not deleted by this, and no version of it is known.
    await adapter.delete('layouts', 'gone');
    expect(Object.keys((calls.at(-1)?.body?.files ?? {}) as object)).not.toContain(
      deletedFile('layouts'),
    );
  });

  it('deletes a document too large to read all the same, recording no version of it', async () => {
    responder = (call) =>
      json(
        200,
        call.method === 'PATCH'
          ? { id: 'g1', files: {} }
          : layoutsGist({ [documentFile('layouts', 'mine')]: { truncated: true } }),
      );
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    await adapter.delete('layouts', 'mine');
    const files = calls.at(-1)?.body?.files as Record<string, unknown>;
    expect(files[documentFile('layouts', 'mine')]).toBeNull();
    expect(deletedFile('layouts') in files).toBe(false);
  });

  it('reads what was deleted, dropping rows that are not deletions, and a file that is not one', async () => {
    const rows = [
      { id: 'old', sha: 'a', deletedAt: '2026-11-01T00:00:00Z' },
      { id: '../index', sha: 'b', deletedAt: '2026-11-01T00:00:00Z' },
      { id: 'no-sha', deletedAt: '2026-11-01T00:00:00Z' },
    ];
    let content = JSON.stringify(rows);
    responder = () => json(200, layoutsGist({ [deletedFile('layouts')]: { content } }));
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));
    expect(await adapter.deleted('layouts')).toEqual([rows[0]]);

    content = 'not json';
    expect(await adapter.deleted('layouts')).toEqual([]);
    // A gist from before deletions were recorded has none.
    responder = () => json(200, layoutsGist());
    expect(await adapter.deleted('layouts')).toEqual([]);
  });

  it('drops the record of a delete once the document is saved again, in the same edit', async () => {
    const kept = { id: 'kept', sha: 'k', deletedAt: '2026-11-01T00:00:00Z' };
    const deletions = [{ id: 'other', sha: 'o', deletedAt: '2026-11-02T00:00:00Z' }, kept];
    responder = (call) =>
      call.method === 'PATCH'
        ? json(200, { id: 'g1', files: {} })
        : json(
            200,
            layoutsGist({ [deletedFile('layouts')]: { content: JSON.stringify(deletions) } }),
          );
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));

    await adapter.put('layouts', 'other', { name: 'Another' });
    let files = calls.at(-1)?.body?.files as Record<string, { content: string }>;
    expect(JSON.parse(files[deletedFile('layouts')].content)).toEqual([kept]);

    // A save of a document never deleted leaves the record alone.
    await adapter.put('layouts', 'mine', { name: 'Mine', note: 'again' });
    files = calls.at(-1)?.body?.files as Record<string, { content: string }>;
    expect(deletedFile('layouts') in files).toBe(false);
  });

  it('keeps the latest deletions only, so the record stays small', async () => {
    const older = Array.from({ length: MAX_DELETIONS }, (_, n) => ({
      id: `old-${n}`,
      sha: 's',
      deletedAt: '2026-01-01T00:00:00Z',
    }));
    responder = (call) =>
      call.method === 'PATCH'
        ? json(200, { id: 'g1', files: {} })
        : json(200, layoutsGist({ [deletedFile('layouts')]: { content: JSON.stringify(older) } }));
    const adapter = new GistAdapter(access, memoryIds({ layouts: 'g1' }));

    await adapter.delete('layouts', 'mine');
    const files = calls.at(-1)?.body?.files as Record<string, { content: string }>;
    const recorded = JSON.parse(files[deletedFile('layouts')].content) as { id: string }[];
    expect(recorded).toHaveLength(MAX_DELETIONS);
    expect(recorded[0].id).toBe('mine');
    expect(recorded.at(-1)?.id).toBe(`old-${MAX_DELETIONS - 2}`);
  });

  it('names its record of deletions so that no document file can be it, as no id has a dot', () => {
    expect(deletedFile('layouts')).toBe('layouts.deleted.index.json');
    expect(isDocumentId('deleted.index')).toBe(false);
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
