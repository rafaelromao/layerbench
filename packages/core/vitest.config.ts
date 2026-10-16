import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '*.config.ts'],
      // Per package; `pnpm test:coverage` fails when any of the four falls below.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
