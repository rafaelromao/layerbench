import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ID_PATTERN, toCanonicalJson } from '@layerbench/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { branchWith, communityDoc } from '../test/community.js';
import {
  communityLayout,
  githubSource,
  indexIds,
  readCommunity,
  readLayouts,
  refreshCommunity,
  setCommunitySource,
  useCommunity,
} from './community.js';

const owl = communityDoc('night-owl', 'Night owl');
const lark = communityDoc('lark', 'Lark');

describe('The index of community layouts', () => {
  it('lists the ids it names, each once, and nothing that is not a document id', () => {
    expect(indexIds({ layouts: ['lark', 'lark', '../x', 7, 'index', 'night-owl'] })).toEqual([
      'lark',
      'night-owl',
    ]);
  });

  it('is no index without a list of layouts', () => {
    expect(() => indexIds(null)).toThrow('lists no layouts');
    expect(() => indexIds({ layouts: 'lark' })).toThrow('lists no layouts');
  });
});

describe('Reading the community layouts', () => {
  it('reads every layout the index lists', async () => {
    const layouts = readLayouts(await readCommunity(branchWith(owl, lark)), []);
    expect(layouts.map((l) => l.name)).toEqual(['Night owl', 'Lark']);
  });

  it('tells a layout that is not one as LayerBench saves it from one that would not come', async () => {
    const files: Record<string, unknown> = {
      'index.json': {
        layouts: [
          'night-owl',
          'gone',
          'no-author',
          'no-link',
          'bad-link',
          'misnamed',
          'odd',
          'no-board',
        ],
      },
      'night-owl.json': toCanonicalJson(owl),
      'no-author.json': toCanonicalJson({ ...communityDoc('no-author', 'A'), author: '' }),
      // A link is optional; one given is an http(s) URL.
      'no-link.json': toCanonicalJson({ ...communityDoc('no-link', 'B'), link: undefined }),
      'bad-link.json': { ...toCanonicalJson(communityDoc('bad-link', 'E')), link: 'example.com' },
      'misnamed.json': toCanonicalJson(communityDoc('other', 'C')),
      'odd.json': { name: 'Odd' },
      // A layout as LayerBench saves it, on a board it does not know: it would open nowhere.
      'no-board.json': toCanonicalJson({
        ...communityDoc('no-board', 'D'),
        geometry: { preset: 'no-such-board' },
      }),
    };
    const read = await readCommunity(async (file) => {
      if (!(file in files)) throw new Error('404');
      return files[file];
    });
    expect(read.map((r) => [r.id, r.status])).toEqual([
      ['night-owl', 'read'],
      ['gone', 'unread'],
      ['no-author', 'invalid'],
      ['no-link', 'read'],
      ['bad-link', 'invalid'],
      ['misnamed', 'invalid'],
      ['odd', 'invalid'],
      ['no-board', 'invalid'],
    ]);
    // One that would not come keeps the copy read before; one that is not a layout does not.
    const before = [communityDoc('gone', 'Gone'), communityDoc('odd', 'Odd')];
    expect(readLayouts(read, before).map((l) => l.id)).toEqual(['night-owl', 'gone', 'no-link']);
  });

  it('reads an index that lists nothing as no layouts', async () => {
    await expect(readCommunity(branchWith())).resolves.toEqual([]);
  });

  it('fails when the index will not read', async () => {
    await expect(
      readCommunity(async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
  });
});

describe('The community layouts kept in this browser', () => {
  it('keeps what it read, and has it at once on the next visit', async () => {
    setCommunitySource(branchWith(owl));
    await refreshCommunity();
    expect(useCommunity.getState()).toMatchObject({ status: 'read', error: null });

    // The next visit, offline: the layouts read last time are there, and stay.
    setCommunitySource(async () => {
      throw new Error('offline');
    });
    expect(useCommunity.getState().layouts.map((l) => l.id)).toEqual(['night-owl']);
    await refreshCommunity();
    expect(useCommunity.getState()).toMatchObject({ status: 'failed', error: 'offline' });
    expect(useCommunity.getState().layouts.map((l) => l.id)).toEqual(['night-owl']);
  });

  it('checks what this browser kept as it checks the branch', () => {
    localStorage.setItem(
      'layerbench:community',
      JSON.stringify([toCanonicalJson(lark), { id: 'odd' }, null]),
    );
    setCommunitySource(branchWith());
    expect(useCommunity.getState().layouts.map((l) => l.id)).toEqual(['lark']);
    localStorage.setItem('layerbench:community', '{');
    setCommunitySource(branchWith());
    expect(useCommunity.getState().layouts).toEqual([]);
    localStorage.setItem('layerbench:community', '{}');
    setCommunitySource(branchWith());
    expect(useCommunity.getState().layouts).toEqual([]);
  });

  it('reads once for every read asked for while one runs', async () => {
    const branch = branchWith(owl);
    setCommunitySource(branch);
    await Promise.all([refreshCommunity(), refreshCommunity()]);
    expect(branch.reads).toEqual(['index.json', 'night-owl.json']);
  });

  it('finds a layout not kept here by reading the branch, once a page load', async () => {
    const branch = branchWith(owl);
    setCommunitySource(branch);
    expect((await communityLayout('night-owl'))?.name).toBe('Night owl');
    expect(await communityLayout('lark')).toBeUndefined();
    expect(branch.reads).toEqual(['index.json', 'night-owl.json']);
  });

  it('reads again for the next link when a read failed', async () => {
    let online = false;
    const branch = branchWith(owl);
    setCommunitySource(async (file) => {
      if (!online) throw new Error('offline');
      return branch(file);
    });
    expect(await communityLayout('night-owl')).toBeUndefined();
    online = true;
    expect((await communityLayout('night-owl'))?.name).toBe('Night owl');
  });

  it('opens a link as the branch has it now, and as kept here only when it cannot be read', async () => {
    setCommunitySource(branchWith(owl));
    await refreshCommunity();
    // The next visit: the branch has changed it since.
    const changed = communityDoc('night-owl', 'Night owl 2');
    setCommunitySource(branchWith(changed));
    expect((await communityLayout('night-owl'))?.name).toBe('Night owl 2');
    // And the visit after, offline.
    setCommunitySource(async () => {
      throw new Error('offline');
    });
    expect((await communityLayout('night-owl'))?.name).toBe('Night owl 2');
  });

  it('reads again for the next link once a later read failed', async () => {
    let online = true;
    const branch = branchWith(owl);
    setCommunitySource(async (file) => {
      if (!online) throw new Error('offline');
      return branch(file);
    });
    await refreshCommunity();
    online = false;
    await refreshCommunity();
    online = true;
    expect(await communityLayout('lark')).toBeUndefined();
    expect(useCommunity.getState().status).toBe('read');
  });

  it('reads again for the next link when its file would not come', async () => {
    let tries = 0;
    const branch = branchWith(owl);
    setCommunitySource(async (file) => {
      if (file === 'night-owl.json' && ++tries === 1) throw new Error('503');
      return branch(file);
    });
    expect(await communityLayout('night-owl')).toBeUndefined();
    expect((await communityLayout('night-owl'))?.name).toBe('Night owl');
  });

  it('keeps a layout whose file would not come this time', async () => {
    setCommunitySource(branchWith(owl, lark));
    await refreshCommunity();
    const branch = branchWith(owl, lark);
    setCommunitySource(async (file) => {
      if (file === 'lark.json') throw new Error('429');
      return branch(file);
    });
    await refreshCommunity();
    expect(useCommunity.getState()).toMatchObject({
      status: 'partial',
      error: 'could not read lark',
    });
    expect(useCommunity.getState().layouts.map((l) => l.id)).toEqual(['night-owl', 'lark']);
  });

  it('drops a read a newer source has taken the place of', async () => {
    let finish: (v: unknown) => void = () => {};
    setCommunitySource(() => new Promise((resolve) => (finish = resolve)));
    const stale = refreshCommunity();
    setCommunitySource(branchWith(lark));
    finish({ layouts: [] });
    await stale;
    expect(useCommunity.getState().status).toBe('cached');
    await refreshCommunity();
    expect(useCommunity.getState().layouts.map((l) => l.id)).toEqual(['lark']);
  });
});

describe('The branch on GitHub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a file of the community folder of `layerbench-data`, asking afresh', async () => {
    const fetch = vi.fn(async () => new Response('{"layouts":[]}'));
    vi.stubGlobal('fetch', fetch);
    expect(await githubSource('index.json')).toEqual({ layouts: [] });
    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/rafaelromao/layerbench/layerbench-data/community/index.json',
      { cache: 'no-cache', credentials: 'omit' },
    );
  });

  it('fails on a file that is not there', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404, statusText: 'Not Found' }));
    await expect(githubSource('gone.json')).rejects.toThrow('gone.json: 404 Not Found');
  });
});

describe("The branch's starting tree", () => {
  const file = (path: string) =>
    readFileSync(resolve(process.cwd(), '../../data-branch', path), 'utf8');

  it('starts with an index the app reads, listing nothing', () => {
    expect(indexIds(JSON.parse(file('community/index.json')))).toEqual([]);
  });

  it('has its workflow list the names the app takes for ids, and only those', () => {
    expect(file('.github/workflows/community-index.yml')).toContain(
      `[[ $id =~ ${ID_PATTERN.source} ]]`,
    );
    // And never the reserved `index`, whatever its case, as `isDocumentId` refuses it.
    expect(file('.github/workflows/community-index.yml')).toContain('! -iname index.json');
    expect(indexIds({ layouts: ['Index', 'INDEX'] })).toEqual([]);
  });
});
