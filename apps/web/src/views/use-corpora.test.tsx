import type { CorpusManifest } from '@layerbench/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisClientProvider } from '../engine/client-context.js';
import { testClient } from '../test/render.js';
import { useCorpora } from './useCorpora.js';

/** A client whose list of corpora comes back, or fails, only when the test says. */
function heldClient() {
  const client = testClient();
  let settle: { ok: (list: CorpusManifest[]) => void; fail: (e: Error) => void } | undefined;
  vi.spyOn(client, 'listCorpora').mockImplementation(
    () =>
      new Promise((ok, fail) => {
        settle = { ok, fail };
      }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnalysisClientProvider client={client}>{children}</AnalysisClientProvider>
  );
  return { wrapper, settle: () => settle as NonNullable<typeof settle> };
}

describe('the corpora for a picker', () => {
  it('are the ones the engine lists, once it has listed them', async () => {
    const { wrapper, settle } = heldClient();
    const { result } = renderHook(() => useCorpora(), { wrapper });
    expect(result.current).toEqual([]);
    const list = [{ id: 'en-general' } as CorpusManifest];
    await act(async () => settle().ok(list));
    expect(result.current).toEqual(list);
  });

  it('are let go when they come back after the picker is gone, listed or failed', async () => {
    // As when a test ends first and its window is torn down: setting the state of a component no
    // longer there would make React throw, and the run fail on an unhandled rejection.
    for (const end of ['ok', 'fail'] as const) {
      const { wrapper, settle } = heldClient();
      const { unmount } = renderHook(() => useCorpora(), { wrapper });
      unmount();
      const rejected: unknown[] = [];
      const onRejection = (reason: unknown) => rejected.push(reason);
      process.on('unhandledRejection', onRejection);
      const window = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Reflect.deleteProperty(globalThis, 'window');
      try {
        if (end === 'ok') settle().ok([{ id: 'en-general' } as CorpusManifest]);
        else settle().fail(new Error('gone'));
        await new Promise((r) => setTimeout(r, 20));
      } finally {
        if (window) Object.defineProperty(globalThis, 'window', window);
        process.off('unhandledRejection', onRejection);
      }
      expect(rejected).toEqual([]);
    }
  });
});
