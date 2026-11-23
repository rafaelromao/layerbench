import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { freshStorage, inspector, key, openEdit } from '../test/analyze-editing.js';
import { openLegend, showLayer } from '../test/layers.js';
import { renderRoute } from '../test/render.js';

const follows = (a: Node, b: Node) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Analyze: the Board tab and the board’s card', () => {
  it('holds the Key hint and A word, typed under the tabs, and the Legend’s button and Summary in the board’s card', async () => {
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
    expect(panel).not.toContainElement(card);
    expect(within(card).queryByRole('region', { name: 'Key' })).toBeNull();
    expect(within(card).queryByRole('region', { name: 'A word, typed' })).toBeNull();

    // The summary is in it, once; the legend is a button in its row of tools, once, not a section.
    expect(within(card).getByRole('button', { name: 'Legend' })).toBeInTheDocument();
    expect(within(card).getByRole('region', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Legend' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Legend' })).toBeNull();
    expect(screen.getAllByRole('region', { name: 'Summary' })).toHaveLength(1);
  }, 60_000);

  it('suggests English words to type in A word, typed, a capital and a symbol among them', async () => {
    await openEdit();
    const field = screen.getByLabelText('How is this typed?');
    const examples = (field.getAttribute('placeholder') ?? '').split(' · ');

    // English words: letters a to z and an apostrophe, no accent and no other alphabet.
    expect.soft(examples.length).toBeGreaterThanOrEqual(3);
    for (const word of examples) expect.soft(word).toMatch(/^[A-Za-z]+(?:'[A-Za-z]+)?$/);

    // Still worth playing on the board: a word that takes Shift, and one that reaches a symbol.
    expect(examples.some((word) => /[A-Z]/.test(word))).toBe(true);
    expect(examples.some((word) => /\P{L}/u.test(word))).toBe(true);
  }, 60_000);

  it('opens the Legend as a popup by its button, closed until then, and starts the Summary open', async () => {
    const user = userEvent.setup();
    await openEdit();
    const card = screen.getByRole('region', { name: 'Board' });

    // A button that opens a dialog, not a heading that folds: nothing of it is on the page, folded
    // or not, until it is opened.
    const legend = within(card).getByRole('button', { name: 'Legend' });
    expect(legend).toHaveAttribute('aria-haspopup', 'dialog');
    expect(legend).not.toHaveAttribute('aria-expanded');
    // In the row of the Board heading, which has room, not in the row of the Heat choice.
    expect(legend.closest('div.flex-wrap')).toContainElement(
      within(card).getByRole('button', { name: 'Board' }),
    );
    expect(legend.closest('div.flex-wrap')).not.toContainElement(
      within(card).getByLabelText('Heat'),
    );
    expect(screen.queryByRole('dialog', { name: 'Legend' })).toBeNull();
    expect(screen.queryByText(/fits its label/)).toBeNull();

    await user.click(legend);
    const popup = await screen.findByRole('dialog', { name: 'Legend' });
    // Qwerty's keys all fit their labels, which is what the legend says.
    expect(within(popup).getByText(/fits its label/)).toBeInTheDocument();
    await user.click(within(popup).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Legend' })).toBeNull();

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

  it('puts the Legend’s button and the Summary in the card of every tab that draws the board, and the Summary alone elsewhere', async () => {
    const user = userEvent.setup();
    await openEdit();

    for (const tab of ['Combos', 'Special Behaviors']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      const card = screen.getByRole('region', { name: 'Board' });
      expect(within(card).getByRole('button', { name: 'Legend' })).toBeInTheDocument();
      expect(within(card).getByRole('region', { name: 'Summary' })).toBeInTheDocument();
      // The Key hint and the word are the Board tab's.
      expect(screen.queryByRole('region', { name: 'Key' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'A word, typed' })).toBeNull();
    }

    // A tab with no board keeps the Summary, in a card of its own.
    await user.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.queryByRole('region', { name: 'Board' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Legend' })).toBeNull();
    const summary = screen.getByRole('region', { name: 'Summary' });
    // A card of its own: not the Editor card, which holds the tabs.
    const own = summary.closest('.card');
    expect(own).not.toBeNull();
    expect(own).not.toContainElement(screen.getByRole('region', { name: 'Editor' }));
  }, 60_000);
});

describe('Compare: the Legend’s popup and the Summary under each board', () => {
  const sideOf = (side: string) =>
    screen.getByRole('group', { name: `Layers of ${side}` }).closest('section') as HTMLElement;

  it('lists the keys of the layer each side shows', async () => {
    const user = userEvent.setup();
    renderRoute('/compare?layout=magic-romak&b=qwerty&corpus=en-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    // Side A on its Symbols layer, side B on its base: each Legend follows its own board.
    await showLayer(user, 'Symbols', 'Layers of A');
    const list = await openLegend(user, 'A');
    expect(list.textContent).toContain('to reach Symbols');
    // Side B has all its keys fit their labels: its part of the popup says there is nothing to list.
    const popup = screen.getByRole('dialog', { name: 'Legend' });
    const sideB = within(popup).getByRole('region', { name: /^Legend of B:/ });
    expect(sideB.textContent).not.toContain('to reach Symbols');
    expect(within(sideB).getByText(/fits its label/)).toBeInTheDocument();
    // Each list is headed with its layout and the layer it is of.
    expect(within(popup).getByRole('heading', { name: /^A: .*Symbols$/ })).toBeInTheDocument();
  }, 60_000);

  it('opens one Legend for both sides from a button in the heat row, and starts the Summary open on both', async () => {
    const user = userEvent.setup();
    renderRoute('/compare?layout=qwerty&b=magic-romak&corpus=en-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('group', { name: 'Layers of A' });
    await screen.findByRole('group', { name: 'Layers of B' });
    const [a, b] = [sideOf('A'), sideOf('B')];
    const summary = (side: HTMLElement) => within(side).getByRole('button', { name: 'Summary' });

    // One button, in the row of the Heat choice, not one under each board; nothing of the list is
    // on the page until it is opened.
    const legend = screen.getByRole('button', { name: 'Legend' });
    expect(screen.getAllByRole('button', { name: 'Legend' })).toHaveLength(1);
    expect(a).not.toContainElement(legend);
    expect(b).not.toContainElement(legend);
    // At the right of the Layouts heading, in its row, which has room: the Heat's row is as it was.
    expect(legend.closest('div.flex-wrap')).toContainElement(
      screen.getByRole('button', { name: 'Layouts' }),
    );
    expect(legend.closest('div.flex-wrap')).not.toContainElement(screen.getByLabelText('Heat'));
    expect(screen.queryByRole('list', { name: 'Key legend' })).toBeNull();
    for (const side of [a, b]) {
      expect(summary(side)).toHaveAttribute('aria-expanded', 'true');
    }

    // Both sides' lists are in the one popup: they are read against each other.
    await user.click(legend);
    const popup = await screen.findByRole('dialog', { name: 'Legend' });
    expect(within(popup).getAllByRole('region', { name: /^Legend of / })).toHaveLength(2);
    // Magic Romak's keys that do not fit their caps are listed.
    expect(
      await within(within(popup).getByRole('region', { name: /^Legend of B:/ })).findByRole(
        'list',
        { name: 'Key legend' },
      ),
    ).toBeVisible();
    await user.click(within(popup).getByRole('button', { name: 'Close' }));

    await user.click(summary(b));
    expect(summary(a)).toHaveAttribute('aria-expanded', 'false');
    expect(summary(b)).toHaveAttribute('aria-expanded', 'false');
  }, 60_000);
});
