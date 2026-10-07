import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useSession } from '../state/session.js';
import { Collapsible } from './Collapsible.js';

afterEach(() => {
  useSession.setState({ collapsedGroups: [] });
});

describe('a group that folds away', () => {
  it('folds under its heading, keeps what it holds, and remembers being folded', async () => {
    const user = userEvent.setup();
    render(
      <Collapsible id="analyze.word" title="A word, typed">
        <input aria-label="Word" />
      </Collapsible>,
    );
    await user.type(screen.getByLabelText('Word'), 'hello');

    const toggle = screen.getByRole('button', { name: 'A word, typed' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'A word, typed' })).toContainElement(toggle);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Word')).not.toBeVisible();
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      collapsedGroups: ['analyze.word'],
    });

    await user.click(toggle);
    expect(screen.getByLabelText('Word')).toHaveValue('hello');
  });
});
