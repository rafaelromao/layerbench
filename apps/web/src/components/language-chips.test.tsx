import type { LanguageCoverage } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguageChips } from './LanguageChips.js';

const covered = (tag: string, name: string, missing: string[] = []): LanguageCoverage => ({
  tag,
  name,
  missingRequired: missing,
  missingOptional: [],
  missingPunctuation: [],
});
const EN = covered('en', 'English');
const PT = covered('pt', 'Português');

describe('language chips', () => {
  it('are named by what they show, then by their language, what one lacks counted', () => {
    render(
      <LanguageChips
        coverage={[EN, covered('pt', 'Português', ['ã', 'ç'])]}
        text={{ corpus: 'en-general', corpus2: null }}
        onText={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'en, English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const pt = screen.getByRole('button', { name: 'pt −2, Português' });
    expect(pt).toHaveTextContent(/^pt −2$/);
    expect(pt).toHaveAttribute('aria-pressed', 'false');
    expect(pt.getAttribute('title')).toMatch(/^Cannot type ã ç/);
  });

  it('show a language named twice, as pt and pt-BR are, once', () => {
    render(
      <LanguageChips
        coverage={[PT, EN, PT]}
        text={{ corpus: 'en-general', corpus2: null }}
        onText={() => {}}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['pt', 'en']);
  });

  it('put the page on the text that comes with the app, but for the chip already on it', async () => {
    const user = userEvent.setup();
    const onText = vi.fn();
    const { rerender } = render(
      <LanguageChips
        coverage={[EN, PT]}
        text={{ corpus: 'en-general', corpus2: 'pt-br-general' }}
        onText={onText}
      />,
    );
    // On a mix, no one language's text is on show: English's chip puts it on English's alone.
    await user.click(screen.getByRole('button', { name: /English/ }));
    expect(onText).toHaveBeenLastCalledWith('en-general');
    rerender(
      <LanguageChips
        coverage={[EN, PT]}
        text={{ corpus: 'pt-br-general', corpus2: null }}
        onText={onText}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Português/ }));
    expect(onText).toHaveBeenCalledTimes(1);
  });
});
