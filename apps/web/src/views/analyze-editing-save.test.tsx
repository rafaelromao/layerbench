import { bundledLayout, type Layout, toCanonicalJson } from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useGitHubSession } from '../auth/github-session.js';
import { setCommunitySource } from '../community/community.js';
import type { AnalyzeRequest } from '../engine/protocol.js';
import { proposalOf } from '../proposals/proposals.js';
import {
  bar,
  copyDialog,
  dragKey,
  freshStorage,
  key,
  linkOf,
  openEdit,
  openEditOn,
  PULL,
  proposing,
  recording,
  saveCopy,
  toCopy,
} from '../test/analyze-editing.js';
import { branchWith, communityDoc } from '../test/community.js';
import { keyNamed } from '../test/keys.js';
import { showLayer } from '../test/layers.js';
import { openSettings, renderRoute, testClient } from '../test/render.js';

describe('Edit', () => {
  it('swaps two keys by dragging, estimates while the analysis runs, then settles on it', async () => {
    // Re-scoring an existing run is milliseconds; simulating the edited layout is not. Slowing the
    // analysis down makes that gap observable, which is exactly the gap the estimate fills.
    const client = testClient();
    const analyze = client.analyze.bind(client);
    let release: (() => void) | null = null;
    vi.spyOn(client, 'analyze').mockImplementation(async (request, opts) => {
      const report = await analyze(request, opts);
      if (release)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return report;
    });

    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      client,
      storage: freshStorage(),
    });

    // The summary only appears once an analysis has completed, and that report is what the
    // estimate is derived from.
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    // From here on, the next analysis parks until released.
    release = () => {};
    await dragKey('LTP', 'LTR');

    expect(await screen.findByText('unsaved')).toBeInTheDocument();
    expect(await screen.findByText(/estimate after swap/)).toBeInTheDocument();

    // Letting the real analysis finish replaces the estimate.
    release = null;
    vi.mocked(client.analyze).mockImplementation(analyze);
    await dragKey('LTR', 'LTM');
    await waitFor(() => expect(screen.queryByText(/estimate after swap/)).toBeNull(), {
      timeout: 25_000,
    });
  });

  it('saves a bundled layout as a copy, asking what to call it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      storage,
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    // Saving is a button in the bar, not a panel.
    expect(screen.queryByRole('tab', { name: 'Save' })).toBeNull();
    expect(within(bar()).getByRole('button', { name: 'Save' })).toHaveAttribute(
      'title',
      'Save a copy in your custom layouts',
    );

    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    await toCopy(user);
    const dialog = copyDialog();
    // It says it makes a copy, and offers a name no layout has.
    expect(
      within(dialog).getByText(/makes a copy of this layout in your custom layouts/),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name of the copy')).toHaveValue('Qwerty copy');
    expect(await storage.list('layouts')).toEqual([]);

    const field = within(dialog).getByLabelText('Name of the copy');
    await user.clear(field);
    await user.type(field, 'Qwerty swapped');
    await user.click(within(dialog).getByRole('button', { name: 'Save copy' }));

    expect(await screen.findByText('Saved Qwerty swapped')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Save a copy' })).toBeNull();
    expect((await storage.get('layouts', 'qwerty-swapped'))?.doc.name).toBe('Qwerty swapped');
    // The layout in the bar is the copy now, and its link carries it whole, so it can be sent.
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty swapped');
    await linkOf(currentSearch, 'qwerty-swapped');
    expect(screen.queryByText('unsaved')).toBeNull();
  });

  it('offers the community layouts in its picker, read from the branch', async () => {
    setCommunitySource(
      branchWith(
        communityDoc('night-owl', 'Night owl'),
        communityDoc('lark', 'Lark'),
        communityDoc('lark-2', 'Lark'),
      ),
    );
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      storage: freshStorage(),
    });
    const group = await screen.findByRole('group', { name: 'Community' });
    expect(within(group).getByRole('option', { name: 'Night owl' })).toHaveValue(
      'community:night-owl',
    );
    // Two by the same name are told apart by their ids.
    expect(within(group).getByRole('option', { name: 'Lark (lark-2)' })).toHaveValue(
      'community:lark-2',
    );
    expect(within(group).getByRole('option', { name: 'Lark (lark)' })).toBeInTheDocument();
  });

  it('opens a community layout by its link, and saves it as a copy', async () => {
    const user = userEvent.setup();
    setCommunitySource(branchWith(communityDoc('night-owl', 'Night owl')));
    const storage = freshStorage();
    const { currentSearch } = renderRoute(
      '/analyze?layout=community:night-owl&corpus=en-general&sample=20000',
      { storage },
    );
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Night owl');
    // The link names it as it is: it opens for anyone sent it.
    expect(new URLSearchParams(currentSearch()).get('layout')).toBe('community:night-owl');
    expect(screen.getByRole('option', { name: 'Night owl', selected: true })).toBeInTheDocument();

    await saveCopy(user);
    expect(await screen.findByText('Saved Night owl copy')).toBeInTheDocument();
    expect((await storage.get('layouts', 'night-owl-copy'))?.doc.name).toBe('Night owl copy');
  });

  it('saves the copy again without asking, and makes no second card', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await openEditOn(storage);
    await saveCopy(user);
    expect(await screen.findByText('Saved Qwerty copy')).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Save' })).toHaveAttribute(
      'title',
      'Keep it in the Library',
    );

    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    // Straight away: no dialog, and the card holds the edit.
    expect(screen.queryByRole('dialog', { name: 'Save a copy' })).toBeNull();
    await waitFor(async () =>
      expect(JSON.stringify((await storage.get('layouts', 'qwerty-copy'))?.doc)).toContain('ç'),
    );
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['qwerty-copy']);
  }, 60_000);

  it('offers Submit for a custom layout only', async () => {
    const user = userEvent.setup();
    useGitHubSession.setState({ status: 'signed-out', login: null });
    await openEdit();
    expect(within(bar()).queryByRole('button', { name: 'Submit' })).toBeNull();
    await saveCopy(user);
    expect(await screen.findByText('Saved Qwerty copy')).toBeInTheDocument();
    // The toast can come before the bar shows the copy, slowly enough under coverage to miss it.
    await user.click(await within(bar()).findByRole('button', { name: 'Submit' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit Qwerty copy' });
    expect(within(dialog).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    useGitHubSession.setState({ status: 'unknown' });
  });

  it('proposes a change to a bundled layout: saved here, its pull request opened and kept with it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { sent } = await proposing();
    try {
      renderRoute('/analyze?layout=colemak&corpus=en-general&sample=20000', { storage });
      await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      const choice = await screen.findByRole('dialog', { name: 'Save Colemak' });
      await user.click(within(choice).getByRole('button', { name: 'Propose change' }));
      expect(await within(choice).findByRole('link', { name: PULL })).toHaveAttribute('href', PULL);

      // The change goes under the bundled layout's id; the copy is kept here, with its proposal.
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        session: 'sealed',
        target: { kind: 'bundled', id: 'colemak' },
        layout: { id: 'colemak', name: 'Colemak' },
      });
      expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['colemak']);
      expect(await proposalOf(storage, 'colemak')).toEqual({
        name: 'Colemak',
        target: { kind: 'bundled', id: 'colemak' },
        url: PULL,
      });

      // Saved again, the copy's pull request gets the new version, under the bundled id still.
      await user.click(within(choice).getByRole('button', { name: 'Close' }));
      key('Key LHM: s').focus();
      await user.keyboard('ç{Enter}');
      await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });
      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      expect(
        await screen.findByText('Your proposed change to Colemak has this version'),
      ).toBeInTheDocument();
      expect(sent).toHaveLength(2);
      expect(sent[1]).toMatchObject({ target: { kind: 'bundled', id: 'colemak' } });
      expect(JSON.stringify(sent[1].layout)).toContain('ç');
    } finally {
      vi.unstubAllGlobals();
      useGitHubSession.setState({ status: 'unknown', login: null, maintainer: false });
    }
  }, 60_000);

  it('proposes on the next save what could not be sent, and never a layout naming no author', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { sent } = await proposing(1);
    try {
      renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', { storage });
      await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      const unsigned = await screen.findByRole('dialog', { name: 'Save Qwerty' });
      await user.click(within(unsigned).getByRole('button', { name: 'Propose change' }));
      expect(await within(unsigned).findByRole('alert')).toHaveTextContent(
        'Nothing was proposed: it names no author; give it one in Settings first.',
      );
      expect(sent).toEqual([]);
      expect(await storage.list('layouts')).toEqual([]);
      await user.click(within(unsigned).getByRole('button', { name: 'Close' }));

      await user.selectOptions(within(bar()).getByRole('combobox', { name: 'Layout' }), 'colemak');
      await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Colemak'));
      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      const choice = await screen.findByRole('dialog', { name: 'Save Colemak' });
      await user.click(within(choice).getByRole('button', { name: 'Propose change' }));
      expect(await within(choice).findByRole('alert')).toHaveTextContent(
        'It could not be proposed: GitHub could not be reached.',
      );
      expect(await proposalOf(storage, 'colemak')).toMatchObject({ url: null });
      await user.click(within(choice).getByRole('button', { name: 'Close' }));

      // The copy's next save sends it, as the dialog said.
      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      expect(
        await screen.findByText('Your proposed change to Colemak has this version'),
      ).toBeInTheDocument();
      expect(sent).toHaveLength(2);
      expect(await proposalOf(storage, 'colemak')).toMatchObject({ url: PULL });
    } finally {
      vi.unstubAllGlobals();
      useGitHubSession.setState({ status: 'unknown', login: null, maintainer: false });
    }
  }, 60_000);

  it('leaves the copy a layout of its own when the server refuses the change, and says so', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { sent } = await proposing(0, 'the layout does not compile');
    try {
      renderRoute('/analyze?layout=colemak&corpus=en-general&sample=20000', { storage });
      await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      const choice = await screen.findByRole('dialog', { name: 'Save Colemak' });
      await user.click(within(choice).getByRole('button', { name: 'Propose change' }));
      expect(await within(choice).findByRole('alert')).toHaveTextContent(
        'Nothing was proposed: the layout does not compile. Your copy is saved among your layouts.',
      );
      expect(sent).toHaveLength(1);
      expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['colemak']);
      // Refused, it would be refused again: its next save sends nothing.
      expect(await storage.list('proposals')).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      useGitHubSession.setState({ status: 'unknown', login: null, maintainer: false });
    }
  }, 60_000);

  it('names the copy anew where a custom layout has the name, and lets a declined one be', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    // A copy of an earlier proposal, declined, still goes by the bundled layout's name.
    const colemak = bundledLayout('colemak') as Layout;
    await storage.put('layouts', 'colemak', toCanonicalJson({ ...colemak, id: 'colemak' }));
    const { sent, pull } = await proposing();
    try {
      renderRoute('/analyze?layout=colemak&corpus=en-general&sample=20000', { storage });
      await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      const choice = await screen.findByRole('dialog', { name: 'Save Colemak' });
      await user.click(within(choice).getByRole('button', { name: 'Propose change' }));
      const naming = await screen.findByRole('dialog', { name: 'Name your copy' });
      expect(sent).toEqual([]);
      const field = within(naming).getByLabelText('Name of the copy');
      await user.clear(field);
      await user.type(field, 'Colemak, proposed');
      await user.click(within(naming).getByRole('button', { name: 'Propose change' }));
      expect(await within(choice).findByRole('link', { name: PULL })).toBeInTheDocument();

      // The pull request proposes Colemak as it is called; the copy goes by its own name.
      expect(sent[0]).toMatchObject({ layout: { id: 'colemak', name: 'Colemak' } });
      const copy = (await storage.list('layouts')).find((e) => e.name === 'Colemak, proposed');
      expect(await proposalOf(storage, copy?.id ?? '')).toMatchObject({
        name: 'Colemak',
        url: PULL,
      });
      await user.click(within(choice).getByRole('button', { name: 'Close' }));
      expect(within(bar()).getByLabelText('Name')).toHaveValue('Colemak, proposed');

      // Declined before the Library was opened again: saving the copy sends nothing, and it is
      // an ordinary custom layout from then on.
      pull.state = 'closed';
      key('Key LHM: s').focus();
      await user.keyboard('ç{Enter}');
      await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });
      await user.click(within(bar()).getByRole('button', { name: 'Save' }));
      expect(
        await screen.findByText(
          'Your change to Colemak was declined; this copy stays in your layouts',
        ),
      ).toBeInTheDocument();
      expect(sent).toHaveLength(1);
      expect(await storage.list('proposals')).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      useGitHubSession.setState({ status: 'unknown', login: null, maintainer: false });
    }
  }, 60_000);

  it('asks to sign in to propose a change, and still saves a copy', async () => {
    const user = userEvent.setup();
    useGitHubSession.setState({ status: 'signed-out', login: null });
    await openEdit();
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));
    const choice = await screen.findByRole('dialog', { name: 'Save Qwerty' });
    expect(within(choice).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    expect(within(choice).getByRole('button', { name: 'Propose change' })).toBeDisabled();
    await user.click(within(choice).getByRole('button', { name: 'Save a copy' }));
    await user.click(within(copyDialog()).getByRole('button', { name: 'Save copy' }));
    expect(await screen.findByText('Saved Qwerty copy')).toBeInTheDocument();
    useGitHubSession.setState({ status: 'unknown' });
  });

  it('takes an optional link in Settings, says so when it is no http(s) address, and saves it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await openEditOn(storage);
    let settings = await openSettings();
    const link = () => within(settings).getByLabelText('Link');
    expect(link()).toHaveValue('');

    await user.type(link(), 'example.com/mine');
    await user.tab();
    expect(within(settings).getByRole('alert')).toHaveTextContent('http:// or https://');
    expect(screen.queryByText('unsaved')).toBeNull();
    // A draft left wrong is not carried to the next layout, though it has no link either.
    await user.click(within(settings).getByRole('button', { name: 'Done' }));
    await user.selectOptions(within(bar()).getByRole('combobox', { name: 'Layout' }), 'colemak');
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Colemak'));
    settings = await openSettings();
    expect(link()).toHaveValue('');
    expect(within(settings).queryByRole('alert')).toBeNull();
    await user.click(within(settings).getByRole('button', { name: 'Done' }));
    await user.selectOptions(within(bar()).getByRole('combobox', { name: 'Layout' }), 'qwerty');
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty'));
    settings = await openSettings();
    await user.type(link(), 'example.com/mine');
    await user.tab();
    expect(within(settings).getByRole('alert')).toBeInTheDocument();

    // Emptied again, it is no link, which is fine.
    await user.clear(link());
    await user.tab();
    expect(within(settings).queryByRole('alert')).toBeNull();

    await user.clear(link());
    await user.type(link(), 'https://example.com/mine{Enter}');
    expect(within(settings).queryByRole('alert')).toBeNull();
    const open = within(settings).getByRole('link', { name: /^Open the link/ });
    expect(open).toHaveAttribute('href', 'https://example.com/mine');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');

    await user.click(within(settings).getByRole('button', { name: 'Done' }));
    await saveCopy(user);
    expect(await screen.findByText('Saved Qwerty copy')).toBeInTheDocument();
    expect((await storage.get('layouts', 'qwerty-copy'))?.doc.link).toBe(
      'https://example.com/mine',
    );
  }, 60_000);

  it('keeps a link being typed while the page catches up, and drops a wrong one on Escape or Undo', async () => {
    const user = userEvent.setup();
    await openEditOn(freshStorage());
    const settings = await openSettings();
    const link = () => within(settings).getByLabelText('Link');
    const later = () => new Promise((done) => setTimeout(done, 800));

    // Another edit lands, and the page's address is written again a moment later.
    await user.type(within(settings).getByLabelText('Author'), 'Ana');
    await user.tab();
    await user.click(link());
    await user.type(link(), 'https://exa');
    await later();
    expect(link()).toHaveValue('https://exa');
    expect(link()).toHaveFocus();
    await user.type(link(), 'mple.com{Enter}');
    await later();
    expect(link()).toHaveValue('https://example.com');
    expect(link()).toHaveFocus();
    // Spaces around the same link are tidied away, and are no edit: one Undo takes the link back.
    await user.type(link(), '  {Enter}');
    expect(link()).toHaveValue('https://example.com');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(link()).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(link()).toHaveValue('https://example.com');

    await user.clear(link());
    await user.type(link(), 'example.com');
    await user.tab();
    expect(within(settings).getByRole('alert')).toBeInTheDocument();
    expect(link()).toHaveAttribute('aria-invalid', 'true');
    await user.click(link());
    await user.keyboard('{Escape}');
    expect(link()).toHaveValue('https://example.com');
    expect(within(settings).queryByRole('alert')).toBeNull();

    await user.clear(link());
    await user.type(link(), 'example.com');
    await user.tab();
    expect(within(settings).getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(link()).toHaveValue('');
    expect(within(settings).queryByRole('alert')).toBeNull();
  }, 60_000);

  it('keeps the layout as it was when the copy cannot be saved, and offers the name given again', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await openEditOn(storage);
    vi.spyOn(storage, 'put').mockRejectedValueOnce(new Error('offline'));

    await saveCopy(user, 'Mine');
    expect(await screen.findByText('Save failed: offline')).toBeInTheDocument();
    // Nothing was saved, so nothing was renamed, and the next try does not name a copy of a copy.
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty');
    expect(await storage.list('layouts')).toEqual([]);

    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    await toCopy(user);
    expect(within(copyDialog()).getByLabelText('Name of the copy')).toHaveValue('Mine');
    await user.click(within(copyDialog()).getByRole('button', { name: 'Save copy' }));
    expect(await screen.findByText('Saved Mine')).toBeInTheDocument();
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Mine');
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['mine']);
  }, 60_000);

  it('offers to overwrite a custom layout the copy is named as, and makes no second', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put(
      'layouts',
      'mine',
      toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine', description: 'the old one' }),
    );
    await openEditOn(storage);

    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    await toCopy(user);
    const dialog = copyDialog();
    const field = within(dialog).getByLabelText('Name of the copy');
    await user.clear(field);
    await user.type(field, 'Mine');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'A custom layout is already called Mine',
    );
    expect(within(dialog).getByRole('button', { name: 'Save copy' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Overwrite Mine' }));

    expect(await screen.findByText('Saved Mine')).toBeInTheDocument();
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Mine');
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['mine']);
    expect((await storage.get('layouts', 'mine'))?.doc.description).not.toBe('the old one');
  }, 60_000);

  it("asks before saving a layout renamed to another's name, and saves it under one picked", async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    await storage.put('layouts', 'gust', toCanonicalJson({ ...qwerty, id: 'gust', name: 'Gust' }));
    renderRoute('/analyze?layout=custom%3Amine&corpus=en-general&sample=20000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    const name = within(bar()).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Gust');
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog', { name: 'Save under another name' });
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'A custom layout is already called Gust',
    );
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['gust', 'mine']);
    const field = within(dialog).getByLabelText('Name of the layout');
    await user.clear(field);
    await user.type(field, 'Gale');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved Gale')).toBeInTheDocument();
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Gale');
    expect((await storage.list('layouts')).map((e) => e.name)).toEqual(['Gale', 'Gust']);
  }, 60_000);

  it('overwrites another layout a renamed one is now called, and leaves it saved', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    await storage.put('layouts', 'gust', toCanonicalJson({ ...qwerty, id: 'gust', name: 'Gust' }));
    renderRoute('/analyze?layout=custom%3Amine&corpus=en-general&sample=20000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    const name = within(bar()).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Gust');
    await user.click(within(bar()).getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save under another name' });
    await user.click(within(dialog).getByRole('button', { name: 'Overwrite Gust' }));

    expect(await screen.findByText('Saved Gust')).toBeInTheDocument();
    expect(screen.queryByText('unsaved')).toBeNull();
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['gust']);
  }, 60_000);

  it('offers a free name for the copy, and refuses none or leaves the layout alone on Cancel', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put(
      'layouts',
      'qwerty-copy',
      toCanonicalJson({ ...qwerty, id: 'qwerty-copy', name: 'Qwerty copy' }),
    );
    await openEditOn(storage);

    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    await toCopy(user);
    const dialog = copyDialog();
    // One of the user's has "Qwerty copy" already, so the offer is numbered.
    expect(within(dialog).getByLabelText('Name of the copy')).toHaveValue('Qwerty copy 2');

    await user.clear(within(dialog).getByLabelText('Name of the copy'));
    expect(within(dialog).getByRole('button', { name: 'Save copy' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Name of the copy'), '  ');
    expect(within(dialog).getByRole('button', { name: 'Save copy' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Save a copy' })).toBeNull();
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty');
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['qwerty-copy']);
  }, 60_000);

  it('compares the layout as edited', async () => {
    const user = userEvent.setup();
    const { currentPath, currentSearch } = renderRoute(
      '/analyze?layout=qwerty&corpus=en-general&sample=20000',
      { storage: freshStorage() },
    );
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });
    // Straight away, before the link has caught up with the edit.
    await user.click(within(bar()).getByRole('button', { name: 'Compare' }));
    await waitFor(() => expect(currentPath()).toBe('/compare'));
    expect(currentSearch()).toContain('layout=inline');
  }, 60_000);

  it('analyzes the layout typed without the features switched off, and still edits it as written', async () => {
    const user = userEvent.setup();
    const { client, requests } = recording();
    const { currentSearch } = renderRoute('/analyze?layout=magic-romak&sample=20000', {
      client,
      storage: freshStorage(),
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    const off = (r: AnalyzeRequest | undefined) => r?.settings.without ?? null;
    await waitFor(() => expect(off(requests[0])).toEqual([]));

    const settings = await openSettings();
    await user.click(
      within(within(settings).getByRole('group', { name: 'Analyze with' })).getByRole('checkbox', {
        name: 'Multi-letter macros',
      }),
    );
    await waitFor(() => expect(currentSearch()).toContain('off=macros'));
    // The numbers are for the layout without its `qu` macro, which the engine leaves out of the
    // layout as written; the layout being edited keeps it.
    await waitFor(() => expect(off(requests.at(-1))).toEqual(['macros']), { timeout: 25_000 });
    expect(JSON.stringify(requests.at(-1)?.layout)).toContain('"qu"');
    await showLayer(user, 'Alpha 2');
    expect(await screen.findByRole('button', { name: /^Key LTM: qu/ })).toBeInTheDocument();
  }, 60_000);
});
