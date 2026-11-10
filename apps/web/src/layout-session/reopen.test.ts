import { describe, expect, it } from 'vitest';
import type { SessionState } from './session.js';
import { reopenAfterReplace } from './use-layout-session.js';

const open = (extra: Partial<Extract<SessionState, { status: 'open' }>>): SessionState =>
  ({
    status: 'open',
    opening: 1,
    storedId: 'mine',
    source: null,
    pickedRef: 'custom:mine',
    saving: false,
    startsUnsaved: false,
    ...extra,
  }) as SessionState;

describe('a layout replaced under its editor', () => {
  it('is opened again when nothing in the editor is unsaved', () => {
    expect(reopenAfterReplace(open({}), ['layouts/mine'])).toBe(true);
  });

  it('is left alone when the editor has unsaved edits, which would be dropped', () => {
    expect(reopenAfterReplace(open({ pickedRef: 'inline:abc' }), ['layouts/mine'])).toBe(false);
  });

  it('is left alone when it is another layout, or nothing is open', () => {
    expect(reopenAfterReplace(open({}), ['layouts/other'])).toBe(false);
    expect(reopenAfterReplace({ status: 'opening', opening: 0 }, ['layouts/mine'])).toBe(false);
    expect(reopenAfterReplace(open({ storedId: null }), ['layouts/mine'])).toBe(false);
  });
});
