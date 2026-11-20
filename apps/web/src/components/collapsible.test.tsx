import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useSession } from '../state/session.js';
import { Collapsible } from './Collapsible.js';

afterEach(() => {
  useSession.setState({ collapsedGroups: [], openedGroups: [] });
});

const stored = () => JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state;

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
    expect(stored()).toMatchObject({ collapsedGroups: ['analyze.word'] });

    await user.click(toggle);
    expect(screen.getByLabelText('Word')).toHaveValue('hello');
  });

  it('starts folded when asked to, is opened by choice, and keeps that apart from what was folded', async () => {
    const user = userEvent.setup();
    // Folded by choice back when the group started open: not an opening of it now.
    useSession.setState({ collapsedGroups: ['analyze.legend'], openedGroups: [] });
    render(
      <Collapsible id="analyze.legend" title="Legend" defaultCollapsed>
        <p>the list</p>
      </Collapsible>,
    );
    const toggle = screen.getByRole('button', { name: 'Legend' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('the list')).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('the list')).toBeVisible();
    expect(stored()).toMatchObject({
      openedGroups: ['analyze.legend'],
      collapsedGroups: ['analyze.legend'],
    });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(stored().openedGroups).toEqual([]);
    expect(stored().collapsedGroups).toEqual(['analyze.legend']);
  });

  it('is opened again by a visit that kept the choice', () => {
    useSession.setState({ openedGroups: ['compare.legend'] });
    render(
      <Collapsible id="compare.legend" title="Legend" defaultCollapsed>
        <p>the list</p>
      </Collapsible>,
    );
    expect(screen.getByRole('button', { name: 'Legend' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('folds and opens together two groups that share an id, each with a body of its own', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Collapsible id="compare.summary" title="Summary">
          <p>A's numbers</p>
        </Collapsible>
        <Collapsible id="compare.summary" title="Summary">
          <p>B's numbers</p>
        </Collapsible>
      </>,
    );
    const [a, b] = screen.getAllByRole('button', { name: 'Summary' });
    expect(a.getAttribute('aria-controls')).not.toBe(b.getAttribute('aria-controls'));

    await user.click(a);
    expect(a).toHaveAttribute('aria-expanded', 'false');
    expect(b).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText("B's numbers")).not.toBeVisible();
  });
});
