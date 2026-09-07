import type { Predicate, Rule } from '@layoutmaster/core';

/**
 * A predicate written back out as text. The rule table shows this so a reader can see what a rule
 * actually tests without opening the document.
 */
export function describeWhere(where: Predicate | null | undefined): string {
  if (!where) return '';
  if ('all' in where && Array.isArray(where.all)) {
    return `all(${where.all.map(describeWhere).join(' ')})`;
  }
  if ('any' in where && Array.isArray(where.any)) {
    return `any(${where.any.map(describeWhere).join(' ')})`;
  }
  if ('none' in where && Array.isArray(where.none)) {
    return `none(${where.none.map(describeWhere).join(' ')})`;
  }
  return Object.entries(where)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
}

/** What a rule reads, in one line: the n-gram shape, or the statistic it pulls. */
export function describeSource(rule: Rule): string {
  const source = rule.source ?? 'ngram';
  if (source === 'ngram' && rule.ngram) {
    return `n=${rule.ngram.n} skip=${JSON.stringify(rule.ngram.skip ?? 0)}`;
  }
  if (source === 'stat') return `stat=${rule.stat ?? '?'}`;
  if (source === 'run') return `run by ${rule.run?.by ?? 'hand'}`;
  if (source === 'travel') return `travel ${rule.travel_mode ?? 'continuous'}`;
  return source;
}
