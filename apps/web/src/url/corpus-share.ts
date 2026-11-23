import type { CorpusManifest } from '@layerbench/core';
import { customId } from '../custom/ref.js';

/** Custom text never leaves the browser; a portable target may name shipped corpora only. */
export function portableCorpusError(
  corpus: string,
  corpus2: string | null,
  manifests: readonly CorpusManifest[],
): string | null {
  const known = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  for (const id of [corpus, corpus2]) {
    if (id === null) continue;
    if (customId(id) !== null)
      return 'Custom corpus text stays on this device and cannot be shared. Choose a shipped corpus instead.';
    const manifest = known.get(id);
    if (!manifest)
      return 'This corpus is not shipped with LayerBench and cannot be shared. Choose a shipped corpus instead.';
    if (manifest.language === 'custom')
      return 'Custom corpus text stays on this device and cannot be shared. Choose a shipped corpus instead.';
  }
  return null;
}
