/**
 * Direction-changing and invisible marks that can make a line read as something it is not: a name
 * that ends in a right-to-left override would draw what follows it backwards. A name here may come
 * from a link someone else made.
 */
const DIRECTION = /[؜‎‏‪-‮⁦-⁩]/g;

/**
 * Text as it goes on a shared image: one line, with what an image document cannot hold or an
 * address cannot carry taken out. Control characters become spaces; a lone surrogate (which makes
 * `encodeURIComponent` throw) and the two non-characters (which XML refuses) become U+FFFD; the
 * direction marks above go; runs of white space become one space. Anything a layout's author may
 * have written, a name, an author, a link, a text's name, is put through here before it is drawn, so
 * no name can stop the card from being made or change how the line beside it reads.
 */
export function plain(text: string): string {
  return text
    .replace(/\p{Cs}|[￾￿]/gu, '�')
    .replace(/\p{Cc}/gu, ' ')
    .replace(DIRECTION, '')
    .replace(/\s+/g, ' ')
    .trim();
}
