import { describe, expect, it } from 'vitest';
import type { AnalysisCore } from './analysis-core.js';
import type { Request, Response } from './protocol.js';
import { createRequestHandler } from './worker-handler.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A stand-in engine whose analysis types in three pauses, recording what it did, and gives up when
 * told nobody waits any more, as the real one does.
 */
function fakeCore(log: string[]) {
  return {
    async analyze(req: { corpusId: string }, _progress: unknown, isCancelled: () => boolean) {
      log.push(`start ${req.corpusId}`);
      for (let i = 0; i < 3; i++) {
        if (isCancelled()) {
          log.push(`dropped ${req.corpusId}`);
          throw new DOMException('aborted', 'AbortError');
        }
        await tick();
      }
      log.push(`done ${req.corpusId}`);
      return req.corpusId;
    },
    peek: () => {
      log.push('peek');
      return null;
    },
  } as unknown as AnalysisCore;
}

function setup() {
  const log: string[] = [];
  const out: Response[] = [];
  const handle = createRequestHandler(fakeCore(log), (m) => out.push(m));
  const analyze = (id: number, corpusId: string) =>
    handle({ id, type: 'analyze', request: { corpusId } } as unknown as Request);
  return { log, out, handle, analyze };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await tick();
};

describe('the worker, answering', () => {
  it('runs analyses one after another, and answers the rest in between', async () => {
    const { log, out, handle, analyze } = setup();
    analyze(1, 'a');
    analyze(2, 'b');
    handle({ id: 3, type: 'peek', request: {} } as unknown as Request);
    await settle();
    expect(log.indexOf('peek')).toBeLessThan(log.indexOf('done a'));
    expect(log.indexOf('done a')).toBeLessThan(log.indexOf('start b'));
    expect(out.filter((m) => 'ok' in m).map((m) => m.id)).toEqual([3, 1, 2]);
  });

  it('drops an analysis cancelled while it runs, and one cancelled before it starts, unanswered', async () => {
    const { log, out, handle, analyze } = setup();
    analyze(1, 'a');
    analyze(2, 'b');
    analyze(3, 'c');
    await tick();
    handle({ id: 1, type: 'cancel' });
    handle({ id: 2, type: 'cancel' });
    await settle();
    expect(log).toContain('dropped a');
    expect(log).toContain('dropped b');
    expect(log).toContain('done c');
    expect(out.filter((m) => 'ok' in m).map((m) => m.id)).toEqual([3]);
  });

  it('ignores a cancel for a request it no longer holds', async () => {
    const { out, handle, analyze } = setup();
    analyze(1, 'a');
    await settle();
    handle({ id: 1, type: 'cancel' });
    handle({ id: 9, type: 'cancel' });
    analyze(2, 'b');
    await settle();
    expect(out.filter((m) => 'ok' in m).map((m) => m.id)).toEqual([1, 2]);
  });
});
