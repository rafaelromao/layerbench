import { expect, type Locator, type Page, test } from '@playwright/test';

const EDIT = '/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000';

async function openEdit(page: Page): Promise<void> {
  await page.goto(EDIT);
  await expect(page.getByRole('list', { name: 'Summary metrics' })).toBeVisible({
    timeout: 45_000,
  });
}

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/**
 * Visible controls inside `selector` that are smaller than the 24px WCAG 2.5.8 asks for, named so
 * a failure says which.
 */
function smallTargets(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [`nothing matches ${sel}`];
    const small: string[] = [];
    const controls = root.querySelectorAll(
      'button, input, select, summary, a[href], [role="button"], [role="tab"]',
    );
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (box.width < 24 || box.height < 24) {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? '';
        small.push(
          `${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`,
        );
      }
    }
    return small;
  }, selector);
}

test('every panel but the Board is a carousel as tall as the Combos one, its slides whole', async ({
  page,
}) => {
  await openEdit(page);
  const heights: Record<string, number> = {};
  for (const tab of [
    'Combos',
    'Layers',
    'Special Behaviors',
    'Typing paths',
    'Configuration',
    'Export',
  ]) {
    await page.getByRole('tab', { name: tab }).click();
    const strip = page.locator('.lb-carousel');
    await expect(strip).toHaveCount(1);
    heights[tab] = (await strip.boundingBox())?.height ?? 0;
    // Wider than its panel or not, it scrolls inside itself, and the page never does.
    expect.soft(await overflow(page), tab).toBeLessThanOrEqual(0);
    // Every slide holds what is in it: one that needs a scroll bar of its own has outgrown the strip.
    const cut = await strip.evaluate((el) =>
      [...el.children]
        .filter((slide) => slide.scrollHeight > slide.clientHeight + 1)
        .map((slide) => slide.textContent?.trim().slice(0, 30)),
    );
    // Soft: a failing tab says so and the rest are still looked at, so one run names every tab.
    expect.soft(cut, tab).toEqual([]);
  }
  for (const [tab, height] of Object.entries(heights)) {
    expect(height, tab).toBeGreaterThan(0);
    expect(Math.abs(height - heights.Combos), tab).toBeLessThanOrEqual(1);
  }
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('nothing scrolls sideways, and every control is a target a finger can hit', async ({
    page,
  }) => {
    await openEdit(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: /^Key LHI:/ }).tap();
    const inspector = page.getByRole('group', { name: 'Edit LHI' });
    await expect(inspector).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await smallTargets(page, '.lb-inspector')).toEqual([]);
    // The key's numbers, in their own section under the editor, are tapped as much.
    await expect(page.getByRole('region', { name: 'Key numbers' })).toBeVisible();
    expect(await smallTargets(page, '.lb-edit-keynumbers')).toEqual([]);

    // The kind tiles are what a finger reaches for first, so they get the full 44px.
    for (const tile of await inspector.locator('.lb-kind-tile').all()) {
      expect((await tile.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('the keys are drawn big enough to tap, and the whole board fits the screen', async ({
    page,
  }) => {
    await openEdit(page);
    const caps = page.locator('#kb-analyze g[data-key] rect.lb-key-cap');
    const sizes = await caps.evaluateAll((rects) =>
      rects.map((r) => Math.min(r.getBoundingClientRect().width, r.getBoundingClientRect().height)),
    );
    expect(sizes.length).toBeGreaterThan(0);
    // At least what a phone's own keyboard gives a key on the narrowest screen, 320px.
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(28);
    // A 24-key split board fits a phone with its halves drawn close: nothing to pan.
    const pans = await page
      .locator('.lb-board-scroll')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(pans).toBeLessThanOrEqual(1);
  });

  test('the inspector opens right under the board, and the board scrolls away with the page', async ({
    page,
  }) => {
    await openEdit(page);
    await page.getByRole('button', { name: /^Key LHI:/ }).tap();
    const inspector = page.getByRole('group', { name: 'Edit LHI' });
    await expect(inspector).toBeInViewport();

    // The board is not pinned, which on a phone would take most of the screen: scrolled far enough
    // down, it is gone, and the inspector has the room.
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(200);
    const board = await page.locator('.lb-edit-board').boundingBox();
    expect((board?.y ?? 0) + (board?.height ?? 0)).toBeLessThanOrEqual(0);
  });

  test("the editor's layers fit the screen, each card's fields clear of its buttons", async ({
    page,
  }) => {
    await openEdit(page);
    await page.getByRole('tab', { name: 'Layers' }).tap();
    const colour = page.getByRole('radiogroup', { name: 'Colour of layer Numbers' });
    await colour.scrollIntoViewIfNeeded();
    // The cards scroll sideways inside their panel, and the page itself never does.
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // The name and the colour end above the card's row of buttons.
    const left = await page.getByRole('button', { name: 'Move Numbers left' }).boundingBox();
    expect(left).not.toBeNull();
    for (const field of [colour, page.getByRole('textbox', { name: 'Name of layer Numbers' })]) {
      const box = await field.boundingBox();
      expect(box).not.toBeNull();
      if (box && left) expect(box.y + box.height).toBeLessThanOrEqual(left.y);
    }
    // Each colour is a circle of at least 24px (WCAG 2.5.8) in a cell of 30px, as a small button is.
    const circles = await colour.getByRole('radio').all();
    expect(circles).toHaveLength(8);
    for (const circle of circles) {
      const dot = await circle.boundingBox();
      const cell = await circle.locator('xpath=..').boundingBox();
      expect(Math.min(dot?.width ?? 0, dot?.height ?? 0)).toBeGreaterThanOrEqual(24);
      expect(Math.min(cell?.width ?? 0, cell?.height ?? 0)).toBeGreaterThanOrEqual(30);
    }
    await colour.getByRole('radio', { name: 'Red' }).tap();
    await expect(colour.getByRole('radio', { name: 'Red' })).toBeChecked();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the layout picker keeps room to show a name without sideways scroll', async ({ page }) => {
    await openEdit(page);
    const bar = page.getByRole('region', { name: 'Layout' });
    // Wide enough to read a layout's name in, whatever else the row holds.
    const picker = await bar.getByRole('combobox', { name: 'Layout' }).boundingBox();
    expect(picker?.width ?? 0).toBeGreaterThanOrEqual(144);

    // On a phone the buttons take a line under the name, which keeps room to be read.
    const name = await bar.getByRole('textbox', { name: 'Name', exact: true }).boundingBox();
    expect(name?.width ?? 0).toBeGreaterThanOrEqual(144);

    // Save as copy sits by Save, and still fits on the screen.
    const copy = bar.getByRole('button', { name: 'Save as copy' });
    await expect(copy).toBeVisible();
    const box = await copy.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(await smallTargets(page, '#analyze-toolbar')).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the layer navigator fits an iPhone SE with no sideways scroll', async ({ page }) => {
    await openEdit(page);
    const nav = page.getByRole('group', { name: 'Layers' });
    await expect(nav.getByRole('button', { name: 'Next layer' })).toBeVisible();
    const box = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    // Stepping to another layer must not push the page sideways either.
    await nav.getByRole('button', { name: 'Next layer' }).click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the layer arrows stay put as names of different lengths turn', async ({ page }) => {
    await openEdit(page);
    const nav = page.getByRole('group', { name: 'Layers' });
    const previous = nav.getByRole('button', { name: 'Previous layer' });
    const next = nav.getByRole('button', { name: 'Next layer' });
    const where = async () => {
      const [p, n] = [await previous.boundingBox(), await next.boundingBox()];
      return `${Math.round(p?.x ?? -1)} ${Math.round(n?.x ?? -1)}`;
    };
    // Magic Romak's layer names run from Alpha 1 to Ç extension in length: a second tap lands where
    // the first did.
    const names: string[] = [];
    const seen = new Set<string>();
    for (;;) {
      names.push(
        (await nav.locator('[data-testid="layer-name-slot"] > :first-child').textContent()) ?? '',
      );
      seen.add(await where());
      if ((await next.getAttribute('aria-disabled')) === 'true') break;
      await next.tap();
    }
    expect(new Set(names.map((n) => n.length)).size).toBeGreaterThan(1);
    expect([...seen]).toHaveLength(1);
  });
});

test.describe('at a desk', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout only');

  test('the inspector docks beside the board', async ({ page }) => {
    await openEdit(page);
    await page.getByRole('button', { name: /^Key LHI:/ }).click();
    const board = await page.locator('.lb-edit-board').boundingBox();
    const inspector = await page.getByRole('group', { name: 'Edit LHI' }).boundingBox();
    expect(board && inspector).toBeTruthy();
    if (!board || !inspector) return;
    expect(inspector.x).toBeGreaterThanOrEqual(board.x + board.width);
    expect(inspector.y).toBeLessThan(board.y + board.height);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('a click on a key selects it, where a drag would move it', async ({ page }) => {
    await openEdit(page);
    await page.getByRole('button', { name: /^Key LHI:/ }).click();
    await expect(page.getByRole('group', { name: 'Edit LHI' })).toBeVisible();
  });

  // Its place between Save and Submit, which a custom layout alone has, is a unit test's
  // (analyze-duplicate.test.tsx): this one is of where it is drawn.
  test('Save as copy follows Save on one row, and the picker sits beside Compare', async ({
    page,
  }) => {
    await openEdit(page);
    const bar = page.getByRole('region', { name: 'Layout' });
    const box = async (control: Locator) => {
      const b = await control.boundingBox();
      if (!b) throw new Error('not drawn');
      return b;
    };
    const centre = async (control: Locator) => {
      const b = await box(control);
      return b.y + b.height / 2;
    };
    const save = bar.getByRole('button', { name: 'Save', exact: true });
    const copy = bar.getByRole('button', { name: 'Save as copy' });
    const named = [await centre(save), await centre(copy)];
    for (const y of named) expect(Math.abs(y - named[0])).toBeLessThanOrEqual(2);
    expect((await box(copy)).x).toBeGreaterThan((await box(save)).x);
    const row = [
      await centre(bar.getByRole('combobox', { name: 'Layout' })),
      await centre(bar.getByRole('button', { name: 'Compare' })),
    ];
    for (const y of row) expect(Math.abs(y - row[0])).toBeLessThanOrEqual(2);
  });
});
