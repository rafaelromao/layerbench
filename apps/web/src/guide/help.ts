import { GLOSSARY_URL } from '@layerbench/core';

/**
 * Where each "?" in the app leads: a page of the guide and, most often, one section of it. Kept in
 * one table so a test can hold every one of them to a heading that exists.
 */
export interface HelpTopic {
  page: string;
  section?: string;
  /** Said after "Help on", for whoever cannot see the "?". */
  topic: string;
}

export const HELP = {
  editKey: { page: 'editing', section: 'choosing-what-a-key-does', topic: 'editing a key' },
  moving: { page: 'editing', section: 'moving-keys-around', topic: 'moving keys' },
  severalKeys: { page: 'editing', section: 'several-keys-at-once', topic: 'editing several keys' },
  layers: { page: 'editing', section: 'layers', topic: 'layers' },
  panels: {
    page: 'editing',
    section: 'combos-typing-paths-and-the-rest',
    topic: 'combos, the configuration and the other panels',
  },
  exporting: { page: 'importing', section: 'exporting', topic: 'exporting' },
  heat: { page: 'analyzing', section: 'heat', topic: 'heat' },
  headline: { page: 'analyzing', section: 'effort-and-sfb', topic: 'Effort and SFB' },
  sorting: { page: 'analyzing', section: 'sorting-and-comparing', topic: 'sorting layouts' },
  without: {
    page: 'analyzing',
    section: 'sorting-and-comparing',
    topic: 'typing without special features',
  },
  importing: { page: 'importing', topic: 'importing from keymap-drawer' },
  rules: { page: 'analyzing', section: 'rules-and-their-sources', topic: 'rules and sources' },
  rulers: { page: 'analyzing', section: 'the-rulers', topic: 'the rulers' },
  rulerLayoutsDoc: {
    page: 'analyzing',
    section: 'the-layouts-doc-rule-set',
    topic: 'the Layouts Doc ruler',
  },
  rulerCyanophage: {
    page: 'analyzing',
    section: 'the-cyanophage-like-rule-set',
    topic: 'the cyanophage-like ruler',
  },
  corpus: { page: 'analyzing', section: 'the-text-itself', topic: 'corpora' },
  keyNumbers: { page: 'analyzing', section: 'a-keys-numbers', topic: "a key's numbers" },
  storage: { page: 'saving', topic: 'saving to GitHub' },
} as const satisfies Record<string, HelpTopic>;

/**
 * The part of the guide that explains the ruler of the rule set a number was rated on: the steps,
 * what each is called and its colour. `rulesRef` is the set as a link names it: a preset's id has
 * its own section, and any other, a custom set that carries the rulers it was saved with, gets the
 * one on rulers in general. (A saved set's own `id` is not the reference: it can copy a preset's.)
 */
export function rulerHelp(rulesRef: string | undefined): HelpTopic {
  switch (rulesRef) {
    case 'layouts_doc':
      return HELP.rulerLayoutsDoc;
    case 'cyanophage':
      return HELP.rulerCyanophage;
    default:
      return HELP.rulers;
  }
}

/**
 * `rulerHelp`, unless the numbers on screen were rated on other rules than the ones now named: after
 * a switch of rule set the last report, or an estimate made from it, stands until the new analysis
 * lands, and its badges are on the old ruler, which a link to the new one would misname. `madeOn`
 * and `now` are the rule sets themselves, compared as objects, so only a change of rules counts:
 * an edit of the layout or a new sample leaves the ruler as it was.
 */
export function rulerShown(
  rulesRef: string | undefined,
  madeOn: object | null | undefined,
  now: object | null | undefined,
): HelpTopic | undefined {
  return madeOn && madeOn === now ? rulerHelp(rulesRef) : undefined;
}

/** The guide's address for a topic, under the app's base path. */
export function helpHref({ page, section }: Pick<HelpTopic, 'page' | 'section'>): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/guide${page ? `/${page}` : ''}${section ? `#${section}` : ''}`;
}

/**
 * The anchor of a link into the glossary, which is a page of the guide too; null for any other
 * link. The bare glossary has the empty anchor.
 */
export function glossaryHash(url: string): string | null {
  if (url !== GLOSSARY_URL && !url.startsWith(`${GLOSSARY_URL}#`)) return null;
  return url.slice(GLOSSARY_URL.length + 1);
}
