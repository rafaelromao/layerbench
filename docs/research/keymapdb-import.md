# keymapdb keymaps through Import

How well **Library → Import → keymap-drawer** reads real keymaps: every keymap on
[keymapdb.com](https://keymapdb.com) whose repository keeps a keymap-drawer YAML file, read through
the dialog and held against the picture keymapdb shows for it, and the files beside them that
someone could choose by mistake. keymapdb's entries were listed on 2026-11-07: 16 of its 152 keep a
keymap-drawer file. The bench is `apps/web/e2e/keymapdb.spec.ts`, with `apps/web/e2e/keymapdb/`.
What Import does with each kind of case is under [What Import does](#what-import-does); the
[guide](../guide/importing.md) says what a user sees.

## In short

- **Every file reads.** All 16 keymap-drawer files parse, up to 35 kB with 25 layers and 149
  combos, and each reaches Analyze and is analysed. The spec asserts that no uncaught error and no
  console error is seen.
- **Where LayerBench offers a board, the letters are right.** On the 13 files it finds a board for
  (10 compared by machine, 3 by eye), every letter of the picture's base layer is on the board, on
  its hand, and no two letters are the wrong way round. The board offered matches the keyboard's
  real stagger only on the Corne-sized boards: a preset is drawn as the preset.
- **Three keyboards get no board by themselves.** A file that only names its keyboard is not looked
  up, and no preset has the 80, 50 or 46 keys of the Glove80, the Kyria and the Corne `_ex2`. Given
  the keyboard's own layout file, each is placed with every character of the picture's base layer
  except the Glove80's digits, which sit on a row past the three the model keeps.
- **Icons for space, modifiers and repeat are read; other legends are not.** Enter, Tab, Escape and
  Backspace icons, a symbol before a name (`␣ SPC`) and a layer key named by an abbreviation
  (`sym`) are not. The keymap that writes `␣ SPC` has no key that types a space, and one whose
  thumbs say `sym` reaches no layer from them.
- **Files that are not keymaps are refused, with a reason, and the dialog recovers.** Of the 10
  mistaken files (keymap-drawer and ZMK configuration, a combos-only file, a character table, the
  SVG and PNG pictures, and a one-layer keymap drawn for a blog post), 9 get a message, nothing is
  made from them, and a good file chosen next reads; the tenth is a keymap and reads. The dialog's
  limits are that a message is not announced to a screen reader, that an empty file gets no message,
  that a columns-and-thumbs notation it cannot read cannot be put on a preset, and that the Board
  box goes on asking for a board after a layout file has given one.

## Method

- **The keymaps.** keymapdb is built from
  [precondition/keymapdb](https://github.com/precondition/keymapdb) (`src/posts/keymaps/*.md`; fields
  `keymapUrl`, `keymapImage`). The git tree of every entry hosted on GitHub (about 120) was listed;
  16 keep a keymap-drawer YAML, a file with `layout` and `layers` at the top. The 20 keymaps that
  live in qmk/qmk_firmware keep none. Each file and picture is read at the commit pinned in
  `apps/web/e2e/keymapdb/entries.ts`, except caksoylar's picture, which GitHub Pages serves from a
  workflow and which differs from the copy in the repository: it carries the SHA-256 it has been
  read with, and `refresh.ts` says when it does not match.
- **Nothing third-party is committed.** 8 of the 16 repositories carry no licence and 3 are GPL,
  so `node apps/web/e2e/keymapdb/refresh.ts` downloads the files into the git-ignored
  `apps/web/e2e/keymapdb/.cache/`, and the spec skips what is not there.
- **The pictures.** 13 of the pictures were drawn by keymap-drawer: their SVG names each layer
  (`layer-<name>`) and each key (`keypos-<n>`, its centre and its legends), and
  `apps/web/e2e/keymapdb/image.ts` reads them. The other 3 (ScriBanana's WebP, indianpojken's and
  rafaelromao's PNG) are compared by eye.
- **Two boards per keymap.** First the board the dialog offers by itself: the one the file
  describes (`ortho_layout`, `cols_thumbs_notation`), or else the first preset with as many keys.
  Then the keyboard's own layout file, the one keymap-drawer finds for the name the file gives (its
  `zmk_keyboard_layouts.yaml`, `qmk_keyboard_mappings.yaml` and `resources/extra_layouts/` at
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
  on its hand. Where a case below differs, the entry pins what it shows instead (`known` in
  `entries.ts`): the board an own layout file gives and the characters it lacks, a base layer with
  no key that types a space, and the legends the dialog says it cannot read. The spec then takes the
  board offered (or the layout file's, where none is offered) to Analyze and waits for the analysis.
  Every other number is recorded in `.cache/results/<entry>.json`, not asserted.
- **Rerunning.**

  ```bash
  node apps/web/e2e/keymapdb/refresh.ts
  E2E_PORT=4021 E2E_CHANNEL=msedge pnpm --filter @layerbench/web e2e keymapdb --project=desktop
  ```

- **The spec.** 34 tests: one per keymap (16), one per mistaken file (10), four on files that do not
  read (cut short, tab-indented, empty, announced), and four on the dialog's own errors (no layer
  ticked, a layout file that is not one, the Board box after a layout file, an unreadable
  notation). Four are expected failures (`test.fail`) that hold dialog limits as they stand: the
  empty file, the message that is not announced, the Board box after a layout file and the
  unreadable notation.
- **What was not re-run.** This note follows the spec, `entries.ts`, `compare.ts` and the importer
  (`packages/core/src/import/keymap-drawer.ts`, `apps/web/src/views/library/KeymapDrawerImport.tsx`),
  read for what each does, and the importer probed with the legends it names. The e2e itself needs
  the downloaded files and a browser, and was not run for this write-up. The table below has the
  columns that follow from where keys are placed. The columns that depend on how legends are read
  (keys read, combos read, space bar) are in `.cache/results/<entry>.json` after a run, and are not
  tabulated here.

## The keymaps

*Board offered* is what the dialog picks by itself. *Own file* is the board from the keyboard's
layout file. *Characters* is the base layer's one-character legends found on that board, against the
picture's. *Flattened* counts pairs of characters, offered → own file.

| Keymap | Keyboard, as the file names it | Board offered | Own file | Layers, file / picture | Characters | Flattened |
|---|---|---|---|---|---|---|
| AlaaSaadAbdo | zmk `rommana` | 23332+2 | 23332+2 | 3 / 3 | 26/26 | 20 → 20 |
| MattSturgeon | zmk `glove80` | none | its own, 48 of 80 keys | 6 / 1 | 32/42 | — |
| ScriBanana | zmk `corne` | 3×6+3 | 3×6+3 | 4 / 4 (by eye) | by eye: all | — |
| akioweh | zmk `kyria_rev3` | none | its own, 48 of 50 keys | 10 / 10 | 33/33 | — |
| caksoylar | qmk `rufous` | 23332+2 | 23332+2 | 5 / 5 | 26/26 | 20 → 20 |
| casuanoob | qmk `bastardkb/dilemma/3x5_3` | 3×5+3 | 3×5+3 | 10 / 10 | 28/28 | 6 → 6 |
| godalming123 | qmk `corne_rotated` | 3×6+3 | 3×6+3 | 2 / 2 | 26/26 | 0 |
| indianpojken | qmk `ferris/sweep` | 3×5+2 | 3×5+2 | 4 / 4 (by eye) | by eye: all | — |
| jcmkk3 | `ortho_layout` 3×5+2, short pinky and inner | 23332+2 (from the file) | — | 4 / 4 | 26/26 | 4 |
| justinmklam | qmk `crkbd/rev4_0/standard`, `_ex2` | none | 3×6+3, 42 of 46 keys | 4 / 4 | 31/31 | — |
| minusfive | zmk `corneish_zen` | 3×6+3 | 3×6+3 | 3 / 3 | 31/31 | 0 |
| phaberest | qmk `crkbd/rev1` | 3×6+3 | 3×6+3 | 7 / 7 | 32/32 | 0 |
| rafaelromao | `qmk_info_json` (Diamond) | 1333+2 | 1333+2 | 25 / 14 (by eye) | by eye: all on 1333+2 | — |
| rearman | qmk `corne_rotated` | 3×6+3 | 3×6+3 | 3 / 3 | 35/35 | 0 |
| valdirjunior011 | zmk `temper` | 3×5+3 | — | 5 / 5 | 30/30 | 24 |
| waffle87 | qmk `ferris/sweep` | 3×5+2 | 3×5+2 | 4 / 4 | 30/30 | 24 → 24 |

Notes on the table:

- **Own files that are a preset.** The layout files of the Rufous and the Rommana (both Berylline's,
  a splayed Hummingbird) and of the Diamond give the very board the dialog offers, position for
  position, so their flattened pairs are the offered board's.
- **Keys not placed.** The Glove80's own file keeps three rows of letters per hand and leaves 32 of
  its 80 keys out, the digits among them, on a row past the three the model keeps; the Kyria's
  leaves out the seventh thumb key of each hand (`BRIGHTNESS INC`, `&alt_tab`); the Corne `_ex2`'s leaves out the
  two-key column inside each index finger.
- **Pictures that differ from the file.** These are differences in the pictures, not in
  LayerBench:
  - MattSturgeon: keymapdb pins a picture of one layer, `ColmakDH`, from another commit than the
    file read; the file has six layers, starting with `default`, whose letters are the same
    Colemak-DH.
  - rafaelromao: the overview draws 14 of the file's 25 layers.
  - caksoylar: the picture GitHub Pages serves is not the copy in the repository.
- **Reversed pairs.** The only reversed pairs are on number layers, where a key on a thumb sits
  further in on the real board than on the preset:
  - rearman and phaberest put `0` on the middle thumb, under the index column;
  - Temper puts `.` on a thumb.

## What Import does

### Placing a keyboard's own layout file

Given a keyboard's layout file (a QMK `info.json`), Import places each key on the model's grid, a
hand, one of three rows or the thumb row, and a column counted from the outer pinky. Keys the model
has no place for are left out, and the dialog says how many (`placeKeys`,
`packages/core/src/import/keymap-drawer.ts`). A board whose columns match a preset is that preset;
any other is a board of its own. `packages/core/src/import/keymap-drawer.test.ts` holds each shape
that follows.

- **Columns.** A key joins a column when it is within half a key of the column's middle, never
  through a neighbour, so a key between two columns is a column of its own. With more than six
  columns on a hand, the ones with the fewest keys go and the outer pinky column stays on a tie:
  the Corne `_ex2`'s extra two-key column goes, and the base layer lacks nothing.
- **Thumbs.** Where the layout does not say, a key is a thumb when it is turned 5° or more toward
  the middle of the board against its hand's own turn (the median, or none where the hand is turned
  less than 5°), and in the band of such keys at the hand's bottom, each within a row of the one
  below it; or when it is the lowest band of a hand with fewer keys than the band above it; or,
  on a hand with turned thumbs, when it is a flat key alone in its column a row or more below the
  columns over it. A splay turns some columns out and some in, and a column turned out is never a
  thumb: the Diamond is the 1333+2 preset with every key placed, and Berylline's outer pinky column
  (turned 8° out) is a pinky column, so the Rufous and the Rommana get the 23332+2 preset. The
  Kyria's flat thumb keys are thumbs, so its middle columns stay apart and it gets a board of its own
  of 48 keys, with every character of its picture and 15 of its 21 combos (the other 6 do nothing the
  analysis simulates).
- **Rows.** A hand taller than three rows keeps the three that hold the most letters of the file's
  first layer (`letterWeights`), the bottom three on a tie: a number row goes, and so does a row
  under the letters. The Glove80 has a row under its letters, so the bottom three are the home row,
  the bottom row and that extra row, and weighing by letters keeps the three rows of letters instead.
  Every column taller than three is cut to the rows kept, and a shorter one keeps all its keys.

### A keyboard named in the file is not looked up

A file that only names its keyboard (`qmk_keyboard`, `zmk_keyboard`, `dts_layout`) is not looked up:
the page reads the file it is given and asks nowhere else. Of the 16 files, 15 name their keyboard
(one by the path of a layout file). For 12 the dialog picks the first preset with as many keys, which
has the right shape (Corne, Sweep, Dilemma, Temper, Hummingbird, Rommana, Diamond), though not every
one is drawn as the keyboard is. For the Glove80 (80 keys), the Kyria (50) and the Corne `_ex2` (46)
no preset has that many keys: the dialog says "No board here has N keys", **Import and edit** is
disabled, and the reader picks the nearest board, whose keys are filled in order, or gives the
keyboard's `info.json`. The dialog never picks a preset with another number of keys for the reader:
justinmklam's `crkbd/rev4_0/standard` with `LAYOUT_split_3x6_3_ex2` has 46 keys, and filling them
in order onto the Corne's 42 would put them on the wrong keys.

### The Board box

- **A preset is drawn as the preset.** The board offered puts pairs the picture separates by more
  than half a key under 0.3 key apart, mostly in the pinky and inner columns: 24 pairs on the Sweep
  and Temper, 20 on the Rufous and Rommana (the 23332+2 preset), 6 on the Dilemma and 4 on jcmkk3,
  whose short columns are half a row off. `boardFromKeys` gives a preset "so an import gets the
  preset's drawing and every analysis tuned for it", so where the keyboard's own layout file is one
  of the presets (Sweep, Dilemma, Rufous, Rommana, Diamond), the preset's drawing wins.
- **`qmk_info_json` is shown as a keyboard's name.** For rafaelromao the Board box says "The file
  names the keyboard docs/img/diagrams/keymap-drawer/diamond-layout.json, whose shape cannot be
  looked up from here". That is a layout file in the author's repository, not a keyboard. It is
  given with **Use a QMK info.json…**.
- **The Board box goes on asking after a layout file gives a board.** The sentence written for the
  board offered stays above the new one: for akioweh it says "No board here has 50 keys: pick the
  nearest… or give the keyboard's QMK info.json", under "Onto a board of its own, 48 keys". For an
  unreadable `cols_thumbs_notation` it says "The file does not say which keyboard it is for", though
  it does (`KeymapDrawerImport.tsx`). The spec holds this as an expected failure.
- **An unreadable `cols_thumbs_notation` cannot be put on a preset.** The dialog offers the list of
  boards, but `resolveBoard` reads the notation before the board chosen, so its error stays whichever
  preset is picked. A layout file given with **Use a QMK info.json…** still works, and so does
  editing the notation in the text. The spec holds this as an expected failure.

### Legends

The guide's [table of legends](../guide/importing.md#what-the-legends-become) lists what is read.
The cases of these keymaps that are not:

- **Icons.** keymap-drawer's `$$mdi:…$$` icons are read where they stand for a key or a modifier
  (`GLYPH_LEGENDS`): `keyboard-space` as the space key, `repeat` as Repeat, and
  `apple-keyboard-shift`, `-control`, `-option` and `-command` as Shift, Control, Alt and Gui, as a
  tap or a hold. Six of the keymaps draw their space bar as `$$mdi:keyboard-space$$` (MattSturgeon,
  caksoylar, indianpojken, minusfive, rafaelromao and waffle87), and several draw their home-row mods
  as the modifier icons. An icon that is not in the table is a picture and stays unread: Enter, Tab,
  Escape and Backspace icons, and `$$mdi:microsoft-windows$$` for Gui. A key with an icon it cannot
  read is transparent (its tap stays where it reads one) and is listed as not read, where the same
  Enter, Tab, Escape or Backspace written as words is read as a key the analysis does not simulate.
- **A legend with a symbol before its name is not read.** casuanoob writes `␣ SPC`, `⇧ LSHFT`,
  `⎈ LCTRL`, `⌥ LALT`, `⊞ LGUI`, `⟳ Repeat`, `⌫ BSPC` and `⎋ ESC`. The base layer then has no key
  that types a space and none for Repeat, and its other layers keep few of their holds: Nav, Sym and
  Num 1 of 5, NumRow 2 of 10, Spec 6 of 14. The dialog says "No key on the base layer types a
  space; the analysis takes the first thumb key as the space bar". Stripping the first word of any
  legend that does not read would be wrong: `BT 0`, `Mouse 1`, `meh k`, `hyper ␣` and `dead ^` in
  this corpus would become `0`, `1`, `k`, space and `^`, and combos rightly left out would type.
  Only a leading token with no letter or digit is safe to strip, reading the rest if it reads.
- **A layer key named by an abbreviation reaches nothing.** jcmkk3's thumbs say `sym` for the layer
  `symbols`, and `upper`, which names no layer of its file. Both become transparent, so nothing on
  the base layer reaches the symbols layer, the analysis cannot type its 22 characters, and the
  dialog says "not read: upper, sym". A legend is matched to a layer by its whole name, case
  ignored; matching `sym` to the one layer that begins with it would read it.
- **A QMK layer word is read as a held layer.** casuanoob's `{t: NAV, h: MO}` and `{h: OSL}` do reach
  their layers: the tap is the layer's name and the key is read as `mo`. `MO` and `OSL` are reported
  as not read, and `OSL`, a one-shot layer, is a held layer here. The layer words Import knows are
  `toggle`, `to`, `switch` and `auto`, and the one-shot words `sticky`, `one-shot`, `oneshot`,
  `one shot`, `os` and `1×`; `tg`, `df` and `osl` are not among them.

### The dialog's messages

- **Files that are not keymaps.** keymap-drawer's configuration (`config.yaml`), ZMK's build matrix
  and west manifest, a combos-only file and a character table for a keymap generator are refused
  with "not a keymap-drawer file: there is no `layers` mapping". That is right, though it does not
  name what the file is. A keymap's SVG or PNG chosen instead of its YAML is refused with the YAML
  reader's message about the line it stopped at (`line 4: unexpected "f" after the document`, `line
  127: unexpected "s" after the document`), which is correct and does not say it is a picture. A
  file cut short says which line (`unclosed [`), and one indented with a tab says so. A one-layer
  keymap drawn for a blog post reads, being a keymap. Nothing is made from a refused file, and a
  keymap chosen next reads.
- **A message is shown, not announced.** The dialog's messages for a file are plain paragraphs, so a
  screen reader says nothing when a file is refused; only the message of a failed fetch is a
  `role="alert"`. The spec holds this as an expected failure.
- **An empty file is met with nothing.** Choosing an empty file clears the dialog, a keymap read
  before included, and says nothing. The spec holds this as an expected failure.
- **No layer ticked.** Unticking every layer says "Choose at least one layer to import." and
  disables **Import and edit**. A layout file that is not one says so, whether it is not JSON or is
  JSON with no `layouts`, and a good one clears the message.

### Combos

Combos are read from the file's key positions or from the legends of their keys, on the layers
kept. Each combo left out is listed with its reason: its trigger keys are on no layer, it is on keys
the board does not have, it is only on layers left out, it does nothing the analysis simulates
(Escape, Tab, Delete, mouse buttons, Bluetooth, a shortcut), it does not type, or it is a key drawn
beside its layer's key, not a chord. A combo is read as a macro when its legend is lower-case letters
beyond ASCII (`ão`) or carries LayerBench's macro mark; a plain `()` is not read, so a combo that
types it is left out as doing nothing the analysis simulates.

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
- **Import and edit** saves the layout and opens it in Analyze, which analyses it, for all 16.

## Not covered

- Combos are counted, not compared key by key with the picture's.
- The dialog's own import error (`importError`) cannot be reached from these files.
- Phone layouts: the dialog on a phone is `phone-menus.spec.ts`'s.
