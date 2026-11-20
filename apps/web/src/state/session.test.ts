import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './session.js';

afterEach(() => {
  vi.restoreAllMocks();
  useSession.setState({ libraryHeat: false, libraryHeatMode: 'usage' });
});

describe('the preferences kept in this browser', () => {
  it('are kept as they are chosen', () => {
    useSession.getState().setLibraryHeat(true);
    useSession.getState().setLibraryHeatMode('travel');
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      libraryHeat: true,
      libraryHeatMode: 'travel',
    });
  });

  it('read a state stored before groups could start folded, and keep what it held', async () => {
    // The store as it first is, not as an earlier test left it. Putting it back writes it out, so the
    // old state is stored after.
    useSession.setState(useSession.getInitialState(), true);
    localStorage.setItem(
      'layerbench:session',
      JSON.stringify({ state: { collapsedGroups: ['analyze.summary'] }, version: 0 }),
    );
    await useSession.persist.rehydrate();
    expect(useSession.getState().collapsedGroups).toEqual(['analyze.summary']);
    expect(useSession.getState().openedGroups).toEqual([]);
  });

  it('hold for the visit where the browser will not store them, and the choice does not throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('the quota is exceeded', 'QuotaExceededError');
    });
    expect(() => useSession.getState().setLibraryHeat(true)).not.toThrow();
    expect(useSession.getState().libraryHeat).toBe(true);
  });
});
