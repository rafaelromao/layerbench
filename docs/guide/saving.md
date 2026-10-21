# Saving and sharing

Everything you save — your custom layouts, rule sets and texts — is kept in this browser. To have it on every
browser you use, sign in with GitHub, and it is kept in your GitHub account as well.

## Saving your own layouts

A layout of your own starts in **Library**, in one of these ways:

- Press **Open** on any layout's card, change it in **Analyze** and press **Save**: Save asks what
  to call the copy, or, on one that comes with the app or a community layout, whether to propose
  your change instead, and keeps it among your custom layouts. See [Saving a copy](#saving-a-copy)
  below.
- **New layout** starts one on the board you choose, empty or from Qwerty to rearrange, and
  **Create and edit** saves it and opens it. **Add the default layers** gives it Numbers, Symbols,
  Accents and, where the board needs it, Extras, described under [Default layers](editing.md#default-layers).
- **Import** opens a dialog. Under **Text or JSON**, it takes LayerBench JSON or a layout written
  as text: **Open in analyzer** to edit it before saving it, **Save to library** to keep it as it
  is. Under **keymap-drawer**, **Import and edit** saves a keymap-drawer file and opens it. See
  [Importing and exporting](importing.md).

Saved, it is a custom layout: listed in **Library** among the layouts that come with the app, marked *custom* and
ranked with them, and **Delete**, on its card, removes it. Edit it in **Analyze**, then press
**Save**, beside its name at the top, to keep the edits. Until you do, the name is marked
*unsaved*, and your edits live only in the page's link and in this tab: opened in another tab or
browser, the same link is a layout of its own, and saving it there makes a copy.

### Saving a copy

A layout that is not yours is never saved over: one that comes with the app, a community layout,
or one that a link or
**Open in analyzer** brought here and you have not saved. On one that comes with the app or a
community layout, **Save** first asks whether to [propose your change](#proposing-a-change) to it
or to **Save a copy**. Save a copy, and the first **Save** of any other, opens a dialog that says
Save makes a copy in your custom layouts and asks for the copy's name. The name offered is the
layout's with *copy* after it, numbered (*copy 2*) if a layout already has it; an empty name is
refused. **Cancel** saves nothing. Once saved, the layout in the editor is the copy, and later
**Save**s keep your edits to it straight away.

A custom layout is kept in this browser. To keep it anywhere else, sign in with GitHub, below; or
copy its LayerBench JSON from the editor's **JSON** panel and keep the text, which **Import** reads
back.

### Proposing a change

**Propose change**, which **Save** offers on a layout that comes with the app or a community
layout, proposes your edits to that layout itself, for everyone. Sign in with GitHub first: the
dialog asks you to if you have not, as the pull request names you, and **Save a copy** still works
meanwhile. Proposing saves the layout here, under its name, like any custom layout, and opens a
public pull request on [layerbench](https://github.com/rafaelromao/layerbench) with the layout as it
is now; the dialog gives its link. In **Library**, your copy is marked *proposed*, linked to the
pull request. If one of your custom layouts has the name already, such as the copy of a change you
proposed before, the dialog asks what to call this copy, or offers to overwrite that one; the pull
request still proposes the layout under its own name. A layout that comes with the app cannot be
proposed under another one's name, nor one that names no author. You can have five changes
proposed and open at once.

Edit your copy and **Save** it again while the pull request is open, and the pull request gets that
version, under the name it proposed: renaming your copy renames only the copy. Once it is merged,
the change is in the Library, for a layout that comes with the app with the next version of the
app, and your copy goes. If it is closed instead, your copy stays one of your custom layouts.
**Library** checks each time it opens, and says which happened; so does **Save** on your copy, which
then keeps it as you saved it and sends nothing.

### A name another layout has

Two custom layouts never share a name: capitals and spacing do not make two names. When the name
you save under is already another custom layout's, whether in a copy's dialog, **New layout**, an
import, or the **Name** field of a layout you renamed, the dialog says so and offers to
**Overwrite** that layout, or to type another name. Overwrite puts this layout in its place; nothing
is saved until you choose.

## Signing in with GitHub

1. Click **Storage** in the header.
2. Click **Sign in with GitHub**, and approve LayerBench on GitHub.

You come back to the page you were on, unsaved edits included. From then on, every save is also
kept in your GitHub account, and **Storage** shows a ✓.

This browser stays signed in until you sign out, or until six months pass without using it. Safari
is stricter: once you have used it for seven days without opening LayerBench, it clears what
LayerBench keeps in it, the sign-in and any work saved only in this browser. In Safari, keep your
work in GitHub.

**Storage** says where your work is going: secret gists in your account, one for layouts, one for
rule sets, one for corpora and one for the changes you proposed. Secret gists are unlisted, not private: anyone with a gist's address
can read it.

## Moving what you saved before

Signing in does not move what this browser saved before. Click **Copy this browser's documents
up** in **Storage** to send what this browser holds to where **Storage** now saves: each layout,
rule set and text GitHub has not got, or has an older copy of. One saved there since, from another
browser, stays as it is, so a browser that has fallen behind never overwrites newer work. A layout
whose name GitHub has for another layout stays in this browser: open it and save it to overwrite
GitHub's, or rename it. It says how many it copied, how many were already up to date and how many
it left; if it stops partway, what went up stays, and copying again carries on from there. Copy
while no other browser is saving to the same account: a save landing at the very moment one is
copied may be written over.

## Signing out

**Sign out**, in **Storage**, stops saving to GitHub. What was saved from this browser stays in it,
and everything in your GitHub account stays there; what is only in your account leaves the lists
here until you sign in again.

## Sharing a link

A link carries the analysis as it stands: the layout, the text, the rules and every switch. The
layout travels whole in it, saved or not, in **Analyze** and on both sides of **Compare**, so anyone
can open it, without signing in. A link that names a custom layout by its id alone opens only where
it is saved, and there it is that layout; Analyze and Compare put the layout itself in its place as
soon as it opens. Opened by
someone who has not got it, it is a layout of their own: they can analyze it, edit it and save a
copy. Opened where it is saved and unchanged, in this browser or your GitHub account, it is your
custom layout, and saving changes that one. A link never saves over a different layout someone has
under the same name unless they choose to: saving asks to overwrite it or for another name. A
custom text and a custom rule set do not travel the same way: the link only names them, so they
open only where they are saved. Anywhere else nothing
opens in their place: the page says the text or rule set is not saved there, and shows no numbers.

A link with a whole layout in it is long: the layout is after the `#`. Copy the whole address, and
if a link opens on a different layout than it should, check that nothing after the `#` was lost on
the way.

## Adding a layout to the Library

A layout joins the Library in one of two ways: as a community layout, which needs no new version of
the app, or bundled with the app, as the layouts it came with are.

### As a community layout

Community layouts are layouts other people made, accepted into the Library. Each is a file on the
`layerbench-data` branch of [layerbench](https://github.com/rafaelromao/layerbench), apart from the
app's code: `community/<id>.json`, the layout's LayerBench JSON, named by its id. A pull request
into that branch that adds one file proposes a layout, and merging it accepts it: it is in every
visitor's Library the next time it opens, marked *community*, with no new version of the app. A
file that is not a layout as LayerBench saves it, with an author, is left out. A link to where it
comes from is welcome, not needed.

**Submit** opens that pull request for you, from one of your custom layouts:

1. Sign in with GitHub, in **Storage**. Submit asks you to if you have not: the pull request names
   you as who sent the layout.
2. In **Analyze**, open the custom layout. In **Settings**, give it its author and, if you can, a
   **Link** to where it comes from: the author's firmware, keymap or page. **Save** it.
3. Click **Submit**, beside **Save**. Submit checks the layout first: an author, saved changes, an
   id no bundled or community layout has (rename it if one does), and that it compiles. If anything
   is missing it says what, and sends nothing.
4. Otherwise it asks before it opens the pull request, which is public. It then gives you the pull
   request's link, where the maintainer may ask for changes.

Submitting the same layout again while its pull request is open updates that pull request with the
layout as it is now, rather than opening another. Once the pull request is merged, the layout is a
community layout. Your own copy stays one of your custom layouts.

### Bundled with the app

The layouts LayerBench came with were written into it from where their authors published them. A
new one joins them as a custom layout in LayerBench, added unchanged by pull request on GitHub.
Anyone can propose one, their own or someone else's that is published, and it
joins everyone's Library once the pull request is merged.

1. In **Analyze**, give the layout its name, and in **Settings** its author and, if you can, a
   **Link** to where it comes from: the author's firmware, keymap or page. **Save** it.
2. Copy its LayerBench JSON from the editor's **JSON** panel.
3. Open a pull request on [layerbench](https://github.com/rafaelromao/layerbench) that adds it as a
   file named by the layout's id, with the two lines of code and the line on the landing page that
   go with it. The [README](../../README.md#bundled-layouts) lists each step.
