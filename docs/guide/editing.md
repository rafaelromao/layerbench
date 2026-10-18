# Editing a layout

A layout is edited where it is analyzed, in **Analyze**: the board shows one layer at a time, with
the layer navigator above it. Tap or click a key to select it. The editor beside the board (under it, on
a phone) says what the key does, what it adds to the numbers, and lets you change it.

1. **Select a key** on the board.
2. **Choose what it does** from the tiles: *Symbol*, *Layer*, *Modifier*, *Tap-hold* and so on.
3. **Fill in the rest**, such as the symbol it types, the layer it reaches or what a hold does.

Every change is kept as you make it, so there is nothing to apply. **Undo** (↶) and **Redo** (↷),
beside the layer's name, step back and forth through your changes. **Save**, beside the layout's name at
the top, keeps it in **Library**, and until then the name is marked *unsaved*. On a layout that is
not yours yet, such as one that comes with the app, the first **Save** makes a copy in your custom
layouts and asks what to call it; after that, **Save** keeps your edits to the copy. A layout's link
follows its name: rename one already in **Library** and save it, and it moves to a link of its new
name, so a link to it from before no longer opens it.

The address follows your edits too: a moment after each one, the link holds the layout as it now
is. Reload the page, or go back to it, in the same tab, and the edits are still there, still
unsaved, and saving them saves the layout they are edits of rather than a copy beside it. Opened in
another tab or browser, the same link is a layout of its own: it is not marked *unsaved*, and saving
it makes a copy. Once saved, the link still carries the layout whole, so it can be sent; opened
where that layout is saved and unchanged, it is the custom layout again. A layout opened from
**Open in analyzer**, or from someone's link, is not in **Library** until you save it, and its first **Save** asks for a name. Picking another layout from **Layout** asks first when there is
something unsaved.

**Settings**, in the bar at the top, holds the layout's author and description, the languages it
is for, and the choices
the numbers are worked out with: **Corpus**, **Mix with**, **Rules**, **Counts**, the **Sample**,
the feature switches, **Space** and **Shift**, the same as in every view that analyzes, and whether
the board draws its combos. The line beside it says what is chosen. A feature switched off changes
the numbers only: the keys are edited as written.

## Numbers while you edit

Every number follows each edit: the summary, every card under it, the heat and the characters the
layout cannot type. Swapping two keys shows an estimate at once, worked out from the text already
typed, marked *estimate after swap* until the layout is typed again; any other change is typed
again straight away, and the numbers say *updating…* meanwhile. A larger **Sample** gives steadier
numbers, a smaller one quicker updates.

The selected key's [own numbers](analyzing.md#a-keys-numbers) on the layer shown open in a section
of their own, right above the summary; on a phone, under the word typed.

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
| Adaptive `✦` | types something that depends on the key before it |
| Macro `⋯` | types several things in one press |
| Transparent `▽` | lets the layer below show through |
| Nothing `∅` | does nothing |

The tiles after them are the rest: alt repeat, tap dance, morph, caps word, Unicode, dead key,
and the layout's own named behaviours. [Special keys](special-keys.md) explains each of them. On a
phone they wait under **More**, which then shows the kind chosen from them.

### Parts of a bigger key

A tap-hold has a tap and a hold, an adaptive key has a branch for each key it follows, and a tap
dance has a binding for each number of taps. Each part has its own small choice of kind, with that
kind's controls under it, so a hold can reach a layer while the tap types a letter, or is an
adaptive key. A hold can be anything a tap can — a layer key of any kind, a modifier, a symbol, a
macro, an adaptive key — except another tap-hold, and the analysis presses it held when that is the way to
type what it does.

### Keys the layout already has

**From this layout** offers the keys the layout already uses, its adaptive keys and alt repeats
first and then its symbols, layer keys and modifiers, to put on the selected key in one tap. **All**
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
| `&altRepeat` | one of the layout's own named behaviours |

A layer can be named by its id, by its name, or by its number as ZMK counts them. A trailing
`tag:name` gives the key a tag that adaptive keys can match on. Under the default `symbols` host
locale a keycode becomes the symbol it types: `&kp N1` is `1`, and shifted `!`.

