/**
 * Layouts covered by the golden matrix. Resolved from `golden/layouts/`, not from the bundled
 * registry. Kept apart from the reports, which read files, so the sign-in server can tell which
 * layouts the Library keeps for them.
 */
export const GOLDEN_LAYOUTS = ['magic-romak', 'romak', 'qwerty'] as const;
