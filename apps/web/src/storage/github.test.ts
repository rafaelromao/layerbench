import { StorageConflictError } from '@layoutmaster/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubAdapter } from './github.js';

const CONFIG = { token: 'secret-token', repo: 'you/data', branch: 'main', path: 'data' };

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
  it('addresses files under the configured branch and directory', async () => {
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
    expect(writes[0].url).toContain('data/layouts/mine.json');
    expect(writes[0].body?.message).toBe('Save layouts Mine');
    expect(writes[0].body?.branch).toBe('main');

    expect(writes[1].url).toContain('data/layouts/index.json');
    expect(writes[1].body?.message).toBe('Save layouts Mine (index)');
    const index = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(writes[1].body?.content as string), (c) => c.charCodeAt(0)),
      ),
    );
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

  it('explains a failed connection without echoing the request', async () => {
    const adapter = new GitHubAdapter(CONFIG);

    responder = () => json(401, { message: 'Bad credentials' });
    expect(await adapter.check()).toEqual({ ok: false, error: 'the token was rejected' });

    responder = () => json(404, { message: 'Not Found' });
    expect(await adapter.check()).toEqual({
      ok: false,
      error: 'no such repository, or the token cannot see it',
    });

    responder = () => json(200, { full_name: 'you/data' }, { 'x-ratelimit-remaining': '4999' });
    expect(await adapter.check()).toEqual({ ok: true, rateLimitRemaining: '4999' });
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

  it('encodes every path segment, so a directory or branch name cannot add one', async () => {
    const adapter = new GitHubAdapter({ ...CONFIG, path: 'my data/ü', branch: 'feature/x#1' });
    await adapter.get('layouts', 'mine');
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/you/data/contents/my%20data/%C3%BC/layouts/mine.json?ref=feature%2Fx%231',
    );
  });

  it('refuses a repository or directory that is not a plain path', async () => {
    for (const repo of ['you', 'you/data/x', 'you/..', '../data', 'you/data?x']) {
      const adapter = new GitHubAdapter({ ...CONFIG, repo });
      await expect(adapter.list('layouts')).rejects.toThrow('invalid repository name');
      expect(await adapter.check()).toEqual({ ok: false, error: 'could not reach GitHub' });
    }
    const adapter = new GitHubAdapter({ ...CONFIG, path: 'data/../..' });
    await expect(adapter.list('layouts')).rejects.toThrow('invalid repository path');
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
