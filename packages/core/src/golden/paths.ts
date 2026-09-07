import { fileURLToPath } from 'node:url';

/** Absolute path of a file under `packages/core/golden` (reports dumped from the reference app). */
export function goldenPath(rel: string): string {
  return fileURLToPath(new URL(`../../golden/${rel}`, import.meta.url));
}

/** Absolute path of a checked-in fixture corpus. */
export function fixturePath(rel: string): string {
  return fileURLToPath(new URL(`../../fixtures/${rel}`, import.meta.url));
}
