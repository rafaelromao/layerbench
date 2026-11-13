import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4011);
const CYANOPHAGE = /cyanophage\.spec\.ts$/;
const CHUNK_LOADING = /chunk-loading\.spec\.ts$/;
const PREVIEW = process.env.E2E_PREVIEW === '1';
const TEST_IGNORE = PREVIEW ? CYANOPHAGE : [CYANOPHAGE, CHUNK_LOADING];

/**
 * What a unit test cannot see: layout, sizes and overflow, measured in a real browser at a phone's
 * width and at a desk's. `pnpm --filter @layerbench/web e2e` starts the dev server itself, or
 * reuses one already listening on the port.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // `E2E_CHANNEL=msedge` or `E2E_CHANNEL=chrome` runs on an Edge or Chrome already installed, for
    // a network that will not let `playwright install` download its own Chromium.
    channel: process.env.E2E_CHANNEL || undefined,
  },
  projects: [
    // The smallest phone still in wide use, and a common large one; both on Chromium, which is
    // what the dev container and CI have.
    {
      name: 'phone-small',
      use: { ...devices['iPhone SE'], browserName: 'chromium' },
      testIgnore: TEST_IGNORE,
    },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: TEST_IGNORE },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: TEST_IGNORE,
    },
    // LayerBench held to cyanophage's playground: ten analyses of the whole English sample, run on
    // their own and only when asked (`E2E_CYANOPHAGE=1 … --project=cyanophage`), never with the
    // checks above.
    ...(process.env.E2E_CYANOPHAGE || process.env.CYANOPHAGE_CAPTURE
      ? [
          {
            name: 'cyanophage',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
            testMatch: CYANOPHAGE,
          },
        ]
      : []),
  ],
  webServer: {
    command: PREVIEW
      ? `pnpm exec vite preview --port ${PORT} --strictPort`
      : `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !PREVIEW,
    timeout: 120_000,
  },
});
