/**
 * What a language needs a keyboard to be able to type.
 *
 * The engine is accent-native — normalisation keeps every letter, and the simulator reports any
 * grapheme it cannot produce. What was missing is a statement of *which* letters matter, so a layout
 * that cannot type `ñ` looks perfectly healthy until someone loads a Spanish corpus.
 */
export interface LanguageProfile {
  /** BCP-47-ish tag as corpora and layouts declare it. */
  tag: string;
  name: string;
  /** Letters the language cannot be written without. */
  required: string[];
  /** Letters that turn up in loanwords, proper nouns and older spellings. */
  optional?: string[];
  /** Punctuation beyond the shared set, such as Spanish's opening marks. */
  punctuation?: string[];
}

function letters(s: string): string[] {
  return [...s].filter((c) => c !== ' ');
}

export const LANGUAGE_PROFILES: Record<string, LanguageProfile> = {
  en: { tag: 'en', name: 'English', required: [] },
  'pt-BR': {
    tag: 'pt-BR',
    name: 'Português (BR)',
    required: letters('á à ã â ç é ê í ó õ ô ú'),
    optional: letters('ü'),
  },
  es: {
    tag: 'es',
    name: 'Español',
    required: letters('ñ á é í ó ú ü'),
    punctuation: ['¿', '¡'],
  },
  fr: {
    tag: 'fr',
    name: 'Français',
    required: letters('à â ç é è ê ë î ï ô ù û ü ÿ œ'),
    optional: letters('æ'),
    punctuation: ['«', '»'],
  },
  it: {
    tag: 'it',
    name: 'Italiano',
    required: letters('à è é ì í î ò ó ù'),
  },
};

/**
 * The profile for a language tag. Matches the exact tag first, then its base — so `pt-PT` falls
 * back to the Portuguese profile rather than to nothing.
 */
export function languageProfile(tag: string | undefined): LanguageProfile | undefined {
  if (!tag) return undefined;
  const exact = LANGUAGE_PROFILES[tag];
  if (exact) return exact;
  const base = tag.split('-')[0];
  const byBase = Object.values(LANGUAGE_PROFILES).find((p) => p.tag.split('-')[0] === base);
  return byBase;
}

/**
 * The languages a layout is held to: the text's, a mixed text's each, then those the layout says
 * it is for. A layout that claims Spanish is judged on `ñ` even on an English text. A language
 * named twice, or by its base tag and its own, counts once.
 */
export function languagesToJudge(
  textLanguage: string | undefined,
  layoutLanguages: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const fromText = textLanguage?.split('+').map((t) => t.trim()) ?? [];
  for (const tag of [...fromText, ...layoutLanguages]) {
    const key = languageProfile(tag)?.tag ?? tag;
    if (tag === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Punctuation to keep for a corpus's language, on top of the shared set. A mixed corpus declares
 * its languages joined by `+`, so every component contributes.
 *
 * The same marks are also the language's *soft* symbols — see `languageSoft`. Keeping a mark the
 * layout cannot type would otherwise report it as a missing character, when what it really is is
 * punctuation this board has no key for.
 */
export function languageKeep(tag: string | undefined): string[] {
  if (!tag) return [];
  const out = new Set<string>();
  for (const part of tag.split('+')) {
    for (const p of languageProfile(part.trim())?.punctuation ?? []) out.add(p);
  }
  return [...out];
}

/**
 * Punctuation that counts as soft-dropped rather than unproducible, for a corpus's language.
 *
 * A language's own marks are punctuation, exactly like `?` and `!`, which the simulator has always
 * treated this way. Without this every Spanish question would report `¿` as a character the layout
 * cannot write, alongside the letters it genuinely cannot.
 */
export function languageSoft(tag: string | undefined): string[] {
  return languageKeep(tag);
}

export interface LanguageCoverage {
  tag: string;
  name: string;
  missingRequired: string[];
  missingOptional: string[];
  missingPunctuation: string[];
}

/** Is this language fully writable on the layout? */
export function languageCovered(c: LanguageCoverage): boolean {
  return c.missingRequired.length === 0;
}

/**
 * Which of a language's characters a set of producible symbols cannot reach.
 *
 * Takes the symbol set rather than a layout so it can be fed from `enumerateProducers` without this
 * module depending on the simulator.
 */
export function coverLanguage(producible: Set<string>, tag: string): LanguageCoverage | undefined {
  const profile = languageProfile(tag);
  if (!profile) return undefined;
  const missing = (chars: string[]) =>
    chars.filter((c) => !producible.has(c) && !producible.has(c.toLowerCase()));
  return {
    tag: profile.tag,
    name: profile.name,
    missingRequired: missing(profile.required),
    missingOptional: missing(profile.optional ?? []),
    missingPunctuation: missing(profile.punctuation ?? []),
  };
}
