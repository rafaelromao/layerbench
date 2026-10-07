import { StorageConflictError } from '@layerbench/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubAdapter } from './github.js';

const CONFIG = {
  token: async () => 'secret-token',
  repo: 'you/data',
  branch: 'main',
};

/** The text a write sends, decoded. */
function written(call: Call | undefined): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(call?.body?.content as string), (c) => c.charCodeAt(0)),
  );
}

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

/** Base64 of the UTF-8 bytes, the way the Contents API returns file content. */
function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes));
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

describe('a repository as storage', () => {
  it("addresses a collection's index under data/, on the configured branch", async () => {
    const adapter = new GitHubAdapter(CONFIG);
    await adapter.list('layouts');

    expect(calls[0].url).toBe(
      'https://api.github.com/repos/you/data/contents/data/layouts/index.json?ref=main',
    );
    expect(calls[0].headers.Authorization).toBe('Bearer secret-token');
    expect(calls[0].headers.Accept).toBe('application/vnd.github+json');
  });

  it('treats a missing file as nothing saved rather than an error', async () => {
    const adapter = new GitHubAdapter(CONFIG);
    expect(await adapter.list('layouts')).toEqual([]);
    expect(await adapter.get('layouts', 'nope')).toBeNull();
  });

  it('round-trips a document with accented letters', async () => {
    const doc = { name: 'Ação', languages: ['pt-BR'] };
    responder = (call) =>
      call.method === 'GET'
        ? json(200, { content: b64(JSON.stringify(doc)), sha: 'abc' }, { etag: 'W/"1"' })
        : json(404, {});

    const adapter = new GitHubAdapter(CONFIG);
    const loaded = await adapter.get('layouts', 'acao');
    expect(loaded?.doc).toEqual(doc);
    expect(loaded?.meta.sha).toBe('abc');
  });

  it('revalidates with the entity tag and reuses the cached copy', async () => {
    let first = true;
    responder = () => {
      if (first) {
        first = false;
        return json(200, { content: b64('{"name":"A"}'), sha: 'sha1' }, { etag: 'W/"1"' });
      }
      return new Response(null, { status: 304 });
    };

    const adapter = new GitHubAdapter(CONFIG);
    expect((await adapter.get('layouts', 'a'))?.doc).toEqual({ name: 'A' });
    expect((await adapter.get('layouts', 'a'))?.doc).toEqual({ name: 'A' });
    expect(calls[1].headers['If-None-Match']).toBe('W/"1"');
  });

  it('writes the document and its index entry', async () => {
    responder = (call) => {
      if (call.method === 'GET') return json(404, {});
      return json(201, { content: { sha: 'new-sha' }, commit: { sha: 'commit-sha' } });
    };

    const adapter = new GitHubAdapter(CONFIG);
    const meta = await adapter.put('layouts', 'mine', { name: 'Mine', layers: [1, 2] });

    expect(meta.sha).toBe('new-sha');
    expect(meta.commit).toBe('commit-sha');

    const writes = calls.filter((c) => c.method === 'PUT');
    expect(writes).toHaveLength(2);
    expect(writes[0].url).toContain('/contents/packages/core/src/layouts/documents/mine.json?');
    expect(writes[0].body?.message).toBe('Save layouts Mine');
    expect(writes[0].body?.branch).toBe('main');

    expect(writes[1].url).toContain('/contents/data/layouts/index.json?');
    expect(writes[1].body?.message).toBe('Save layouts Mine (index)');
    const index = JSON.parse(written(writes[1]));
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({ id: 'mine', name: 'Mine', layers: 2 });
  });

  it('sends the blob hash so a concurrent change is caught', async () => {
    responder = (call) => {
      if (call.method !== 'GET') return json(200, { content: { sha: 'next' } });
      return call.url.includes('index.json')
        ? json(200, { content: b64('[]'), sha: 'idx-sha' })
        : json(200, { content: b64('{"name":"Old"}'), sha: 'old-sha' });
    };

    const adapter = new GitHubAdapter(CONFIG);
    await adapter.put('layouts', 'mine', { name: 'New' });
    expect(calls.find((c) => c.method === 'PUT')?.body?.sha).toBe('old-sha');
  });

  it('reports a lost race as a conflict', async () => {
    responder = (call) =>
      call.method === 'GET' ? json(404, {}) : json(409, { message: 'conflict' });
    const adapter = new GitHubAdapter(CONFIG);
    await expect(adapter.put('layouts', 'mine', { name: 'Mine' })).rejects.toBeInstanceOf(
      StorageConflictError,
    );
  });

  it('reads a stale-hash rejection as a conflict too', async () => {
    responder = (call) =>
      call.method === 'GET'
        ? json(404, {})
        : new Response(JSON.stringify({ message: 'sha does not match' }), { status: 422 });

    const adapter = new GitHubAdapter(CONFIG);
    await expect(adapter.put('layouts', 'mine', { name: 'Mine' })).rejects.toBeInstanceOf(
      StorageConflictError,
    );
  });

  it('leaves other unprocessable requests as plain failures', async () => {
    responder = (call) =>
      call.method === 'GET'
        ? json(404, {})
        : new Response(JSON.stringify({ message: 'branch not found' }), { status: 422 });

    const adapter = new GitHubAdapter(CONFIG);
    await expect(adapter.put('layouts', 'mine', { name: 'Mine' })).rejects.toThrow('422');
  });

  it('removes the document and its index entry', async () => {
    responder = (call) => {
      if (call.method === 'GET' && call.url.includes('index.json')) {
        return json(200, { content: b64('[{"id":"mine","name":"Mine"}]'), sha: 'idx' });
      }
      if (call.method === 'GET') return json(200, { content: b64('{"name":"Mine"}'), sha: 'doc' });
      return json(200, { content: { sha: 'next' } });
    };

    const adapter = new GitHubAdapter(CONFIG);
    await adapter.delete('layouts', 'mine');

    const removed = calls.find((c) => c.method === 'DELETE');
    expect(removed?.body?.sha).toBe('doc');
    const indexWrite = calls.find((c) => c.method === 'PUT');
    const index = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(indexWrite?.body?.content as string), (c) => c.charCodeAt(0)),
      ),
    );
    expect(index).toEqual([]);
  });

  it('tells the session when GitHub no longer accepts the token', async () => {
    const onUnauthorized = vi.fn();
    responder = () => json(401, { message: 'Bad credentials' });
    const adapter = new GitHubAdapter({ ...CONFIG, onUnauthorized });
    await expect(adapter.list('layouts')).rejects.toThrow('GitHub responded 401');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('refuses an id that could step out of the data directory, before any request', async () => {
    const adapter = new GitHubAdapter(CONFIG);
    for (const id of ['../../../../user#', 'a/b', 'mine?x=1', 'mine#', 'index', '']) {
      await expect(adapter.get('layouts', id)).rejects.toThrow('invalid document id');
      await expect(adapter.put('layouts', id, { name: 'x' })).rejects.toThrow(
        'invalid document id',
      );
      await expect(adapter.delete('layouts', id)).rejects.toThrow('invalid document id');
    }
    expect(calls).toEqual([]);
  });

  it('encodes the branch, so its name cannot add a query or a fragment', async () => {
    const adapter = new GitHubAdapter({ ...CONFIG, branch: 'feature/x#1' });
    await adapter.get('rulesets', 'mine');
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/you/data/contents/data/rulesets/mine.json?ref=feature%2Fx%231',
    );
  });

  it('refuses a repository that is not a plain name', async () => {
    for (const repo of ['you', 'you/data/x', 'you/..', '../data', 'you/data?x']) {
      const adapter = new GitHubAdapter({ ...CONFIG, repo });
      await expect(adapter.list('layouts')).rejects.toThrow('invalid repository name');
    }
    expect(calls).toEqual([]);
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
    responder = () => json(200, { content: b64(JSON.stringify(rows)), sha: 'abc' });
    const adapter = new GitHubAdapter(CONFIG);
    expect((await adapter.list('layouts')).map((e) => e.id)).toEqual(['mine']);
  });

  it('reports a response that is not a file instead of crashing on it', async () => {
    responder = () => json(200, [{ name: 'a directory listing' }]);
    const adapter = new GitHubAdapter(CONFIG);
    await expect(adapter.get('layouts', 'mine')).rejects.toThrow('something other than a file');
  });

  it('never puts the token anywhere but the authorization header', async () => {
    responder = (call) =>
      call.method === 'GET' ? json(404, {}) : json(201, { content: { sha: 's' } });
    const adapter = new GitHubAdapter(CONFIG);
    await adapter.put('layouts', 'mine', { name: 'Mine' });

    for (const call of calls) {
      expect(call.url).not.toContain('secret-token');
      expect(JSON.stringify(call.body)).not.toContain('secret-token');
    }
  });
});

