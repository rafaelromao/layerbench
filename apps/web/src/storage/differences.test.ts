import { bundledLayout, toCanonicalJson } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import type { Conflict } from './composite.js';
import { compareLink, describeDifferences } from './differences.js';

describe('what differs between two versions', () => {
  it('shows a name or a note as it reads in each', () => {
    expect(
      describeDifferences(
        { format: 'f', id: 'a', name: 'Gust', author: 'Me' },
        { format: 'f', id: 'a', name: 'Gust 2', author: 'Me' },
      ),
    ).toEqual(['name: “Gust” in this browser, “Gust 2” in GitHub']);
  });

  it('says a field one has and the other lacks', () => {
    expect(describeDifferences({ name: 'A', author: 'Me' }, { name: 'A' })).toEqual([
      'author: “Me” in this browser, none in GitHub',
    ]);
  });

  it('shortens a long value', () => {
    const [line] = describeDifferences({ description: 'x'.repeat(100) }, { description: 'y' });
    expect(line.length).toBeLessThan(90);
    expect(line).toContain('…');
  });

  it('counts the keys of a layer that differ, and names layers only one has', () => {
    const layer = (id: string, name: string, bindings: Record<string, unknown>) => ({
      id,
      name,
      bindings,
    });
    expect(
      describeDifferences(
        {
          layers: [
            layer('base', 'Base', { a: 1, b: 2, c: 3 }),
            layer('sym', 'Symbols', { a: 1 }),
            layer('mine', 'Mine only', {}),
          ],
        },
        {
          layers: [
            layer('base', 'Base', { a: 1, b: 9, c: 8 }),
            layer('sym', 'Symbols', { a: 1 }),
            layer('theirs', 'Theirs only', {}),
          ],
        },
      ),
    ).toEqual([
      'layer Base: 2 keys differ',
      'layer Mine only: only in this browser',
      'layer Theirs only: only in GitHub',
    ]);
    expect(
      describeDifferences(
        { layers: [layer('base', 'Base', { a: 1, b: 2 })] },
        { layers: [layer('base', 'Base', { a: 1, b: 3 })] },
      ),
    ).toEqual(['layer Base: 1 key differs']);
  });

  it('counts the items of a list that only one has', () => {
    expect(
      describeDifferences(
        { combos: [{ keys: ['a', 'b'] }, { keys: ['c', 'd'] }] },
        { combos: [{ keys: ['a', 'b'] }, { keys: ['e', 'f'] }, { keys: ['g', 'h'] }] },
      ),
    ).toEqual(['combos: 1 only in this browser, 2 only in GitHub']);
  });

  it('counts the settings of an object that differ', () => {
    expect(
      describeDifferences(
        { geometry: { preset: 'x', columnOffsets: { a: 1, b: 2 } } },
        { geometry: { preset: 'y', columnOffsets: { a: 1, b: 3 } } },
      ),
    ).toEqual(['geometry: 2 settings differ']);
  });

  it('keeps to a few lines and counts the rest', () => {
    const mine: Record<string, string> = {};
    const theirs: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      mine[`field${String(i).padStart(2, '0')}`] = 'a';
      theirs[`field${String(i).padStart(2, '0')}`] = 'b';
    }
    const lines = describeDifferences(mine, theirs);
    expect(lines).toHaveLength(9);
    expect(lines.at(-1)).toBe('and 4 more');
  });

  it('still says something when only the way they are written differs', () => {
    expect(describeDifferences({ id: 'a' }, { id: 'b' })).toEqual(['The two versions differ.']);
    expect(describeDifferences('x', { a: 1 })).toEqual(['The two versions differ.']);
  });
});

describe('a link to compare the two versions', () => {
  const qwerty = toCanonicalJson(bundledLayout('qwerty') as never);
  const conflict = (
    collection: Conflict['collection'],
    mine: object,
    theirs: object,
  ): Conflict => ({
    collection,
    id: 'gust',
    name: 'Gust',
    mine: { doc: mine as never, updatedAt: '2026-11-10T09:00:00Z' },
    theirs: { name: 'Gust', doc: theirs as never, updatedAt: '2026-11-10T11:00:00Z', sha: 's' },
  });

  it('carries both layouts whole, after the #, each named for where it is', async () => {
    const link = await compareLink(
      conflict('layouts', qwerty, { ...qwerty, name: 'Qwerty, edited' }),
    );
    expect(link).toMatch(/\/compare#layout=inline%3A.+&b=inline%3A/);
  });

  it('is only for layouts that read as layouts', async () => {
    expect(await compareLink(conflict('rulesets', qwerty, qwerty))).toBeNull();
    expect(await compareLink(conflict('layouts', { name: 'not a layout' }, qwerty))).toBeNull();
    expect(await compareLink(conflict('layouts', qwerty, { name: 'not a layout' }))).toBeNull();
  });
});
