import { bundledLayout, toCanonicalJson } from '@layerbench/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocumentsChanged } from '../state/documents-changed.js';
import { useToasts } from '../state/toasts.js';
import { memoryMarks } from '../test/memory-marks.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { forgetOffered, noteResult, review, startAutoSync, useSync } from './auto-sync.js';
import { ConflictDialog } from './ConflictDialog.js';
import { CompositeStorage } from './composite.js';
import { StorageProvider } from './use-storage.js';

/** The phone's edit, made offline, and the laptop's, made in the account, of each of `names`. */
async function conflicted(names: string[] = ['Gust']) {
  const marks = memoryMarks();
  const local = new MemoryStorage('local');
  const remote = new MemoryStorage('github');
  const storage = new CompositeStorage(local, remote, marks);
  const offline = new CompositeStorage(local, null, marks);
  for (const name of names) {
    const id = name.toLowerCase();
    await storage.put('layouts', id, { name });
    await offline.put('layouts', id, { name, description: `${name} on the phone` });
    await remote.put('layouts', id, { name, description: `${name} on the laptop` });
  }
  noteResult(await storage.copyUp());
  return { marks, local, remote, storage };
}

function show(storage: CompositeStorage) {
  render(
    <StorageProvider adapter={storage}>
      <ConflictDialog />
    </StorageProvider>,
  );
}

const description = async (store: MemoryStorage, id: string) =>
  (await store.get('layouts', id))?.doc.description;

beforeEach(() => {
  forgetOffered();
  useToasts.setState({ toasts: [] });
});

afterEach(() => {
  useSync.setState({ phase: 'idle', error: null, last: null, reviewing: false, held: null });
});

describe('a dialog that opens by itself', () => {
  it('opens onto the button that overwrites nothing', async () => {
    const { storage } = await conflicted();
    show(storage);
    await screen.findByRole('dialog', { name: 'Two versions of Gust' });
    expect(screen.getByRole('button', { name: 'Decide later' })).toHaveFocus();
  });

  it('does not open over someone typing, and opens once they have left the field', async () => {
    const { storage } = await conflicted();
    act(() => review(false));
    render(
      <>
        <input aria-label="A layout's name" />
        <StorageProvider adapter={storage}>
          <ConflictDialog />
        </StorageProvider>
      </>,
    );
    const field = screen.getByLabelText("A layout's name");
    field.focus();

    act(() => review(true));
    // Typing carries on into the field, not onto a button.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog', { name: /Two versions/ })).toBeNull();
    expect(field).toHaveFocus();

    act(() => field.blur());
    expect(await screen.findByRole('dialog', { name: 'Two versions of Gust' })).toBeInTheDocument();
  });

  it('puts focus back on the safe button after a choice, for the next one', async () => {
    const user = userEvent.setup();
    const { storage } = await conflicted(['Gust', 'Breeze']);
    show(storage);
    await screen.findByRole('dialog', { name: /Two versions of / });

    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Decide later' })).toHaveFocus());
  });
});

