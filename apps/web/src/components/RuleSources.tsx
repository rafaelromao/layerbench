import {
  citeRule,
  PRESET_IDS,
  presetName,
  presetReferences,
  type Rule,
  type RuleReference,
  type RuleSet,
  ruleReferences,
} from '@layerbench/core';
import { glossaryHash, HELP, helpHref } from '../guide/help.js';
import { HelpWord } from './HelpLink.js';

/** The glossary is part of the guide, so a rule citing it opens it here rather than on GitHub. */
function hrefOf(url: string): string {
  const hash = glossaryHash(url);
  return hash === null ? url : helpHref({ page: 'metrics', section: hash || undefined });
}

/** A rule-set reference names a preset only when it is one; a custom set has no sources of its own. */
export function presetOf(ref: string | undefined): string | undefined {
  return ref && (PRESET_IDS as readonly string[]).includes(ref) ? ref : undefined;
}

/**
 * A list of sources folded away until asked for, and after them where the glossary says how
 * LayerBench uses each: what it shares with them, what it adopts for compatibility and what is
 * its own.
 */
function SourceList({
  refs,
  label,
  note,
}: {
  refs: readonly RuleReference[];
  label: string;
  /** Said before the list: whose rule these are the sources of, when not this one as it is. */
  note?: string;
}) {
  return (
    <details className="text-[10px]">
      <summary className="cursor-pointer opacity-60 select-none">
        {label} ({refs.length})
      </summary>
      {note && <p className="opacity-70 pt-1">{note}</p>}
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
 * to check a definition, and would otherwise double the height of every rule listed. They are
 * chosen by what the rule counts in its set, a preset or a custom one (`citeRule`): a rule that
 * counts as a preset's leads with what the preset follows for it. A rule changed in the set says
 * whose rule the sources are for; one composed in the Rules view has no published source, and
 * says so rather than showing nothing.
 */
export function RuleSources({
  ruleId,
  ruleSet,
  rule: given,
}: {
  ruleId: string;
  /** The set the rule is in, which decides whose sources it shows. */
  ruleSet?: RuleSet;
  /** The rule itself, where the caller has it: a composed rule may share a built-in's id. */
  rule?: Rule;
}) {
  // A card knows its rule by id alone: where ids repeat, take the last that is on.
  const rule = given ?? ruleSet?.rules.findLast((r) => r.id === ruleId && r.enabled !== false);
  const cited = rule && ruleSet ? citeRule(rule, ruleSet) : undefined;
  const refs = cited?.refs ?? ruleReferences(ruleId);
  if (refs.length === 0) {
    return <p className="text-[10px] opacity-50">No published source: a rule composed here.</p>;
  }
  const note = !cited?.edited
    ? undefined
    : cited.follows
      ? `Its bands are changed in this rule set: these sources are for the rule as the ${presetName(cited.follows)} rule set has it.`
      : 'Changed in this rule set: these sources are for the built-in rule.';
  return <SourceList refs={refs} label="Sources" note={note} />;
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
