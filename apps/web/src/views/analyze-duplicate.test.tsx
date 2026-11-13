import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  bar,
  freshStorage,
  key,
  linkOf,
  qwertyWithDefaults,
  seed,
} from '../test/analyze-editing.js';
import { keyNamed } from '../test/keys.js';
import { showLayer, shownLayer } from '../test/layers.js';
import { renderRoute } from '../test/render.js';

/** The dialog Save as copy opens, asking what to call the copy of `layout`. */
const duplicateDialog = (layout: string) =>
  screen.getByRole('dialog', { name: `Save ${layout} as a copy` });

describe('Save as copy', () => {
  it('saves the layout in hand as a custom layout under the name asked for, and opens it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=1000', {
      storage,
    });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    const button = within(bar()).getByRole('button', { name: 'Save as copy' });
    expect(button).toBeEnabled();
    await user.click(button);

    // It offers a name no layout has.
    const dialog = duplicateDialog('Qwerty');
    expect(within(dialog).getByLabelText('Name of the copy')).toHaveValue('Qwerty copy');
    expect(await storage.list('layouts')).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Save copy' }));

    expect(await screen.findByText('Saved Qwerty copy')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Save Qwerty as a copy' })).toBeNull();
    // Analyze is on the duplicate: the bar, the picker and the link, with nothing unsaved.
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty copy'));
    expect(screen.getByRole('option', { name: 'Qwerty copy', selected: true })).toBeInTheDocument();
    await linkOf(currentSearch, 'qwerty-copy');
    expect(screen.queryByText('unsaved')).toBeNull();
    // Qwerty comes with the app: only the duplicate is kept.
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['qwerty-copy']);
  }, 60_000);

  it('opens the duplicate on its first layer, wherever the layout was', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    // Qwerty as New layout makes it has layers past its base; the bundled one has just the one.
    await seed(storage, qwertyWithDefaults(), 'qwerty-defaults', {});
    const { currentSearch } = renderRoute(
      '/analyze?layout=custom%3Aqwerty-defaults&corpus=en-general&sample=1000',
      { storage },
    );
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    const first = shownLayer();
    await showLayer(user, 'Numbers');
    expect(shownLayer()).toBe('Numbers');
    await waitFor(() => expect(currentSearch()).toContain('layer='));

    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
    await user.click(within(duplicateDialog('Qwerty')).getByRole('button', { name: 'Save copy' }));

    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty copy'));
    expect(shownLayer()).toBe(first);
    expect(currentSearch()).not.toContain('layer=');
  }, 60_000);

  it('takes the unsaved edits with it and says so, leaving the layout as it was saved', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'qwerty', 'mine', { name: 'Mine' });
    renderRoute('/analyze?layout=custom%3Amine&corpus=en-general&sample=1000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    // With nothing unsaved the dialog has nothing to say of it.
    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
    expect(within(duplicateDialog('Mine')).queryByText(/unsaved/)).toBeNull();
    await user.click(within(duplicateDialog('Mine')).getByRole('button', { name: 'Cancel' }));

    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });
    expect(screen.getByText('unsaved')).toBeInTheDocument();

    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
    const dialog = duplicateDialog('Mine');
    expect(within(dialog).getByText(/unsaved changes/)).toHaveTextContent(
      'Saves a copy of this layout, with its unsaved changes, among your custom layouts, and opens it. Mine stays as it was.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save copy' }));

    // The duplicate is on screen with the edit, saved: nothing is left unsaved.
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Mine copy'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: ç') })).toBeInTheDocument();
    expect(screen.queryByText('unsaved')).toBeNull();
    expect(JSON.stringify((await storage.get('layouts', 'mine-copy'))?.doc)).toContain('ç');
    expect(JSON.stringify((await storage.get('layouts', 'mine'))?.doc)).not.toContain('ç');

    // The layout it was made from, opened again, is as it was saved.
    await user.selectOptions(
      within(bar()).getByRole('combobox', { name: 'Layout' }),
      'custom:mine',
    );
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Mine'));
    expect(await screen.findByRole('button', { name: keyNamed('Key LHM: d') })).toBeInTheDocument();
  }, 60_000);

  it('offers a name numbered while a layout has it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'qwerty', 'qwerty-copy', { name: 'Qwerty copy' });
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=1000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));

    expect(within(duplicateDialog('Qwerty')).getByLabelText('Name of the copy')).toHaveValue(
      'Qwerty copy 2',
    );
  }, 60_000);

  it('rejects a name another custom layout has, whatever its capitals and spacing, and an empty one', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'colemak', 'gust', { name: 'Gust' });
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=1000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
    const dialog = duplicateDialog('Qwerty');
    const field = within(dialog).getByLabelText('Name of the copy');
    const submit = within(dialog).getByRole('button', { name: 'Save copy' });

    await user.clear(field);
    await user.type(field, '  gUST ');
    // It says so, and there is no overwriting a layout by a duplicate: only another name.
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'A custom layout is already called Gust. Type another name.',
    );
    expect(field).toBeInvalid();
    expect(submit).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: /Overwrite/ })).toBeNull();

    await user.clear(field);
    expect(submit).toBeDisabled();
    await user.type(field, '   ');
    expect(submit).toBeDisabled();
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['gust']);

    // Another name goes through.
    await user.clear(field);
    await user.type(field, 'Gale');
    expect(within(dialog).getByRole('status')).toHaveTextContent('');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(await screen.findByText('Saved Gale')).toBeInTheDocument();
    expect((await storage.list('layouts')).map((e) => e.name).sort()).toEqual(['Gale', 'Gust']);
  }, 60_000);

  it('stores nothing and leaves the editor, unsaved edits and all, when it is cancelled or closed', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'qwerty', 'mine', { name: 'Mine' });
    renderRoute('/analyze?layout=custom%3Amine&corpus=en-general&sample=1000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });

    for (const leave of ['Cancel', 'close'] as const) {
      await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
      const dialog = duplicateDialog('Mine');
      // A name given and not used is not kept for the next time.
      await user.clear(within(dialog).getByLabelText('Name of the copy'));
      await user.type(within(dialog).getByLabelText('Name of the copy'), 'Never made');
      if (leave === 'Cancel')
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      // What Escape raises.
      else fireEvent(dialog, new Event('close'));

      expect(screen.queryByRole('dialog', { name: 'Save Mine as a copy' })).toBeNull();
      expect(within(bar()).getByLabelText('Name')).toHaveValue('Mine');
      expect(screen.getByText('unsaved')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: keyNamed('Key LHM: ç') })).toBeInTheDocument();
      expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['mine']);
    }
  }, 60_000);

  it('asks again, the name flagged, when storage has the name although the list the page read did not', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=1000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });

    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
    const field = within(duplicateDialog('Qwerty')).getByLabelText('Name of the copy');
    await user.clear(field);
    await user.type(field, 'Gust');
    // Another tab saves a layout by the name while the dialog is open: this page is not told.
    await seed(storage, 'colemak', 'gust', { name: 'Gust' });
    // So the dialog lets the name through ...
    const submit = within(duplicateDialog('Qwerty')).getByRole('button', { name: 'Save copy' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    // ... and storage does not: the dialog is back, with the name flagged, and nothing was made.
    const again = await screen.findByRole('dialog', { name: 'Save Qwerty as a copy' });
    expect(within(again).getByLabelText('Name of the copy')).toHaveValue('Gust');
    expect(within(again).getByRole('status')).toHaveTextContent(
      'A custom layout is already called Gust. Type another name.',
    );
    expect(within(again).getByRole('button', { name: 'Save copy' })).toBeDisabled();
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty');
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['gust']);
  }, 60_000);

  it('says when it could not be stored, stays on the layout, and offers the name given again', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=1000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    vi.spyOn(storage, 'put').mockRejectedValueOnce(new Error('offline'));

    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
    const field = within(duplicateDialog('Qwerty')).getByLabelText('Name of the copy');
    await user.clear(field);
    await user.type(field, 'Mine');
    await user.click(within(duplicateDialog('Qwerty')).getByRole('button', { name: 'Save copy' }));

    expect(await screen.findByText('Save as copy failed: offline')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Save Qwerty as a copy' })).toBeNull();
    // Nothing was made, and nothing moved: this is still Qwerty.
    expect(within(bar()).getByLabelText('Name')).toHaveValue('Qwerty');
    expect(await storage.list('layouts')).toEqual([]);

    // The next time, the name given is offered, and trying again makes the one layout.
    await user.click(within(bar()).getByRole('button', { name: 'Save as copy' }));
    expect(within(duplicateDialog('Qwerty')).getByLabelText('Name of the copy')).toHaveValue(
      'Mine',
    );
    await user.click(within(duplicateDialog('Qwerty')).getByRole('button', { name: 'Save copy' }));
    expect(await screen.findByText('Saved Mine')).toBeInTheDocument();
    await waitFor(() => expect(within(bar()).getByLabelText('Name')).toHaveValue('Mine'));
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['mine']);
  }, 60_000);

  it('waits while a save is in flight, as Save does', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await seed(storage, 'qwerty', 'mine', { name: 'Mine' });
    renderRoute('/analyze?layout=custom%3Amine&corpus=en-general&sample=1000', { storage });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    key('Key LHM: d').focus();
    await user.keyboard('ç{Enter}');
    await screen.findByRole('button', { name: keyNamed('Key LHM: ç') });
    const put = storage.put.bind(storage);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(storage, 'put').mockImplementation(async (...args) => {
      await gate;
      return put(...args);
    });

    await user.click(within(bar()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(within(bar()).getByRole('button', { name: 'Save' })).toBeDisabled());
    expect(within(bar()).getByRole('button', { name: 'Save as copy' })).toBeDisabled();
    release();
    await waitFor(() =>
      expect(within(bar()).getByRole('button', { name: 'Save as copy' })).toBeEnabled(),
    );
    expect(within(bar()).getByRole('button', { name: 'Save' })).toBeEnabled();
  }, 60_000);
});
