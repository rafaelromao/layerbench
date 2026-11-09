import { describe, expect, it } from 'vitest';
import { HELP, rulerHelp, rulerShown } from './help.js';

describe('the ruler a badge leads to', () => {
  const doc = { id: 'layouts_doc' };
  const cyanophage = { id: 'cyanophage' };

  it('is the section of the preset the link names, and the general one for any other set', () => {
    expect(rulerHelp('layouts_doc')).toBe(HELP.rulerLayoutsDoc);
    expect(rulerHelp('cyanophage')).toBe(HELP.rulerCyanophage);
    expect(rulerHelp('custom:mine')).toBe(HELP.rulers);
    expect(rulerHelp(undefined)).toBe(HELP.rulers);
  });

  it('is shown while the numbers on screen were rated on the rules now named', () => {
    expect(rulerShown('layouts_doc', doc, doc)).toBe(HELP.rulerLayoutsDoc);
  });

  it('is not shown after a switch of rules, until the new numbers land', () => {
    // The last report is of the Layouts Doc rules, the link names cyanophage-like.
    expect(rulerShown('cyanophage', doc, cyanophage)).toBeUndefined();
  });

  it('is not shown while nothing has been rated, or the rules are not read', () => {
    expect(rulerShown('layouts_doc', null, doc)).toBeUndefined();
    expect(rulerShown('layouts_doc', undefined, undefined)).toBeUndefined();
    expect(rulerShown('layouts_doc', doc, null)).toBeUndefined();
  });
});
