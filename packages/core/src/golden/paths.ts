import { fileURLToPath } from 'node:url';

/** Absolute path of a file under `packages/core/golden` (reports dumped from the reference app). */
export function goldenPath(rel: string): string {
  return fileURLToPath(new URL(`../../golden/${rel}`, import.meta.url));
}

/** Absolute path of a checked-in fixture corpus. */
export function fixturePath(rel: string): string {
  return fileURLToPath(new URL(`../../fixtures/${rel}`, import.meta.url));
}

/** Root of the built corpora the web app serves. */
export function corporaRoot(): string {
  return fileURLToPath(new URL('../../../../apps/web/public/corpora', import.meta.url));
}
