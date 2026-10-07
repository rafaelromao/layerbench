import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4011);

/**
 * The screenshots on the landing page (`docs/site`), taken from the running app so the page shows
 * what the app draws. Kept apart from the e2e suite so `pnpm e2e` never rewrites them:
 * `pnpm --filter @layerbench/web shots` writes `docs/site/assets/img/`, each shot in the dark and
 * the light theme. Motion is reduced so nothing is caught mid-transition, and a word's presses are
 * stepped through by hand.
 */
export default defineConfig({
  testDir: './shots',
  testMatch: '*.shots.ts',
  timeout: 180_000,
  // One browser at a time: the Library scores every layout, and shots taken in parallel would
  // compete for the CPU and wait on each other's analyses.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // `E2E_CHANNEL=msedge` or `E2E_CHANNEL=chrome` runs on an Edge or Chrome already installed.
    channel: process.env.E2E_CHANNEL || undefined,
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'desk-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1.5,
        colorScheme: 'dark',
      },
    },
    {
      name: 'desk-light',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1.5,
        colorScheme: 'light',
      },
    },
    // The phone's own density would make a 1 MB image of a 412px-wide page.
    {
      name: 'phone-dark',
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1.5, colorScheme: 'dark' },
    },
    {
      name: 'phone-light',
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1.5, colorScheme: 'light' },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
