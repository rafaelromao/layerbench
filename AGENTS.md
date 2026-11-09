# LayerBench: agent notes

## Default layers

Read this before changing how symbols, digits or accents are spread over the default layers
(`packages/core/src/layouts/templates.ts`, `small.ts`). The full tables, as the user sees them, are
in [docs/guide/editing.md](docs/guide/editing.md#default-layers). Update the tables there whenever a
rule here moves a key, and keep `templates.test.ts` asserting each rule.

- **Who has them.** A layout a user makes with **New layout** can start with Numbers, Symbols and
  Accents (`defaultLayers`, `newLayout` in the app). A bundled layout is its author's design, with
  no layer its author does not define; Bird, Nordrassil and Uno, three Special layouts whose
  sources define no layer that types, take them, keeping every key they have (`withDefaultLayers`).
- **The layers.** Numbers, Symbols and Accents. Extras exists only on a board that needs it: one
  that lacks keys for what Numbers and Symbols carry, or for Accents' 30 keys. Extras comes on while
  Numbers and Symbols are both held: both inner thumbs, in either order, Symbols' left inner thumb
  holding Numbers there too. Each layer spans at most 34 keys.
- **A bundled layout is its author's design.** Its definition (`ClassicDef`, in `classic.ts` and
  `small.ts`) writes what its source (its `link`, its author's keymap or firmware) publishes: the
  letters and marks of the base layer, the thumbs (a space key on the outer left thumb where the
  source leaves them to a space bar), the combos, and the layers the author's keymap defines past
  the letters. Magic Romak, Magic Sturdy, Enthium, Hands Down Gold, Promethium and Vibranium, T-34,
  Finch, Cem Aksoylar's Colemak-DH and Ben Vallack Piano define layers: they get no default layer
  and no Accents combo. Numbers and Symbols are written in `layers` by the ids `num` and `sym`
  (`bringsOwnLayers`, which `withDefaultLayers` checks), the keys that hold them in `holds`, and the
  author's combos for symbols, digits and accents in `combos`; `drawn` in `small.ts` lays a layer
  out as the author draws it. Copy only what the keymap types, on the keys the board has: what the
  author's design lacks, the layout cannot type, left for an edit in the app, and `templates.test.ts`
  pins it (`UNTYPED` for a layout with layers, `TYPES` for one with none, and by language `LACKS`).
  Keys that type nothing the analysis counts, holds onto layers that type nothing, a toggle to a
  layer a hold reaches too, modifiers held on a layer's keys and dead keys the analysis cannot
  compose stay out. Their layers count toward their category, as any layer of their own
  (`hasDefaultLayers` in `templates.ts`): Hands Down's three are Special by the `z` and `q` on their
  Symbols, a second alpha layer, and their `œu` combo, a macro, and Enthium by the letters on its
  Numbers and its Symbols' macro. Every other layout is its letters and marks alone, as its source
  has them on 34 keys. RSTHD's author's layers are reached only from ErgoDox thumb keys; Hands Down
  Neu's author's firmware carries the layers of another set of letters; Nordrassil's author
  publishes the rest of the keymap outside its repository. The guide lists them all
  ([docs/guide/editing.md](docs/guide/editing.md#layouts-with-their-authors-layers)).
  No code singles a layout out: each uses `ClassicDef` fields any layout may use.
  - Magic Romak models its author's keymap (github.com/rafaelromao/keyboards), which has neither
    Extras nor Accents, and is built on the keymap-drawer file its author keeps for it
    (`packages/core/fixtures/romak-keymap-drawer.yaml`, a copy of `docs/img/diagrams/keymap-drawer/
    keymap-drawer.yaml` at the commit the file names). Its Alpha 1, Alpha 2, Ç extension, Numbers and
    Symbols, every key and every combo, are what the importer reads from it
    (`src/layouts/keymaps/magic-romak.json`, written by `pnpm keymap`, which
    `magic-romak-source.test.ts` keeps equal to the import). The file draws 26 combos, and the
    layout types with ten (`TYPING_COMBOS`): `;`, `à`, the five dead keys, `€`, `°` and `º` (`ª`
    held); the other 16 have `role: 'command'`: on the keyboard, drawn in Combos, never pressed by
    the analysis (`-` `:` `?` `!`, Numbers' `g` `j` `k` `|`, and Alpha 1's eight letter chords, which
    Alpha 2's keys type). The file draws no `¿` or `¡`, so Magic Romak has none. `small.ts` adds only what keymap-drawer has no field for, and the
    test names each key: the adaptive `h`/`v` and alt repeat, the sentence space and morph on the
    thumbs, caps word on the shift key, the accents as macros that tag the press, `qu`, the hold
    that types `ª`, and the keymap's 30 ms combo timeout. When the keymap changes, copy
    the file again, run `pnpm keymap`, then `pnpm goldens`.
- **The 24-key core is Magic Romak's keymap** (github.com/rafaelromao/keyboards, `numbers_layer` and
  `symbols_layer`). Numbers is a keypad on the right, with the brackets and the arithmetic beside
  them on the left; brackets on Numbers stay on the left hand. Every board gets the same core, so
  the muscle memory carries over, but for a pair half that leaves its key (see Pairs).
- **Every symbol is its own `kp`**, on one key, never the `shifted` half of another: fold mode drops
  outputs that need a modifier.
- **Thumbs.** A layout's thumbs are its author's, a space key on the outer left thumb where its
  author leaves them to a space bar. A Special layout that takes the default layers holds Numbers and
  Symbols on its inner thumbs, each still typing what it typed; only an inner thumb that is a
  tap-hold already falls back (`withDefaultLayers`). Accents is the combo `accentsCombo`. On a
  row-stagger board, a new layout's one space bar (L0 and R0 together) holds Numbers. Ben Vallack
  Piano taps a one-shot Shift where its keymap has Repeat, and it is its `keys.shift`; Night holds
  Shift on its outer thumbs, as its author draws them. A thumb that holds and taps nothing is still
  a `hold_tap`, its tap `none`, so the board draws its hold along the bottom, as on every tap-hold;
  `templates.test.ts` (`thumbs that only hold`) checks every bundled layout.
- **Home row mods.** A layout holds home row mods only where its author's keymap does, and its
  definition gives them (`ClassicDef.homeRowMods`, applied by `withHomeRowMods`); each key still
  types what it typed, a letter or not, and one with nothing on it, or holding something already,
  does not. Both hands hold the left modifiers, as the analysis types a capital with the left Shift
  and the right Alt is AltGr. Magic Romak holds its keymap's home block mods, which its file draws:
  Ctrl, Alt and Shift from the ring finger in, Shift with Gui on F and C, and Gui on P and the magic
  key. The keymap's pinkies hold its Shortcuts layer, and `,` and `.` hold to move the cursor: a layer that
  types nothing, and editing, both left out. Magic Sturdy, the three Hands Down with their authors'
  layers and Ben Vallack Piano hold their authors' too (`STURDY_MODS`, `HD_MODS`, `PIANO_MODS`), as
  their keymaps hold their layers on the home row. A document carries its own in its JSON. In the
  Shift case mode a capital holds Shift on no key it presses, the one that reaches its layer
  included, nor on a thumb of a hand whose thumb presses one, and on a thumb before a finger. A layout with
  no Shift key of its own holds a Shift thumb if it has one it can, else the other hand's home row
  Shift where it can, never a key that holds other modifiers with it (`holdMod` in `resolver.ts`);
  with neither, it types no capital there.
- **No layer that types nothing.** No bundled layout reaches a layer of functions, media or
  macros, by a hold or a key: an author's keymap's own such holds are left out, as Magic Romak's
  are. `templates.test.ts` checks that every layer of every bundled layout types something
  (`layers that type nothing`).
- **A layout is only what the editor can make.** A key that does what the analysis does not
  simulate (Escape, Enter, Backspace, Tab, a layer LayerBench lacks, as T-34's Shortcuts) is
  `trans`, as a key left unset is, and under a hold a tap of `none`. This holds for the bundled
  layouts (`TRANSPARENT` and `NOTHING` in `classic.ts`) and for what the keymap-drawer import makes
  (`readLegend`). The import writes what making it in the editor would: no description, unset keys
  left unset, combos with the editor's layers and timing (`freeComboId`). Nothing in the app, the
  guide or the code calls a key or layer imported; the Import button is the one word for it.
- **A held thumb blocks its hand.** On a layer every way onto which holds a thumb key of one hand
  down (`mo`, `lt`), that hand's thumb keys get no binding: the thumb is busy holding. Numbers and
  Symbols each block the hand holding them, and Extras, both held, every thumb. The held keys
  themselves show as `held`. `blockedThumbs` finds them; the analysis types nothing on them, and `templates.test.ts` fails for
  a bundled layout or a board's defaults with a binding there. An author's layer leaves those keys
  empty too. What finds no finger key goes on Accents' thumbs, Accents being one-shot.
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