describe('choosing between two versions', () => {
  it('shows both versions, when each was saved, and what differs', async () => {
    const { storage } = await conflicted();
    show(storage);
    const dialog = await screen.findByRole('dialog', { name: 'Two versions of Gust' });

    expect(dialog).toHaveTextContent('One layout to choose');
    expect(within(dialog).getByText('This browser')).toBeInTheDocument();
    expect(within(dialog).getByText('Your GitHub account')).toBeInTheDocument();
    expect(dialog.textContent).toMatch(/Saved .*\d/);
    expect(dialog).toHaveTextContent(
      'description: “Gust on the phone” in this browser, “Gust on the laptop” in GitHub',
    );
    expect(dialog).toHaveTextContent('nothing is replaced until you do');
  });

  it('links to a comparison of two layouts that read as layouts', async () => {
    const qwerty = toCanonicalJson(bundledLayout('qwerty') as never);
    const marks = memoryMarks();
    const local = new MemoryStorage('local');
    const remote = new MemoryStorage('github');
    const storage = new CompositeStorage(local, remote, marks);
    await storage.put('layouts', 'qwerty-mine', qwerty);
    await new CompositeStorage(local, null, marks).put('layouts', 'qwerty-mine', {
      ...qwerty,
      description: 'phone',
    });
    await remote.put('layouts', 'qwerty-mine', { ...qwerty, description: 'laptop' });
    noteResult(await storage.copyUp());
    show(storage);

    const link = await screen.findByRole('link', { name: /Compare them side by side/ });
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/compare#layout=inline%3A/));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it("keeps this browser's version: it goes to the account, and the dialog is done", async () => {
    const user = userEvent.setup();
    const { storage, local, remote, marks } = await conflicted();
    show(storage);
    await screen.findByRole('dialog', { name: 'Two versions of Gust' });

    await user.click(screen.getByRole('button', { name: 'Keep mine' }));

    await waitFor(async () => expect(await description(remote, 'gust')).toBe('Gust on the phone'));
    expect(await description(local, 'gust')).toBe('Gust on the phone');
    expect(marks.count()).toBe(0);
    expect(useToasts.getState().toasts.map((t) => t.text)).toContain(
      "Kept this browser's version of Gust",
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Two versions/ })).toBeNull());
    expect(useSync.getState().last?.conflicts).toEqual([]);
  });

  it("keeps the account's version: this browser's copy becomes it, and the account's is not touched", async () => {
    const user = userEvent.setup();
    const { storage, local, remote, marks } = await conflicted();
    show(storage);
    await screen.findByRole('dialog', { name: 'Two versions of Gust' });

    await user.click(screen.getByRole('button', { name: 'Keep theirs' }));

    await waitFor(async () => expect(await description(local, 'gust')).toBe('Gust on the laptop'));
    expect(await description(remote, 'gust')).toBe('Gust on the laptop');
    expect(marks.count()).toBe(0);
    expect(useToasts.getState().toasts.map((t) => t.text)).toContain(
      "Kept GitHub's version of Gust",
    );
    // Whatever has the layout open is told its copy was replaced.
    expect(useDocumentsChanged.getState().changed).toContain('layouts/gust');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Two versions/ })).toBeNull());
  });

  it('can be put off: both versions stay as they are, and the conflict is still there to choose', async () => {
    const user = userEvent.setup();
    const { storage, local, remote, marks } = await conflicted();
    show(storage);
    await screen.findByRole('dialog', { name: 'Two versions of Gust' });

    await user.click(screen.getByRole('button', { name: 'Decide later' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Two versions/ })).toBeNull());
    expect(await description(local, 'gust')).toBe('Gust on the phone');
    expect(await description(remote, 'gust')).toBe('Gust on the laptop');
    expect(marks.has('layouts', 'gust')).toBe(true);
    expect(useSync.getState()).toMatchObject({ reviewing: false });
    expect(useSync.getState().last?.conflicts).toHaveLength(1);

    // Open to the user again whenever they ask, from the status.
    act(() => review(true));
    expect(await screen.findByRole('dialog', { name: 'Two versions of Gust' })).toBeInTheDocument();
  });

  it('is put off by closing it any other way too, as Escape does', async () => {
    const { storage, remote } = await conflicted();
    show(storage);
    const dialog = await screen.findByRole('dialog', { name: 'Two versions of Gust' });

    fireEvent(dialog, new Event('close'));

    await waitFor(() => expect(useSync.getState().reviewing).toBe(false));
    expect(await description(remote, 'gust')).toBe('Gust on the laptop');
  });

  it('asks about each of several in turn, in one dialog', async () => {
    const user = userEvent.setup();
    const { storage, local, remote } = await conflicted(['Gust', 'Breeze']);
    show(storage);
    const dialog = await screen.findByRole('dialog', { name: /Two versions of / });
    expect(dialog).toHaveTextContent('Layout 1 of 2 to choose');
    const first = (dialog.querySelector('h2')?.textContent ?? '').replace('Two versions of ', '');

    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    const next = await screen.findByRole('dialog', {
      name: (name) => name.startsWith('Two versions of ') && !name.endsWith(first),
    });
    expect(next).toHaveTextContent('One layout to choose');

    await user.click(screen.getByRole('button', { name: 'Keep theirs' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Two versions/ })).toBeNull());

    // One of each, as the user chose, and nothing else touched.
    const sent = [await description(remote, 'gust'), await description(remote, 'breeze')];
    expect(sent.filter((d) => String(d).endsWith('on the phone'))).toHaveLength(1);
    expect(sent.filter((d) => String(d).endsWith('on the laptop'))).toHaveLength(1);
    expect(await description(local, 'gust')).toBe(await description(remote, 'gust'));
    expect(await description(local, 'breeze')).toBe(await description(remote, 'breeze'));
  });

  it('writes nothing when the account changed again since it was shown, and says so', async () => {
    const user = userEvent.setup();
    const { storage, local, remote, marks } = await conflicted();
    // As in the app, where a pass is running for as long as someone is signed in.
    const stop = startAutoSync(storage, marks);
    show(storage);
    await screen.findByRole('dialog', { name: 'Two versions of Gust' });
    await remote.put('layouts', 'gust', { name: 'Gust', description: 'Gust on the laptop, again' });

    await user.click(screen.getByRole('button', { name: 'Keep mine' }));

    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.text)).toContain(
        'Gust changed again in your GitHub account, so nothing was replaced. Choose again.',
      ),
    );
    expect(await description(remote, 'gust')).toBe('Gust on the laptop, again');
    expect(await description(local, 'gust')).toBe('Gust on the phone');
    expect(marks.has('layouts', 'gust')).toBe(true);
    // It is asked about afresh, against what the account holds now.
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Two versions of Gust' })).toHaveTextContent(
        'Gust on the laptop, again',
      ),
    );
    stop();
  });

  it("keeps this browser's version, and says so, when the account's was deleted since", async () => {
    const user = userEvent.setup();
    const { storage, local, remote, marks } = await conflicted();
    const stop = startAutoSync(storage, marks);
    show(storage);
    await screen.findByRole('dialog', { name: 'Two versions of Gust' });
    await remote.delete('layouts', 'gust');

    await user.click(screen.getByRole('button', { name: 'Keep theirs' }));

    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.text)).toContain(
        "Gust was deleted from your GitHub account since, so this browser's version stays and is sent again.",
      ),
    );
    expect(await description(local, 'gust')).toBe('Gust on the phone');
    // Sent again, as it said.
    await waitFor(async () => expect(await description(remote, 'gust')).toBe('Gust on the phone'));
    stop();
  });

  it('says why a choice could not be kept, and writes nothing', async () => {
    const user = userEvent.setup();
    const { storage, remote } = await conflicted();
    show(storage);
    await screen.findByRole('dialog', { name: 'Two versions of Gust' });
    const put = remote.put.bind(remote);
    remote.put = async () => {
      throw new Error('GitHub responded 503');
    };

    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.text)).toContain(
        "Could not keep this browser's version of Gust: GitHub responded 503",
      ),
    );
    remote.put = put;
    expect(await description(remote, 'gust')).toBe('Gust on the laptop');
    expect(screen.getByRole('dialog', { name: 'Two versions of Gust' })).toBeInTheDocument();
  });

  it('is not there while there is nothing to choose', () => {
    render(
      <StorageProvider adapter={new CompositeStorage(new MemoryStorage('l'), null)}>
        <ConflictDialog />
      </StorageProvider>,
    );
    act(() => review(true));
    expect(screen.queryByRole('dialog', { name: /Two versions/ })).toBeNull();
  });
});