Some keys hold more than this syntax can write, such as an adaptive key's branches or a tap-hold
with its own timing. For those the field starts empty and says so; the controls above still edit all
of it, and a binding typed into the field replaces it.

## Moving keys around

Drag a key onto another to swap the two. Hold `Alt` while dropping to copy it instead.

The same moves work without dragging. **Swap with…** and **Copy to…** in the editor ask you to
tap the other key. **Send to layer…** puts a key at the same place on another layer, picked from
a list, and so is the way to move a key to another layer. `Delete` on a selected key
makes it do nothing (*Nothing* `∅`), on any layer, rather than let the layer below show through;
**Clear**, in the editor, does the same for a key with a binding of its own, and is greyed out on
one that takes its layer's default.

### Several keys at once

Shift-click a key to select it beside the ones already selected, and again to take it back out; on
a phone, rest your finger on it and lift. With more than one key selected, the editor gives way to
what can be done with all of them: **Send to layer…** and **Copy to layer…** put them on another
layer at the same places, **Make transparent** lets the layer below show through them, and
**Clear** makes them do nothing, as `Delete` does on any one of them. Each is one change, so one **Undo** takes it back, and the keys stay
selected for the next.

## Layers

The layer navigator above the board switches between layers: ‹ and › step through them, the
layer's name is written in its colour, and the counter under it says which of how many is shown.
Swipe the board sideways to do the same on a phone, or press `←` and `→` while the navigator has
focus. The same navigator shows the layers of a card in **Library** and of each layout in
**Compare**. A key's colour says which layer it reaches.

The **Layers** panel lists them in order, and does everything else with them:

- **Rename** a layer in its name field, or double-click its name in the navigator (press and hold
  it on a phone, or `F2` on the keyboard).
- **Reorder** with the arrows, or by dragging its row. The base layer stays first.
- **Duplicate** (⧉) copies a layer, with all its keys, right after it.
- **Colour**, under the layer's name, picks the colour its name and the keys that reach it are
  drawn in. **Automatic** follows the layer's place in the list; each of the others keeps a shade
  for the light theme and one for the dark, so legends stay readable in both.
- **Remove** (✕) deletes a layer. It refuses while a key, combo or behaviour still reaches the layer,
  and names each one, so nothing is left pointing at a layer that is gone.
- **+ layer** adds one at the end, whose keys all let the layer below show through.

### The keys that reach a layer

On any layer but the base, the keys you hold or tap to get there carry a ring in the layer's
colour, and `held` or `tapped` along the bottom: the thumb held for Symbols, the one-shot key
tapped for Alpha 2, the `ç` macro that turns on Ç extension, an alt repeat branch that arms a
layer, both keys of the combo tapped for Accents. They are found from the layout itself, so they change as you edit: give a key something else
to do and it stops being marked, even where the layout names it as a way in. Select one, or read
the list under the board, to see where it is pressed and when.

Several keys can reach a layer the same way, say three one-shots for Alpha 2. Each word is then
typed with the one that suits it: the one that makes the fewest same-finger pairs with the keys
around it, two in a row first and then one apart, and then the one with less effort. The first of
them is pressed when nothing tells them apart. A key held for a layer is always pressed as found.

### Default layers

A new layout can start with more layers, the same on every board: **Numbers**, **Symbols**,
**Accents**, and **Extras** where the board needs it. Below, the left hand reads from the pinky to
the inner column (P R M I C), the right from the inner column to the pinky, and `·` lets the layer
below show through.

**Numbers** and **Symbols** are Magic Romak's on the 24 keys most boards have. The pinky's top and
bottom keys and the inner column add what has no room there: currency and ordinals on Numbers, for
the left hand while the right types the digits, and on Symbols each mark beside its look-alike
(`;` by `:`, `¿` by `?`, `¡` by `!`, `«` and `»` around `<` and `>`).

