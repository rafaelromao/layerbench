# keymapdb keymaps through Import

How well **Library → Import → keymap-drawer** reads real keymaps: every keymap on
[keymapdb.com](https://keymapdb.com) whose repository keeps a keymap-drawer YAML file, read through
the dialog and held against the picture keymapdb shows for it, and the files beside them that
someone could choose by mistake. Measured on 2026-11-07, on main at `0f43f67` (import by address,
PR #107, included), with `apps/web/e2e/keymapdb.spec.ts`: 34 tests, all passing, 4 of them
expected failures and the rest of the findings pinned as they stand (see Findings).

## In short

- **Every file reads.** All 16 keymap-drawer files parse, up to 35 kB with 25 layers and 149
  combos, and every one reaches Analyze and is analysed. No test saw an uncaught error or a console
  error.
- **Where LayerBench offers a board, the letters are right.** On the 13 files it finds a board
  for (10 compared by machine, 3 by eye), every letter of the picture's base layer is on the
  board, on its hand, and no two letters are the wrong way round. The board LayerBench offers matches the keyboard's real stagger only on
  the Corne-sized boards.
- **Three keyboards get no board, and four layout files lose keys.** A file that only names its
  keyboard is not looked up, and no preset has the 80, 50 or 46 keys of the Glove80, Kyria and
  Corne `_ex2` (F5). Given the keyboard's own layout file, the board model drops 15 of the Kyria's
  letters (F1), the Glove80's top row of letters (F2), 10 of the Diamond's 24 keys (F3) and the
  Corne `_ex2`'s outer column (F4).
- **Space and home-row mods drawn as icons are lost.** 7 of 16 keymaps end up with no key that
  types a space, and several lose most of their home-row mods, because their legends are icons
  (`$$mdi:keyboard-space$$`) or carry a symbol before the name (`␣ SPC`) (F6, F7).
- **Files that are not keymaps are refused, with a reason, and the dialog recovers.** All 10
  wrong files (keymap-drawer and ZMK configuration, a combos-only file, a character table, the SVG
  and PNG pictures) get a message, nothing is made from them, and a good file chosen next reads.
  The gaps: the message is not announced to a screen reader (F9), an empty file gets no message at
  all (F10), a columns-and-thumbs notation LayerBench cannot read cannot be put on a preset (F11),
  and the Board box goes on asking for a board after a layout file has given one (F15).

## Method

- **The keymaps.** keymapdb is built from
  [precondition/keymapdb](https://github.com/precondition/keymapdb) (`src/posts/keymaps/*.md`, 152
  entries; fields `keymapUrl`, `keymapImage`). The git tree of every entry hosted on GitHub (about
  120) was listed; 16 keep a keymap-drawer YAML, a file with `layout` and `layers` at the top. The
  20 keymaps that live in qmk/qmk_firmware keep none. Each file and picture is read at
  the commit pinned in `apps/web/e2e/keymapdb/entries.ts`, except caksoylar's picture, which
  GitHub Pages serves from a workflow and which differs from the copy in the repository.
- **Nothing third-party is committed.** 8 of the 16 repositories carry no licence and 3 are GPL,
  so `node apps/web/e2e/keymapdb/refresh.ts` downloads the files into the git-ignored
  `apps/web/e2e/keymapdb/.cache/`, and the spec skips what is not there.
- **The pictures.** 13 of the pictures were drawn by keymap-drawer: their SVG names each layer
  (`layer-<name>`) and each key (`keypos-<n>`, its centre and its legends), and
  `apps/web/e2e/keymapdb/image.ts` reads them. The other 3 (ScriBanana's WebP, indianpojken's
  and rafaelromao's PNG) were compared by eye.
- **Two boards per keymap.** First the board the dialog offers by itself: the one the file
  describes (`ortho_layout`, `cols_thumbs_notation`), or else the first preset with as many keys.
  Then the keyboard's own layout file, the one keymap-drawer would find for the name the file gives
  (its `zmk_keyboard_layouts.yaml`, `qmk_keyboard_mappings.yaml` and `resources/extra_layouts/` at
  commit `467abe2`), given through **Use a QMK info.json…**. Temper has no such file anywhere, and
  jcmkk3's file describes its own board.
- **Held against the picture.** For each layer of the preview, `compare.ts` reads the keys drawn
  (`g[data-key]`: centre, tap, hold) and compares them with the picture's layer of the same name.
  The base layer is compared with the picture's first layer whatever its name. It counts:
  - the one-character legends (letters, digits, punctuation) the board lacks;
  - the letters it puts on the other hand;
  - for each pair of characters at least 0.6 key apart in the picture, whether the board puts
    them the other way round (*reversed*) or under 0.3 key apart (*flattened*);
  - the keys showing a hold.

  On both boards the spec asserts that the dialog shows no error message, that **Import and edit**
  is enabled once a preview is drawn, and that the base layer has every letter of the picture, each
  on its hand. Where a finding below changes that, the entry pins what it shows instead
  (`known` in `entries.ts`). It then takes the board offered (or the layout file's, where none is
  offered) to Analyze and waits for the analysis. Every other number is recorded in
  `.cache/results/<entry>.json`, not asserted.
- **Rerunning.**

  ```bash
  node apps/web/e2e/keymapdb/refresh.ts
  E2E_PORT=4021 E2E_CHANNEL=msedge pnpm --filter @layerbench/web e2e keymapdb --project=desktop
  ```

## The keymaps

*Board offered* is what the dialog picks by itself. *Own file* is the board from the keyboard's
layout file. *Read* is the keys the dialog reports read, over all layers, on the board offered, or
on the own file where nothing is offered. *Characters* is the base layer's one-character legends
found on that board, against the picture's. *Flattened* counts pairs of characters, offered → own
file. *Space* says whether a base-layer key types a space.

| Keymap | Keyboard, as the file names it | Board offered | Own file | Layers, file / picture | Read | Characters | Flattened | Combos read / left out | Space | Findings |
|---|---|---|---|---|---|---|---|---|---|---|
| AlaaSaadAbdo | zmk `rommana` | 23332+2 | its own, 30 keys | 3 / 3 | 76/90 | 26/26 | 20 → 0 | 9 / 11 | yes | F13 |
| MattSturgeon | zmk `glove80` | none | its own, 48 of 80 keys | 6 / 1 (older) | 243/288 | 24/42 | — | 0 / 1 | no | F2, F5, F6 |
| ScriBanana | zmk `corne` | 3×6+3 | 3×6+3 | 4 / 4 (by eye) | 132/168 | by eye: all | — | 0 / 0 | yes | — |
| akioweh | zmk `kyria_rev3` | none | its own, 34 of 50 keys | 10 / 10 | 319/340 | 17/33 | — | 1 / 20 | yes | F1, F5 |
| caksoylar | qmk `rufous` | 23332+2 | its own, 30 keys | 5 / 5 | 95/150 | 26/26 | 20 → 0 | 14 / 13 | no | F6, F13 |
| casuanoob | qmk `bastardkb/dilemma/3x5_3` | 3×5+3 | 3×5+3 | 10 / 10 | 244/360 | 28/28 | 6 → 6 | 14 / 15 | no | F7, F13 |
| godalming123 | qmk `corne_rotated` | 3×6+3 | 3×6+3 | 2 / 2 | 84/84 | 26/26 | 0 | 0 / 20 | yes | — |
| indianpojken | qmk `ferris/sweep` | 3×5+2 | 3×5+2 | 4 / 4 (by eye) | 94/136 | by eye: all | — | 4 / 19 | no | F6 |
| jcmkk3 | `ortho_layout` 3×5+2, short pinky and inner | 23332+2 (from the file) | — | 4 / 4 | 110/120 | 26/26 | 4 | 9 / 0 | yes | F8 |
| justinmklam | qmk `crkbd/rev4_0/standard`, `_ex2` | none | its own, 40 of 46 keys | 4 / 4 | 130/160 | 30/31 | — | 8 / 4 | yes | F4, F5 |
| minusfive | zmk `corneish_zen` | 3×6+3 | 3×6+3 | 3 / 3 | 77/126 | 31/31 | 0 | 11 / 14 | no | F6 |
| phaberest | qmk `crkbd/rev1` | 3×6+3 | 3×6+3 | 7 / 7 | 253/294 | 32/32 | 0 | 25 / 4 | yes | — |
| rafaelromao | `qmk_info_json` (Diamond) | 1333+2 | its own, 14 of 24 keys | 25 / 14 (by eye) | 279/600 | by eye: all on 1333+2 | — | 57 / 92 | no | F3, F6, F14 |
| rearman | qmk `corne_rotated` | 3×6+3 | 3×6+3 | 3 / 3 | 124/126 | 35/35 | 0 | 14 / 19 | yes | — |
| valdirjunior011 | zmk `temper` | 3×5+3 | — | 5 / 5 | 123/180 | 30/30 | 24 | 0 / 7 | yes | F6, F13 |
| waffle87 | qmk `ferris/sweep` | 3×5+2 | 3×5+2 | 4 / 4 | 98/136 | 30/30 | 24 → 24 | 1 / 2 | no | F6, F13 |

Notes on the table:

- **Combos left out.** Most combos left out do something the analysis does not simulate (Escape,
  Tab, Delete, mouse buttons, Bluetooth, two-character macros such as `()`), as designed. The
  others are on keys a board dropped: 18 of akioweh's 20, 3 of justinmklam's 4.
- **Keys not read.** Most keys left unread are editing, media and system keys, which are left out
  by design, and the icon legends of F6.
- **Pictures that differ from the file.** These are differences in the pictures, not in
  LayerBench:
  - MattSturgeon: keymapdb pins an older picture of one layer, `ColmakDH`. The file now has six,
    starting with `default`, whose letters are the same Colemak-DH.
  - rafaelromao: the overview draws 14 of the file's 25 layers.
  - caksoylar: the picture GitHub Pages serves is not the copy in the repository.
- **Reversed pairs.** The only reversed pairs are on number layers, where a key on a thumb sits
  further in on the real board than on the preset:
  - rearman and phaberest put `0` on the middle thumb, under the index column;
  - Temper puts `.` on a thumb.

## Findings

Each finding names the test or the recorded result that shows it. The spec holds most of them as
they stand, so fixing one fails its test until the pin goes with the fix:

- `known` in `entries.ts` pins F1–F4 (the board and the characters lost), F6 and F7 (no space bar)
  and F8 (what is not read).
- `test.fail` marks F9, F10, F11 and F15.
- The mistaken-file tests pin F12's messages.
- F5, F13 and F14 are in the recorded results only. Severity is about what a user loses: a
board or letters the analysis needs (high), a part of what the analysis needs or of the dialog's
use (medium), or polish (low).

### F1 — A Kyria's middle columns are read as one: 15 letters and a comma are lost (high)

- **Evidence.** `akioweh: the keymap reads as keymapdb pictures it`, pinned: with
  keymap-drawer's `kyria_rotated.json`, the base layer lacks `w e r u i o s d f j k l x c m ,`.
- **Cause.** `placeKeys` (`packages/core/src/import/keymap-drawer.ts:405`) groups a hand's alpha
  keys into columns by chaining: a key joins the column when it is within 0.5 key of the column's
  *last* key. Two of the Kyria's thumb keys are not rotated, so they are taken for alpha keys. They
  sit at x 3.0 and 4.0, between the columns at 2.5, 3.5 and 4.5, so the chain runs through all
  three columns: one column of 11 keys, of which the bottom three are kept. That loses 8 letters on
  the left hand, and 7 letters and the comma on the right.
- **Proposed fix.** Two changes in `placeKeys`, each with a unit test on a board of this shape:
  - Group a key into a column by its distance to the column's own x (its first key's, or the
    mean), never through a neighbour.
  - Take as a thumb a key that sits a whole row or more below the bottom key of the columns above
    it, on a hand that has rotated thumb keys.

### F2 — On a Glove80 the top row of letters is lost (high)

- **Evidence.** `MattSturgeon: …`, pinned: with keymap-drawer's `glove80.json`, the base
  layer lacks `q w f p l u y '` and the digits; 32 of 80 keys are dropped.
- **Cause.** `placeKeys` keeps the bottom three keys of a column taller than three ("the extra is a
  number row"). The Glove80 has a row *under* its letters, so the bottom three are the home row,
  the bottom row and that extra row. It also decides this column by column: the inner column, which
  has no key in the extra row, keeps its top letter, so its home-row key is placed a row below the
  others'.
- **Proposed fix.** Keep, for the whole hand, the three rows that hold the base layer's letters.
  `boardFromKeys` can take a weight per position (1 where the base layer types a letter) from the
  file being read. Choose by that weight, and keep the bottom rows only where it ties.

### F3 — A splayed board's keys are taken for thumbs: the Diamond loses 10 of 24 keys (high)

- **Evidence.** `rafaelromao: …` pins "a board of its own, 14 keys; 10 keys the model has no
  place for", and the preview kept 7 keys a hand (on the left `m g t p`, the outer `d` and two
  thumbs). Every key of the Diamond is turned 3–10° (its columns splay), and every key turned 5°
  or more is taken for a thumb (`keymap-drawer.ts:440`, `Math.abs(keys[i].r) >= 5`). With more
  than six "thumbs" a hand, the rest are dropped. On the 1333+2 preset the dialog offers, the letters match the picture.
- **Proposed fix.** Measure a key's turn against its hand's median turn, so a splay does not make
  thumbs. Take a turned key for a thumb only when it is also in the hand's lowest band.

### F4 — With seven columns, the outer pinky column is dropped instead of the extra keys (medium)

- **Evidence.** `justinmklam: …`, pinned: with `corne_rotated.json`'s `LAYOUT_split_3x6_3_ex2`, the base
  layer lacks `'`, and 6 keys are dropped.
- **Cause.** `placeKeys` keeps the six innermost columns. The `_ex2` layout adds a two-key column
  inside the index finger's, so the outer pinky column goes.
- **Proposed fix.** When a hand has more than six columns, drop the ones with the fewest keys,
  keeping the outer pinky column on a tie.

### F5 — A keyboard named in the file is not looked up: 3 of 16 get no board (high)

- **Evidence.** In `MattSturgeon`, `akioweh` and `justinmklam: …`, "No board here has N keys" is
  shown and **Import and edit** is disabled. 15 of the 16 files only name their keyboard (one by
  the path of a layout file). For 12 the dialog picks the first preset with as many keys, which has
  the right shape (Corne, Sweep, Dilemma, Temper, Hummingbird, Rommana, Diamond), though not every
  one is drawn as the keyboard is (F13). It cannot pick for the Glove80 (80 keys), the Kyria (50)
  or the Corne `_ex2` (46).
- **Proposed fix.** In order of effort:
  1. A table from keymap-drawer's keyboard and layout names to the preset each one is: `corne`,
     `crkbd/*`, `corne_rotated` and `corneish_zen` with a 3×6+3 layout to 3×6+3; `ferris/*` and
     `cradio` to 3×5+2; `bastardkb/dilemma/3x5_3` to 3×5+3; `hummingbird`, `rufous` and `rommana`
     to 23332+2. Each row applies only when the file's key count is the preset's: justinmklam's
     `crkbd/rev4_0/standard` with `LAYOUT_split_3x6_3_ex2` has 46 keys, and must not be filled in
     order onto 42. The Board box then says "Corne" rather than "whose shape cannot be looked up
     from here".
  2. keymap-drawer's own layout files for the keyboards no preset is, bundled with their names
     (their licence to be checked first).
  3. Offering to fetch the keyboard's layout file from raw.githubusercontent.com, the host the
     dialog already fetches YAML files from since PR #107.

  Options 2 and 3 need F1–F4 fixed first; otherwise the layout files lose keys.

### F6 — Space, Enter and the modifiers drawn as icons are not read (high)

- **Evidence.** 6 keymaps draw space as `$$mdi:keyboard-space$$`: MattSturgeon, caksoylar,
  indianpojken, minusfive, rafaelromao and waffle87 (pinned). Their dialogs say "No key on the
  base layer types a space; the analysis takes the first thumb key as the space bar". Home-row mods drawn as
  `$$mdi:apple-keyboard-shift$$`, `-control$$`, `-option$$` and `-command$$` are lost; the board
  keeps this many of the picture's holds on the base layer:

  | Keymap | Holds kept |
  |---|---|
  | minusfive | 4 of 14 |
  | valdirjunior011 | 2 of 12 |
  | waffle87 | 0 of 8 |

  indianpojken and rafaelromao lose theirs the same way. Enter, Tab, Escape and Backspace icons are
  reported as "not read", where the same keys written as words are read, as keys the analysis does
  not simulate.
- **Cause.** `symbolOf` and `readLegend` (`keymap-drawer.ts:829`, `:891`) know `SPACE`, `␣`, `⇧`
  and the rest, but no `$$…$$` icon.
- **Proposed fix.** A table of keymap-drawer's common icon names next to `SPACE_NAMES`,
  `MOD_NAMES`, `REPEAT_NAMES` and `NAMED_KEY_GLYPHS`, read as their words are:
  - `keyboard-space` as space;
  - `apple-keyboard-shift`, `-control`, `-option` and `-command` (and `microsoft-windows`) as Shift,
    Ctrl, Alt and Gui;
  - `repeat` as Repeat;
  - `keyboard-return`, `keyboard-tab`, `keyboard-esc`, `backspace*` and `arrow-*` as named keys.

  An icon not in the table stays unread, as now.

### F7 — A legend with a symbol before its name is not read (medium)

- **Evidence.** casuanoob (pinned: no space) writes `␣ SPC`, `⇧ LSHFT`, `⎈ LCTRL`, `⌥ LALT`, `⊞ LGUI`, `⟳ Repeat`,
  `⌫ BSPC` and `⎋ ESC`. The base layer then has no space and no Repeat, and its other layers keep
  few of their holds: Nav, Sym and Num 1 of 5, NumRow 2 of 10, Spec 6 of 14.
- **Proposed fix.** In `readLegend`, when a legend does not read and starts with a symbol, read
  what follows it: strip a leading token with no letter or digit
  (`/^[^\p{L}\p{N}\s]+\s+(.+)$/u`) and take the rest if it reads. Stripping any first word would
  be wrong: `BT 0`, `Mouse 1`, `meh k`, `hyper ␣` and `dead ^` in this corpus would become `0`,
  `1`, `k`, space and `^`, and combos rightly left out today would type. A test can use casuanoob's
  legends, which are words, not the file.

### F8 — A layer key named by an abbreviation reaches nothing (medium)

- **Evidence.** `jcmkk3: …` pins "not read: upper, sym". jcmkk3's thumbs say `sym` for the layer
  `symbols`, and `upper`, which the reader does not know either. Both become transparent, so
  nothing on the base layer reaches the symbols layer and the analysis cannot type its 22
  characters.
- **Proposed fix.** Match a legend of three or more letters to the one layer whose name begins
  with it, ignoring case: `sym` → `symbols`, `num` → `numbers`. In the dialog, offer a choice of
  layer for a thumb key whose legend is not read.
- **A different case.** casuanoob's `{t: NAV, h: MO}` and `{h: OSL}` do reach their layers: the
  reader takes the tap as the layer and reads the key as `mo`. It only reports `MO` and `OSL` as
  "not read". Adding `mo`, `tg` and `df` to `LAYER_WORDS` and `osl` to `STICKY_WORDS`
  (`keymap-drawer.ts:787`, `:789`) would read them exactly.

### F9 — A message about the file is shown, not announced (medium)

- **Evidence.** `a file that does not read › is announced, not only shown`, expected to fail. The
  dialog's messages are plain paragraphs (`KeymapDrawerImport.tsx:329`, `:390`, `:391`, `:501`),
  so a screen reader says nothing when a file is refused.
- **Proposed fix.** `role="alert"` on those paragraphs, as the message of a fetch that fails
  already has (`:323`, PR #107).

### F10 — An empty file is met with nothing (low)

- **Evidence.** `a file that does not read › empty, says it is empty`, expected to fail. Choosing
  an empty file clears the dialog, a keymap read before included, and says nothing.
- **Proposed fix.** Remember the chosen file's name; when its text is blank, say "‹name› is
  empty." in the error paragraph.

### F11 — An unreadable `cols_thumbs_notation` cannot be put on a preset (low)

- **Evidence.** `the dialog's own errors › columns and thumbs it cannot read leave a board to
  choose`, expected to fail. The dialog offers the list of boards, but `resolveBoard`
  (`KeymapDrawerImport.tsx:39`) tries the notation before the board chosen, so the error stays
  whichever preset is picked. A layout file given with **Use a QMK info.json…** still works, and so
  does editing the notation in the text.
- **Proposed fix.** In `resolveBoard`, use the chosen preset before the notation, or fall back to
  it when the notation throws.

### F12 — A picture chosen instead of its YAML gets the YAML reader's message (low)

- **Evidence.** `jcmkk3-image` and `indianpojken-image` are refused with `line 4: unexpected "f"
  after the document` and `line 127: unexpected "s" after the document`. Both are correct, but
  neither says what happened. The configuration files are refused with "not a keymap-drawer file:
  there is no `layers` mapping", which is right, though it could name what they are.
- **Proposed fix.** Before reading, recognise an SVG (`<svg`, `<?xml`) or an image (PNG, JPEG or
  WebP signature, or NUL bytes) and say "This is a picture, not the YAML it was drawn from".
  Recognise a file with only `draw_config` or `parse_config` and say "This is keymap-drawer's
  configuration, not a keymap".

### F13 — A preset is drawn with its own stagger, not the keyboard's (low, by design)

- **Evidence.** The board LayerBench offers puts pairs the picture separates by more than half a
  key under 0.3 key apart, mostly the pinky and inner columns:
  - Sweep and Temper: 24 pairs;
  - Rufous and Rommana, on the 23332+2 preset: 20 pairs (0 with their own layout files);
  - Dilemma: 6 pairs;
  - jcmkk3: 4 pairs, its short columns being half a row off.

  Where the keyboard's own layout file is one of the presets (Sweep, Dilemma), the preset's drawing
  still wins.
- **Assessment.** By design: `boardFromKeys` gives a preset "so an import gets the preset's
  drawing and every analysis tuned for it". No change proposed beyond, at most, a line in the Board
  box saying the board is drawn as the preset.

### F14 — `qmk_info_json` is shown as a keyboard's name (low)

- **Evidence.** For rafaelromao the Board box says "The file names the keyboard
  docs/img/diagrams/keymap-drawer/diamond-layout.json, whose shape cannot be looked up from here".
  That is a layout file in the author's repository, not a keyboard.
- **Proposed fix.** For `qmk_info_json`, say "The file takes its board from ‹path›, which is not
  fetched: give it with **Use a QMK info.json…**".

### F15 — The Board box goes on asking for a board after a layout file gives one (low)

- **Evidence.** `the dialog's own errors › with a layout file given, the board box stops asking for
  one`, expected to fail. Every own-file reading in the results keeps the sentence written for the
  board offered above the new board. For akioweh it says "No board here has 50 keys: pick the
  nearest… or give the keyboard's QMK info.json", under "Onto a board of its own, 34 keys".
  Separately, for an unreadable `cols_thumbs_notation` the box says "The file does not say which
  keyboard it is for", though it does (`KeymapDrawerImport.tsx:335`–`:342`).
- **Proposed fix.** With a layout file given, say "The board comes from ‹name› (info.json)."
  instead. With a `cpt` layout that throws, say the notation could not be read and offer the
  presets.

## What works

- Every file of the corpus reads, whichever way it is written:
  - block and flow lists;
  - `draw_config` with block scalars;
  - quoted and emoji legends;
  - `type: held` and `type: trans` keys;
  - 25 layers and 149 combos.
- On the Corne-sized boards, every character of the letter layers is drawn where the picture has
  it: godalming123, minusfive, phaberest and rearman show 0 flattened and 0 reversed pairs there,
  and ScriBanana matches its picture by eye. The only reversed pairs are the thumb keys of the
  number layers noted above.
- Every wrong file is refused with a reason, nothing can be made from it, and the next good file
  reads. A file cut short or indented with a tab says which line.
- Unticking every layer says "Choose at least one layer to import." and disables **Import and
  edit**. A layout file that is not one says so, whether it is not JSON or JSON with no
  `layouts`, and a good one clears the message.
- **Import and edit** saves the layout and opens it in Analyze, which analyses it, for all 16.

## Suggested order

F6 and F7 together, which give 7 keymaps their space bar back and restore the home-row mods. Then
F1–F4 in `placeKeys`, with a test per board shape. Then F5's table of names. F9–F11 and F15 are
small changes in `KeymapDrawerImport.tsx`. Each fix removes its `test.fail` or its pin in `known`,
and the spec then holds the fixed behaviour.

## Not covered

- Combos are counted, not compared key by key with the picture's.
- The dialog's own import error (`importError`) cannot be reached from these files.
- Phone layouts: the dialog on a phone is `phone-menus.spec.ts`'s.
