import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Analyses run for real in these tests, on a small sample.
    testTimeout: 30_000,
    // Coverage slows every test, and the heavy ones run for tens of seconds on a CI runner with
    // dozens of jsdom workers sharing a few cores; one that passes in a minute on a laptop has
    // been seen to miss its limit there. A second try tells that apart from a test that is broken.
    retry: process.env.CI ? 2 : 0,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/main.tsx',
        'src/engine/analysis.worker.ts',
        'src/test/**',
        'e2e/**',
        'shots/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '*.config.ts',
      ],
      // Per package; `pnpm test:coverage` fails when any of the four falls below.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
