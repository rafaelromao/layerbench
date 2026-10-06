import { bundledLayout, getPreset, type Layout } from '@layoutmaster/core';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisClient, ReportDTO } from './protocol.js';

const OPTS = {
  corpusId: 'en-general',
  caseMode: 'fold' as const,
  textClass: 'letters' as const,
  maxSymbols: 10_000,
  ruleSet: getPreset('layouts_doc'),
};

const ENTRIES = [{ key: 'qwerty', layout: bundledLayout('qwerty') as Layout }];

/** A report with only what a summary reads: Effort, SFB, and nothing left untyped. */
function report(effort: number, sfb: number): ReportDTO {
  return {
    results: [
      { id: 'effort', value: effort },
      { id: 'sfb', value: sfb },
    ],
    coverage: { unproducible: [] },
    stats: { symbols: 1000 },
  } as unknown as ReportDTO;
}

/** A client whose answers the test hands out, one analysis at a time. */
function client(): { client: AnalysisClient; answer: (r: ReportDTO) => void; asked: () => number } {
  const waiting: ((r: ReportDTO) => void)[] = [];
  let asked = 0;
  const c = {
    peek: async () => null,
    analyze: () => {
      asked++;
      return new Promise<ReportDTO>((resolve) => waiting.push(resolve));
    },
  } as unknown as AnalysisClient;
  return { client: c, answer: (r) => waiting.shift()?.(r), asked: () => asked };
}

/**
 * The hook module keeps this page's own results in memory, so each test imports it afresh: a new
 * visit, with only what the browser stored.
 */
async function freshHook(c: AnalysisClient) {
  vi.resetModules();
  const { useSummaries } = await import('./use-summaries.js');
  const { AnalysisClientProvider } = await import('./client-context.js');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnalysisClientProvider client={c}>{children}</AnalysisClientProvider>
  );
  return renderHook(() => useSummaries(ENTRIES, OPTS), { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
});

describe('scores kept between visits', () => {
  it('shows the last visit’s scores at once, and checks them again in the background', async () => {
    const first = client();
    const visit = await freshHook(first.client);
    expect(visit.result.current.pending).toBe(1);
    await waitFor(() => expect(first.asked()).toBe(1));
    first.answer(report(10, 1.5));
    await waitFor(() => expect(visit.result.current.pending).toBe(0));
    visit.unmount();

    // The next visit has the score before anything is analyzed, and still analyzes again.
    const second = client();
    const again = await freshHook(second.client);
    expect(again.result.current.pending).toBe(0);
    expect(again.result.current.summaries.get('qwerty')?.effort).toBe(10);
    await waitFor(() => expect(second.asked()).toBe(1));

    // The same numbers change nothing; different ones replace what was shown.
    const shown = again.result.current.summaries;
    second.answer(report(10, 1.5));
    await vi.advanceTimersByTimeAsync(50);
    expect(again.result.current.summaries).toBe(shown);
    again.unmount();

    const third = client();
    const later = await freshHook(third.client);
    await waitFor(() => expect(third.asked()).toBe(1));
    third.answer(report(12, 2));
    await waitFor(() => expect(later.result.current.summaries.get('qwerty')?.effort).toBe(12));
  });
});
