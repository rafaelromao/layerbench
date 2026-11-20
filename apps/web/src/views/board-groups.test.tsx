import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { freshStorage, inspector, key, openEdit } from '../test/analyze-editing.js';
import { renderRoute } from '../test/render.js';

const follows = (a: Node, b: Node) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Analyze: the Board tab and the board’s card', () => {
  it('holds the Key hint and A word, typed under the tabs, and the Legend and Summary in the board’s card', async () => {
    await openEdit();
    const panel = screen.getByRole('tabpanel', { name: 'Board' });
    const card = screen.getByRole('region', { name: 'Board' });

    // Under the tabs, in the Board tab: how a key is picked, and the word typed.
    const hint = within(panel).getByRole('region', { name: 'Key' });
    expect(hint).toHaveTextContent(/Tap or click a key on the board to edit it/);
    const word = within(panel).getByRole('region', { name: 'A word, typed' });
    expect(word).toContainElement(within(panel).getByLabelText('How is this typed?'));

    // The board's card follows them, and neither is in it.
    expect(follows(panel, card)).toBe(true);
    expect(within(card).queryByRole('region', { name: 'Key' })).toBeNull();
    expect(within(card).queryByRole('region', { name: 'A word, typed' })).toBeNull();

    // The legend and the summary are in it, each once.
    expect(within(card).getByRole('region', { name: 'Legend' })).toBeInTheDocument();
    expect(within(card).getByRole('region', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Legend' })).toHaveLength(1);
    expect(screen.getAllByRole('region', { name: 'Summary' })).toHaveLength(1);
  }, 60_000);

  it('starts the Legend folded, opens it by its heading, and starts the Summary open', async () => {
    const user = userEvent.setup();
    await openEdit();
    const card = screen.getByRole('region', { name: 'Board' });

    const legend = within(card).getByRole('button', { name: 'Legend' });
    expect(legend).toHaveAttribute('aria-expanded', 'false');
    // Qwerty's keys all fit their labels, which is what the legend says.
    const body = within(card).getByText(/fits its label/);
    expect(body).not.toBeVisible();
    await user.click(legend);
    expect(legend).toHaveAttribute('aria-expanded', 'true');
    expect(body).toBeVisible();

    expect(within(card).getByRole('button', { name: 'Summary' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  }, 60_000);

  it('opens the editor of a selected key by the board, and none before one is picked', async () => {
    const user = userEvent.setup();
    await openEdit();
    const panel = screen.getByRole('tabpanel', { name: 'Board' });
    const card = screen.getByRole('region', { name: 'Board' });
    expect(screen.queryByRole('group', { name: /^Edit / })).toBeNull();
    // Its slot is empty, and hidden, so it leaves no gap under the card where the page is one column.
    const slot = document.querySelector('.lb-edit-inspector');
    expect(slot).toBeEmptyDOMElement();
    expect(slot).toHaveClass('empty:hidden');

    await user.click(key('Key LHM: d'));
    const editor = await inspector('LHM');
    // Beside the board, not among the Key hint and the word above it, which stay where they are.
    expect(editor.closest('.lb-edit-side')).not.toBeNull();
    expect(panel).not.toContainElement(editor);
    expect(card).not.toContainElement(editor);
    expect(within(panel).getByRole('region', { name: 'Key' })).toBeInTheDocument();

    // The key's numbers are in the card, right above the Summary.
    const numbers = await screen.findByRole('region', { name: 'Key numbers' });
    expect(card).toContainElement(numbers);
    expect(follows(numbers, within(card).getByRole('region', { name: 'Summary' }))).toBe(true);
  }, 60_000);

  it('draws the Legend and Summary in the card of every tab that draws the board, and the Summary alone elsewhere', async () => {
    const user = userEvent.setup();
    await openEdit();

    for (const tab of ['Combos', 'Special Behaviors']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      const card = screen.getByRole('region', { name: 'Board' });
      expect(within(card).getByRole('region', { name: 'Legend' })).toBeInTheDocument();
      expect(within(card).getByRole('region', { name: 'Summary' })).toBeInTheDocument();
      // The Key hint and the word are the Board tab's.
      expect(screen.queryByRole('region', { name: 'Key' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'A word, typed' })).toBeNull();
    }

    // A tab with no board keeps the Summary, in a card of its own.
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.queryByRole('region', { name: 'Board' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Legend' })).toBeNull();
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(summary.closest('.card')).not.toBeNull();
  }, 60_000);
});

describe('Compare: Legend and Summary under each board', () => {
  const sideOf = (side: string) =>
    screen.getByRole('group', { name: `Layers of ${side}` }).closest('section') as HTMLElement;

  it('starts the Legend folded and the Summary open, and folds and opens each on both sides together', async () => {
    const user = userEvent.setup();
    renderRoute('/compare?layout=qwerty&b=magic-romak&corpus=en-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    const [a, b] = [sideOf('A'), sideOf('B')];
    const legend = (side: HTMLElement) => within(side).getByRole('button', { name: 'Legend' });
    const summary = (side: HTMLElement) => within(side).getByRole('button', { name: 'Summary' });

    for (const side of [a, b]) {
      expect(legend(side)).toHaveAttribute('aria-expanded', 'false');
      expect(summary(side)).toHaveAttribute('aria-expanded', 'true');
    }
    // Under the board, and its note, as the list was.
    expect(follows(within(a).getByRole('group', { name: 'Layers of A' }), legend(a))).toBe(true);

    // One side's heading opens the other's: they are read against each other.
    await user.click(legend(a));
    expect(legend(a)).toHaveAttribute('aria-expanded', 'true');
    expect(legend(b)).toHaveAttribute('aria-expanded', 'true');
    // Magic Romak's keys that do not fit their caps are listed.
    expect(await within(b).findByRole('list', { name: 'Key legend' })).toBeVisible();

    await user.click(summary(b));
    expect(summary(a)).toHaveAttribute('aria-expanded', 'false');
    expect(summary(b)).toHaveAttribute('aria-expanded', 'false');
    // The legend stays as it was: each group is its own.
    expect(legend(a)).toHaveAttribute('aria-expanded', 'true');
  }, 60_000);
});
