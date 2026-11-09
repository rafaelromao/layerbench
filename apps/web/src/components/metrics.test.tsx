import type { RuleResult } from '@layerbench/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { rulerHelp } from '../guide/help.js';
import { MetricCard, SummaryStrip } from './Metrics.js';

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

describe('the badge of Effort and SFB', () => {
  const rated = (id: string, label = 'high'): RuleResult => ({
    ...result,
    id,
    label:
      id === 'sfb' ? 'Same finger bigrams' : id === 'effort' ? 'Effort' : 'Same finger skipgrams',
    band: { index: 6, label, quality: 'bad', goodness: 0.25 },
  });

  it('leads to the guide’s ruler for the rule set, in a new tab', () => {
    render(<MetricCard result={rated('sfb')} ruler={rulerHelp('cyanophage')} />);
    const link = screen.getByRole('link', { name: /^high: how it is rated/ });
    expect(link).toHaveAttribute(
      'href',
      expect.stringMatching(/\/guide\/analyzing#the-cyanophage-like-rule-set$/),
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('high');
  });

  it('says which ruler it leads to: a preset’s own, or the general one for any other set', () => {
    for (const [set, section] of [
      ['layouts_doc', 'the-layouts-doc-rule-set'],
      ['cyanophage', 'the-cyanophage-like-rule-set'],
      ['custom:lenient', 'the-rulers'],
      [undefined, 'the-rulers'],
    ] as const) {
      expect(rulerHelp(set).section, String(set)).toBe(section);
    }
  });

  it('is the link’s own click: it does not enlarge the card', async () => {
    render(<MetricCard result={rated('sfb')} ruler={rulerHelp('layouts_doc')} />);
    const link = screen.getByRole('link', { name: /how it is rated/ });
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.setup().click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a plain pill on any other metric, and where no ruler is given', () => {
    const { rerender } = render(
      <MetricCard result={rated('sfs')} ruler={rulerHelp('layouts_doc')} />,
    );
    expect(screen.queryByRole('link', { name: /how it is rated/ })).toBeNull();
    expect(screen.getByText('high')).toBeInTheDocument();
    rerender(<MetricCard result={rated('effort')} />);
    expect(screen.queryByRole('link', { name: /how it is rated/ })).toBeNull();
  });

  it('sits beside the stat’s button in the summary, not inside it', async () => {
    const onSelect = vi.fn();
    render(
      <SummaryStrip
        results={[rated('effort', 'mid'), rated('sfb'), rated('sfs')]}
        ids={['effort', 'sfb', 'sfs']}
        onSelect={onSelect}
        ruler={rulerHelp('layouts_doc')}
      />,
    );
    const links = screen.getAllByRole('link', { name: /how it is rated/ });
    // Effort and SFB have one; the third stat does not.
    expect(links.map((l) => l.textContent)).toEqual(['mid', 'high']);
    const stat = screen.getByRole('button', { name: /^SFB/i });
    expect(stat.contains(links[1])).toBe(false);
    expect(links[1].closest('.lb-stat')).toBe(stat.closest('.lb-stat'));
    const user = userEvent.setup();
    await user.click(stat);
    expect(onSelect).toHaveBeenCalledWith('sfb');
    onSelect.mockClear();
    // A click on the link is the link's own: it selects nothing.
    links[1].addEventListener('click', (e) => e.preventDefault());
    await user.click(links[1]);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
