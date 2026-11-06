import { compileLayout, type Layout, type LayoutFeatures } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeaturesPanel } from '../panels.js';
import { initialState } from '../reducer.js';
import { FeatureBody, featureTitle, withoutFeatureAt } from './features.js';

const layout = (features?: LayoutFeatures): Layout => ({
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [
    { id: 'base', bindings: {} },
    { id: 'nav', bindings: {} },
  ],
  features,
});

describe('feature names', () => {
  it('reads each feature as words', () => {
    expect(featureTitle('sentenceCase')).toBe('Sentence case');
  });
});

describe('taking a feature off a layer', () => {
  it('leaves the other layers it is on', () => {
    const l = layout({ sentenceCase: { on: ['base', 'nav'] } });
    expect(withoutFeatureAt(l, 'sentenceCase', 'nav').sentenceCase).toEqual({ on: ['base'] });
  });

  it('turns it off, keeping its settings, once no layer is left', () => {
    const l = layout({ sentenceCase: { key: 'L0', on: ['nav'] } });
    expect(withoutFeatureAt(l, 'sentenceCase', 'nav').sentenceCase).toEqual({
      key: 'L0',
      on: ['nav'],
      enabled: false,
    });
  });

  it('counts the base layer as the one it is on when it names none', () => {
    expect(withoutFeatureAt(layout(), 'sentenceCase', 'base').sentenceCase).toEqual({
      enabled: false,
    });
    expect(withoutFeatureAt(layout(), 'sentenceCase', 'nav').sentenceCase).toEqual({
      on: ['base'],
    });
  });

  it('copes with a layout that has no layers', () => {
    const empty = { ...layout(), layers: [] };
    expect(withoutFeatureAt(empty, 'sentenceCase', 'base').sentenceCase).toEqual({
      enabled: false,
    });
  });
});

describe('the sentence case editor', () => {
  it('says what the sentence space does, and links its module, with nothing to choose', () => {
    render(<FeatureBody feature="sentenceCase" />);
    expect(screen.getByText(/leaves a capital for the next key pressed/)).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/rafaelromao/zmk-sentence-case',
    ]);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says so in External Behaviors, whether the feature is on or off', () => {
    const links = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    const panel = (l: Layout) => (
      <FeaturesPanel state={initialState(l, compileLayout(l))} send={vi.fn()} />
    );
    const { rerender } = render(panel(layout()));
    expect(screen.getByLabelText('Sentence case')).not.toBeChecked();
    expect(links()).toEqual(['https://github.com/rafaelromao/zmk-sentence-case']);
    rerender(panel(layout({ sentenceCase: {} })));
    expect(screen.getByLabelText('Sentence case')).toBeChecked();
    expect(links()).toEqual(['https://github.com/rafaelromao/zmk-sentence-case']);
    expect(screen.queryByLabelText('Sentence-ending punctuation')).toBeNull();
  });
});
