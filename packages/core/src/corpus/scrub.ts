/**
 * Contact details in a text sample. News corpora quote phone numbers and e-mail addresses, often
 * beside the name of the person they reach. A layout analysis needs the shape of such a string —
 * its digits, its `@`, its dots and dashes, where it sits in the sentence — and nothing of the
 * person, so each one is replaced by another of the same shape, taken from a fixed sequence that
 * owes nothing to the original.
 */

/** Letters and digits in a fixed order, so the same input scrubs the same way on every build. */
const LETTERS = 'thequickbrownfoxjumpsoverthelazydogpackmyboxwithfivedozenliquorjugs';
const DIGITS = '7305918264';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/**
 * Digits with the separators phone numbers use between them: `(11) 3333-4444`, `0800 123 4567`,
 * `+55 11 99999-9999`, `555-1234`. Only matches with at least `MIN_PHONE_DIGITS` digits are
 * taken, which leaves years, prices and small counts alone. Anything larger that happens to match
 * — a long figure with dots in it — loses nothing a layout analysis needs, since digits replace digits.
 */
const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/g;
const MIN_PHONE_DIGITS = 7;

function sameShape(text: string): string {
  let letters = 0;
  let digits = 0;
  let out = '';
  for (const ch of text) {
    if (/[0-9]/.test(ch)) out += DIGITS[digits++ % DIGITS.length];
    else if (/[a-z]/.test(ch)) out += LETTERS[letters++ % LETTERS.length];
    else if (/[A-Z]/.test(ch)) out += LETTERS[letters++ % LETTERS.length].toUpperCase();
    else out += ch;
  }
  return out;
}

/** The text with every e-mail address and phone number replaced by one of the same shape. */
export function scrubContacts(text: string): string {
  return text
    .replace(EMAIL, sameShape)
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= MIN_PHONE_DIGITS ? sameShape(m) : m));
}
