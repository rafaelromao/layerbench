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

  it('hold for the visit where the browser will not store them, and the choice does not throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('the quota is exceeded', 'QuotaExceededError');
    });
    expect(() => useSession.getState().setLibraryHeat(true)).not.toThrow();
    expect(useSession.getState().libraryHeat).toBe(true);
  });
});
