# Importing and exporting

[keymap-drawer](https://github.com/caksoylar/keymap-drawer) draws keymaps from a YAML file that
lists what each key shows, layer by layer. Its `keymap parse` command writes that file from a ZMK
or QMK keymap, and LayerBench reads it.

1. In **Library**, click **Import**, then **keymap-drawer**, and paste the file, **Choose a .yaml
   file**, or give the file's address on GitHub and press **Fetch**.
2. Check the board it goes onto, and look over the preview. A combo it cannot draw on the board is
   behind a button beside the layers, such as **1 more combo**.
3. Untick the layers you do not want, and rename or reorder the rest. The first one ticked becomes
   the base layer.
4. Name the layout and press **Import and edit**.

Nothing is saved until you press it, and nothing is fetched until you press **Fetch**, or Enter in
the address field: the board comes from the file, or from you.

## Fetching a file by its address

**Fetch** reads the file at an address and puts its text in the box, as if you had pasted it, so
everything after it is the same, and a file gives the same layout whichever way it came. Under the
box, **Read from** says where the text came from, until you change it. The address is:

- the file's page on GitHub, such as
  `https://github.com/you/zmk-config/blob/main/keymap-drawer/board.yaml`, which is turned into the
  file's own address; or
- its **Raw** address, on `raw.githubusercontent.com`.

Only `https://` addresses on `raw.githubusercontent.com` are fetched. The page's security policy
lets it reach its own site, GitHub and the sign-in server and no other host, and many hosts do not
let other sites read their files anyway (the browser calls that a CORS refusal, and a page cannot
tell it from a lost connection). For a file anywhere else, open it, copy its text and paste it. An
address with a token in it, as GitHub gives for some private files, is fetched as it stands and
left out of **Read from**; if GitHub refuses it, paste the file's text instead.

Fetching asks GitHub for the file, so GitHub sees its address, as it would if you opened it in a
browser. What you paste or choose is not sent anywhere.

A failure is said under the address and leaves the box as it was: an address that is not one, a
file that is not there (404), a server that answers with an error or asks you to wait, one that is
too slow, a file over 1 MB, a web page or other file that is not text. A file that is text but not
a keymap-drawer file is said in the box's own words, as when pasted. A file that is slow to come
can be stopped with **Cancel**, and whatever you type or paste while it is coming wins: the file is
then dropped. The file is only ever read as text, to be read as a keymap: nothing in it is run or
followed.

## The board

keymap-drawer describes a board in one of three ways, and each is read as keymap-drawer itself
lays it out:

- `cols_thumbs_notation`, such as `33333+2 2+33333`: the number of keys in each column, then the
  thumbs;
- `ortho_layout`: rows, columns and thumb keys, with the pinky or inner columns shortened;
- `qmk_keyboard` or `zmk_keyboard`: only the keyboard's name.

A named keyboard is not looked up: the page reads the file it is given, and asks nowhere else about
a keyboard. You choose the board instead, from the presets; those with as many keys as the file are
marked *matches*, and the first of them is chosen for you. **Use a QMK info.json…** reads the
keyboard's own layout file, if you have it.

### How keys find their place

A board whose columns match one of LayerBench's presets becomes that preset, key for key.
Anything else is drawn as a board of its own.

LayerBench models up to three rows of up to six columns on each hand, and up to six thumb keys on
each hand.
Keys beyond that, such as a number row or a seventh column, are left out, and the import says how
many.

## What the legends become

A legend is what a key shows, not what it does, so the import reads it the way a person would:

| Legend | Becomes |
|---|---|
| `W` · `SQT` · `KC_COMM` · `N1` · `,` | the symbol it types: `w` · `'` · `,` · `1` · `,` |
| `SPACE` · `␣` · `$$mdi:keyboard-space$$` | the space key |
| a layer's name, alone or over `MO` | a key that reaches that layer while held |
| three letters or more on a key's tap, as `sym` | the one layer whose name begins with them, as `symbols` |
| a layer's name over `sticky` · `toggle` · `to` · `auto`, or QMK's `OSL` · `TG` · `DF` | a one-shot, toggle, switch or auto layer key |
| `LSHFT` · `LCTRL` · `⇧` · `⌘` · `$$mdi:apple-keyboard-shift$$` | a modifier; over `sticky`, a one-shot modifier |
| `A` over `LCTRL` | a tap-hold: tap for `a`, hold for Control |
| `ESC` over a layer's name | a hold for that layer, tapping nothing |
| `REPEAT` · `CAPS_WORD` · `$$mdi:repeat$$` | a repeat key, caps word |
| `␣ SPC` · `⇧ LSHFT`: a mark, then a key's name | what the name is |
| `▽` · `{type: trans}` · `{type: held}` | transparent |
| an empty legend | a key that does nothing |
| `ão` | a macro that types it |
| `ESC` · `PG UP` · `F1` · `LC(Z)` · `←` · `$$mdi:keyboard-return$$` | transparent: understood, but not simulated |
| a key that reaches a layer you left out | transparent, unless it does something else the analysis simulates, a tap such as `␣` or `A`, or a hold of a layer you kept, which stays |

The layout you get is the one you would make in the editor by hand. A key the analysis does not
simulate, such as Escape or an arrow, is transparent, as a key left unset is, and under a hold it
taps nothing: the layer held on it still works. A layer you left out is named nowhere.

keymap-drawer's icons are read for space, the modifiers (the Mac's keys, and the Windows logo for
Gui), repeat, Enter, Tab, Escape, Backspace and the arrows. Any other icon is not read, and is
listed with the other keys not read. A layer's name cut short is read on a key's tap only: a word
under a key, such as `symbol`, more often says what the key does.

Combos come along too, found by their key positions or by the legends of their keys, on the layers
you keep, with the timing the editor gives a combo. Only a combo that types is read: one that does
nothing, or does something that is not typing, such as a shortcut, is skipped, as the editor makes
no transparent combo.

### What the report says

Each layer shows how many of its keys were read. Legends it could not read in full are listed after
**not read**: what it could not read is left out, and a key with nothing left is transparent. Each
can be set in the editor like any other key. A note says how many keys reached a layer you left
out, and which combos were skipped and why.

## Exporting

**Export**, among the editor's panels in **Analyze**, shows the layout as LayerBench JSON, or, with
**keymap-drawer YAML**, as a file for keymap-drawer. Copy it or **Download .yaml**, then run
`keymap draw` on it.

The file draws each key as the board does: adaptive keys, macros and tap dances carry their mark in
the corner, a key that lets the layer below show through is `▽` and one that does nothing is
empty, and a key held or tapped to reach a layer is marked `held` on that layer where it is
transparent, as keymap-drawer's own examples mark one. Read back in, it gives the same layers,
keys and combos, a `held` key coming back transparent, except for what keymap-drawer has no field
for: an adaptive key comes back as a plain key typing its default, a macro as the text it types without
its other steps, a dead key as its plain accent, a tap dance as its single tap and a morph as its
unmodified part.

### Other formats

**Import**, in **Library**, also takes LayerBench JSON under **Text or JSON**, or a layout written
as text the way layouts are often shared: three rows of letters separated by spaces, with an
optional thumb row, or a single string of 30 characters as cmini writes them, or of 33 to 35 as
cyanophage does. A text layout goes onto the board you choose under **Physical layout**.
