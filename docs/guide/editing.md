# Editing a layout

**Edit** shows the board one layer at a time, with the layer tabs above it. Tap or click a key to
select it. The editor beside the board (under it, on a phone) says what the key does and lets you
change it.

1. **Select a key** on the board.
2. **Choose what it does** from the tiles: *Symbol*, *Layer*, *Modifier*, *Tap-hold* and so on.
3. **Fill in the rest**, such as the symbol it types, the layer it reaches or what a hold does.

Every change is kept as you make it, so there is nothing to apply. **Undo** and **Redo**, beside
the layer tabs, step back and forth through your changes. **Save**, beside the layout's name at
the top, keeps it in **Library**, and until then the name is marked *unsaved*. A layout's link
follows its name: rename one already in **Library** and save it, and it moves to a link of its new
name, so a link to it from before no longer opens it.

The bar at the top also holds the layout's author and description, and the **Corpus** and
**Rules** the numbers under the board are worked out with. The editor starts on English news
unless its link names another text; from **Library** it opens on the text and rules being ranked
there.

## Choosing what a key does

The tiles along the top of the editor are the kinds of key. The lit tile is what the key is now,
and choosing another turns it into that kind, keeping what it can: a symbol stays the symbol when
the key becomes a tap-hold.

| Tile | The key |
|---|---|
| Symbol `a` | types a letter, digit or symbol |
| Layer `Nav` | reaches another layer: while held, for one key, until pressed again, for good, or until the word ends |
| Modifier `⇧` | is Shift, Control, Alt or Command, held or for the next key only |
| Tap-hold `a/⇧` | does one thing when tapped and another when held |
| Repeat `⟳` | presses the key before it again |
| Magic `✦` | types something that depends on the key before it |
| Macro `⋯` | types several things in one press |
| Transparent `▽` | lets the layer below show through |
| Nothing `∅` | does nothing |

**More** holds the rest: alt repeat, tap dance, morph, caps word, Unicode, dead key, and the
layout's own named behaviours. [Special keys](special-keys.md) explains each of them.

### Parts of a bigger key

A tap-hold has a tap and a hold, a magic key has a branch for each key it follows, and a tap dance
has a binding for each number of taps. Each part has its own small choice of kind, with that
kind's controls under it, so a hold can reach a layer while the tap types a letter, or is a magic
key.

### Keys the layout already has

**From this layout** offers the keys the layout already uses, its magic keys and alt repeats first
and then its symbols, layer keys and modifiers, to put on the selected key in one tap. **All**
shows every one of them, including the keys an import brought in.

### Typing a binding

**Or type** takes a binding written the way ZMK writes one. On a selected key you can simply start
typing, and the first character goes straight into the field. `Enter`, or leaving the field,
applies it; `Escape` leaves the key as it was. Starting with `&` lists the behaviours that fit.

| Type | The key |
|---|---|
| `ç` · `ão` | types that |
| `&kp A` · `&kp N1` · `&kp LS(COMMA)` | a key press, by keycode |
| `&lt num a` · `&mo sym` · `&sl ccedil` · `&to base` · `&tog num` | layer taps and switches |
| `&sk LSHIFT` · `&kp LSHIFT` | a one-shot modifier, and a held one |
| `&macro ão` · `&macro ão then alpha2` | a macro, optionally turning on a layer after it |
| `&trans` · `&none` · `&key_repeat` · `&caps_word` | the rest |
| `&magic` | one of the layout's own named behaviours |

A layer can be named by its id, by its name, or by its number as ZMK counts them. A trailing
`tag:name` gives the key a tag that magic keys can match on. Under the default `symbols` host
locale a keycode becomes the symbol it types: `&kp N1` is `1`, and shifted `!`.

Some keys hold more than this syntax can write, such as a magic key's branches or a tap-hold with
its own timing. For those the field starts empty and says so; the controls above still edit all of
it, and a binding typed into the field replaces it.

## Moving keys around

Drag a key onto another to swap the two. Hold `Alt` while dropping to copy it instead, or drop it
on a layer tab to send it to that layer.

The same moves work without dragging. **Swap with…** and **Copy to…** in the editor ask you to
tap the other key, and **Send to layer…** picks the layer from a list. **Clear** empties the key.

## Layers

The tabs above the board switch between layers. A key's colour and dot say which layer it reaches.

The **Layers** panel lists them in order, and does everything else with them:

- **Rename** a layer in its name field, or double-click its tab (press and hold it on a phone, or
  `F2` on the keyboard).
- **Reorder** with the arrows, or by dragging its row. The base layer stays first.
- **Duplicate** copies a layer, with all its keys, right after it.
- **Remove** deletes a layer. It refuses while a key, combo or behaviour still reaches the layer,
  and names each one, so nothing is left pointing at a layer that is gone.
- **+ layer** adds an empty one at the end.

### The keys that reach a layer

On any layer but the base, the keys you hold or tap to get there carry a ring in the layer's
colour, and `held` or `tapped` along the bottom: the thumb held for Symbols, the one-shot key
tapped for Alpha 2, the `ç` macro that turns on Ç extension, an alt repeat branch that arms a
layer. They are found from the layout itself, so they change as you edit. Select one, or read the
list under the board, to see where it is pressed and when.

### Which layer wins

When two layers are on at once, a key comes from the one further down the list. A key that is
transparent on that layer falls through to the next one up, and every key falls back to the base
layer in the end, which is why it stays first.

## Combos, typing paths and the rest

The other panels hold what is not on a single key:

- **Features** turns on sentence case and caps word.
- **Geometry** chooses the board and says which keys are space and shift.
- **Combos** are keys pressed together. **Pick on board**, then tap the keys; the output takes
  the same syntax as **Or type**.
- **Behaviors** are the named bindings keys refer to, such as `&magic`.
- **Typing paths** list the other ways a character can be typed; drag or use the arrows to change
  which is tried first.
- **JSON** shows the whole layout as LayoutMaster JSON or as a keymap-drawer file.

## On a phone

Everything works by tapping. The board stays at the top of the screen while you edit, with the
editor under it, so the key you are changing is always in sight. Tiles and chips are sized for a
finger.

To drag a key, rest your finger on it for a moment first; a quick swipe scrolls the page instead.
**Swap with…**, **Copy to…** and **Send to layer…** do the same without dragging. The on-screen
keyboard stays down until you tap a text field, such as **Or type**.

## Keyboard shortcuts

With the board focused, the arrow keys move between keys; the board is one stop for `Tab`, not
one for each key.

| Key | Does |
|---|---|
| any character | starts the key's binding with it, in **Or type** |
| `Enter` · `F2` | puts the whole binding in **Or type**, ready to replace |
| `Space` | selects the key |
| `Delete` · `Backspace` | clears the key |
| `Alt`+`S` | starts a swap; then `Enter` or a click on the other key |
| `Escape` | cancels a swap or a combo pick; otherwise closes the editor |
| `Ctrl`/`Cmd`+`Z` | undoes; with `Shift` as well, redoes |