| Numbers | P | R | M | I | C | | C | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Top | € | `\` | `{` | `}` | £ | | · | 7 | 8 | 9 | ° |
| Home | `,` | `&` | `(` | `)` | § | | · | 4 | 5 | 6 | `.` |
| Bottom | ª | `\|` | `[` | `]` | º | | · | 1 | 2 | 3 | · |

| Symbols | P | R | M | I | C | | C | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Top | · | `~` | `#` | `'` | · | | · | `%` | `=` | `:` | `;` |
| Home | `@` | `^` | `$` | `"` | · | | ¿ | `?` | `-` | `+` | `_` |
| Bottom | « | `<` | `>` | `` ` `` | » | | ¡ | `!` | `/` | `*` | · |

`0` is on a thumb of the hand that holds Symbols: the other one, or that one's tap where it has no
other. With no thumb there, it is the inner column's bottom key, beside `1`; on a row-stagger
board, the key past `°`.

**Accents** holds the dead keys; the letters no accent makes, `ñ` `ç` `œ` `æ` `ß`; and the
accented letters the texts the app comes with use most, each a key of its own, a press less than
its accent and the letter, German's `ä` `ö` `ü` among them. `qu` is there too. With the base
layer's letters, that writes every language the app has a text for. Each key is where it costs
least for how often it is used: counted over all the texts together, the most used get the
cheapest keys in Effort. The dead keys and the letters of their own stay on the finger keys every
board has; the letters used least, which a dead key also makes, are on the pinkies' top and bottom
keys and the inner column. `qu` and `ê` trade places, so the home row is accented letters only, and
`ê` keeps the place on the core that `qu` would have had. In bold, the dead keys:

| Accents | P | R | M | I | C | | C | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Top | ö | **~** | ñ | **¨** | ò | | ì | ß | qu | **´** | ä |
| Home | ü | à | á | ê | ô | | ù | é | ó | ã | í |
| Bottom | õ | æ | œ | ç | â | | î | è | **^** | **`** | ú |

`û`, `ë`, `ï` and `ÿ` are their accent and the letter.

**Extras** is there only on a board that lacks some of those outer keys, Magic Romak's 24 keys
say: it holds the symbols that had nowhere else to go, on the keys of the 24 below. It comes on
while Numbers and Symbols are both held.

| Extras | P | R | M | I | | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|
| Top | | · | € | · | | ° | · | `;` | |
| Home | ª | · | £ | · | | ¿ | · | · | º |
| Bottom | | « | » | · | | ¡ | · | § | |

The left inner thumb types space and, held, turns on Numbers. The right inner thumb, held, turns on
Symbols; held from Numbers, it turns on Extras, or Symbols where there is no Extras. Accents comes
on for one key from the base layer, by the left ring and middle fingers' home keys, LHR and LHM,
pressed together: a combo, drawn between them, the same on every board. A board without those
thumbs gets the same layers arranged to fit it, and keys beyond the ones the layers use let the
layer below show through. A board with no bottom row keeps `1 2 3` on the left home row, puts on
Extras what the bottom rows carried, and fills Accents with the dead keys, the letters of their own
and the symbols left over, on its thumbs too; every accented letter there is its accent and the
letter. The board shows where everything went.

Every layout that comes with the app has them too, with all of its own keys where they were. The key
that types space also holds Numbers, and a thumb of the other hand holds Symbols: the innermost one
with nothing on it, or else the innermost, still typing what it typed. Accents is the same combo on
every one of them, so none is ranked better or worse for where its thumbs happen to be free.
Magic Romak and Romak keep their own thumbs on Numbers and Symbols and, as in their author's keymap,
combos on Alpha 2 for the accents it has no key for, with `?` and `!` typing `¿` and `¡` when held.
Magic Romak reaches Accents from Alpha 2's right outer thumb.

### Which layer wins

When two layers are on at once, a key comes from the one further down the list. A key that is
transparent on that layer falls through to the next one up, and every key falls back to the base
layer in the end, which is why it stays first.

## Combos, typing paths and the rest

The other panels hold what is not on a single key:

