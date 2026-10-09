import { bundledLayout, getPreset, type Layout } from '@layerbench/core';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisClient, ReportDTO } from './protocol.js';
import type { LayoutSummary, SummaryEntry } from './use-summaries.js';

const OPTS = {
  corpusId: 'en-general',
  caseMode: 'fold' as const,
  textClass: 'letters' as const,
  maxSymbols: 10_000,
  ruleSet: getPreset('layouts_doc'),
};

const CONTEXT = 'en-general, layouts_doc';

const QWERTY = { key: 'qwerty', layout: bundledLayout('qwerty') as Layout };
const COLEMAK = { key: 'colemak', layout: bundledLayout('colemak') as Layout };
const ENTRIES = [QWERTY];

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

function summary(effort: number, sfb: number): LayoutSummary {
  return { effort, sfb, skipped: 0, missing: [] };
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

/** What an earlier visit left in this browser, written as it would have. */
async function remembered(context: string, entries: [string, LayoutSummary][]): Promise<void> {
  const { rememberSummary } = await import('./ranking-memory.js');
  for (const [key, s] of entries) rememberSummary(context, key, s);
}

/**
 * The hook module keeps this page's own results in memory, so each test imports it afresh: a new
 * visit, with only what the browser stored. `renders` gets what each render returned, the first
 * one included, which a test reading the hook after its effects would never see.
 */
async function freshHook(
  c: AnalysisClient,
  entries: SummaryEntry[] = ENTRIES,
  context = CONTEXT,
  renders: Map<string, LayoutSummary>[] = [],
) {
  vi.resetModules();
  const { useSummaries } = await import('./use-summaries.js');
  const { AnalysisClientProvider } = await import('./client-context.js');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnalysisClientProvider client={c}>{children}</AnalysisClientProvider>
  );
  return renderHook(
    () => {
      const result = useSummaries(entries, OPTS, context);
      renders.push(result.summaries);
      return result;
    },
    { wrapper },
  );
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

  it('has them from the very first render, so the list never shows in another order', async () => {
    await remembered(CONTEXT, [['qwerty', summary(10, 1.5)]]);
    const renders: Map<string, LayoutSummary>[] = [];
    await freshHook(client().client, ENTRIES, CONTEXT, renders);
    expect(renders[0].get('qwerty')?.effort).toBe(10);
  });

  it('shows a layout’s score while its document is still being read', async () => {
    await remembered(CONTEXT, [['s:mine', summary(8, 1)]]);
    const c = client();
    const visit = await freshHook(c.client, [QWERTY, { key: 's:mine', layout: null }]);
    expect(visit.result.current.summaries.get('s:mine')?.effort).toBe(8);
    // Only the layout it has is counted as waiting, and only that one is analyzed.
    expect(visit.result.current.pending).toBe(1);
    await waitFor(() => expect(c.asked()).toBe(1));
  });

  it('keeps the scores of another text or rule set apart', async () => {
    await remembered('pt-br-general, layouts_doc', [['qwerty', summary(10, 1.5)]]);
    const visit = await freshHook(client().client);
    expect(visit.result.current.summaries.size).toBe(0);
    expect(visit.result.current.pending).toBe(1);
  });
});

describe('scores checked again', () => {
  it('moves the layouts whose numbers changed together, once every layout is checked', async () => {
    await remembered(CONTEXT, [
      ['qwerty', summary(10, 1.5)],
      ['colemak', summary(20, 1)],
    ]);
    const c = client();
    const visit = await freshHook(c.client, [QWERTY, COLEMAK]);
    const shown = visit.result.current.summaries;

    await waitFor(() => expect(c.asked()).toBe(1));
    c.answer(report(30, 2));
    await waitFor(() => expect(c.asked()).toBe(2));
    // Changed, but held while the rest are still being checked.
    expect(visit.result.current.summaries).toBe(shown);
    expect(visit.result.current.summaries.get('qwerty')?.effort).toBe(10);

    c.answer(report(20, 1));
    await waitFor(() => expect(visit.result.current.summaries.get('qwerty')?.effort).toBe(30));
    expect(visit.result.current.summaries.get('colemak')?.effort).toBe(20);
  });

  it('shows a score for a layout that had none as soon as it lands', async () => {
    await remembered(CONTEXT, [['qwerty', summary(10, 1.5)]]);
    const c = client();
    // Colemak is checked first, and has nothing to show until it is.
    const visit = await freshHook(c.client, [COLEMAK, QWERTY]);
    expect(visit.result.current.pending).toBe(1);

    await waitFor(() => expect(c.asked()).toBe(1));
    c.answer(report(25, 1));
    await waitFor(() => expect(visit.result.current.summaries.get('colemak')?.effort).toBe(25));
    // Qwerty is still being checked meanwhile.
    expect(c.asked()).toBe(2);
    expect(visit.result.current.pending).toBe(0);
  });

  it('remembers each score as it lands, so leaving halfway loses nothing', async () => {
    const c = client();
    const visit = await freshHook(c.client, [QWERTY, COLEMAK]);
    await waitFor(() => expect(c.asked()).toBe(1));
    c.answer(report(30, 2));
    await waitFor(() => expect(c.asked()).toBe(2));
    visit.unmount();

    const again = await freshHook(client().client, [QWERTY, COLEMAK]);
    expect(again.result.current.summaries.get('qwerty')?.effort).toBe(30);
    expect(again.result.current.pending).toBe(1);
  });
});
