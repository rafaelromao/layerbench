import { classicLayout, type Layout } from '@layerbench/core';

/**
 * Qwerty as written, its letters alone and no languages stated: a layout of this file's own, built
 * as the Library's definition is, so that a change proposed to the Library's, which makes it a
 * document, moves nothing in the tests that start from a layout with no layer past its base.
 */
export const qwertyAsWritten = (): Layout =>
  classicLayout({
    id: 'qwerty',
    name: 'Qwerty',
    rows: 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /',
  });
