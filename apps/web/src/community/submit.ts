import {
  compileLayout,
  documentMissing,
  isDocumentId,
  type Layout,
  toCanonicalJson,
} from '@layerbench/core';
import { MAX_LAYOUT_BYTES } from '../server/submit.js';

/**
 * What a custom layout needs before Submit sends it, each said as what to do: the checks the
 * Library makes of a community layout (who made it, that it is what LayerBench saves and compiles;
 * a link to where it comes from is welcome but not needed), an id no bundled or community layout
 * has, and its changes saved, so what is proposed is the layout kept. Empty when it can be sent;
 * the server checks again, as `documentLayout`.
 */
export function submissionProblems(
  layout: Layout,
  {
    dirty,
    bundledIds,
    communityIds,
  }: { dirty: boolean; bundledIds: readonly string[]; communityIds: readonly string[] },
): string[] {
  const problems: string[] = [];
  if (dirty) problems.push('Save your changes first.');
  const missing = documentMissing(layout);
  if (missing.includes('author')) problems.push('Give it an author, in Settings → This layout.');
  const id = layout.id ?? '';
  if (!isDocumentId(id)) {
    problems.push('Save it, which gives it an id of its own.');
  } else if (bundledIds.includes(id)) {
    problems.push(`Rename it and save: a bundled layout already has the id "${id}".`);
  } else if (communityIds.includes(id)) {
    problems.push(`Rename it and save: a community layout already has the id "${id}".`);
  }
  try {
    compileLayout(layout);
  } catch (e) {
    problems.push(`Fix it so it compiles: ${e instanceof Error ? e.message : String(e)}`);
  }
  const doc = toCanonicalJson(layout);
  if (new TextEncoder().encode(JSON.stringify(doc)).length > MAX_LAYOUT_BYTES) {
    problems.push(`Make it smaller: a submitted layout is at most ${MAX_LAYOUT_BYTES / 1024} KB.`);
  }
  return problems;
}
