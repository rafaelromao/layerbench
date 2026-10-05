# Guide

LayoutMaster types a text on your keymap the way your keyboard's firmware would, and measures how
comfortable that typing is. Layers, one-shots, tap-holds, magic and repeat keys are all part of it.
Everything runs in your browser, and nothing leaves it unless you sign in with GitHub to keep your
work in your own account.

1. **Pick a layout.** The site opens on **Library**, ranked by Effort; choose one, or bring your
   own from a [keymap-drawer file](importing.md).
2. **Read two numbers.** On **Analyze**, *Effort* is how hard the keys are to reach, and *SFB* how
   often one finger presses two keys in a row. Lower is better for both.
3. **Change a key.** On **Analyze** too, tap or click a key and choose what it does. Every change
   is kept as you make it, every number follows it, and **Undo** takes it back.
4. **Compare.** **Compare** puts two layouts side by side, number by number.

Each topic below starts short. Open it for more, and follow its links for the rest.

## Reading the numbers

Every layout gets the same two headline numbers, wherever it is shown:

- **Effort**: how hard the keys are to reach, averaged over everything typed, from
  [cyanophage's](https://cyanophage.github.io/playground.html) cost for each key.
- **SFB**, same finger bigrams: how often one finger presses two different keys in a row.

**Library** sorts layouts by either. The other numbers, and how each is worked out, are in
[Analyzing a layout](analyzing.md).

## Editing keys and layers

Tap or click a key on the board, in **Analyze**. The editor beside it (under it, on a phone) shows
what the key does and what it adds to the numbers, with a row of tiles (*Symbol*, *Layer*,
*Tap-hold*, *Magic* and more) to make it something else.

Drag a key onto another to swap them. Layers can be renamed, reordered, duplicated and removed.
[Editing a layout](editing.md) has the details.

## Special keys

A key can do more than type a letter. It can reach a layer while held, work once on the next key,
repeat the key before it, or type something that depends on it. [Special keys](special-keys.md)
shows how each is drawn on the board and made in the editor.

## Importing and exporting

A [keymap-drawer](https://github.com/caksoylar/keymap-drawer) YAML file brings a whole keymap in,
and you choose which of its layers to take. The editor writes one back out, as well as
LayoutMaster's own JSON. See [Importing and exporting](importing.md).

## Keeping and sharing your work

Saved layouts, rule sets and corpora stay in this browser. **Storage**, in the header, can also
keep them in your GitHub account: **Sign in with GitHub**, and they go to your fork of layoutmaster
once you give the app access to it (on a `layoutmaster-data` branch, so your main branch stays as it
is), or to secret gists in your account otherwise. Secret gists are unlisted, not private: anyone
with a gist's address can read it. Signing out leaves the copies in this browser where they are.

A link carries everything a view shows, so copying the address shares the analysis as it stands,
unsaved edits included, even for a layout that was never saved.
