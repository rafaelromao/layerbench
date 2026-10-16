import type { Layout, LayoutFeatures } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
    const l = layout({ sentenceCase: { after: ['.'], on: ['nav'] } });
    expect(withoutFeatureAt(l, 'sentenceCase', 'nav').sentenceCase).toEqual({
      after: ['.'],
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
  it('shows the default punctuation and reports a new list', async () => {
    const setFeatures = vi.fn();
    render(<FeatureBody layout={layout()} feature="sentenceCase" setFeatures={setFeatures} />);
    const field = screen.getByLabelText('Sentence-ending punctuation');
    expect(field).toHaveValue('. ? !');
    await userEvent.clear(field);
    await userEvent.type(field, '. ;{Enter}');
    expect(setFeatures).toHaveBeenLastCalledWith({ sentenceCase: { after: ['.', ';'] } });
  });

  it('drops the list when the field is emptied, so the defaults apply again', async () => {
    const setFeatures = vi.fn();
    render(
      <FeatureBody
        layout={layout({ sentenceCase: { after: ['.'] } })}
        feature="sentenceCase"
        setFeatures={setFeatures}
      />,
    );
    const field = screen.getByLabelText('Sentence-ending punctuation');
    await userEvent.clear(field);
    await userEvent.type(field, '{Enter}');
    expect(setFeatures).toHaveBeenLastCalledWith({ sentenceCase: {} });
  });

  it('picks the modifier it arms', async () => {
    const setFeatures = vi.fn();
    render(<FeatureBody layout={layout()} feature="sentenceCase" setFeatures={setFeatures} />);
    expect(screen.getByRole('button', { name: 'Shift' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Control' }));
    expect(setFeatures).toHaveBeenCalledWith({ sentenceCase: { mod: 'LCTRL' } });
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
