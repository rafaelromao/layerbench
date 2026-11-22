import type { Layout } from '@layerbench/core';
import { PLAIN_MAX, plain } from './plain-text.js';

/**
 * What a shared image says about whose a layout is, and about whose edits it carries when nobody
 * has saved them: the layout's name, its author, where it comes from, and, for a version not saved
 * anywhere, who made the changes. The author is the layout's own (`Layout.author`); the editor is
 * whoever shares the image, who says so (`editorName`), because the layout's author did not make
 * edits that are not in the layout they saved, and the page cannot tell who did.
 */
export interface Credit {
  name: string;
  /** `by Ana`, or null for a layout that names no author. */
  byline: string | null;
  /** The address its author gave for it, without `https://`, or null. */
  source: string | null;
  /** Said of a version nobody has saved: `Unsaved edits by @ana`, or without a name; else null. */
  edits: string | null;
}

/** The longest an editor's name goes on an image: a line of the card, not a paragraph. */
export const EDITOR_MAX = 40;

/**
 * The name typed for whoever made the edits, as it goes on the image: one line, trimmed, and not
 * longer than a line holds. Empty when nothing is left, for an image that does not name them.
 */
export function editorName(typed: string): string {
  return [...plain(typed)].slice(0, EDITOR_MAX).join('').trim();
}

/** A signed-in user as an editor's name: the login, as GitHub writes a mention. */
export function loginName(login: string | null): string {
  return login ? `@${login}` : '';
}

/**
 * `path` without the slashes at its end, found by walking back from the end. Not a pattern such as
 * `/\/+$/`, which a path with a long run of slashes followed by another character makes the engine
 * try from each slash in turn: quadratic, on a text a link can make as long as it likes.
 */
function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) end--;
  return path.slice(0, end);
}

/**
 * A link as a person reads it under a title: without its scheme, its `www.`, a query or fragment and
 * a closing slash. `null` for a link that is not one, as a document's can be.
 */
export function sourceOf(link: string | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const path = withoutTrailingSlashes(url.pathname.slice(0, PLAIN_MAX));
    return plain(`${url.host.replace(/^www\./, '')}${path}`) || null;
  } catch {
    return null;
  }
}

/**
 * The credit of a layout. `unsaved` is that what is shown has changes that are saved nowhere, and
 * `editor` who made them (`editorName`): with none given the image still says the edits are not the
 * author's saved version.
 */
export function creditOf(
  layout: Pick<Layout, 'name' | 'author' | 'link'>,
  edits: { unsaved: boolean; editor: string },
): Credit {
  const author = layout.author ? plain(layout.author) : '';
  const editor = plain(edits.editor);
  return {
    name: plain(layout.name),
    byline: author ? `by ${author}` : null,
    source: sourceOf(layout.link),
    edits: edits.unsaved ? (editor ? `Unsaved edits by ${editor}` : 'Unsaved edits') : null,
  };
}

/** A file name for an image: the words of the names, in lowercase, joined by dashes. */
export function imageFileName(names: readonly string[]): string {
  const slug = (name: string) =>
    name
      .slice(0, 200)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
  const words = names.map(slug).filter(Boolean);
  return `layerbench-${words.length > 0 ? words.join('-vs-') : 'layout'}.png`;
}
