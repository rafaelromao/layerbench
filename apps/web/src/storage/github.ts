import {
  type Collection,
  documentPath,
  type IndexEntry,
  indexPath,
  indexSummary,
  type JsonObject,
  type StorageAdapter,
  StorageConflictError,
  type StorageMeta,
} from '@layoutmaster/core';

const API = 'https://api.github.com';

export interface GitHubConfig {
  /** Personal access token with read and write on the data repository's contents. */
  token: string;
  /** `owner/name`. */
  repo: string;
  branch: string;
  /** Directory inside the repository that holds the collections. */
  path: string;
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
 * Documents in a GitHub repository the user owns, through the Contents API. The token lives in this
 * browser and is sent to `api.github.com` and nowhere else; it never appears in a link, an export,
 * or an error message.
 */
export class GitHubAdapter implements StorageAdapter {
  readonly id = 'github';
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: GitHubConfig) {}

  private url(path: string): string {
    const prefix = this.config.path.replace(/^\/+|\/+$/g, '');
    const full = prefix ? `${prefix}/${path}` : path;
    return `${API}/repos/${this.config.repo}/contents/${encodeURI(full)}?ref=${encodeURIComponent(
      this.config.branch,
    )}`;
  }

  private headers(extra: Record<string, string> = {}): HeadersInit {
    return {
      // The browser sets its own user agent; GitHub accepts that.
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-API-Version': '2022-11-28',
      ...extra,
    };
  }

  /** Read a file, revalidating against the cached entity tag so unchanged files cost nothing. */
  private async readFile(path: string): Promise<{ content: string; sha: string } | null> {
    const cached = this.cache.get(path);
    const res = await fetch(this.url(path), {
      headers: this.headers(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
    });

    if (res.status === 304 && cached) return { content: cached.content, sha: cached.sha };
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);

    const data = (await res.json()) as { content: string; sha: string };
    const content = decodeBase64(data.content);
    this.cache.set(path, { content, sha: data.sha, etag: res.headers.get('etag') });
    return { content, sha: data.sha };
  }

  private async writeFile(path: string, content: string, message: string, sha?: string) {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
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
    const res = await fetch(this.url(path), {
      method: 'DELETE',
      headers: this.headers({ 'Content-Type': 'application/json' }),
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
    const path = indexPath(collection);
    const existing = await this.readFile(path);
    // A missing or unreadable index is rebuilt rather than allowed to break the write.
    let current: IndexEntry[] = [];
    if (existing) {
      try {
        const parsed = JSON.parse(existing.content);
        if (Array.isArray(parsed)) current = parsed as IndexEntry[];
      } catch {
        current = [];
      }
    }
    const next = current.filter((e) => e.id !== id);
    if (entry) next.push(entry);
    next.sort((a, b) => a.name.localeCompare(b.name));
    await this.writeFile(path, JSON.stringify(next), `${message} (index)`, existing?.sha);
  }

  async list(collection: Collection): Promise<IndexEntry[]> {
    const file = await this.readFile(indexPath(collection));
    if (!file) return [];
    try {
      const parsed = JSON.parse(file.content);
      return Array.isArray(parsed) ? (parsed as IndexEntry[]) : [];
    } catch {
      return [];
    }
  }

  async get(
    collection: Collection,
    id: string,
  ): Promise<{ doc: JsonObject; meta: StorageMeta } | null> {
    const path = documentPath(collection, id);
    const file = await this.readFile(path);
    if (!file) return null;
    return { doc: JSON.parse(file.content) as JsonObject, meta: { sha: file.sha, path } };
  }

  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: { expectedSha?: string; message?: string } = {},
  ): Promise<StorageMeta> {
    const path = documentPath(collection, id);
    const message = opts.message ?? `Save ${collection} ${(doc.name as string) ?? id}`;
    const sha = opts.expectedSha ?? (await this.readFile(path))?.sha;

    const written = await this.writeFile(path, JSON.stringify(doc), message, sha);
    await this.updateIndex(collection, id, indexSummary(collection, id, doc), message);
    return { sha: written.sha, path, commit: written.commit };
  }

  async delete(collection: Collection, id: string, opts: { message?: string } = {}): Promise<void> {
    const path = documentPath(collection, id);
    const message = opts.message ?? `Delete ${collection} ${id}`;
    const file = await this.readFile(path);
    if (file) await this.deleteFile(path, message, file.sha);
    await this.updateIndex(collection, id, null, message);
  }

  /** Check the token and repository before the user relies on them. */
  async check(): Promise<
    { ok: true; rateLimitRemaining: string | null } | { ok: false; error: string }
  > {
    try {
      const res = await fetch(`${API}/repos/${this.config.repo}`, { headers: this.headers() });
      if (res.status === 401) return { ok: false, error: 'the token was rejected' };
      if (res.status === 403)
        return { ok: false, error: 'the token lacks access to that repository' };
      if (res.status === 404) {
        return { ok: false, error: 'no such repository, or the token cannot see it' };
      }
      if (!res.ok) return { ok: false, error: `GitHub responded ${res.status}` };
      return { ok: true, rateLimitRemaining: res.headers.get('x-ratelimit-remaining') };
    } catch {
      // Never surface the request itself: it carries the token.
      return { ok: false, error: 'could not reach GitHub' };
    }
  }
}
