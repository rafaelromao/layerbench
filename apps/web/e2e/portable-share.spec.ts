import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

const LAYOUT_BLOB = readFileSync(
  new URL('../../../packages/core/golden/inline-magic-romak.txt', import.meta.url),
  'utf8',
).trim();
const LAYOUT = JSON.parse(
  inflateSync(Buffer.from(LAYOUT_BLOB.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString(
    'utf8',
  ),
) as Record<string, unknown>;

function noisyDescription(seed: number, length: number): string {
  let state = seed >>> 0;
  const chars = new Array<string>(length);
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    chars[i] = String.fromCharCode(32 + (state % 95));
  }
  return chars.join('');
}

function canonical(entries: [string, string][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of [...entries].sort(([a], [b]) => a.localeCompare(b)))
    params.append(key, value);
  return params.toString();
}

test('a large Compare snapshot survives the static-host route redirect and reloads cleanly', async ({
  page,
}) => {
  const layoutA = {
    ...LAYOUT,
    name: 'Large A',
    description: noisyDescription(17, 24_000),
  };
  const layoutB = {
    ...LAYOUT,
    name: 'Large B',
    description: noisyDescription(29, 24_000),
  };
  const encode = (layout: Record<string, unknown>) =>
    `inline:${deflateSync(Buffer.from(JSON.stringify(layout))).toString('base64url')}`;
  const [refA, refB] = [encode(layoutA), encode(layoutB)];
  const query = canonical([
    ['corpus', 'en-general'],
    ['sample', '10000'],
    ['share', '1'],
  ]);
  const fragment = canonical([
    ['b', refB],
    ['layout', refA],
  ]);
  const target = `/compare?${query}#${fragment}`;
  const address = new URL(target, 'http://localhost');
  expect(target.length).toBeGreaterThan(7_900);
  expect((address.pathname + address.search).length).toBeLessThan(7_900);

  let redirected = false;
  const navigations: string[] = [];
  page.on('request', (request) => {
    if (!request.isNavigationRequest()) return;
    const url = new URL(request.url());
    if (url.pathname.startsWith('/compare')) navigations.push(url.pathname + url.search);
  });
  await page.route('**/compare*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname !== '/compare' || requestUrl.searchParams.get('share') !== '1') {
      await route.continue();
      return;
    }
    redirected = true;
    await route.fulfill({
      status: 308,
      headers: { location: `${requestUrl.origin}/compare/${requestUrl.search}` },
    });
  });

  await page.goto(target);
  expect(redirected).toBe(true);
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        route: url.pathname.replace(/\/$/, ''),
        share: url.searchParams.get('share'),
        secondLayout: new URLSearchParams(url.hash.slice(1)).get('b')?.startsWith('inline:'),
      };
    })
    .toEqual({ route: '/compare', share: '1', secondLayout: true });
  await expect(page.getByRole('heading', { name: 'A: Large A' })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole('heading', { name: 'B: Large B' })).toBeVisible();
  expect(navigations.length).toBeGreaterThanOrEqual(2);
  for (const request of navigations) {
    expect(request.length).toBeLessThan(7_900);
    expect(request).not.toContain('inline');
  }

  await page.reload();
  await expect(page.getByRole('heading', { name: 'A: Large A' })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole('heading', { name: 'B: Large B' })).toBeVisible();
});
