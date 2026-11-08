import type { RuleResult } from '@layerbench/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MetricCard } from './Metrics.js';

const KEYS = 'L1 (Repeat) → L0 (space / Numb) · same finger, LT';

const result: RuleResult = {
  id: 'sfb',
  label: 'Same finger bigrams',
  family: 'bigram',
  value: 1.4,
  unit: 'percent',
  band: { index: null, label: null, quality: 'neutral' },
  items: [{ label: '⟳␣', keys: [20, 21], percent: 0.2 }],
  per_finger: {},
  per_key: {},
  per_layer_key: {},
  key_scale: null,
  per_hand: {},
  breakdown: {},
  note: null,
  enabled: true,
  score_weight: 0,
  normalized: null,
};

describe('a metric card’s items', () => {
  it('names the keys of an item in its tooltip, which its label does not', () => {
    render(<MetricCard result={result} describeItem={() => KEYS} />);
    expect(screen.getByRole('button', { name: '⟳␣' })).toHaveAttribute('title', `⟳␣\n${KEYS}`);
    // The card itself stays as compact as it was.
    expect(screen.queryByText(KEYS)).toBeNull();
  });

  it('writes them under the item when the card is enlarged', async () => {
    render(<MetricCard result={result} describeItem={() => KEYS} />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Enlarge Same finger bigrams' }));
    expect(within(screen.getByRole('dialog')).getByText(KEYS)).toBeInTheDocument();
  });

  it('is the label alone where nothing describes the keys', () => {
    render(<MetricCard result={result} />);
    expect(screen.getByRole('button', { name: '⟳␣' })).toHaveAttribute('title', '⟳␣');
  });

  it('keeps the value, the bar and the keys in separate lines when enlarged', async () => {
    render(<MetricCard result={result} describeItem={() => KEYS} />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Enlarge Same finger bigrams' }));
    const row = within(screen.getByRole('dialog')).getByText(KEYS).closest('li');
    // The keys' line is the row's own, under the label, bar and value, which share one line.
    expect(row?.firstElementChild?.querySelector('button')).not.toBeNull();
    expect(row?.firstElementChild?.textContent).not.toContain(KEYS);
  });
});
