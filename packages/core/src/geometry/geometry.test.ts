import { describe, expect, it } from 'vitest';
import { applyFingering, getGeometryPreset, GEOMETRY_PRESET_IDS } from './presets.js';
import { keyDistance } from './distance.js';

describe('geometry presets', () => {
  it('have the expected key counts and unique ids', () => {
    const expected: Record<string, number> = { '3x5+2': 34, '3x5+3': 36, '3x6+3': 42, '1333+2': 24, ansi: 34, iso: 35 };
    for (const id of GEOMETRY_PRESET_IDS) {
      const g = getGeometryPreset(id);
      expect(g.keys.length, id).toBe(expected[id]);
      expect(new Set(g.keys.map((k) => k.id)).size).toBe(g.keys.length);
    }
  });

  it('1333+2 has only the home-row pinky and thumbs L1 L0 R0 R1', () => {
    const g = getGeometryPreset('1333+2');
    const ids = g.keys.map((k) => k.id);
    expect(ids).toContain('LHP');
    expect(ids).not.toContain('LTP');
    expect(ids).not.toContain('LBP');
    expect(g.textThumbs).toEqual(['L1', 'L0', 'R0', 'R1']);
  });

  it('columnar stagger lowers the pinky and raises the middle column', () => {
    const g = getGeometryPreset('3x5+2');
    const pinky = g.keys.find((k) => k.id === 'LHP')!;
    const middle = g.keys.find((k) => k.id === 'LHM')!;
    expect(pinky.y).toBeGreaterThan(middle.y);
  });

  it('row stagger offsets top row by -0.25U and bottom row by +0.5U', () => {
    const g = getGeometryPreset('ansi');
    const q = g.keys.find((k) => k.id === 'LTP')!;
    const a = g.keys.find((k) => k.id === 'LHP')!;
    const z = g.keys.find((k) => k.id === 'LBP')!;
    expect(q.x - a.x).toBeCloseTo(-0.25);
    expect(z.x - a.x).toBeCloseTo(0.5);
  });

  it('angle mod refingers the left bottom row (ANSI: pinky loses a key, index gains one)', () => {
    const g = applyFingering(getGeometryPreset('ansi'), 'angle-mod');
    const z = g.keys.find((k) => k.id === 'LBP')!;
    const x = g.keys.find((k) => k.id === 'LBR')!;
    const c = g.keys.find((k) => k.id === 'LBM')!;
    expect(z.finger).toBe('LR');
    expect(x.finger).toBe('LM');
    expect(c.finger).toBe('LI');
  });

  it('distance is undefined across hands and Euclidean within a hand', () => {
    const g = getGeometryPreset('3x5+2');
    const a = g.keys.find((k) => k.id === 'LHM')!;
    const b = g.keys.find((k) => k.id === 'LHI')!;
    const r = g.keys.find((k) => k.id === 'RHI')!;
    expect(keyDistance(a, r)).toBeNull();
    expect(keyDistance(a, b)!).toBeCloseTo(Math.sqrt(1 + 0.25 * 0.25));
    expect(keyDistance(a, b, 'squared')!).toBeCloseTo(1 + 0.0625);
  });
});
