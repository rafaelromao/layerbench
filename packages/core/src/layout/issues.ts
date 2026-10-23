import { z } from 'zod';

/**
 * How many of what is wrong with a document its error tells, the shallowest first, and then how
 * many more there are. A document can be wrong in many places, and a layout in one that a name
 * copied to many.
 */
const MAX_ISSUES = 20;

/** What is wrong with a document, as `prettifyError` tells it, up to `MAX_ISSUES` faults. */
export function tellIssues(issues: readonly z.core.$ZodIssue[]): string {
  // In the order `prettifyError` lists them, so a shallow fault found late is not the one left out.
  const shallowest = [...issues].sort((a, b) => a.path.length - b.path.length);
  const told = z.prettifyError({ issues: shallowest.slice(0, MAX_ISSUES) });
  const more = issues.length - MAX_ISSUES;
  return more > 0 ? `${told}\n… and ${more} more` : told;
}
