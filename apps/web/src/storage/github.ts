import {
  assertDocumentId,
  type Collection,
  type IndexEntry,
  indexSummary,
  isDocumentId,
  type JsonObject,
  type StorageAdapter,
  StorageConflictError,
  type StorageMeta,
} from '@layerbench/core';
import { API, type GitHubAccess, gitHubFetch } from './github-api.js';

/** `owner/name`, each a plain name: nothing that could step out of the repository's path. */
const REPO_SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;

function isRepoName(repo: string): boolean {
  const parts = repo.split('/');
  return parts.length === 2 && parts.every((p) => REPO_SEGMENT.test(p));
}

/** A path inside the repository, as path segments; `.` and `..` have no business in one. */
function pathSegments(path: string): string[] {
  const segments = path.split('/').filter((s) => s !== '');
  if (segments.some((s) => s === '.' || s === '..')) throw new Error('invalid repository path');
  return segments;
}

function isIndexEntry(value: unknown): value is IndexEntry {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    isDocumentId(o.id) &&
    typeof o.name === 'string' &&
    typeof o.updatedAt === 'string'
  );
}

/** The rows of an index file that are what an index row should be; anything else is dropped. */
export function readIndex(text: string): IndexEntry[] {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isIndexEntry) : [];
  } catch {
    return [];
  }
}

export interface GitHubConfig extends GitHubAccess {
  /** `owner/name`. */
  repo: string;
  branch: string;
}

/**
 * Where a document is kept in the repository. A layout and a text are kept where the bundled ones
 * are on main, so proposing one for everyone's Library is taking its files to a branch made from
 * main (README → Bundled layouts, Bundled corpora). A rule set has no such place, and is kept under
 * `data/`, as each collection's index is, which only the app reads.
 */
export function documentFile(collection: Collection, id: string): string {
  switch (collection) {
    case 'layouts':
      return `packages/core/src/layouts/documents/${id}.json`;
    case 'corpora':
      return `packages/corpora/raw/${id}.json`;
    default:
      return `data/${collection}/${id}.json`;
  }
}

/** A text's sample, beside its entry, as the bundled texts' raw files are kept. */
export function sampleFile(id: string): string {
  return `packages/corpora/raw/${id}.txt`;
}

export function indexFile(collection: Collection): string {
  return `data/${collection}/index.json`;
}

/** A document as a file someone will read in a pull request: indented, ending in a newline. */
function documentText(doc: JsonObject): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * A text is kept as the bundled ones are: its sample in a file of its own, and beside it an entry
 * shaped like a row of `raw/sources.json`, naming that file. Its counts are left out; they come
 * from the sample when it is read.
 */
function corpusFiles(id: string, doc: JsonObject): { entry: JsonObject; sample: string } {
  const { sample, symbols: _symbols, words: _words, ...rest } = doc;
  return {
    entry: { file: `${id}.txt`, ...rest },
    sample: typeof sample === 'string' ? sample : '',
  };
}

interface CacheEntry {
  content: string;
  sha: string;
  etag: string | null;
}

/** Base64 of the UTF-8 bytes: layouts carry accented letters. */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Documents in a GitHub repository the user owns, through the Contents API. The token is sent to
 * `api.github.com` and nowhere else; it never appears in a link, an export, or an error message.
 */
