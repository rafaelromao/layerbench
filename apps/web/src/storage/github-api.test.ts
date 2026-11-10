import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, gitHubFetch, timeoutSignal } from './github-api.js';

afterEach(() => vi.unstubAllGlobals());

const access = { token: async () => 'secret-token' };

describe('a request to GitHub', () => {
  it('is given a limit, so one that never answers ends', async () => {
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      signal = init?.signal;
      return new Response('[]');
    });
    await gitHubFetch(access, `${API}/gists`);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it('says it did not answer in time, whichever way the browser says it', async () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      vi.stubGlobal('fetch', async () => {
        throw new DOMException('timed out', name);
      });
      await expect(gitHubFetch(access, `${API}/gists`)).rejects.toThrow(
        'GitHub did not answer in time',
      );
    }
  });

  it('lets any other failure through as it is', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(gitHubFetch(access, `${API}/gists`)).rejects.toThrow('Failed to fetch');
  });
});

describe('a limit on a wait', () => {
  afterEach(() => vi.useRealTimers());

  it('is made by hand where the browser has no AbortSignal.timeout', () => {
    vi.useFakeTimers();
    const original = AbortSignal.timeout;
    // Safari before 16.
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
    try {
      const signal = timeoutSignal(1_000);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
      vi.advanceTimersByTime(1_000);
      expect(signal?.aborted).toBe(true);
      expect((signal?.reason as DOMException | undefined)?.name).toBe('TimeoutError');
    } finally {
      Object.defineProperty(AbortSignal, 'timeout', { value: original, configurable: true });
    }
  });
});
