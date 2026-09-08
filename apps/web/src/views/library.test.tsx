import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { renderRoute } from '../test/render.js';

let counter = 0;

/** Each test gets its own database, so saved documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layoutmaster-library-${++counter}`);
}

describe('Creating layouts', () => {
  it('creates a layout from scratch and opens it in the editor', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute('/library', { storage });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const dialog = screen.getByRole('form', { name: 'New layout' });
    const name = within(dialog).getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'Bird nest');
    await user.selectOptions(within(dialog).getByLabelText('New layout board'), '23332+2');
    await user.click(within(dialog).getByLabelText('Add number and symbol layers'));
    await user.click(within(dialog).getByRole('button', { name: 'Create and edit' }));

    await waitFor(() => expect(currentSearch()).toContain('saved%3Abird-nest'));
    const stored = await storage.get('layouts', 'bird-nest');
    expect(stored).not.toBeNull();
    const doc = stored?.doc as { name: string; layers: unknown[] };
    expect(doc.name).toBe('Bird nest');
    expect(doc.layers).toHaveLength(3);
  });

  it('duplicates a bundled layout under a free id instead of overwriting', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/library', { storage });

    await user.click(await screen.findByRole('button', { name: 'Duplicate Qwerty' }));
    await waitFor(async () =>
      expect((await storage.get('layouts', 'qwerty-copy'))?.doc.name).toBe('Qwerty copy'),
    );
  });
});
