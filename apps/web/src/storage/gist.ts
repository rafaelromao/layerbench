import {
  assertDocumentId,
  type Collection,
  type IndexEntry,
  indexSummary,
  type JsonObject,
  type StorageAdapter,
  StorageConflictError,
  type StorageMeta,
} from '@layerbench/core';
import { readIndex } from './github.js';
import { API, type GitHubAccess, gitHubFetch } from './github-api.js';
import { sha1Hex } from './indexeddb.js';

const COLLECTIONS: Collection[] = ['layouts', 'rulesets', 'corpora'];

const DESCRIPTIONS: Record<Collection, string> = {
  layouts: 'LayerBench: saved layouts',
  rulesets: 'LayerBench: saved rule sets',
  corpora: 'LayerBench: saved corpora',
};

/**
 * A gist holds no directories, so the collection becomes a prefix. Ids never contain a dot and
 * `index` is not an id, so a document's file cannot be mistaken for the index or for another
 * collection's file. The index file is also how the gist is recognised among the user's others.
 */
export const indexFile = (collection: Collection) => `${collection}.index.json`;
export const documentFile = (collection: Collection, id: string) => `${collection}.${id}.json`;

/** Listing every gist of someone with thousands of them would never end; this is plenty. */
const MAX_LIST_PAGES = 30;

interface GistFile {
  content?: string;
  truncated?: boolean;
}

interface Gist {
  id: string;
  files: Record<string, GistFile | null | undefined>;
}

/** Where the id of each collection's gist is remembered between visits. */
export interface GistIds {
  get(collection: Collection): string | undefined;
  set(collection: Collection, id: string | undefined): void;
}

function isGist(value: unknown): value is Gist {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.id === 'string' && !!o.files && typeof o.files === 'object';
}

/**
 * Documents in secret gists of the signed-in user, one gist per collection, each holding its
 * documents and an index. A save writes the document and the index in one revision.
 *
 * Secret gists are unlisted, not private: anyone with a gist's address can read it.
 */
export class GistAdapter implements StorageAdapter {
  readonly id = 'gist';
  private readonly cache = new Map<string, { gist: Gist; etag: string | null }>();
  private searched = false;

  constructor(
    private readonly access: GitHubAccess,
    private readonly ids: GistIds,
  ) {}

  /** Look through the user's gists once for any of ours that are not remembered yet. */
  private async search(): Promise<void> {
    if (this.searched) return;
    this.searched = true;
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const res = await gitHubFetch(this.access, `${API}/gists?per_page=100&page=${page}`);
      if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
      const gists: unknown = await res.json();
      if (!Array.isArray(gists)) throw new Error('GitHub returned something other than gists');
      for (const gist of gists) {
        if (!isGist(gist)) continue;
        for (const collection of COLLECTIONS) {
          if (!this.ids.get(collection) && indexFile(collection) in gist.files) {
            this.ids.set(collection, gist.id);
          }
        }
      }
      if (gists.length < 100) return;
    }
  }

  private async gistId(collection: Collection): Promise<string | undefined> {
    if (!this.ids.get(collection)) await this.search();
    return this.ids.get(collection);
  }

  /** The collection's gist, revalidated against its entity tag; none until the first save. */
  private async read(collection: Collection, retried = false): Promise<Gist | null> {
    const id = await this.gistId(collection);
    if (!id) return null;
    const cached = this.cache.get(id);
    const res = await gitHubFetch(this.access, `${API}/gists/${encodeURIComponent(id)}`, {
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
    });
    if (res.status === 304 && cached) return cached.gist;
    if (res.status === 404) {
      // Deleted on GitHub: forget it, and look once for another before starting afresh.
      this.cache.delete(id);
      this.ids.set(collection, undefined);
      if (retried) return null;
      this.searched = false;
      return this.read(collection, true);
    }
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const gist: unknown = await res.json();
    if (!isGist(gist)) throw new Error('GitHub returned something other than a gist');
    this.cache.set(id, { gist, etag: res.headers.get('etag') });
    return gist;
  }

  /** A file's text. A truncated one is over a megabyte, which no saved document reaches. */
  private static content(gist: Gist, name: string): string | null {
    const file = gist.files[name];
    if (!file) return null;
    if (file.truncated || typeof file.content !== 'string') {
      throw new Error(`${name} is too large to read from a gist`);
    }
    return file.content;
  }

  private async write(
    collection: Collection,
    gist: Gist | null,
    files: Record<string, { content: string } | null>,
  ): Promise<void> {
    const res = gist
      ? await gitHubFetch(this.access, `${API}/gists/${encodeURIComponent(gist.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        })
      : await gitHubFetch(this.access, `${API}/gists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: DESCRIPTIONS[collection], public: false, files }),
        });

    if (gist) this.cache.delete(gist.id);
    if (res.status === 404 && gist) this.ids.set(collection, undefined);
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const written: unknown = await res.json();
    if (!isGist(written)) throw new Error('GitHub returned something other than a gist');
    this.ids.set(collection, written.id);
  }

  async list(collection: Collection): Promise<IndexEntry[]> {
    const gist = await this.read(collection);
    const index = gist ? GistAdapter.content(gist, indexFile(collection)) : null;
    return index ? readIndex(index) : [];
  }

  async get(
    collection: Collection,
    id: string,
  ): Promise<{ doc: JsonObject; meta: StorageMeta } | null> {
    assertDocumentId(id);
    const gist = await this.read(collection);
    const path = documentFile(collection, id);
    const content = gist ? GistAdapter.content(gist, path) : null;
    if (content === null) return null;
    return { doc: JSON.parse(content) as JsonObject, meta: { sha: await sha1Hex(content), path } };
  }

  /**
   * A gist takes no conditional writes, so the expected version is checked against a fresh read
   * just before writing; the window left is the length of one request. Commit messages have no
   * place in a gist and are not kept.
   */
  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: { expectedSha?: string; message?: string } = {},
  ): Promise<StorageMeta> {
    assertDocumentId(id);
    const path = documentFile(collection, id);
    const content = JSON.stringify(doc);
    const gist = await this.read(collection);

    const current = gist ? GistAdapter.content(gist, path) : null;
    if (opts.expectedSha !== undefined && current !== null) {
      if ((await sha1Hex(current)) !== opts.expectedSha) throw new StorageConflictError();
    }

    const index = gist ? GistAdapter.content(gist, indexFile(collection)) : null;
    const next = (index ? readIndex(index) : []).filter((e) => e.id !== id);
    next.push(indexSummary(collection, id, doc));
    next.sort((a, b) => a.name.localeCompare(b.name));

    await this.write(collection, gist, {
      [path]: { content },
      [indexFile(collection)]: { content: JSON.stringify(next) },
    });
    return { sha: await sha1Hex(content), path };
  }

  async delete(collection: Collection, id: string): Promise<void> {
    assertDocumentId(id);
    const path = documentFile(collection, id);
    const gist = await this.read(collection);
    if (!gist) return;

    const index = GistAdapter.content(gist, indexFile(collection));
    const next = (index ? readIndex(index) : []).filter((e) => e.id !== id);
    // A file named in an edit with nothing in it is deleted, so only a file that exists is named.
    await this.write(collection, gist, {
      ...(gist.files[path] ? { [path]: null } : {}),
      [indexFile(collection)]: { content: JSON.stringify(next) },
    });
  }
}
