# Special keys

A key can do more than type a letter. This page shows how each kind of key is drawn on the board,
and how to make it in the editor, in **Analyze**: select a key, then choose its tile.

Every kind of key the editor makes is one ZMK can run. Most are ZMK's own behaviours; a few need a
ZMK module, which the editor names and links, as [In ZMK](#in-zmk) lists.

| On a key | Means |
|---|---|
| the large legend | what a tap does |
| `✦` or `TD` as the large legend | a key with nothing of its own to type: an adaptive key with no default, an empty tap dance |
| a small word along the bottom | what a hold does, or how a layer comes on: `1×` for one key, `toggle`, `switch`, `auto`, and `hold` under a layer that a tap dance, a morph or an adaptive key holds |
| nothing in the centre, a small word along the bottom | a key that only holds, a layer while it is held (`&mo`) or a modifier: drawn as a tap-hold that taps nothing |
| a small legend at the top | what it types with Shift, where that is not just the capital |
| `✦` `⋯` `TD` `U+` in the corner | an adaptive key, a macro, a tap dance, a Unicode character |
| a colour | the layer the key reaches, matching the colour of that layer's name in the layer navigator; chosen under **Layers**, or set by the layer's place in the list |
| an accent in a colour of its own, over a dotted line | a dead key: it types nothing itself and accents the next letter; a combo's box in that colour arms an accent |
| a ring inside the key, `held` or `tapped` along the bottom | on a layer above the base: the key held or tapped to get to this layer |
| `▽` in a dashed outline | transparent: the key of the layer below shows through |
| a small box on the gap between keys | a combo that types: press those keys together. It shows what it types, and what it does held under that; select it to edit it as any kind of key but transparent. Combos on three or more keys, on keys apart, or with no room on their gap, are under the button beside **Heat** |
| a number in the corner | more than fits on the key; the list under the board says it all |
| a grey legend | a key kept from an import, drawn but not simulated |

`⇧` `⌃` `⌥` `⌘` are Shift, Control, Alt and Command, `⟳` is repeat and `⇪` is caps word.

## Holds and one-shots

A key can do one thing when tapped and another while held, or act once, on the next key only.

### Tap-holds and home row mods

A **Tap-hold** key has two parts. The **Tap** is what a quick press does, usually a letter; the
**Hold** is a layer or a modifier while the key is held down. A letter on the home row with a
modifier underneath is a home row mod: every layout that comes with the app holds Gui, Ctrl, Alt and
Shift on its home row from the left pinky in, mirrored on the right, but Magic Romak and the layouts
whose keymaps hold their layers on the home row, which hold their authors'. A hold may give several
modifiers together, under **Held with**: Shift and Gui at once, say, as ZMK's `LS(LGUI)`. The Tap
can also be an adaptive key or an alt repeat, so a thumb can adapt when tapped and reach a layer
when held.

**Timing**, under the hold, sets the tapping term, how long a press must last to count as a hold,
and the flavor, ZMK's rule for telling a tap from a hold when another key comes in between. Its
[hold-tap documentation](https://zmk.dev/docs/keymaps/behaviors/hold-tap) explains both.

### One-shot layers and modifiers

A one-shot works on the next key only, then turns itself off, so the layer or modifier does not
have to be held. On the board it reads `1×`. Choose **Layer** or **Modifier**, then **One-shot**.

A one-shot ends with the next key: a one-shot layer with the next key pressed, a one-shot modifier
with the next key that types something. Each key is pressed and let go before the next, so whether
ZMK would end it as that key goes down or as it comes up (`quickRelease`, among the layout's
behaviour defaults, set in the **Geometry** panel) makes no difference to the numbers. A modifier
pressed in between leaves it armed when those defaults say to ignore modifiers, as ZMK does. ZMK's
[sticky layer](https://zmk.dev/docs/keymaps/behaviors/sticky-layer) and
[sticky key](https://zmk.dev/docs/keymaps/behaviors/sticky-key) pages describe the options.

### Layer keys

A **Layer** key turns another layer on in one of five ways:

| Comes on | The layer is on | ZMK, QMK |
|---|---|---|
| Momentary | while the key is held | `&mo`, `MO` |
| One-shot | for the next key only | `&sl`, `OSL` |
| Toggle | until the key is pressed again | `&tog`, `TG` |
| To layer | from now on, with every other layer off but the base | `&to`, `TO` |
| Auto | until the word ends | the module [urob/zmk-auto-layer](https://github.com/urob/zmk-auto-layer) |

## Repeat and alt repeat

A **Repeat** key `⟳` presses the key before it again, so a doubled letter is typed with two
fingers instead of one. It is ZMK's `&key_repeat`.

An **Alt repeat** key repeats as well, but after chosen keys it types something else: after `a`,
say, it could type `o`. Each **branch** names the keys it follows and what it types after them. On
the board it reads `⟳` with a `✦`. A repeat key becomes one with **Make it an alt repeat**, and a
layout can have as many as it needs. An alt repeat is an adaptive key whose default is the repeat,
so everything below about adaptive keys holds for it too. In ZMK it needs the module
[urob/zmk-adaptive-key](https://github.com/urob/zmk-adaptive-key), as an adaptive key does.

## Adaptive keys

An **Adaptive** key `✦`, which other tools call a magic key, types something that depends on the
key pressed before it. Its **Default** is what it types when nothing matches; each **branch** says "after these
keys, type this instead". **Add branch** adds one.

A branch can also match on a **tag**: a name a key or macro gives itself, so a branch can tell a
`u` typed by a `qu` macro from a plain `u`. **Only after a tagged key**, in a branch, names the
tag. The key or macro carries it under **Tag** (for a symbol, under **Shifted symbol, tag**), or
as `tag:name` at the end of what you type in **Or type**. In ZMK a tag is a one-shot layer that
the key arms, with another adaptive key on it.

The idea, and the way LayerBench models it, follows
[urob/zmk-adaptive-key](https://github.com/urob/zmk-adaptive-key). In ZMK an adaptive key needs
that module.

### Which branch wins

Branches are tried from the top, and the first that matches the key before wins; the arrows beside
a branch move it. A branch that needs a tag goes above a plain one for the same keys, so after an
accent tagged `alpha2` an alt repeat can type one thing and after the plain letter another. That
is a second stage, which firmware builds with a one-shot layer the accent arms.

### The same adaptive key on several keys

An adaptive key lives on its key, like any other. **Copy to…**, or dragging with `Alt`, puts a copy
on another key, and **From this layout** lists the layout's adaptive keys first. Each copy is a key
of its own: changing one leaves the others as they were. A custom layout saved when adaptive keys were
declared in **Features** opens with each one on the keys it was placed on, typing as it did.

## Macros

A **Macro** `⋯` types several things with one press. As **Text** it types the letters given, such
as `qu` or `ão`, and can turn a layer on for the next key after them. As **Steps** it is a list of
key presses, layer changes and modifiers, in order. Switching between the two never changes what
the macro does: steps after its letters still run after them as text, and come back as steps. A
step the list has no row for, such as one an import brought in, is shown as it is, and can still be
moved or removed.

## Caps word and sentence case

**Caps word** `⇪` types capitals until the word ends. **Features** can also put
caps word on the shift key, so that shift pressed while shift is already on starts it, and turn on
**sentence case**, which makes the space key a sentence space.

A **Sentence space**, among the editor's other tiles, types a space. Pressed right after `.`, `?` or
`!`, it leaves a capital for the next key pressed. A letter a–z comes out a capital. Any other key,
a digit, a symbol, a dead key, a modifier or another space, takes it and types as it is, so the
letter after it is lowercase. A layer key presses no keycode, and leaves the capital for the key
after it. A lowercase letter right after `. ` cannot be typed: the module lets the capital go after
a second, and the analysis has no clock.

A **Morph** can also change **After a sentence**, while a sentence space has left a capital. Magic
Romak's Alpha 2 key is one, as in its author's keymap: after a sentence's end it arms Shift with
Alpha 2, so an accent that starts a sentence is a capital too. The capital alone would not give one,
as an accent is no letter a–z.

Caps word is ZMK's own `&caps_word`; on the shift key it is a mod-morph. A sentence space and a
morph after a sentence need the module
[rafaelromao/zmk-sentence-case](https://github.com/rafaelromao/zmk-sentence-case): they are its
`&sentence_space` and its sentence-morph. Which punctuation ends a sentence, and that the capital is
Left Shift, are the module's.

## Tap dance, morphs, Unicode and dead keys

These are among the editor's other tiles, under **More** on a phone:

- **Tap dance** `TD` does one thing on one tap, another on two, and so on.
- **Morph** does something else while a modifier is held, while a layer is on, or after a
  sentence's end. With a modifier it is ZMK's mod-morph. On a layer it changes while any of the
  layers chosen is on, and needs the module
  [rafaelromao/zmk-layer-morph](https://github.com/rafaelromao/zmk-layer-morph). After a sentence,
  see [Caps word and sentence case](#caps-word-and-sentence-case).
- **Unicode** `U+` types a character the operating system has no key for. It needs the module
  [urob/zmk-unicode](https://github.com/urob/zmk-unicode), and the operating system set up for
  Unicode input. The module types the character as keys of its own, so it leaves nothing to follow:
  a repeat right after it types nothing, and no adaptive key's branch follows it.
- **Dead key** puts an accent on the next letter, as `´` then `e` gives `é`. On the board it shows
  its accent in a colour of its own, over a dotted line where the letter will go. The analysis types
  through them: an accented letter no key types is typed as its accent, then the letter, and a
  layer held for the accent is let go before the letter. Each accent goes on the letters it is
  written on. A letter some key types in one press is typed there.
  **Shifted** gives the key a second accent for when shift is on, as US-International has `¨`
  over `´`; it is drawn at the top of the key. Like a shifted symbol, it is typed only when
  **Shift** is on, since with capitals folded no shift is pressed.
  In ZMK a dead key is the host's own, sent with `&kp`, so the host's keyboard layout must have
  it, as US-International and ABNT2 do.

## Imported keys

A key brought in from a keymap-drawer file keeps its legend when LayerBench has no model of what
it does: Escape, an arrow, a Bluetooth or media key. It is drawn in grey, types nothing in the
analysis, and moves, swaps and copies like any other key. Choosing another tile replaces it. A
layer reached by holding such a key still works: the hold is kept, and only the tap is imported.
See [Importing and exporting](importing.md).

## In ZMK

Each kind of key the editor makes, and each feature, is one ZMK can run, with its own behaviours
or with a module. Each module's page says how to add it to a keymap.

| Key or feature | In ZMK |
|---|---|
| Symbol, modifier | `&kp` and `&sk`; a shifted symbol the host's Shift does not give is a [mod-morph](https://zmk.dev/docs/keymaps/behaviors/mod-morph) |
| Transparent, nothing | `&trans`, `&none` |
| Layer: momentary, one-shot, toggle, to layer | `&mo`, `&sl`, `&tog`, `&to` ([layers](https://zmk.dev/docs/keymaps/behaviors/layers)) |
| Layer: auto | the module [urob/zmk-auto-layer](https://github.com/urob/zmk-auto-layer) |
| Tap-hold, home row mods | [hold-tap](https://zmk.dev/docs/keymaps/behaviors/hold-tap) |
| Repeat | [`&key_repeat`](https://zmk.dev/docs/keymaps/behaviors/key-repeat) |
| Adaptive key, alt repeat | the module [urob/zmk-adaptive-key](https://github.com/urob/zmk-adaptive-key) |
| Macro | [macros](https://zmk.dev/docs/keymaps/behaviors/macros) |
| Tap dance | [tap-dance](https://zmk.dev/docs/keymaps/behaviors/tap-dance) |
| Morph with a modifier | [mod-morph](https://zmk.dev/docs/keymaps/behaviors/mod-morph) |
| Morph on a layer | the module [rafaelromao/zmk-layer-morph](https://github.com/rafaelromao/zmk-layer-morph) |
| Caps word | [`&caps_word`](https://zmk.dev/docs/keymaps/behaviors/caps-word); on the shift key, in a mod-morph |
| Sentence case, sentence space, morph after a sentence | the module [rafaelromao/zmk-sentence-case](https://github.com/rafaelromao/zmk-sentence-case) |
| Unicode | the module [urob/zmk-unicode](https://github.com/urob/zmk-unicode) |
| Dead key | the host's dead key, sent with `&kp` |
| Combo | [combos](https://zmk.dev/docs/keymaps/combos) |
| Conditional layer | [conditional layers](https://zmk.dev/docs/keymaps/conditional-layers) |

Magic Romak's author's keymap, [rafaelromao/keyboards](https://github.com/rafaelromao/keyboards),
builds with each of these modules but zmk-unicode.
