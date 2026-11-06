import { Note } from './controls.js';

/**
 * What a sentence space does, as zmk-sentence-case's `&sentence_space`: a space that leaves a
 * capital pending after a sentence's end, on any key it is made.
 */
export function SentenceSpaceNote() {
  return (
    <Note>
      Types a space. After <span className="font-mono">. ? !</span> it leaves a capital for the next
      key pressed, a layer key aside: a letter a–z comes out a capital, any other key as it is.
    </Note>
  );
}
