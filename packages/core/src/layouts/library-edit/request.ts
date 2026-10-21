/**
 * A change to the Library, as the sign-in server commits it to `.library/request.json` on a branch
 * of its own, for CI to apply there (`plan.ts`, `.github/workflows/library-edit.yml`): change a
 * bundled layout to the one given, delete one, or promote a layout to it. A layout is as LayerBench
 * saves it; `by` is who asked. Kept apart from the planning, which reads files, so the sign-in
 * server can write one.
 */
export interface LibraryRequest {
  action: 'change' | 'delete' | 'promote';
  id: string;
  layout?: unknown;
  by?: string;
}

/** Where the request file is, from the repository's root. */
export const LIBRARY_REQUEST = '.library/request.json';

/** The request file's text, as the sign-in server commits it. */
export function requestText(request: LibraryRequest): string {
  return `${JSON.stringify(request, null, 2)}\n`;
}
