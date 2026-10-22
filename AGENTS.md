# LayerBench: agent notes

## Default layers

Read this before changing how symbols, digits or accents are spread over the default layers
(`packages/core/src/layouts/templates.ts`, `standard.ts`, `small.ts`). The full tables, as the user
sees them, are in [docs/guide/editing.md](docs/guide/editing.md#default-layers). Update the tables
there whenever a rule here moves a key, and keep `templates.test.ts` asserting each rule.

- **The layers.** Every layout whose author defines no layers past its letters gets Numbers, Symbols
  and Accents. Extras exists only on a board that
  needs it: one that lacks keys for what Numbers and Symbols carry, or for Accents' 30 keys. Extras
  comes on while Numbers and Symbols are both held: both inner thumbs, in either order, Symbols'
  left inner thumb holding Numbers there too. Each layer spans at most 34 keys.
- **A layout whose author defines layers keeps them.** Where a layout's source (its `link`, its
  author's keymap or firmware) defines layers past the letters, the layout brings those in place of
  the default ones: Magic Romak, Magic Sturdy, Enthium, Hands Down Gold, Promethium and Vibranium,
  T-34, Finch, Cem Aksoylar's Colemak-DH and Ben Vallack Piano. It gets no default layer, no Accents
  combo and no standard thumbs, and its base layer keeps its symbols. Its definition writes the
  author's layers in `layers`, Numbers and Symbols by the ids `num` and `sym` (`bringsOwnLayers`,
  which `withDefaults` and `withDefaultLayers` check), the keys that hold them in `holds`, and the
  author's combos for symbols, digits and accents in `combos`; `drawn` in `small.ts` lays a layer
  out as the author draws it. Copy only what the keymap types, on the keys the board has: what the
  author's layers lack, the layout cannot type, left for an edit in the app, and `templates.test.ts`
  pins it (`UNTYPED`). Keys that type nothing the analysis counts, holds onto layers that type
  nothing, a toggle to a layer a hold reaches too, modifiers held on a layer's keys and dead keys
  the analysis cannot compose stay out. Their layers count toward their category, as any layer of
  their own (`hasDefaultLayers` in `categories.ts`): Enthium is Special by its Symbols' macro. Every
  other layout takes the default layers: its source defines only letters, or its author's layers
  have no place on its board (RSTHD's are reached only from ErgoDox thumb keys), go with another
  version of its letters (Hands Down Neu), or are published outside its source (Nordrassil). The
  guide lists them all ([docs/guide/editing.md](docs/guide/editing.md#layouts-with-their-authors-layers)).
  No code singles a layout out: each uses `ClassicDef` fields any layout may use.
  - Magic Romak models its author's keymap (github.com/rafaelromao/keyboards), which has neither
    Extras nor Accents. The keymap's combos type what those carried: Alpha 2's dead keys and `à`,
    and `€`, `°` and `º`/`ª` on Symbols and Numbers (`KEYMAP_SYMBOL_COMBOS` in `small.ts`). `¿` and
    `¡` come from holding Alpha 2's `?` and `!` combos, a hold the model gives them.
- **The 24-key core is Magic Romak's keymap** (github.com/rafaelromao/keyboards, `numbers_layer` and
  `symbols_layer`). Numbers is a keypad on the right, with the brackets and the arithmetic beside
  them on the left; brackets on Numbers stay on the left hand. Every board gets the same core, so
  the muscle memory carries over, but for a pair half that leaves its key (see Pairs).
- **Every symbol is its own `kp`**, on one key, never the `shifted` half of another: fold mode drops
  outputs that need a modifier.
- **Main thumbs.** On Standard and Thumb Alpha layouts that take the default layers, the two
  innermost thumbs of each hand hold, left to right, Shift, Numbers, Symbols and Shift. Tapped, they
  type Repeat, space, the thumb letter or nothing, and the right outer one one-shots Accents. Special
  layouts that take them keep their keys, and
  hold Numbers and Symbols on the inner thumbs too, as Romak does, each still typing what it typed;
  only an inner thumb that is a tap-hold already falls back (`withDefaultLayers`). Accents is the
  combo `accentsCombo`. On a row-stagger board, a new layout's one space bar (L0 and R0 together)
  holds Numbers. Ben Vallack Piano taps a one-shot Shift where its keymap has Repeat, and it is its
  `keys.shift`.
- **Home row mods.** Every bundled layout holds Gui, Ctrl, Alt and Shift on its base layer's home
  row from the left pinky in, mirrored on the right (`HOME_ROW_MODS`, `withHomeRowMods`), unless its
  definition gives its own (`ClassicDef.homeRowMods`). Both hands hold the left modifiers, as the
  two Shift thumbs do: the analysis types a capital with the left Shift, and the right Alt is AltGr.
  Every key there that types gets one, letter or not (Uno's space, T-34's Repeat); one with nothing
  on it, or holding something already, does not, and no other layer does. They go on after the
  default layers, whose standard thumbs keep only plain keys; Nordwind, a document, carries them in
  its JSON. Magic Romak gives its own, its author's keymap's home block mods (`MAGIC_ROMAK_MODS` in
  `small.ts`): Ctrl, Alt and Shift from the ring finger in, Shift with Gui on F and C, and Gui on P
  and the magic key. The keymap's pinkies hold its Shortcuts layer, and `,` and `.` hold to move the
  cursor: a layer that types nothing, and editing, both left out. Magic Sturdy, the three Hands Down
  with their authors' layers and Ben Vallack Piano give their authors' too (`STURDY_MODS`,
  `HD_MODS`, `PIANO_MODS`), as their keymaps hold their layers on the home row. In the Shift case
  mode a capital holds Shift on no key it presses, the one that reaches its layer included, nor on a
  thumb of a hand whose thumb presses one, and on a thumb before a finger: on the standard thumbs
  R1, and L1 for one on Accents, which R1 taps, or on a right thumb. A layout with no Shift key of
  its own holds a Shift thumb if it has one it can, else the other hand's home row Shift where it
  can, never a key that holds other modifiers with it (`holdMod` in `resolver.ts`).
- **No layer that types nothing.** No bundled layout reaches a layer of functions, media or
  macros, by a hold or a key: an author's keymap's own such holds are left out, as Magic Romak's
  are, and the editor makes no imported key. `templates.test.ts` checks every bundled layout
  (`layers that type nothing`).
- **A held thumb blocks its hand.** On a layer every way onto which holds a thumb key of one hand
  down (`mo`, `lt`), that hand's thumb keys get no binding: the thumb is busy holding. Numbers and
  Symbols each block the hand holding them, and Extras, both held, every thumb. The held keys
  themselves show as `held`. `blockedThumbs` finds them; the analysis types nothing on them, and `templates.test.ts` fails for
  a bundled layout or a board's defaults with a binding there. An author's layer leaves those keys
  empty too. What finds no finger key goes on Accents' thumbs, Accents being one-shot.
- **The base layer keeps only `'` `,` `.` `;`** besides its letters and Repeat (`BASE_SYMBOLS`), on
  a Standard or Thumb Alpha layout that takes the default layers. Every other symbol is on Symbols
  or Extras. A home row mod types what its tap types.
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
  those three are exempt. A layout that keeps its author's layers keeps its author's pairs as they
  are, together or apart.
- **Extras starts on the prime keys.** It takes what has no key in `EXTRAS_ORDER` (the pairs, then
  the single symbols, most used in the texts first). Each goes on the prime keys still free
  (`primeKeys`): the lowest Effort cost, the home row first among keys of equal cost. The keys of
  Accents a board lacks follow, each beside its place on Accents. What still has no key goes on
  Accents' free keys. Extras never takes a thumb key (see A held thumb blocks its hand). On a board
  with no bottom row, every finger key is taken: `=` and `ı` go on Symbols' thumbs of the hand
  holding Numbers, `=` where space would be.