describe('where each kind of document is kept', () => {
  const saved = () => json(201, { content: { sha: 'new' }, commit: { sha: 'c' } });

  it('keeps a layout where bundled layouts are, indented as a pull request shows it', async () => {
    responder = (call) => (call.method === 'GET' ? json(404, {}) : saved());
    await new GitHubAdapter(CONFIG).put('layouts', 'mine', { name: 'Mine', layers: [] });
    const doc = calls.find((c) => c.method === 'PUT');
    expect(doc?.url).toContain('/contents/packages/core/src/layouts/documents/mine.json?');
    expect(written(doc)).toBe('{\n  "name": "Mine",\n  "layers": []\n}\n');
  });

  it('keeps a rule set under data/, as main has no place for one', async () => {
    responder = (call) => (call.method === 'GET' ? json(404, {}) : saved());
    await new GitHubAdapter(CONFIG).put('rulesets', 'mine', { name: 'Mine', rules: [] });
    expect(calls.find((c) => c.method === 'PUT')?.url).toContain(
      '/contents/data/rulesets/mine.json?',
    );
  });

  it('keeps a text as the raw texts are: its sample, and an entry beside it naming it', async () => {
    responder = (call) => (call.method === 'GET' ? json(404, {}) : saved());
    await new GitHubAdapter(CONFIG).put('corpora', 'notes', {
      name: 'Notes',
      language: 'en',
      license: 'user-provided',
      sample: 'Ação, then more.',
      symbols: 14,
      words: 3,
    });

    const [sample, entry, index] = calls.filter((c) => c.method === 'PUT');
    expect(sample.url).toContain('/contents/packages/corpora/raw/notes.txt?');
    expect(written(sample)).toBe('Ação, then more.');
    expect(entry.url).toContain('/contents/packages/corpora/raw/notes.json?');
    // Shaped like a row of raw/sources.json; the counts come from the sample.
    expect(JSON.parse(written(entry))).toEqual({
      file: 'notes.txt',
      name: 'Notes',
      language: 'en',
      license: 'user-provided',
    });
    expect(index.url).toContain('/contents/data/corpora/index.json?');
    expect(JSON.parse(written(index))[0]).toMatchObject({ id: 'notes', words: 3 });
  });

  it('reads a text back from its entry and its sample', async () => {
    responder = (call) =>
      call.url.includes('notes.txt')
        ? json(200, { content: b64('Ação, then more.'), sha: 'txt' })
        : json(200, {
            content: b64('{"file":"notes.txt","name":"Notes","language":"en"}'),
            sha: 'entry',
          });
    const loaded = await new GitHubAdapter(CONFIG).get('corpora', 'notes');
    expect(loaded?.doc).toEqual({ name: 'Notes', language: 'en', sample: 'Ação, then more.' });
    expect(loaded?.meta.sha).toBe('entry');
  });

  it('removes a text with its sample', async () => {
    responder = (call) =>
      call.method === 'GET' ? json(200, { content: b64('[]'), sha: 'x' }) : saved();
    await new GitHubAdapter(CONFIG).delete('corpora', 'notes');
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([
      expect.stringContaining('/contents/packages/corpora/raw/notes.json?'),
      expect.stringContaining('/contents/packages/corpora/raw/notes.txt?'),
    ]);
  });
});
