import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** The layer navigator of a board: `Layers`, or `Layers of A` where a page shows two. */
export const layerNav = (label = 'Layers'): HTMLElement =>
  screen.getByRole('group', { name: label });

const COUNTER = /^\d+ \/ \d+$/;

/** The element that carries the shown layer's name, in the layer's colour. */
export function layerNameEl(label = 'Layers'): HTMLElement {
  const parts = [...layerNav(label).children].filter(
    (el) => !el.matches('button[aria-label$=" layer"]') && !COUNTER.test(el.textContent ?? ''),
  );
  if (parts.length !== 1) throw new Error(`expected one layer name, found ${parts.length}`);
  return parts[0] as HTMLElement;
}

/** The name of the layer shown. */
export const shownLayer = (label = 'Layers'): string => layerNameEl(label).textContent ?? '';

/** The navigator's counter: where it stands among the layers. */
export const layerCounter = (label = 'Layers'): string =>
  within(layerNav(label)).queryByText(COUNTER)?.textContent ?? '';

const atEdge = (button: HTMLElement) => button.getAttribute('aria-disabled') === 'true';

async function firstLayer(user: UserEvent, label: string): Promise<void> {
  const nav = within(layerNav(label));
  const previous = () => nav.queryByRole('button', { name: 'Previous layer' });
  for (let back = previous(); back && !atEdge(back); back = previous()) await user.click(back);
}

/** Step to the first layer, then on to the one named, the way a person with the buttons would. */
export async function showLayer(user: UserEvent, name: string, label = 'Layers'): Promise<void> {
  const nav = within(layerNav(label));
  await firstLayer(user, label);
  for (;;) {
    if (shownLayer(label) === name) return;
    const next = nav.queryByRole('button', { name: 'Next layer' });
    if (!next || atEdge(next)) throw new Error(`no layer named ${name}`);
    await user.click(next);
  }
}

/** The names of every layer, in order, read by stepping through them. Leaves the last one shown. */
export async function layerNames(user: UserEvent, label = 'Layers'): Promise<string[]> {
  const nav = within(layerNav(label));
  await firstLayer(user, label);
  const names = [shownLayer(label)];
  for (;;) {
    const next = nav.queryByRole('button', { name: 'Next layer' });
    if (!next || atEdge(next)) return names;
    await user.click(next);
    names.push(shownLayer(label));
  }
}
