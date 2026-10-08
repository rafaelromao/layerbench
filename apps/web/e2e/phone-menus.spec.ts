import { expect, type Locator, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Whether a box lies wholly on the screen, left to right. */
async function onScreen(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  return box !== null && box.x >= 0 && box.x + box.width <= width;
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('the menu opens on the screen, every view in it in full', async ({ page }) => {
    await page.goto('/library?sample=10000');
    await page.getByText('Menu', { exact: true }).tap();
    const views = page.locator('header details .menu');
    await expect(views).toBeVisible();
    expect(await onScreen(page, views)).toBe(true);
    for (const name of ['Library', 'Analyze', 'Compare', 'Rules', 'Corpus', 'Guide', 'About']) {
      expect(await onScreen(page, views.getByRole('link', { name, exact: true })), name).toBe(true);
    }
  });

  test("Analyze's settings open in a dialog that fits the screen", async ({ page }) => {
    await page.goto('/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000');
    await page.getByRole('button', { name: 'Settings' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByRole('textbox', { name: 'Author' })).toHaveValue('Rafael Romão');
    expect(await onScreen(page, dialog.getByRole('textbox', { name: 'Author' }))).toBe(true);
    // The switches line up in two columns: each of the second column's starts where the others do.
    const lefts = await dialog
      .getByRole('group', { name: 'Analyze with' })
      .getByRole('checkbox')
      .evaluateAll((boxes) => boxes.map((b) => Math.round(b.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(2);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Taller than the screen, it scrolls inside, with Done in sight at its foot from the start.
    expect(await fitsTheScreen(page, dialog)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 });
  });

  test("the Library's import dialog fits the screen, a keymap-drawer file and all", async ({
    page,
  }) => {
    await page.goto('/library?sample=10000');
    await page.getByRole('button', { name: 'Import', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Import a layout' });
    await dialog.getByRole('tab', { name: 'keymap-drawer' }).tap();
    await dialog.getByLabel('keymap-drawer YAML').fill(KEYMAP);
    // The board it goes onto is offered by name, the longest names wider than a phone.
    await expect(dialog.getByRole('combobox', { name: 'Board to import onto' })).toBeVisible();
    expect(await fitsTheScreen(page, dialog)).toBe(true);
    // Exactly: the backdrop behind every dialog is a button called "close" too.
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({
      ratio: 1,
    });
  });
});

/** A keymap-drawer file that only names its keyboard, so the board is chosen from a list. */
const KEYMAP = `layout:
  zmk_keyboard: hummingbird
layers:
  Def:
  - [W, F, M, P, G, K, U, O, Y, SQT]
  - [R, S, N, T, B, J, A, E, I, H]
  - [C, L, D, X, ',', .]
  - {t: Nav, h: sticky}
  - SPACE
  - {t: LSHFT, h: sticky}
  - {t: Num, h: sticky}
  Nav:
  - [F1, F2, F3, F4, F5, ESC, HOME, UARW, END, PG UP]
  - [LGUI, LALT, LSHFT, LCTRL, LC(Z), DEL, LARW, ENTER, RARW, PG DN]
  - [LC(X), LC(C), LC(V), BSPC, DARW, TAB]
  - [{type: held}, '', '', '']
`;

/**
 * Whether a dialog's box lies on the screen, top to bottom and side to side, and nothing in it is
 * wider than the box: it may scroll down inside, never sideways.
 */
async function fitsTheScreen(page: Page, dialog: Locator): Promise<boolean> {
  const box = dialog.locator('.modal-box');
  const size = page.viewportSize();
  const rect = await box.boundingBox();
  const sideways = await box.evaluate((el) => el.scrollWidth - el.clientWidth);
  return (
    size !== null &&
    rect !== null &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= size.width &&
    rect.y + rect.height <= size.height &&
    sideways <= 0
  );
}
