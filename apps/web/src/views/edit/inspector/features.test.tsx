import { compileLayout, type Layout, type LayoutFeatures } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(featureTitle('capsWord')).toBe('Caps word');
  });
});

describe('taking a feature off a layer', () => {
  it('leaves the other layers it is on', () => {
    const l = layout({ capsWord: { on: ['base', 'nav'] } });
    expect(withoutFeatureAt(l, 'capsWord', 'nav').capsWord).toEqual({ on: ['base'] });
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
    expect(withoutFeatureAt(layout(), 'capsWord', 'base').capsWord).toEqual({ enabled: false });
    expect(withoutFeatureAt(layout(), 'capsWord', 'nav').capsWord).toEqual({ on: ['base'] });
  });

  it('copes with a layout that has no layers', () => {
    const empty = { ...layout(), layers: [] };
    expect(withoutFeatureAt(empty, 'capsWord', 'base').capsWord).toEqual({ enabled: false });
  });
});

describe('the sentence case editor', () => {
  it('says what the sentence space does, and links its module, with nothing to choose', () => {
    render(<FeatureBody layout={layout()} feature="sentenceCase" setFeatures={vi.fn()} />);
    expect(screen.getByText(/leaves a capital for the next key pressed/)).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/rafaelromao/zmk-sentence-case',
    ]);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says so in Features, whether the feature is on or off', () => {
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

  it('names no module for caps word, which stock ZMK has', () => {
    render(<FeatureBody layout={layout()} feature="capsWord" setFeatures={vi.fn()} />);
    expect(screen.queryAllByRole('link')).toEqual([]);
  });
});

describe('the caps word editor', () => {
  it('sets the characters that keep it going, and clears them', async () => {
    const setFeatures = vi.fn();
    const { rerender } = render(
      <FeatureBody layout={layout()} feature="capsWord" setFeatures={setFeatures} />,
    );
    const field = screen.getByLabelText('Caps word continue list');
    await userEvent.type(field, '- _{Enter}');
    expect(setFeatures).toHaveBeenLastCalledWith({ capsWord: { continueList: ['-', '_'] } });
    rerender(
      <FeatureBody
        layout={layout({ capsWord: { continueList: ['-'] } })}
        feature="capsWord"
        setFeatures={setFeatures}
      />,
    );
    await userEvent.clear(screen.getByLabelText('Caps word continue list'));
    await userEvent.type(screen.getByLabelText('Caps word continue list'), '{Enter}');
    expect(setFeatures).toHaveBeenLastCalledWith({ capsWord: {} });
  });
});
