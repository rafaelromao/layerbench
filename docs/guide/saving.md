# Saving and sharing

Everything you save — layouts, rule sets and texts — is kept in this browser. To have it on every
browser you use, sign in with GitHub, and it is kept in your GitHub account as well.

## Saving your own layouts

A layout of your own starts in **Library**, in one of these ways:

- **Duplicate**, on any layout's card, saves a copy and opens it in **Analyze**.
- **New layout** starts one on the board you choose, empty or from Qwerty to rearrange, and
  **Create and edit** saves it and opens it.
- **Import** opens a dialog. Under **Text or JSON**, it takes LayerBench JSON or a layout written
  as text: **Open in analyzer** to edit it before saving it, **Save to library** to keep it as it
  is. Under **keymap-drawer**, **Import and edit** saves a keymap-drawer file and opens it. See
  [Importing and exporting](importing.md).

Saved, it is listed in **Library** among the layouts that come with the app, marked *saved* and
ranked with them, and **Delete**, on its card, removes it. Edit it in **Analyze**, then press
**Save**, beside its name at the top, to keep the edits. Until you do, the name is marked
*unsaved*, and your edits live only in the page's link and in this tab: opened in another tab or
browser, the same link is a layout of its own, and saving it there makes a copy.

A saved layout is kept in this browser. To keep it anywhere else, sign in with GitHub, below; or
copy its LayerBench JSON from the editor's **JSON** panel and keep the text, which **Import** reads
back.

## Signing in with GitHub

1. Click **Storage** in the header.
2. Click **Sign in with GitHub**, and approve LayerBench on GitHub.

You come back to the page you were on, unsaved edits included. From then on, every save is also
kept in your GitHub account, and **Storage** shows a ✓.

This browser stays signed in until you sign out, or until six months pass without using it. Safari
is stricter: once you have used it for seven days without opening LayerBench, it clears what
LayerBench keeps in it, the sign-in and any work saved only in this browser. In Safari, keep your
work in GitHub.

**Storage** says where your work is going. Unless you have given LayerBench a fork, it goes to
secret gists in your account, one for layouts, one for rule sets and one for corpora. Secret gists
are unlisted, not private: anyone with a gist's address can read it.

## Saving to your fork instead

If you have a fork of layerbench on GitHub, your work can be kept there instead of in gists.

1. Sign in, as above.
2. In **Storage**, follow **Give LayerBench access to it**.
3. On GitHub, choose your account, then **Only select repositories**, pick your fork, and click
   **Install**.
4. Back here, open **Storage** and click **Check again**.

**Storage** now names your fork. Each save commits the document, then the list of them, to a branch
called `layerbench-data`, so your fork's main branch stays exactly as it was. A layout is kept on it
where the layouts that come with LayerBench are on main, and a text where theirs are, which makes
proposing one simpler (see below); rule sets and the lists are kept in its `data` folder. If your
fork is public, so is everything saved to it.

## Moving what you saved before

Switching from this browser alone to GitHub, or from gists to your fork, does not move what was saved
before. Click **Copy this browser's documents up** in **Storage** to send everything this browser
holds to where **Storage** now saves.

## Signing out

**Sign out**, in **Storage**, stops saving to GitHub. What was saved from this browser stays in it,
and everything in your GitHub account stays there; what is only in your account leaves the lists
here until you sign in again.

## Sharing a link

A link carries the analysis as it stands: the layout, the text, the rules and every switch. A
layout with unsaved edits, or one that was never saved, travels whole in it, so anyone can open it,
without signing in. A saved layout's link only names it, so it opens only where it is saved: in this
browser, or in your GitHub account once you sign in. To share one, send its LayerBench JSON, from
the editor's **JSON** panel. The same goes for a saved text, which opens nowhere else, and a saved
rule set, which anywhere else opens as the Layouts Doc's rules.

A layout that was never saved makes a long link: the whole layout is in it, after the `#`. Copy the
whole address, and if a link opens on a different layout than it should, check that nothing after
the `#` was lost on the way.

## Adding a layout to the Library

The layouts LayerBench came with were written into it from where their authors published them. A
new one joins them as a layout saved in LayerBench, added unchanged by pull request on GitHub.
Anyone can propose one, their own or someone else's that is published, and it
joins everyone's Library once the pull request is merged.

1. In **Analyze**, give the layout its name, and in **Settings** its author and a description that
   says where it comes from, with a link: the author's firmware, keymap or page. **Save** it.
2. If you save to your fork, the layout is already on its `layerbench-data` branch, in the folder it
   goes in on main. Otherwise copy its LayerBench JSON from the editor's **JSON** panel.
3. Open a pull request on [layerbench](https://github.com/rafaelromao/layerbench) that adds it as a
   file named by the layout's id, with the two lines of code and the line on the landing page that
   go with it. The [README](../../README.md#bundled-layouts) lists each step.
