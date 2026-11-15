import { LANGUAGE_CORPORA, type LanguageCoverage } from '@layerbench/core';

/** The text a page is analyzed on: a corpus, and a second one when two are mixed. */
export interface PageText {
  corpus: string;
  corpus2: string | null;
}

/**
 * The languages a layout is for, a chip each. One it cannot fully type is shown as a warning, with
 * how many characters it lacks and which. A chip puts the whole page on its language's text, the
 * news corpus that comes with LayerBench, in place of the text or mix it was on; the chip whose
 * text is on show is pressed.
 */
export function LanguageChips({
  coverage,
  text,
  onText,
  className = '',
}: {
  coverage: LanguageCoverage[];
  text: PageText;
  /** Put the page on this corpus alone. */
  onText: (corpus: string) => void;
  className?: string;
}) {
  // `pt` and `pt-BR` are one language, and one chip.
  const chips = coverage.filter((c, i) => coverage.findIndex((d) => d.tag === c.tag) === i);
  if (chips.length === 0) return null;
  return (
    <p className={`flex flex-wrap gap-1 ${className}`}>
      {chips.map((c) => {
        const fits = c.missingRequired.length === 0;
        const what = fits
          ? `Types everything ${c.name} needs`
          : `Cannot type ${c.missingRequired.join(' ')}`;
        const look = `lb-language-chip badge badge-xs ${fits ? 'badge-ghost' : 'badge-warning'}`;
        const label = `${c.tag}${fits ? '' : ` −${c.missingRequired.length}`}`;
        const corpus = LANGUAGE_CORPORA[c.tag];
        if (corpus === undefined) {
          return (
            <span key={c.tag} className={look} title={what}>
              {label}
            </span>
          );
        }
        const on = text.corpus2 === null && text.corpus === corpus;
        return (
          <button
            key={c.tag}
            type="button"
            className={look}
            aria-label={c.name}
            aria-pressed={on}
            title={on ? `${what}; on its text` : `${what}; switch to its text`}
            onClick={() => {
              if (!on) onText(corpus);
            }}
          >
            {label}
          </button>
        );
      })}
    </p>
  );
}
