# LayerBench: agent notes

## Default layers

Read this before changing how symbols, digits or accents are spread over the default layers
(`packages/core/src/layouts/templates.ts`, `standard.ts`, `romak.ts`). The full tables, as the user
sees them, are in [docs/guide/editing.md](docs/guide/editing.md#default-layers). Update the tables
there whenever a rule here moves a key, and keep `templates.test.ts` asserting each rule.

- **The layers.** Every layout gets Numbers, Symbols and Accents. Extras exists only on a board that
  needs it: one that lacks keys for what Numbers and Symbols carry, or for Accents' 30 keys. Extras
  comes on while Numbers and Symbols are both held: both inner thumbs, in either order, Symbols'
  left inner thumb holding Numbers there too. Each layer spans at most 34 keys.
- **Magic Romak is the one exception: no Extras, no Accents.** It models the author's keymap
  (github.com/rafaelromao/keyboards), which has neither, so it has only Numbers and Symbols, and
  nothing reaches the other two. The keymap's combos type what they carried: Alpha 2's dead keys
  and `à`, and `€`, `°` and `º`/`ª` on Symbols and Numbers (`KEYMAP_SYMBOL_COMBOS` in `romak.ts`).
  `¿` and `¡` come from holding Alpha 2's `?` and `!` combos, a hold the model gives them. It
  cannot type `£ § « » ı ß œ æ`; `templates.test.ts` pins that list (`MAGIC_ROMAK_UNTYPED`) and
  what French and German lose. Do not give it the default Extras or
  Accents back, and do not extend the exception to another layout.
- **The 24-key core is Magic Romak's keymap** (github.com/rafaelromao/keyboards, `numbers_layer` and
  `symbols_layer`). Numbers is a keypad on the right, with the brackets and the arithmetic beside
  them on the left; brackets on Numbers stay on the left hand. Every board gets the same core, so
  the muscle memory carries over, but for a pair half that leaves its key (see Pairs).
- **Every symbol is its own `kp`**, on one key, never the `shifted` half of another: fold mode drops
  outputs that need a modifier.
- **Main thumbs.** On Standard and Thumb Alpha layouts the two innermost thumbs of each hand hold,
  left to right, Shift, Numbers, Symbols and Shift. Tapped, they type Repeat, space, the thumb
  letter or nothing, and the right outer one one-shots Accents. Special layouts keep their keys, and
  hold Numbers and Symbols on the inner thumbs too, as Romak does, each still typing what it typed;
  only an inner thumb that is a tap-hold already falls back (`withDefaultLayers`). Accents is the
  combo `accentsCombo`. A row-stagger board's one space bar holds Numbers: it has no inner thumbs.
  Ben Vallack Piano taps a one-shot Shift where its keymap has Repeat, and it is its `keys.shift`.
- **Home row mods.** Every bundled layout but Magic Romak holds Gui, Ctrl, Alt and Shift on its
  base layer's home row from the left pinky in, mirrored on the right (`HOME_ROW_MODS`,
  `withHomeRowMods`). Both hands hold the left modifiers, as the two Shift thumbs do: the analysis
  types a capital with the left Shift, and the right Alt is AltGr. Every key there that types gets
  one, letter or not (Uno's space, T-34's Repeat); one with nothing on it, or holding something
  already, does not, and no other layer does. They go on after the default layers, whose standard
  thumbs keep only plain keys; Nordwind, a document, carries them in its JSON. Magic Romak has none
  and is left as it is: its author's keymap has home row mods of its own (Ctrl, Alt and Shift from
  the ring finger in, a layer on each pinky, Gui on the bottom row), which its model does not
  carry. In the Shift case mode a layout with no Shift key of its own holds the other hand's home
  row Shift for a capital, never one on a key the capital presses (`holdMod` in `resolver.ts`).
- **A held thumb blocks its hand.** On a layer every way onto which holds a thumb key of one hand
  down (`mo`, `lt`), that hand's thumb keys get no binding: the thumb is busy holding. Numbers and
  Symbols each block the hand holding them, and Extras, both held, every thumb. The held keys
  themselves show as `held`. `blockedThumbs` finds them; the analysis types nothing on them, and `templates.test.ts` fails for
  a bundled layout or a board's defaults with a binding there. What finds no finger key goes on
  Accents' thumbs, Accents being one-shot.
- **The base layer keeps only `'` `,` `.` `;`** besides its letters and Repeat (`BASE_SYMBOLS`).
  Every other symbol is on Symbols or Extras. A home row mod types what its tap types.
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
  those three are exempt. Magic Romak itself keeps its keymap's Symbols whole and has no Extras;
  every other layout takes the defaults.
- **Extras starts on the prime keys.** It takes what has no key in `EXTRAS_ORDER` (the pairs, then
  the single symbols, most used in the texts first). Each goes on the prime keys still free
  (`primeKeys`): the lowest Effort cost, the home row first among keys of equal cost. The keys of
  Accents a board lacks follow, each beside its place on Accents. What still has no key goes on
  Accents' free keys. Extras never takes a thumb key (see A held thumb blocks its hand). On a board
  with no bottom row, every finger key is taken: `=` and `ı` go on Symbols' thumbs of the hand
  holding Numbers, `=` where space would be.
