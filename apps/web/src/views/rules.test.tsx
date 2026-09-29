import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { renderRoute } from '../test/render.js';

let counter = 0;
const freshStorage = () => new IndexedDbAdapter(`layoutmaster-rules-${++counter}`);

describe('Rules', () => {
  it('lists the built-in rules by family', async () => {
    renderRoute('/rules', { storage: freshStorage() });

    expect(await screen.findByText('Same finger bigrams')).toBeInTheDocument();
    expect(screen.getByText('Bigrams')).toBeInTheDocument();
    expect(screen.getByText('Layers')).toBeInTheDocument();
    expect(screen.getByText('Layer taps per 100 symbols')).toBeInTheDocument();
  });

  it('cites a source under every rule, leading with the definition in force', async () => {
    renderRoute('/rules?rules=keysolve', { storage: freshStorage() });
    await screen.findByText('Same finger bigrams');

    const rows = [...document.querySelectorAll('tbody tr')];
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      expect(within(row as HTMLElement).getByText(/^Sources \(\d+\)$/)).toBeInTheDocument();
    }

    // Keysolve redefines full scissors, so its own README is the first source cited for them.
    const fsb = rows.find((r) => r.textContent?.includes('fsb')) as HTMLElement;
    const first = within(fsb).getAllByRole('link')[0];
    expect(first).toHaveTextContent('Keysolve README');
    expect(first).toHaveAttribute('href', expect.stringContaining('keysolve'));
  });

  it('adds a composed rule to the set', async () => {
    const user = userEvent.setup();
    renderRoute('/rules', { storage: freshStorage() });
    await screen.findByText('Same finger bigrams');

    const form = document.getElementById('composer-form') as HTMLElement;
    await user.type(within(form).getByLabelText('Rule id'), 'my rule');
    await user.type(within(form).getByLabelText('Rule label'), 'My rule');
    await user.selectOptions(within(form).getByLabelText('Predicate 1 type'), 'same_finger');
    await user.click(within(form).getByRole('button', { name: 'Add rule to set' }));

    expect(await screen.findByText('My rule')).toBeInTheDocument();
    expect(screen.getByText('Rule my-rule added')).toBeInTheDocument();
  });

  it('disables a rule and offers a removed one back', async () => {
    const user = userEvent.setup();
    renderRoute('/rules', { storage: freshStorage() });
    await screen.findByText('Same finger bigrams');

    const checkbox = screen.getByLabelText('Enable Same finger bigrams');
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByLabelText('Remove Same finger bigrams'));
    await waitFor(() => expect(screen.queryByText('Same finger bigrams')).toBeNull());

    // A removed built-in can be put back.
    expect(screen.getByText('Removed built-ins')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Same finger bigrams' }));
    expect(await screen.findByText('Same finger bigrams')).toBeInTheDocument();
  });

  it('switches presets from the picker', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute('/rules', { storage: freshStorage() });
    await screen.findByText('Same finger bigrams');

    await user.selectOptions(screen.getByLabelText('Rule set'), 'cyanophage');

    await waitFor(() => expect(currentSearch()).toContain('rules=cyanophage'));
    expect(await screen.findByText('Scissors (adjacent columns, 2 rows)')).toBeInTheDocument();
  });

  it('saves the set and offers it in the picker', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute('/rules', { storage });
    await screen.findByText('Same finger bigrams');

    const name = screen.getByLabelText('Rule set name');
    await user.clear(name);
    await user.type(name, 'Mine');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved rule set mine')).toBeInTheDocument();
    const stored = await storage.get('rulesets', 'mine');
    expect(stored?.doc.name).toBe('Mine');
    expect(Array.isArray(stored?.doc.rules)).toBe(true);
  });

  it('reports a rule set that cannot be read', async () => {
    const user = userEvent.setup();
    renderRoute('/rules', { storage: freshStorage() });
    await screen.findByText('Same finger bigrams');

    // A doubled brace is how this helper types a literal one.
    await user.type(screen.getByLabelText('Rule set JSON'), '{{"name":"broken"}');
    await user.click(screen.getByRole('button', { name: 'Import (replace current)' }));

    expect(await screen.findByText(/rules list/)).toBeInTheDocument();
  });
});
