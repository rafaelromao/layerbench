import { describe, expect, it, vi } from 'vitest';
import { Unsynced } from './unsynced.js';

function memory(initial: string | null = null) {
  let text = initial;
  return {
    backing: {
      read: () => text,
      write: (t: string) => {
        text = t;
      },
    },
    text: () => text,
  };
}

describe('the documents saved here and not sent', () => {
  it('marks, counts and clears', () => {
    const marks = new Unsynced(memory().backing);
    expect(marks.count()).toBe(0);
    marks.mark('layouts', 'a');
    marks.mark('layouts', 'a');
    marks.mark('rulesets', 'a');
    expect(marks.count()).toBe(2);
    expect(marks.has('layouts', 'a')).toBe(true);
    expect(marks.has('corpora', 'a')).toBe(false);
    marks.clear('layouts', 'a');
    expect(marks.has('layouts', 'a')).toBe(false);
    expect(marks.count()).toBe(1);
  });

  it('keeps them where they are given to keep, for the next visit', () => {
    const kept = memory();
    new Unsynced(kept.backing).mark('layouts', 'gust');
    expect(new Unsynced(kept.backing).has('layouts', 'gust')).toBe(true);
  });

  it('reads nothing into what is not marks', () => {
    for (const text of ['not json', '[1,2]', '', 'null', '{"unsent":"layouts/a"}']) {
      expect(new Unsynced(memory(text).backing).count()).toBe(0);
    }
    const kept = new Unsynced(
      memory('{"unsent":["layouts/a",3],"base":{"layouts/a":"s","x":4}}').backing,
    );
    expect(kept.count()).toBe(1);
    expect(kept.base('layouts', 'a')).toBe('s');
    expect(kept.base('layouts', 'x')).toBeNull();
  });

  it('lists the marked documents of a collection', () => {
    const marks = new Unsynced(memory().backing);
    marks.mark('layouts', 'a');
    marks.mark('layouts', 'b');
    marks.mark('rulesets', 'c');
    expect(marks.marked('layouts')).toEqual(['a', 'b']);
    expect(marks.marked('corpora')).toEqual([]);
  });

  it('keeps the version a document last had in both stores, apart from whether it is marked', () => {
    const marks = new Unsynced(memory().backing);
    expect(marks.base('layouts', 'a')).toBeNull();
    marks.setBase('layouts', 'a', 'sha-1');
    marks.mark('layouts', 'a');
    marks.clear('layouts', 'a');
    expect(marks.base('layouts', 'a')).toBe('sha-1');
    marks.setBase('layouts', 'a', 'sha-2');
    expect(marks.base('layouts', 'a')).toBe('sha-2');
  });

  it('forgets everything about a document', () => {
    const marks = new Unsynced(memory().backing);
    marks.mark('layouts', 'a');
    marks.setBase('layouts', 'a', 'sha-1');
    marks.mark('layouts', 'b');
    marks.forget('layouts', 'a');
    expect(marks.has('layouts', 'a')).toBe(false);
    expect(marks.base('layouts', 'a')).toBeNull();
    expect(marks.has('layouts', 'b')).toBe(true);
  });

  it('keeps who this browser last sent to', () => {
    const kept = memory();
    const marks = new Unsynced(kept.backing);
    expect(marks.account()).toBeNull();
    marks.setAccount('you');
    marks.mark('layouts', 'a');
    expect(new Unsynced(kept.backing).account()).toBe('you');
  });

  it('tells those listening when the marks change, and only then', () => {
    const marks = new Unsynced(memory().backing);
    const heard = vi.fn();
    const stop = marks.subscribe(heard);
    marks.mark('layouts', 'a');
    marks.mark('layouts', 'a');
    marks.clear('layouts', 'zzz');
    expect(heard).toHaveBeenCalledTimes(1);
    marks.clear('layouts', 'a');
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    marks.mark('layouts', 'b');
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('keeps a mark the browser had no room for, rather than losing it', () => {
    const marks = new Unsynced();
    marks.mark('layouts', 'a');
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      marks.mark('layouts', 'b');
      // What the browser holds is out of date from now on: the page's own marks are the truth.
      expect(marks.has('layouts', 'a')).toBe(true);
      expect(marks.has('layouts', 'b')).toBe(true);
      expect(marks.count()).toBe(2);
    } finally {
      set.mockRestore();
    }
  });

  it('lasts for the page when the browser keeps no site data', () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    try {
      const marks = new Unsynced();
      marks.mark('layouts', 'a');
      expect(marks.has('layouts', 'a')).toBe(true);
    } finally {
      blocked.mockRestore();
      set.mockRestore();
    }
  });
});

describe('the look at the account, with the documents it lacked', () => {
  const missing = [
    { collection: 'layouts', id: 'a', name: 'A', sent: false },
    { collection: 'corpora', id: 'b', name: 'B', sent: true },
  ] as const;

  it('keeps which documents the account lacked, not only how many', () => {
    const kept = memory();
    new Unsynced(kept.backing).setAudit({
      account: 'me',
      at: 5,
      lacking: 2,
      missing: [...missing],
    });
    expect(new Unsynced(kept.backing).audit()).toEqual({
      account: 'me',
      at: 5,
      lacking: 2,
      missing,
    });
  });

  it('reads one kept as a count only, as before they were listed, as having no list', () => {
    const kept = memory(
      JSON.stringify({ unsent: [], base: {}, audit: { account: 'me', at: 5, lacking: 2 } }),
    );
    expect(new Unsynced(kept.backing).audit()).toEqual({ account: 'me', at: 5, lacking: 2 });
  });

  it('reads a list that is not whole as no list, never as a shorter one', () => {
    const bad = { collection: 'nothing', id: 'x', name: 'X', sent: false };
    const kept = memory(
      JSON.stringify({
        unsent: [],
        base: {},
        audit: { account: 'me', at: 5, lacking: 2, missing: [missing[0], bad] },
      }),
    );
    expect(new Unsynced(kept.backing).audit()).toEqual({ account: 'me', at: 5, lacking: 2 });
  });
});
