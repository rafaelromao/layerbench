# Special keys

A key can do more than type a letter. This page shows how each kind of key is drawn on the board,
and how to make it in the editor, in **Analyze**: select a key, then choose its tile.

| On a key | Means |
|---|---|
| the large legend | what a tap does |
| a small word along the bottom | what a hold does, or how a layer comes on: `hold`, `1×` for one key, `toggle`, `switch`, `auto` |
| a small legend at the top | what it types with Shift, where that is not just the capital |
| `✦` `⋯` `TD` `U+` in the corner | a magic key, a macro, a tap dance, a Unicode character |
| a colour | the layer the key reaches, matching the dot on that layer's tab; chosen under **Layers**, or set by the layer's place in the list |
| a ring inside the key, `held` or `tapped` along the bottom | on a layer above the base: the key held or tapped to get to this layer |
| `▽` in a dashed outline | transparent: the key of the layer below shows through |
| a pill between keys | a combo that types: press those keys together |
| a number in the corner | more than fits on the key; the list under the board says it all |
| a grey legend | a key kept from an import, drawn but not simulated |

`⇧` `⌃` `⌥` `⌘` are Shift, Control, Alt and Command, `⟳` is repeat and `⇪` is caps word.

## Holds and one-shots

A key can do one thing when tapped and another while held, or act once, on the next key only.

### Tap-holds and home-row modifiers

A **Tap-hold** key has two parts. The **Tap** is what a quick press does, usually a letter; the
**Hold** is a layer or a modifier while the key is held down. A letter on the home row with a
modifier underneath is a home-row modifier. The Tap can also be a magic key or an alt repeat, so a
thumb can adapt when tapped and reach a layer when held.

**Timing**, under the hold, sets the tapping term, how long a press must last to count as a hold,
and the flavor, ZMK's rule for telling a tap from a hold when another key comes in between. Its
[hold-tap documentation](https://zmk.dev/docs/keymaps/behaviors/hold-tap) explains both.

### One-shot layers and modifiers

A one-shot works on the next key only, then turns itself off, so the layer or modifier does not
have to be held. On the board it reads `1×`. Choose **Layer** or **Modifier**, then **One-shot**.

How a one-shot ends, as soon as the next key goes down or only when it comes up, follows the
layout's behaviour defaults, kept in its JSON. ZMK's
[sticky layer](https://zmk.dev/docs/keymaps/behaviors/sticky-layer) and
[sticky key](https://zmk.dev/docs/keymaps/behaviors/sticky-key) pages describe the options.

### Layer keys

A **Layer** key turns another layer on in one of five ways:

| Comes on | The layer is on |
|---|---|
| Hold | while the key is held |
| One-shot | for the next key only |
| Toggle | until the key is pressed again |
| Switch | from now on, until another switch |
| Auto | until the word ends |

## Repeat and alt repeat

A **Repeat** key `⟳` presses the key before it again, so a doubled letter is typed with two
fingers instead of one.

An **Alt repeat** key, under **More**, repeats as well, but after chosen keys it types something
else: after `a`, say, it could type `o`. Each **branch** names the keys it follows and what it
types after them. On the board it reads `⟳` with a `✦`. A repeat key becomes one with **Make it
an alt repeat**, and a layout can have as many as it needs. An alt repeat is a magic key whose
default is the repeat, so everything below about magic keys holds for it too.

## Magic keys

A **Magic** key `✦`, also called an adaptive key, types something that depends on the key pressed
before it. Its **Default** is what it types when nothing matches; each **branch** says "after these
keys, type this instead". **Add branch** adds one.

A branch can also match on a **tag**: a name a key or macro gives itself, so a branch can tell a
`u` typed by a `qu` macro from a plain `u`. **Only after a tagged key**, in a branch, names the
tag. The key or macro carries it under **Tag** (for a symbol, under **Shifted symbol, tag**), or
as `tag:name` at the end of what you type in **Or type**.

The idea, and the way LayerBench models it, follows
[urob's zmk-adaptive-key](https://github.com/urob/zmk-adaptive-key).

### Which branch wins

Branches are tried from the top, and the first that matches the key before wins; the arrows beside
a branch move it. A branch that needs a tag goes above a plain one for the same keys, so after an
accent tagged `alpha2` an alt repeat can type one thing and after the plain letter another. That
is a second stage, which firmware builds with a one-shot layer the accent arms.

### The same magic key on several keys

A magic key lives on its key, like any other. **Copy to…**, or dragging with `Alt`, puts a copy on
another key, and **From this layout** lists the layout's magic keys first. Each copy is a key of
its own: changing one leaves the others as they were. A layout saved when magic keys were declared
in **Features** opens with each one on the keys it was placed on, typing as it did.

## Macros

A **Macro** `⋯` types several things with one press. As **Text** it types the letters given, such
as `qu` or `ão`, and can turn a layer on for the next key after them. As **Steps** it is a list of
key presses, layer changes and modifiers, in order.

## Caps word and sentence case

**Caps word** `⇪`, under **More**, types capitals until the word ends. **Features** can also put
caps word on the shift key, so that shift pressed while shift is already on starts it, and turn on
**sentence case**: after the punctuation that ends a sentence, the space key types a space and
shifts the next letter.

## Tap dance, morphs, Unicode and dead keys

These are under **More**:

- **Tap dance** `TD` does one thing on one tap, another on two, and so on.
- **Morph** does something else while a modifier is held, or while a layer is on.
- **Unicode** `U+` types a character the operating system has no key for.
- **Dead key** puts an accent on the next letter, as `´` then `e` gives `é`.
- **Behaviour** uses one of the layout's own named bindings, from the **Behaviors** panel.

## Imported keys

A key brought in from a keymap-drawer file keeps its legend when LayerBench has no model of what
it does: Escape, an arrow, a Bluetooth or media key. It is drawn in grey, types nothing in the
analysis, and moves, swaps and copies like any other key. Choosing another tile replaces it. A
layer reached by holding such a key still works: the hold is kept, and only the tap is imported.
See [Importing and exporting](importing.md).
