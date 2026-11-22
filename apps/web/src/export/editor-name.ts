/**
 * The name this browser puts on an image as whoever made the unsaved edits, when the user has
 * typed one: kept so it is not typed again. Only a name the user typed is kept; a signed-in
 * login is read from the session each time, so it is never stored here.
 */
const KEY = 'layerbench:export-editor';

/** The name typed last, or null when none has been typed (an empty one is kept: it is a choice). */
export function rememberedEditor(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Storage blocked or unavailable: the field simply starts from the login, or empty.
    return null;
  }
}

export function rememberEditor(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // Not kept; the name still goes on the image in hand.
  }
}
