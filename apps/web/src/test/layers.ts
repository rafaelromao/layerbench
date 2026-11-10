import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** The layer navigator of a board: `Layers`, or `Layers of A` where a page shows two. */
export const layerNav = (label = 'Layers'): HTMLElement =>
  screen.getByRole('group', { name: label });

const COUNTER = /^\d+ \/ \d+$/;

/** The column between the arrows: the name, with the counter under it. */
export function layerStack(label = 'Layers'): HTMLElement {
  const parts = [...layerNav(label).children].filter(
    (el) => !el.matches('button[aria-label$=" layer"]'),
  );
  if (parts.length !== 1) throw new Error(`expected one name column, found ${parts.length}`);
  return parts[0] as HTMLElement;
}

/** The element that carries the shown layer's name, in the layer's colour. */
export function layerNameEl(label = 'Layers'): HTMLElement {
  const parts = [...layerStack(label).children].filter((el) => !COUNTER.test(el.textContent ?? ''));
  if (parts.length !== 1) throw new Error(`expected one layer name, found ${parts.length}`);
  return parts[0] as HTMLElement;
}

/** The name of the layer shown. */
export const shownLayer = (label = 'Layers'): string => layerNameEl(label).textContent ?? '';

/** The navigator's counter: where it stands among the layers. */
export const layerCounter = (label = 'Layers'): string =>
  within(layerNav(label)).queryByText(COUNTER)?.textContent ?? '';

const atEdge = (button: HTMLElement) => button.getAttribute('aria-disabled') === 'true';

/**
 * Step to the layer named: forward from the one shown, then back if it was behind, the way a person
 * with the buttons would. Every step draws the whole board again, so no step is spent on the way.
 */
export async function showLayer(user: UserEvent, name: string, label = 'Layers'): Promise<void> {
  // On Analyze the board is the first tab: its navigator is there only while that tab is open.
  const board = screen.queryByRole('tab', { name: 'Board', selected: false });
  if (board) await user.click(board);
  const nav = within(layerNav(label));
  for (const direction of ['Next layer', 'Previous layer']) {
    for (;;) {
      if (shownLayer(label) === name) return;
      const button = nav.queryByRole('button', { name: direction });
      if (!button || atEdge(button)) break;
      await user.click(button);
    }
  }
  throw new Error(`no layer named ${name}`);
}

/** The names of every layer, in order, read by stepping through them. Leaves the last one shown. */
export async function layerNames(user: UserEvent, label = 'Layers'): Promise<string[]> {
  const nav = within(layerNav(label));
  for (let back = nav.queryByRole('button', { name: 'Previous layer' }); back && !atEdge(back); ) {
    await user.click(back);
    back = nav.queryByRole('button', { name: 'Previous layer' });
  }
  const names = [shownLayer(label)];
  for (;;) {
    const next = nav.queryByRole('button', { name: 'Next layer' });
    if (!next || atEdge(next)) return names;
    await user.click(next);
    names.push(shownLayer(label));
  }
}

const SHARE_SAID = 'Share of key presses on this layer: ';

/**
 * The share of the typing written beside the navigator, in percent, or null where there is none (no
 * heat, or numbers not of this board). It must be said to a screen reader with what it is, and
 * written as Board writes it; `under 0.1%` reads as 0 and `over 99.9%` as 100.
 */
export function layerShareIn(scope: HTMLElement): number | null {
  const el = within(scope).queryByTestId('layer-share');
  if (!el) return null;
  const said = el.querySelector('.sr-only')?.textContent ?? '';
  if (said !== SHARE_SAID) throw new Error(`share not said for what it is: ${said}`);
  const shown = el.querySelector('[data-share-value]')?.textContent ?? '';
  if (shown === 'under 0.1%') return 0;
  if (shown === 'over 99.9%') return 100;
  if (!/^\d+(\.\d)?%$/.test(shown)) throw new Error(`share written as ${shown}`);
  return Number.parseFloat(shown);
}