export class GitHubAdapter implements StorageAdapter {
  readonly id = 'github';
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: GitHubConfig) {}

  /**
   * Every segment is encoded on its own, so nothing in a directory name, an id or a branch can
   * add a segment, a query or a fragment of its own. Ids are also checked before they get here.
   */
  private url(path: string): string {
    const segments = pathSegments(path);
    const encoded = segments.map(encodeURIComponent).join('/');
    return `${this.repoUrl()}/contents/${encoded}?ref=${encodeURIComponent(this.config.branch)}`;
  }

  private repoUrl(): string {
    if (!isRepoName(this.config.repo)) throw new Error('invalid repository name');
    return `${API}/repos/${this.config.repo}`;
  }

  /** Read a file, revalidating against the cached entity tag so unchanged files cost nothing. */
  private async readFile(path: string): Promise<{ content: string; sha: string } | null> {
    const cached = this.cache.get(path);
    const res = await gitHubFetch(this.config, this.url(path), {
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
    });

    if (res.status === 304 && cached) return { content: cached.content, sha: cached.sha };
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);

    const data = (await res.json()) as { content?: unknown; sha?: unknown };
    if (typeof data.content !== 'string' || typeof data.sha !== 'string') {
      throw new Error('GitHub returned something other than a file');
    }
    const content = decodeBase64(data.content);
    this.cache.set(path, { content, sha: data.sha, etag: res.headers.get('etag') });
    return { content, sha: data.sha };
  }

  private async writeFile(path: string, content: string, message: string, sha?: string) {
    const res = await gitHubFetch(this.config, this.url(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: encodeBase64(content),
        branch: this.config.branch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (res.status === 200 || res.status === 201) {
      const data = (await res.json()) as { content?: { sha?: string }; commit?: { sha?: string } };
      const newSha = data.content?.sha ?? '';
      this.cache.set(path, { content, sha: newSha, etag: null });
      return { sha: newSha, commit: data.commit?.sha };
    }

    this.cache.delete(path);
    // A stale blob hash is reported either as a conflict or as an unprocessable request naming it.
    if (res.status === 409) throw new StorageConflictError();
    if (res.status === 422) {
      const body = await res.text();
      if (body.includes('sha')) throw new StorageConflictError();
      throw new Error(`GitHub responded 422`);
    }
    throw new Error(`GitHub responded ${res.status}`);
  }

  private async deleteFile(path: string, message: string, sha: string): Promise<void> {
    const res = await gitHubFetch(this.config, this.url(path), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch: this.config.branch }),
    });
    this.cache.delete(path);
    if (!res.ok && res.status !== 404) throw new Error(`GitHub responded ${res.status}`);
  }

  /** The index is a plain file, so it is rewritten alongside every change. */
  private async updateIndex(
    collection: Collection,
    id: string,
    entry: IndexEntry | null,
    message: string,
  ): Promise<void> {
    const path = indexFile(collection);
    const existing = await this.readFile(path);
    // A missing or unreadable index is rebuilt rather than allowed to break the write.
    const current = existing ? readIndex(existing.content) : [];
    const next = current.filter((e) => e.id !== id);
    if (entry) next.push(entry);
    next.sort((a, b) => a.name.localeCompare(b.name));
    await this.writeFile(path, JSON.stringify(next), `${message} (index)`, existing?.sha);
  }

  async list(collection: Collection): Promise<IndexEntry[]> {
    const file = await this.readFile(indexFile(collection));
    return file ? readIndex(file.content) : [];
  }

  async get(
    collection: Collection,
    id: string,
  ): Promise<{ doc: JsonObject; meta: StorageMeta } | null> {
    assertDocumentId(id);
    const path = documentFile(collection, id);
    const file = await this.readFile(path);
    if (!file) return null;
    const doc = JSON.parse(file.content) as JsonObject;
    const meta = { sha: file.sha, path };
    if (collection !== 'corpora') return { doc, meta };
    const { file: _file, ...entry } = doc;
    const sample = await this.readFile(sampleFile(id));
    return { doc: { ...entry, sample: sample?.content ?? '' }, meta };
  }

  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: { expectedSha?: string; message?: string } = {},
  ): Promise<StorageMeta> {
    assertDocumentId(id);
    const path = documentFile(collection, id);
    const message = opts.message ?? `Save ${collection} ${(doc.name as string) ?? id}`;
    const sha = opts.expectedSha ?? (await this.readFile(path))?.sha;

    let content = documentText(doc);
    if (collection === 'corpora') {
      // The sample first: an entry is only ever written beside the text it names.
      const { entry, sample } = corpusFiles(id, doc);
      const samplePath = sampleFile(id);
      const sampleSha = (await this.readFile(samplePath))?.sha;
      await this.writeFile(samplePath, sample, `${message} (text)`, sampleSha);
      content = documentText(entry);
    }
    const written = await this.writeFile(path, content, message, sha);
    await this.updateIndex(collection, id, indexSummary(collection, id, doc), message);
    return { sha: written.sha, path, commit: written.commit };
  }

  async delete(collection: Collection, id: string, opts: { message?: string } = {}): Promise<void> {
    assertDocumentId(id);
    const path = documentFile(collection, id);
    const message = opts.message ?? `Delete ${collection} ${id}`;
    const file = await this.readFile(path);
    if (file) await this.deleteFile(path, message, file.sha);
    if (collection === 'corpora') {
      const sample = await this.readFile(sampleFile(id));
      if (sample) await this.deleteFile(sampleFile(id), `${message} (text)`, sample.sha);
    }
    await this.updateIndex(collection, id, null, message);
  }
}
