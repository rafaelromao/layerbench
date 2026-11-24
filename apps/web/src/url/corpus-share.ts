import type { CorpusManifest } from '@layerbench/core';
import { customId } from '../custom/ref.js';

/**
 * IDs in public/corpora/index.json. The portable URL contract runs before the async corpus loader,
 * so it uses this small, build-time list to reject unknown IDs before a view opens the target.
 */
export const SHIPPED_CORPUS_IDS: ReadonlySet<string> = new Set([
  'code-c-family',
  'code-python-family',
  'de-general',
  'en-general',
  'en-markdown-agents',
  'es-general',
  'fr-general',
  'it-general',
  'pt-br-general',
]);

/** Custom text never leaves the browser; a portable target may name shipped corpora only. */
export function portableCorpusError(
  corpus: string,
  corpus2: string | null,
  manifests?: readonly CorpusManifest[],
): string | null {
  const known = manifests ? new Map(manifests.map((manifest) => [manifest.id, manifest])) : null;
  for (const id of [corpus, corpus2]) {
    if (id === null) continue;
    if (customId(id) !== null || /^(?:custom|mix)-/.test(id))
      return 'Custom corpus text stays on this device and cannot be shared. Choose a shipped corpus instead.';
    const manifest = known?.get(id);
    if (known ? !manifest : !SHIPPED_CORPUS_IDS.has(id))
      return 'This corpus is not shipped with LayerBench and cannot be shared. Choose a shipped corpus instead.';
    if (manifest?.language === 'custom')
      return 'Custom corpus text stays on this device and cannot be shared. Choose a shipped corpus instead.';
  }
  return null;
}
