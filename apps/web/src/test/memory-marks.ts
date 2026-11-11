import { Unsynced } from '../storage/unsynced.js';

/** The marks of documents not sent, kept in memory, so each test has its own. */
export function memoryMarks(): Unsynced {
  let text: string | null = null;
  return new Unsynced({
    read: () => text,
    write: (t) => {
      text = t;
    },
  });
}
