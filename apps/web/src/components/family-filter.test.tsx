import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useSession } from '../state/session.js';
import { FamilyFilter } from './FamilyFilter.js';

afterEach(() => {
  useSession.setState({ hiddenFamilies: [] });
});

function box(name: string): HTMLInputElement {
  const group = screen.getByRole('group', { name: 'Show' });
  return within(group).getByRole('checkbox', { name }) as HTMLInputElement;
}

describe('which sections of numbers are shown', () => {
  it('hides and shows one family, and keeps the choice in this browser', async () => {
    const user = userEvent.setup();
    render(<FamilyFilter />);

    await user.click(box('Trigrams'));
    expect(box('Trigrams')).not.toBeChecked();
    expect(useSession.getState().hiddenFamilies).toEqual(['trigram']);
    expect(JSON.parse(localStorage.getItem('layoutmaster:session') ?? '{}').state).toMatchObject({
      hiddenFamilies: ['trigram'],
    });

    await user.click(box('Trigrams'));
    expect(useSession.getState().hiddenFamilies).toEqual([]);
  });

  it('selects and unselects every family at once, and shows when only some are chosen', async () => {
    const user = userEvent.setup();
    render(<FamilyFilter />);
    expect(box('All')).toBeChecked();

    await user.click(box('Bigrams'));
    expect(box('All')).not.toBeChecked();
    expect(box('All').indeterminate).toBe(true);

    await user.click(box('All'));
    expect(box('All')).toBeChecked();
    expect(box('Bigrams')).toBeChecked();

    await user.click(box('All'));
    expect(box('All').indeterminate).toBe(false);
    for (const name of ['Bigrams', 'Skipgrams', 'Trigrams', 'Usage', 'Effort', 'Layers']) {
      expect(box(name)).not.toBeChecked();
    }
  });
});
