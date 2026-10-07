import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/**
 * A layout that was never saved rides in its link after the `#`, which a browser never sends: GitHub
 * Pages refuses a request whose address is about 8 KB or longer, before the app could load. The
 * golden blob is Magic Romak, the way a link carries it.
 */
const BLOB = readFileSync(
  new URL('../../../packages/core/golden/inline-magic-romak.txt', import.meta.url),
  'utf8',
).trim();

const LINK = `/analyze?corpus=pt-br-conv&sample=20000#layout=inline%3A${BLOB}`;

/** What the browser asks the host for, for the page it shows: the address up to the `#`. */
function request(page: Page): string {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

async function analyzed(page: Page): Promise<void> {
  await expect(page.getByRole('list', { name: 'Summary metrics' })).toBeVisible({
    timeout: 45_000,
  });
}

test('a layout never saved opens from after the #, and its edits are written there', async ({
  page,
}) => {
  await page.goto(LINK);
  await analyzed(page);
  expect(request(page)).not.toContain('inline');
  expect(new URL(page.url()).hash).toBe(`#layout=inline%3A${BLOB}`);

  await page.reload();
  await analyzed(page);
  expect(request(page)).not.toContain('inline');

  // An edit reaches the link a moment later, after the # as well.
  await page.getByRole('button', { name: /^Key LHI:/ }).focus();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Key LHI: empty' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).not.toBe(`#layout=inline%3A${BLOB}`);
  expect(new URL(page.url()).hash).toMatch(/^#layout=inline%3A[\w-]+$/);
  expect(request(page)).not.toContain('inline');
});