- **Features** turns on sentence case and caps word.
- **Geometry** shows the board, which is chosen when a layout is imported or created and cannot
  be changed here, and says which keys are space and shift, the kind of shift, and how doubled
  letters are typed.
- **Combos** are keys pressed together. **pick on board**, then tap the keys; the output takes
  the same syntax as **Or type**, and can be left empty. A combo added opens in the **combo
  editor**, in the key editor's place; so does a combo's pill on the board, or **edit** on its row.
  A combo can be any kind of key but Transparent, from the same tiles a key has: a tap-hold, an
  adaptive key, a macro, a tap dance, a morph, a layer and the rest. **From this layout** and **Or
  type** work as they do for a key. Under them are its keys (**Pick again on the board**, tap the
  new keys, then **Use these keys**), the layers it works on and its role. One for typing is
  pressed by the analysis as a key would be: it types, adapts to the key before it, accents the
  next letter, turns a layer on, or, held, does what its hold does; a tap dance on a combo types
  its second part when its keys are pressed together twice. The board draws it between its keys,
  its hold after a slash, as `? / ¿`. Every combo in the list can also be changed where it stands:
  type another output in its field (what the syntax cannot read is refused, and the combo keeps
  its output; a combo whose output the syntax cannot write, such as a tap-hold, shows it there and
  is edited in the combo editor), **pick again** and tap its new keys, then **Use**, tick the
  layers it works on (one at least), or click its role to switch between typing and command. Each
  change is one edit that Undo takes back. A change is refused, with its reason, when it would
  leave fewer than two keys, a key or layer the layout does not have, or the same keys as another
  combo on one of its layers.
- **Behaviors** lists the layout's special features first, one group each: adaptive keys, alt
  repeats, macros, mod morphs and its own named behaviours. Each names its layer and key, or its
  combo; pick one to turn the board to that layer with the key selected, or to outline the combo's
  keys. Under the list are the named bindings keys refer to, such as `&altRepeat`, as JSON:
  **Apply behaviors** applies them.
- **Typing paths** list the other ways a character can be typed. Left alone, a character is typed
  the cheapest way from where the typist is: the fewest presses, then the one that leaves no layer
  key held, then the one that makes the fewest same-finger pairs with the keys before it in the
  word, then the less effort. Drag or use the arrows to put one way first instead, and that order
  is kept.
- **JSON** shows the whole layout as LayerBench JSON or as a keymap-drawer file.

## On a phone

Everything works by tapping. Selecting a key opens the editor right under the board, and the
board scrolls away with the page as you work through the editor, leaving it the screen; scroll
back up for the next key. Tiles and chips are sized for a finger.

To drag a key, rest your finger on it for a moment first.
**Swap with…**, **Copy to…** and **Send to layer…** do the same without dragging. Resting a finger
on a key and lifting it without moving adds it to the keys selected, to [move or clear several at
once](#several-keys-at-once). The on-screen keyboard stays down until you tap a text field, such
as **Or type**.

A quick swipe up or down scrolls the page, and a quick swipe sideways on the board turns it to the
next or the previous layer. A board wider than the screen pans under your finger first; swipe from
its edge to turn the layer.

## Keyboard shortcuts

With the board focused, the arrow keys move between keys; the board is one stop for `Tab`, not
one for each key.

| Key | Does |
|---|---|
| any character | starts the key's binding with it, in **Or type** |
| `Enter` · `F2` | puts the whole binding in **Or type**, ready to replace |
| `Space` | selects the key; with `Shift`, adds it to the keys selected, or takes it out |
| `Delete` · `Backspace` | makes the key do nothing, or every key selected |
| `←` · `→` | on the layer navigator, goes to the previous or the next layer; on the panels' tabs, to the previous or the next panel |
| `F2` | on the layer's name in the navigator, renames the layer |
| `Alt`+`S` | starts a swap; then `Enter` or a click on the other key |
| `Escape` | cancels a swap or a combo pick; then clears an outlined pair; then closes the editor |
| `Ctrl`/`Cmd`+`Z` | undoes; with `Shift` as well, redoes |
