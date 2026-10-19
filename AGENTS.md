# LayerBench: agent notes

## Default layers

Read this before changing how symbols, digits or accents are spread over the default layers
(`packages/core/src/layouts/templates.ts`, `standard.ts`, `romak.ts`). The full tables, as the user
sees them, are in [docs/guide/editing.md](docs/guide/editing.md#default-layers). Update the tables
there whenever a rule here moves a key, and keep `templates.test.ts` asserting each rule.

- **The layers.** Every layout gets Numbers, Symbols and Accents. Extras exists only on a board that
  needs it: one that lacks keys for what Numbers and Symbols carry, or for Accents' 30 keys. Extras
  comes on while Numbers and Symbols are both held. Each layer spans at most 34 keys.
- **The 24-key core is Magic Romak's keymap** (github.com/rafaelromao/keyboards, `numbers_layer` and
  `symbols_layer`). Numbers is a keypad on the right, with the brackets and the arithmetic beside
  them on the left; brackets on Numbers stay on the left hand. Every board gets the same core, so
  the muscle memory carries over.
- **Every symbol is its own `kp`**, on one key, never the `shifted` half of another: fold mode drops
  outputs that need a modifier.
- **Main thumbs.** On Standard and Thumb Alpha layouts the two innermost thumbs of each hand hold,
  left to right, Shift, Numbers, Symbols and Shift. Tapped, they type Repeat, space, the thumb
  letter or nothing, and the right outer one one-shots Accents. Special layouts keep their keys: the
  space key holds Numbers, a thumb of the other hand holds Symbols, and Accents is the combo
  `accentsCombo`.
- **The base layer keeps only `'` `,` `.` `;`** besides its letters and Repeat (`BASE_SYMBOLS`).
  Every other symbol is on Symbols or Extras.
- **Accents ranking.** Accents has the dead keys, the letters no accent makes, and the accented
  letters the texts use most, each a key of its own. The most used go on the cheapest keys, in
  groups that are easy to remember. A layout that types its vowels with the left hand gets Accents
  mirrored. The measurements are in
  [docs/research/accents-layer.md](docs/research/accents-layer.md).
- **Pairs stay together.** The brackets `()` `[]` `{}` `<>` `«»` and the look-alikes `; :`, `? ¿`,
  `! ¡` share a layer, side by side: neighbours in a row, or in a column, as `«` above `»` in
  Symbols' left inner column (`SYMBOL_PAIRS`). Extras puts each pair in a row. A pair that can't
  stay together on Numbers or Symbols goes to Extras whole. The half that had a key leaves it, and
  that key on Symbols takes the most used symbol that has no key. The keymap's own core splits
  `/ \`, `- _` and `+ =` (`CORE_SPLIT_PAIRS`). That is deliberate: the core matches the keymap, and
  those three are exempt. Magic Romak itself keeps its keymap's Symbols whole and its own Extras
  (`MAGIC_ROMAK_EXTRAS` in `romak.ts`); every other layout takes the defaults.
- **Extras starts on the prime keys.** It takes what has no key in `EXTRAS_ORDER` (the pairs, then
  the single symbols, most used in the texts first). Each goes on the prime keys still free
  (`primeKeys`): the lowest Effort cost, the home row first among keys of equal cost. The keys of
  Accents a board lacks follow, each beside its place on Accents. What still has no key goes on
  Accents' free keys.
