import { compileLayout, type Layout } from '@layerbench/core';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReportDTO } from '../engine/protocol.js';
import { useSession } from '../state/session.js';
import { KeyStats } from './KeyStats.js';

afterEach(() => {
  useSession.setState({ collapsedGroups: [] });
});

const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'two keys',
  geometry: { preset: '3x5+2' },
  keys: { space: 'L0' },
  layers: [{ id: 'base', bindings: { LHP: { kind: 'kp', symbol: 'a' } } }],
};
const compiled = compileLayout(layout);
const LHP = compiled.keyIndex.get('LHP') as number;
const LHR = compiled.keyIndex.get('LHR') as number;

/** The part of a report a key's numbers read: its presses, and which keys each position is. */
function reportOf(onBase: Record<number, number>, combo: number[] = []): ReportDTO {
  const positions = compiled.positions.length + 1;
  const base = new Array<number>(positions).fill(0);
  for (const [pos, n] of Object.entries(onBase)) base[Number(pos)] = n;
  return {
    results: [],
    usageByLayer: [base],
    usageAll: base,
    layerTapsByLayer: [new Array<number>(positions).fill(0)],
    members: [...compiled.positions.map((p) => p.members), combo],
  } as unknown as ReportDTO;
}

/** The sentence a key's numbers open with. */
function headline(report: ReportDTO, key: string): string {
  const { container } = render(
    <KeyStats
      compiled={compiled}
      report={report}
      keyId={key}
      layer={0}
      stats={null}
      updating={false}
    />,
  );
  return container.querySelector('.lb-key-stats p')?.textContent ?? '';
}

describe("a key's numbers, as they open", () => {
  it('give its share of the presses as the key’s tooltip writes it', () => {
    expect(headline(reportOf({ [LHP]: 1234, [LHR]: 8766 }), 'LHP')).toBe(
      '12.34% of the presses (1,234)',
    );
  });

  it('say under 0.01% for a key pressed too rarely for two decimals', () => {
    expect(headline(reportOf({ [LHP]: 1, [LHR]: 99_999 }), 'LHP')).toBe(
      'under 0.01% of the presses (1)',
    );
  });

  it('say 0% for a key pressed only in combos, and how many presses those were', () => {
    const combo = compiled.positions.length;
    expect(headline(reportOf({ [LHR]: 10, [combo]: 5 }, [LHP, LHR]), 'LHP')).toBe(
      '0% of the presses (0), and 5 in combos',
    );
  });

  it('say a key never pressed is not pressed', () => {
    expect(headline(reportOf({ [LHR]: 10 }), 'LHP')).toBe('Not pressed on base in this text.');
  });
});
