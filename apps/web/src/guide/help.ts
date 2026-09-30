import { GLOSSARY_URL } from '@layoutmaster/core';

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
  layers: { page: 'editing', section: 'layers', topic: 'layers' },
  features: { page: 'special-keys', section: 'magic-keys', topic: 'magic keys and features' },
  panels: {
    page: 'editing',
    section: 'combos-typing-paths-and-the-rest',
    topic: 'combos, geometry and the other panels',
  },
  exporting: { page: 'importing', section: 'exporting', topic: 'exporting' },
  saving: { page: '', section: 'keeping-and-sharing-your-work', topic: 'saving' },
  headline: { page: 'analyzing', section: 'effort-and-sfb', topic: 'Effort and SFB' },
  sorting: { page: 'analyzing', section: 'sorting-and-comparing', topic: 'sorting layouts' },
  without: {
    page: 'analyzing',
    section: 'sorting-and-comparing',
    topic: 'typing without special features',
  },
  importing: { page: 'importing', topic: 'importing from keymap-drawer' },
  rules: { page: 'analyzing', section: 'rules-and-their-sources', topic: 'rules and sources' },
  corpus: { page: 'analyzing', section: 'the-text-itself', topic: 'corpora' },
} as const satisfies Record<string, HelpTopic>;

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
