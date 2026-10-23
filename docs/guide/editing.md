# Editing a layout

A layout is edited where it is analyzed, in **Analyze**: the board shows one layer at a time, with
the layer navigator under it. Tap or click a key to select it. The editor beside the board (under it, on
a phone) says what the key does, what it adds to the numbers, and lets you change it. Tap or click the
board between the keys to put the selection away, cancel a swap or a [missing key](#missing-keys)
tapped, or clear an outline; a drag or a swipe does not.

1. **Select a key** on the board.
2. **Choose what it does** from the tiles: *Symbol*, *Layer*, *Modifier*, *Tap-hold* and so on.
3. **Fill in the rest**, such as the symbol it types, the layer it reaches or what a hold does.

Every change is kept as you make it, so there is nothing to apply. **Undo** (↶) and **Redo** (↷),
under the board beside **Heat**, step back and forth through your changes. **Save**, beside the
layout's name at the top, keeps it in **Library**, and until then the name is marked *unsaved*. On a
layout that is not yours yet, such as one that comes with the app, the first **Save** makes a copy
in your custom layouts and asks what to call it, or, on one that comes with the app or a community
layout, [proposes your change](saving.md#proposing-a-change) to it; after that, **Save** keeps your
edits to the copy. A layout's link follows its name: rename one already in **Library** and save it,
and it moves to a link of its new name, so a link to it from before no longer opens it.

The address follows your edits too: a moment after each one, the link holds the layout as it now
is. Reload the page, or go back to it, in the same tab, and the edits are still there, still
unsaved, and saving them saves the layout they are edits of rather than a copy beside it. Opened in
another tab or browser, the same link is a layout of its own: it is not marked *unsaved*, and saving
it makes a copy. Once saved, the link still carries the layout whole, so it can be sent; opened
where that layout is saved and unchanged, it is the custom layout again. A layout opened from
**Open in analyzer**, or from someone's link, is not in **Library** until you save it, and its first **Save** asks for a name. Picking another layout from **Layout** asks first when there is
something unsaved.

**Settings**, in the bar at the top, holds the layout's author and description, its **Link** to
where it comes from (optional; an address starting `http://` or `https://`, which the Library shows
on its card), the languages it is for, and the choices the numbers are worked out with:
**Corpus**, **Mix with**, **Rules**, **Counts**, the **Sample**, the feature switches, **Space**
and **Shift**, the same as in every view that analyzes, and whether the board draws its combos. The line beside it says what is chosen. A feature switched off changes
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

The tiles after them are the rest: alt repeat, tap dance, morph, caps word, sentence space, Unicode
and dead key.
[Special keys](special-keys.md) explains each of them. On a phone they wait under **More**, which
then shows the kind chosen from them.

A kind that needs a ZMK module says so under its controls, and links the module;
[In ZMK](special-keys.md#in-zmk) lists what ZMK runs each kind with.

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
shows every one of them.

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
| `&trans` · `&none` · `&key_repeat` · `&caps_word` · `&sentence_space` | the rest |

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

### Missing keys

Under the board, the **Missing keys** tray holds the characters the layout cannot type: those of
the text, most frequent first, then the letters the layout's language needs. Drag one onto a key,
or tap it and then tap the key, and the key types that character instead. Whatever the key typed
before joins the tray, unless another key still types it. Each placement is one change, so one
**Undo** brings the old key back, and the tray with it. `Escape` puts down a character tapped.

## Layers

The layer navigator under the board switches between layers: ‹ and › step through them, the
layer's name is written in its colour, and the counter under it says which of how many is shown.
Swipe the board sideways to do the same on a phone, or press `←` and `→` while the navigator has
focus. The same navigator shows the layers of a card in **Library** and of each layout in
**Compare**. A key's colour says which layer it reaches.

The **Layers** panel lists them in order, and does everything else with them:

- **Rename** a layer in its name field, or double-click its name in the navigator (press and hold
  it on a phone, or `F2` on the keyboard).
- **Id**, under the name, is what links and the keys that reach the layer call it, as a keymap's
  layer has a name of its own (`alpha1`, `num`). Changing it changes every key, combo and setting
  that names the layer, so nothing is left pointing at the old one; an id another layer has is
  refused.
- **Reorder** with the arrows, or by dragging its row. The base layer stays first.
- **Duplicate** (⧉) copies a layer, with all its keys, right after it.
- **Colour**, under the layer's name, picks the colour its name and the keys that reach it are
  drawn in. **Automatic** follows the layer's place in the list; each of the others keeps a shade
  for the light theme and one for the dark, so legends stay readable in both.
- **Remove** (✕) deletes a layer. It refuses while a key or combo still reaches the layer, and names
  each one, so nothing is left pointing at a layer that is gone.
- **+ layer** adds one at the end, whose keys all let the layer below show through.
- **Conditional layers**, under the list, are layers that come on by themselves while every layer
  they wait for is on, as ZMK's conditional layers: Extras while Numbers and Symbols are both held.
  **+ condition** adds one, bringing on a layer nothing else reaches where it can; pick the layers
  it waits for, up to four, and the layer it brings on.
  The base layer is always on, so it neither waits nor is waited for, a layer never waits for
  itself, and a layer that comes on by a condition is not one another waits for. A layer comes on by
  one condition at most, and by no other way: a key or combo that reaches it no longer does, and
  the panel names them. A layer later in the list is drawn over an earlier one, so one brought on
  should come after the layers it waits for; the panel says so when it does not.

### The keys that reach a layer

On any layer but the base, the keys you hold or tap to get there carry a ring in the layer's
colour, and `held` or `tapped` along the bottom: the thumb held for Symbols, the one-shot key
tapped for Alpha 2, the `ç` macro that turns on Ç extension, an alt repeat branch that arms a
layer, the thumb or both keys of the combo tapped for Accents. They are found from the layout itself, so they change as you edit: give a key something else
to do and it stops being marked, even where the layout names it as a way in. Select one, or read
the list under the board, to see where it is pressed and when.

A thumb holding a layer on can press nothing else, so on that layer the other thumb keys of its hand
are out of reach: where every way onto a layer holds a thumb of one hand down, that hand's thumb keys
type nothing there. A key that only arms, toggles or switches to the layer is let go, and blocks
nothing. On Numbers the thumb keys of the hand holding it type nothing; on Extras, Numbers and
Symbols both held, no thumb key does. The analysis counts what only those keys carry as
a symbol the layout cannot type, and the default layers put nothing on them.

Several keys can reach a layer the same way, say three one-shots for Alpha 2. Each word is then
typed with the one that suits it: the one that makes the fewest same-finger pairs with the keys
around it, two in a row first and then one apart, and then the one with less effort. The first of
them is pressed when nothing tells them apart. A key held for a layer is always pressed as found.

### Default layers

A new layout can start with more layers, the same on every board: **Numbers**, **Symbols**,
**Accents**, and **Extras** where the board needs it. Below, the left hand reads from the pinky to
the inner column (P R M I C), the right from the inner column to the pinky, and `·` lets the layer
below show through.

They are for a layout whose authors define no layers past its letters. A layout whose author's
keymap defines its own, numbers and symbols say, keeps those instead, as its author has them: on the
keys its board has, with the keys and combos that reach them and the combos its author types
symbols and accents with. It has none of the default layers, nor a key to reach them, and nothing is
added to what its author's layers type: a character they leave out, it cannot type, until you add it
in the editor. [The layouts that come with the app and keep their authors' layers](#layouts-with-their-authors-layers)
are listed below.

**Numbers** and **Symbols** are Magic Romak's on the 24 keys most boards have. The pinky's top and
bottom keys and the inner column add what has no room there: currency and ordinals on Numbers, for
the left hand while the right types the digits, and on Symbols each mark beside its look-alike
(`;` by `:`, `¿` by `?`, `¡` by `!`), `«` above `»` in the left inner column, and Turkish `ı`
above `¿`.

Pairs stay together: the brackets `()` `[]` `{}` `<>` `«»` and the look-alikes `; :`, `? ¿` and
`! ¡` are on one layer, side by side: neighbours in a row, or `«` and `»` in a column. A board with
no key for one half moves the pair to Extras whole. The half that had a key leaves it, and on Symbols
that key types the most used symbol left without one. Magic Romak's keymap keeps three pairs apart
on the 24 keys, and so do these layers: `\` on Numbers and `/` on Symbols, `+` between `-` and `_`,
and `+` below and beside `=`.

| Numbers | P | R | M | I | C | | C | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Top | € | `\` | `{` | `}` | £ | | · | 7 | 8 | 9 | ° |
| Home | `,` | `&` | `(` | `)` | § | | · | 4 | 5 | 6 | `.` |
| Bottom | ª | `\|` | `[` | `]` | º | | · | 1 | 2 | 3 | · |

| Symbols | P | R | M | I | C | | C | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Top | · | `~` | `#` | `'` | « | | ı | `%` | `=` | `:` | `;` |
| Home | `@` | `^` | `$` | `"` | » | | ¿ | `?` | `-` | `+` | `_` |
| Bottom | · | `<` | `>` | `` ` `` | · | | ¡ | `!` | `/` | `*` | · |

`0` is on a thumb of the hand that holds Symbols: the other one, or that one's tap where it has no
other. With no thumb there, it is the inner column's bottom key, beside `1`; on a row-stagger
board, the key past `°`.

**Accents** holds the dead keys; the letters no accent makes, `ñ` `ç` `œ` `æ` `ß`; and the
accented letters the texts the app comes with use most, each a key of its own, a press less than
its accent and the letter, German's `ä` `ö` `ü` among them. `qu` is there too. With the base
layer's letters, that writes every language the app has a text for. Its 30 keys are in groups that
are easy to remember. The right hand types the accented vowels: a row for each accent, grave on top,
acute on home and circumflex below, and a column for each vowel, `u a e o i` from the inner column
out, with `^` where `û` would be. The left hand has German's letters on its home row, the tilde's
letters and `ç` below them, and the ligatures with `qu` and `ß` on top, the dead keys at the ends of
the rows. In bold, the dead keys:

| Accents | P | R | M | I | C | | C | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Top | **`** | ß | qu | œ | æ | | ù | à | è | ò | ì |
| Home | ö | ä | ü | ñ | **´** | | ú | á | é | ó | í |
| Bottom | **¨** | õ | ç | ã | **~** | | **^** | â | ê | ô | î |

`û`, `ë`, `ï` and `ÿ` are their accent and the letter. A layout whose base layer types more of the
vowels with the left hand than with the right, Dvorak say, has Accents mirrored, the vowels on the
left: what follows an accented vowel is most often a consonant, under the other hand.

**Extras** is there only on a board that lacks some of those outer keys, Magic Romak's 24 keys say.
It comes on while Numbers and Symbols are both held: both inner thumbs, in either order. It takes
what has no key elsewhere, the pairs first and then the symbols on their own, most used in the texts
first, and starts on the prime keys: the least effort, the home row first among keys that cost the
same. Each pair takes the two neighbours in a row that cost least. The keys of Accents the board has
no key for follow, each on the free key nearest its place on Accents. Extras has no thumb keys to
give, both thumbs holding: what has no room on its fingers' keys goes on a free thumb of Accents,
which comes on for one key and so leaves the thumbs free, the thumbs of its own hand first. On a new
layout on Magic Romak's 24 keys that is `^` and `î`, on Accents' right inner and outer thumbs. On a
new layout there, the symbols:

| Extras | P | R | M | I | | I | M | R | P |
|---|---|---|---|---|---|---|---|---|---|
| Top | | · | ª | · | | · | £ | · | |
| Home | ¡ | `!` | « | » | | `:` | `;` | ¿ | `?` |
| Bottom | | · | · | § | | ı | · | · | |

`?`, `!` and `:` went with `¿`, `¡` and `;`, which those keys have no room for, and on Symbols
their keys type `€` where `?` was, `°` where `!` was and `º` where `:` was. Magic Romak itself
keeps Symbols as its keymap has it, and has no Extras (see below).

The left inner thumb types space and, held, turns on Numbers. The right inner thumb, held, turns on
Symbols; held from Numbers, it turns on Extras, or Symbols where there is no Extras. Where there is
Extras, the left inner thumb held from Symbols turns it on too, so holding both inner thumbs turns
Extras on whichever goes down first. Accents comes on for one key from the base layer, by the outer
main thumbs, L1 and R1, pressed together: a combo, drawn between them. A board with one thumb a hand
presses its two thumbs, and a row-stagger board, with one space bar for both, the left ring and
middle fingers' home keys, LHR and LHM. On a board with all of Accents' 30 main keys, thumbs press
none of them, so the thumb combo is never a same-finger pair with the accent after it; on a new
layout on Magic Romak's 24 keys, `^` and `î` are on Accents' right thumbs, R1 among them. A board
without those thumbs gets the same layers arranged to fit it, and keys beyond the ones the layers
use let the layer below show through. A board with no bottom row keeps `1 2 3` on the left home row,
puts `;` beside `:` where `=` was, and `=` and `ı` on Symbols' left thumbs, the space key, which
still holds Numbers there, and the one beside it, which the right thumb holding Symbols leaves free:
no finger key is left for them, so space is typed with Symbols released there. It puts on Extras
what the bottom rows carried, and fills Accents with the dead keys, the letters of their own and the
symbols Extras has no room for, on its thumbs too; every accented letter there is its accent and the
letter. The board shows where everything went.

Every layout that comes with the app whose authors define no layers has them too. Of those, the
Standard and Thumb Alpha ones, Romak included, also share their main thumbs, the two
innermost of each hand, so that what tells them apart is their letters. Held, left to right, the
main thumbs give Shift, Numbers, Symbols and Shift. Tapped, they type Repeat, which types the last
key again, then space, then the layout's thumb letter or
nothing, and the right outer one turns on Accents for one key. Where a layout's author put space or a
letter on a thumb, it stays there, and the main thumbs left tap Accents, then Repeat, from the right:
RSTHD taps Repeat, `e`, space and Accents. A second thumb letter takes the left outer thumb,
and Repeat a key of the base layer that a symbol left, as on Hands Down Neu. A main thumb with
nothing to tap shows only what it holds, along its bottom, as Qwerty's Symbols thumb does. Their
other thumb keys go, and their base layers keep no symbol but `'` `,` `.` `;`: the rest are on
Symbols or Extras.

The Special layouts with the default layers keep every key they have. Like every other layout with
them, they hold Numbers on the left inner thumb and Symbols on the right inner one, each still
typing what it typed, so Extras is both inner thumbs on every layout that has it. Bird and
Nordrassil type space on L1, beside the inner thumb, which holds Numbers. An inner thumb that is a
tap-hold already cannot hold another layer; the key that types space then holds Numbers, and the
innermost thumb of the other hand with nothing on it Symbols. Accents is the combo on two thumbs,
as on a new layout.

Where an author's keymap has a key that does what the analysis does not simulate, such as Escape,
Enter, Backspace, Tab or T-34's key for a Shortcuts layer LayerBench does not have, the key is
transparent, as one left unset is; under a hold it taps nothing, and shows only what it holds.

Every layout that comes with the app has home row mods too: held, the home row's finger keys give
Gui, Ctrl, Alt and Shift from the left pinky in, and Shift, Alt, Ctrl and Gui from the right index
out. Magic Romak holds its author's keymap's instead: Ctrl, Alt and Shift from the ring finger in,
and on the bottom row Shift with Gui under the left ring and middle fingers and Gui under the index
fingers. So do the layouts whose authors' keymaps hold their layers on the home row: Magic Sturdy,
the three Hands Down with their own layers, and Ben Vallack Piano, its modifiers on the top row.
Both hands hold the left modifiers, as both Shift thumbs do. Tapped, each key types what it typed, a
letter or anything else: Uno's space holds Alt. They are on the base layer only. In the Shift case
mode, a Standard or Thumb Alpha layout types a capital holding the right Shift thumb, but one on
Accents or on a right thumb holding the left, as a thumb holding Shift presses nothing else. A
layout with no Shift key of its own types a capital holding a Shift thumb if it has one that is
free, and otherwise the home row Shift of the other hand, where the capital does not press that key.

#### Layouts with their authors' layers

These layouts that come with the app keep their authors' layers, in place of the default ones. Each
is drawn on the board LayerBench has it on: what its author put on keys that board lacks, a number
row or an outer column, is left out, as on its base layer. So are the keys that type nothing the
analysis counts, the holds that reach a layer that types nothing (navigation, functions, media), a
toggle to a layer a hold reaches too, a modifier held on a layer's key, and a dead key the analysis
composes nothing with (Hands Down's macron, ring and cedilla, whose combos type their letter only
when held). A key on a thumb that a held thumb blocks types nothing there. Their authors' layers
count toward their category, as any layer of their own does: Hands Down's Symbols has `z` and `q`,
a second alpha layer, and Enthium's Numbers has letters too and its Symbols types three backticks
at once, a macro, so both are Special. The last column is what each cannot type of the digits, the
default layers' symbols and German's letters; the accented letters only some dead key makes go
with `ñ` `ç` `ä` `ö` `ü`.

| Layout | Its author's layers | Reached by | Cannot type |
|---|---|---|---|
| Magic Romak | Numbers, Symbols | space held, the Alpha 2 thumb held | £ § « » ı ß œ æ |
| Magic Sturdy | Symbols, Numbers | `t` or `a` held, `n` held | € £ § ª º ° `?` « » ı ¿ ¡ ß œ æ ñ ç ä ö ü |
| Enthium | Numbers, Symbols | L1 (Tab in its keymap) held, `r` held | `&` `(` `)` € £ § ª º ° « » ı ¿ ¡ ß œ æ ñ ç ä ö ü |
| Hands Down Gold, Promethium, Vibranium | Symbols, Numbers, Numpad | space held; L1 (Backspace in its keymap) or `,` (`f` on Promethium) held; `b` (`k`) held | `\` ª º « » ı ¿ ¡ ß |
| T-34 | Swedish, Numbers, Symbols, Specials | `l ( )` toggles it; both inner thumbs, a num word; `t h` or `n a` held; R1, one-shot | € £ § ª º ° « » ı ¿ ¡ ß œ æ |
| Finch | Symbols and numbers | `e` held | € £ § ª º ° `~` `^` `"` `?` « » ı ¿ ¡ ß œ æ ñ ç ä ö ü |
| Cem Aksoylar's Colemak-DH | Symbols | the right inner thumb held | `{` `}` `\|` € £ § ª º ° `~` `"` `<` `>` `:` `?` « » ı ¡ ß œ æ ñ ç ä ö ü |
| Ben Vallack Piano | Symbols 1 and 2, Numbers, Alpha 2 shifted | middle fingers held, ring fingers held, pinkies held; R0, one-shot | € § ª º ° `_` « » ı ¿ ¡ ß œ æ ñ ç ä ö ü |

Their authors' combos type more. Magic Sturdy's type `\` and `;`. Hands Down's type the marks with
no key and the dead keys `´` `` ` `` `^` `¨` `~` on the base layer, each held for a second mark or
for the letter the accent most often makes (`é` `è` `ê` `ü` `ñ`, and `ç` `å` `ō`), and on the numpad
pairs of digits held for a symbol. T-34's type the digits and most symbols with a thumb and a
letter, and `å` `ä` `ö`; its Specials has the dead keys. Finch's type `{` `[` `(` `)` `]` `}`, `/`
`\` and `` ` ``, and `<` and `>`, held for arrows. Cem Aksoylar's type `(` `)` `[` `]`, `'` `` ` ``,
`/` `\` and `;`, and `!` on Symbols. Ben Vallack Piano's shifted Alpha 2 has Alpha 2's capitals and
a comma where Alpha 2 has its full stop.

The other layouts take the default layers. Their sources define only their letters, but for RSTHD,
whose author's ErgoDox keymap puts its digits on a number row and reaches its layers from thumb
keys thirty-four keys lack, Hands Down Neu, whose author's firmware carries the Hands Down layers
for a later Neu with other letters and thumbs, and Nordrassil, whose author publishes the rest of
the keymap only outside its repository.

Magic Romak is its author's keymap, and has no Extras and no Accents, as the keymap has none. It
keeps its own thumbs on Numbers and Symbols, and the keymap's combos type what those two layers
carried: on Alpha 2, the dead keys `´` `` ` `` `^` `~` `¨` and `à`; on Symbols, `€` (RTR, RTM and
RTI together); on Numbers, `°` (RBR, RBM and RBI) and `º`, or `ª` when held (RHR, RHM and RHI).
`¿` and `¡` come from holding Alpha 2's `?` and `!` combos, a hold this model gives them. It cannot
type `£` `§` `«` `»` `ı` `ß` `œ` `æ`, which the keymap has no way to, so French lacks `œ`, `æ` and
its quotes and German its `ß`.

### Which layer wins

When two layers are on at once, a key comes from the one further down the list. A key that is
transparent on that layer falls through to the next one up, and every key falls back to the base
layer in the end, which is why it stays first.

## Combos, typing paths and the rest

The other panels hold what is not on a single key:

- **Features** turns on sentence case and caps word. Sentence case needs a ZMK module, which it
  links.
- **Geometry** shows the board, which is chosen when a layout is created or read with **Import**,
  and cannot be changed here, and says which keys are space and shift, the kind of shift, and how
  doubled letters are typed. Under **One-shot layers** and **One-shot keys** it says how the
  layout's one-shots end: as the next key goes down or not, whether they stay on while a modifier
  is pressed, and after how many milliseconds unused.
- **Combos** are keys pressed together. **pick on board**, then tap the keys; the output takes the
  same syntax as **Or type**, and can be left empty. A combo added opens in the **combo editor**, in
  the key editor's place; so does a combo's pill on the board, or **edit** on its row. A combo can
  be any kind of key but Transparent, from the same tiles a key has: a tap-hold, an adaptive key, a
  macro, a tap dance, a morph, a layer and the rest. **From this layout** and **Or type** work as
  they do for a key. Under them are its keys (**Pick again on the board**, tap the new keys, then
  **Use these keys**), the layers it works on, its role, and its timeout, how long its keys have to
  go down together. One for typing is pressed by the analysis as a key would be: it types, adapts to
  the key before it, accents the next letter, turns a layer on, or, held, does what its hold does; a
  tap dance on a combo types its second part when its keys are pressed together twice. The board
  draws it between its keys, its hold after a slash, as `? / ¿`. Every combo in the list can also be
  changed where it stands: type another output in its field (what the syntax cannot read is refused,
  and the combo keeps its output; a combo whose output the syntax cannot write, such as a tap-hold,
  shows it there and is edited in the combo editor), **pick again** and tap its new keys, then
  **Use**, tick the layers it works on (one at least), or click its role to switch between typing
  and command. Each change is one edit that Undo takes back. A change is refused, with its reason,
  when it would leave fewer than two keys, a key or layer the layout does not have, or the same keys
  as another combo on one of its layers.
- **Behaviors** lists the layout's special features, one group each: adaptive keys, alt repeats,
  macros and mod morphs. Each names its layer and key, or its combo; pick one to turn the board to
  that layer with the key selected, or to outline the combo's keys.
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

To drag a key, rest your finger on it for a moment first. A [missing key](#missing-keys) is
dragged straight away, or tapped and then the key tapped.
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
| `Enter` · `Space` | with a [missing key](#missing-keys) tapped, puts it on the key |
| `Escape` | cancels a swap, a missing key tapped or a combo pick; then clears an outlined pair; then closes the editor |
| `Ctrl`/`Cmd`+`Z` | undoes; with `Shift` as well, redoes |
