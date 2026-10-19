import { BUNDLED_LAYOUTS, type Layout } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGitHubSession, useGitHubSession } from '../../auth/github-session.js';
import { SubmitDialog } from './SubmitDialog.js';

const QWERTY = BUNDLED_LAYOUTS.find((l) => l.id === 'qwerty') as Layout;
const MINE: Layout = {
  ...QWERTY,
  id: 'mine',
  name: 'Mine',
  author: 'Ana',
  description: 'From https://example.com/mine',
};
const PULL = 'https://github.com/rafaelromao/layerbench/pull/7';

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SIGNED_IN = {
  available: true,
  clientId: 'Iv1.client',
  signedIn: true,
  login: 'you',
  token: 'ghu_one',
  expiresAt: Date.now() + 8 * 3600_000,
};

let submitted: unknown[];

beforeEach(async () => {
  submitted = [];
  localStorage.setItem('layerbench:github-session', 'sealed');
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (String(input).endsWith('/submit')) {
      submitted.push(JSON.parse(String(init?.body)).layout);
      return reply({ url: PULL }, 201);
    }
    return reply(SIGNED_IN);
  });
  await initGitHubSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function open(layout: Layout = MINE, dirty = false) {
  const onClose = vi.fn();
  render(<SubmitDialog layout={layout} dirty={dirty} onClose={onClose} />);
  return onClose;
}

describe('Submit', () => {
  it('asks before it opens the pull request, then gives its link', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByRole('dialog', { name: 'Submit Mine' })).toHaveAttribute('open');
    await user.click(await screen.findByRole('button', { name: 'Open the pull request' }));
    const link = await screen.findByRole('link', { name: PULL });
    expect(link).toHaveAttribute('href', PULL);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ id: 'mine', author: 'Ana' });
  });

  it('says what is missing and sends nothing', async () => {
    open({ ...MINE, author: '' }, true);
    expect(await screen.findByText('Nothing was sent. Before it can be submitted:')).toBeVisible();
    expect(screen.getByText(/Save your changes/)).toBeVisible();
    expect(screen.getByText(/Give it an author/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open the pull request' })).toBeNull();
    expect(submitted).toEqual([]);
  });

  it('asks a signed-out user to sign in', () => {
    useGitHubSession.setState({ status: 'signed-out', login: null });
    open();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  });

  it('says there is no sign-in where there is none', () => {
    useGitHubSession.setState({ status: 'unavailable', login: null });
    open();
    expect(screen.getByText(/has no sign-in/)).toBeVisible();
  });

  it('says why the server would not take it, or what failed', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', async (input: string) =>
      String(input).endsWith('/submit')
        ? reply({ error: 'taken', reason: 'a community layout already has the id "mine"' }, 409)
        : reply(SIGNED_IN),
    );
    open();
    await user.click(await screen.findByRole('button', { name: 'Open the pull request' }));
    expect(await screen.findByText(/already has the id "mine"/)).toBeVisible();
  });

  it('closes with Close', async () => {
    const user = userEvent.setup();
    const onClose = open();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
