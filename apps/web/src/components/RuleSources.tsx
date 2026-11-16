import { PRESET_IDS, presetReferences, type RuleReference, ruleReferences } from '@layerbench/core';
import { glossaryHash, HELP, helpHref } from '../guide/help.js';
import { HelpWord } from './HelpLink.js';

/** The glossary is part of the guide, so a rule citing it opens it here rather than on GitHub. */
function hrefOf(url: string): string {
  const hash = glossaryHash(url);
  return hash === null ? url : helpHref({ page: 'metrics', section: hash || undefined });
}

/** A rule-set reference names a preset only when it is one; a custom set cites the catalog. */
export function presetOf(ref: string | undefined): string | undefined {
  return ref && (PRESET_IDS as readonly string[]).includes(ref) ? ref : undefined;
}

/**
 * A list of sources folded away until asked for, and after them where the glossary says how
 * LayerBench uses each: what it shares with them, what it adopts for compatibility and what is
 * its own.
 */
function SourceList({ refs, label }: { refs: readonly RuleReference[]; label: string }) {
  return (
    <details className="text-[10px]">
      <summary className="cursor-pointer opacity-60 select-none">
        {label} ({refs.length})
      </summary>
      <ul className="opacity-80 space-y-0.5 list-none p-0 m-0 pt-1" aria-label={label}>
        {refs.map((r) => (
          <li key={`${r.url}|${r.locator ?? ''}`}>
            <a
              className="link link-hover"
              href={hrefOf(r.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {r.title}
            </a>
            {r.locator && <span> — {r.locator}</span>}
          </li>
        ))}
      </ul>
      <HelpWord
        help={HELP.attribution}
        word="How LayerBench uses its sources"
        className="link link-hover opacity-60"
      />
    </details>
  );
}

/**
 * Where a rule comes from, folded away until asked for: the sources are there for whoever wants
 * to check a definition, and would otherwise double the height of every rule listed. Under a
 * preset, what the preset follows for the rule comes first. A rule composed in the Rules view has
 * no published source, and says so rather than showing nothing.
 */
export function RuleSources({ ruleId, presetId }: { ruleId: string; presetId?: string }) {
  const refs = ruleReferences(ruleId, presetId);
  if (refs.length === 0) {
    return <p className="text-[10px] opacity-50">No published source: a rule composed here.</p>;
  }
  return <SourceList refs={refs} label="Sources" />;
}

/**
 * What a preset as a whole follows, shown with the rule set: under each rule are only the sources
 * of what that rule counts. A custom set has none of its own and shows nothing.
 */
export function PresetSources({ presetId }: { presetId?: string }) {
  const refs = presetReferences(presetId);
  if (refs.length === 0) return null;
  return <SourceList refs={refs} label="Rule set sources" />;
}
