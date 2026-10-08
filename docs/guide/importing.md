# Importing and exporting

[keymap-drawer](https://github.com/caksoylar/keymap-drawer) draws keymaps from a YAML file that
lists what each key shows, layer by layer. Its `keymap parse` command writes that file from a ZMK
or QMK keymap, and LayerBench reads it.

1. In **Library**, click **Import**, then **keymap-drawer**, and paste the file or **Choose a .yaml
   file**.
2. Check the board it goes onto, and look over the preview.
3. Untick the layers you do not want, and rename or reorder the rest. The first one ticked becomes
   the base layer.
4. Name the layout and press **Import and edit**.

Nothing is saved until you press it, and nothing is fetched from anywhere: the board comes from
the file, or from you.

## The board

keymap-drawer describes a board in one of three ways, and each is read as keymap-drawer itself
lays it out:

- `cols_thumbs_notation`, such as `33333+2 2+33333`: the number of keys in each column, then the
  thumbs;
- `ortho_layout`: rows, columns and thumb keys, with the pinky or inner columns shortened;
- `qmk_keyboard` or `zmk_keyboard`: only the keyboard's name.

A named keyboard is not looked up, since the page fetches nothing. You choose the board instead,
from the presets; those with as many keys as the file are marked *matches*, and the first of them
is chosen for you. **Use a QMK info.json…** reads the keyboard's own layout file, if you have it.

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
| `SPACE` · `␣` | the space key |
| a layer's name | a key that reaches that layer while held |
| a layer's name over `sticky` · `toggle` · `to` · `auto` | a one-shot, toggle, switch or auto layer key |
| `LSHFT` · `LCTRL` · `⇧` · `⌘` | a modifier; over `sticky`, a one-shot modifier |
| `A` over `LCTRL` | a tap-hold: tap for `a`, hold for Control |
| `ESC` over a layer's name | tap for Escape, hold for that layer |
| `REPEAT` · `CAPS_WORD` | a repeat key, caps word |
| `▽` · `{type: trans}` · `{type: held}` | transparent |
| an empty legend | a key that does nothing |
| `ão` | a macro that types it |
| `ESC` · `PG UP` · `F1` · `LC(Z)` · `←` | an imported key: understood, but not simulated |

Combos come along too, found by their key positions or by the legends of their keys, on the layers
you import.

### What the report says

Each layer shows how many of its keys were read. Legends it could not read are listed after **kept
as imported**. They stay on the board as imported keys, with their legend, and can be replaced in
the editor like any other key. A key that reaches a layer you left out is kept the same way.

Imported keys type nothing in the analysis. That is right for Escape or an arrow, which type no
text anyway. A layer held on such a key still works, because the hold is kept and only the tap is
imported.

## Exporting

**JSON**, among the editor's panels in **Analyze**, shows the layout as LayerBench JSON, or, with
**keymap-drawer YAML**, as a file for keymap-drawer. Copy it or **Download .yaml**, then run
`keymap draw` on it.

The file draws each key as the board does: adaptive keys, macros and tap dances carry their mark in
the corner, a key that lets the layer below show through is `▽` and one that does nothing is
empty, and a key held or tapped to reach a layer is marked `held` on that layer where it is
transparent, as keymap-drawer's own examples mark one. Read back in, it gives the same layers,
keys and combos, a `held` key coming back transparent, except for what keymap-drawer has no field
for: an adaptive key comes back as a plain key typing its default, a macro as the text it types without
its other steps, a dead key as its plain accent, a tap dance as its single tap and a morph as its
unmodified arm.

### Other formats

**Import**, in **Library**, also takes LayerBench JSON under **Text or JSON**, or a layout written
as text the way layouts are often shared: three rows of letters separated by spaces, with an
optional thumb row, or a single string of 30 characters as cmini writes them, or of 33 to 35 as
cyanophage does. A text layout goes onto the board you choose under **Geometry**.
