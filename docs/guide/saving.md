# Saving and sharing

Everything you save — your custom layouts, rule sets and texts — is kept in this browser. To have it on every
browser you use, sign in with GitHub, and it is kept in your GitHub account as well, by itself: see
[Syncing](#syncing).

## Saving your own layouts

A layout of your own starts in **Library**, in one of these ways:

- Press **Analyze** on any layout's card, change it in **Analyze** and press **Save**: Save asks what
  to call the copy, or, on one that comes with the app or a community layout, whether to propose
  your change instead, and keeps it among your custom layouts. See [Saving a copy](#saving-a-copy)
  below.
- **New layout** starts one on the board you choose, empty or from Qwerty to rearrange, and
  **Create and edit** saves it and opens it. **Add the default layers** gives it Numbers, Symbols,
  Accents and, where the board needs it, Extras, described under [Default layers](editing.md#default-layers).
- **Import** opens a dialog. Under **Text or JSON**, it takes LayerBench JSON or a layout written
  as text: **Open in analyzer** to edit it before saving it, **Save to library** to keep it as it
  is. Under **keymap-drawer**, which takes a file pasted, chosen or fetched from its GitHub address,
  **Import and edit** saves a keymap-drawer file and opens it. See
  [Importing and exporting](importing.md).

Saved, it is a custom layout: listed in **Library** among the layouts that come with the app, marked *custom* and
ranked with them, and **Delete**, on its card, removes it. Edit it in **Analyze**, then press
**Save**, beside its name at the top, to keep the edits. Until you do, the name is marked
*unsaved*, and your edits live only in the page's link and in this tab: opened in another tab or
browser, the same link is a layout of its own, and saving it there makes a copy.

While edits are unsaved, **Cancel** sits beside **Save**: it gives the layout back as it was opened
or last saved, all the edits at once. It does not ask, because **Undo** brings them back, unsaved as
they were. A layout opened from a link whose edits were unsaved from the start has no saved state to
go back to, and no **Cancel**; to leave it, pick another layout.

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
copy its LayerBench JSON from the editor's **Export** panel and keep the text, which **Import** reads
back.

### Proposing a change

**Propose change**, which **Save** offers on a layout that comes with the app or a community
layout, proposes your edits to that layout itself, for everyone. Sign in with GitHub first: the
dialog asks you to if you have not, as the pull request names you, and **Save a copy** still works
meanwhile. Proposing saves the layout here, under its name, like any custom layout, and opens a
public pull request on [layerbench](https://github.com/rafaelromao/layerbench) with the layout as it
is now; the dialog gives its link. In **Library**, and in the bar of **Analyze** while your copy is
open there, it is marked *proposed*, linked to the pull request. If one of your custom layouts has
the name already, such as the copy of a change you proposed before, the dialog asks what to call
this copy, or offers to overwrite that one; the pull request still proposes the layout under its
own name. A layout that comes with the app cannot be proposed under another one's name, nor one
that names no author. You can have five changes proposed and open at once.

The pull request's title is written for you, as `fix(library): change colemak` is for a change to
Colemak; leave it as it is.

Edit your copy and **Save** it again while the pull request is open, and the pull request gets that
version, under the name it proposed: renaming your copy renames only the copy. Once it is merged,
the change is in the Library, for a layout that comes with the app with the next version of the
app, and your copy goes. If it is closed instead, your copy stays one of your custom layouts.
**Library** checks each time it opens, and says which happened; so does **Save** on your copy, which
then keeps it as you saved it and sends nothing. To propose the change again, click **Submit** on
the copy: while it goes by the name of the layout it was proposed to, Submit offers **Propose
change** to that layout, bundled or community, where it would otherwise submit a new layout.

### A name another layout has

Two custom layouts never share a name: capitals and spacing do not make two names. When the name
you save under is already another custom layout's, whether in a copy's dialog, **New layout**, an
import, or the **Name** field of a layout you renamed, the dialog says so and offers to
**Overwrite** that layout, or to type another name. Overwrite puts this layout in its place; nothing
is saved until you choose.

## Signing in with GitHub

1. Click **Storage** in the header.
2. Click **Sign in with GitHub**, and approve LayerBench on GitHub.

You come back to the page you were on, unsaved edits included. What this browser saved before you
signed in is sent to your account at once, with nothing to press, and from then on every save is
also kept there. **Storage** shows a ✓ only once nothing is waiting to be sent and your account lacks
nothing this browser holds; otherwise it says what is not. See [Syncing](#syncing).

This browser stays signed in until you sign out, or until six months pass without using it. Safari
is stricter: once you have used it for seven days without opening LayerBench, it clears what
LayerBench keeps in it, the sign-in and any work saved only in this browser. In Safari, keep your
work in GitHub.

**Storage** says where your work is going: secret gists in your account, one for layouts, one for
rule sets, one for corpora and one for the changes you proposed. Secret gists are unlisted, not
private: anyone with a gist's address can read it.

## Syncing

Syncing is automatic, and where your work stands is always said, never left to guess. It is
described here in the order things happen.

**Signed in**, a save is kept in this browser first, and marked as not sent before anything else is
done with it, a layout's name checked against your account included, so a tab closed or put to sleep
while it is on its way to your account loses nothing. It is then written to your gists, and the mark
goes once they hold it. If your account could not be
written (no connection, GitHub down, a sign-in that ended), the save is still kept in this browser,
and **Save** does not refuse it: the status says it is not sent, and why, and a save made meanwhile
goes on from it. The page tries again by itself, a few seconds later, then after 30 seconds, a minute,
two, five, until it goes through. A save waits up to five seconds for the check of its name against your account and up to ten for
the send; past that it is said to be kept, and what comes of sending it, a name your account already has
included, is left to the status: it is not taken back, and what the account refuses afterwards is asked about.
What your account refuses for what it holds, a name or a version that changed under a check of its
own, is refused, and the copy is taken back to what it was, if it is still what that save wrote. It also tries when the
browser comes back online and when you come back to the tab, from one tab at a time. A document that
cannot be sent is named, with why, and the rest go on; several in a row, which means GitHub is out of
reach, end that attempt. While a document is marked, this browser shows it as you last saved it, not
the older copy in your account, and its next saves stay in this browser too, to go up together with
the rest. With no connection, the status says so and what waits.

A save is only written to your account over the version it is an edit of. For a layout, that is the
version **Analyze** opened (or a draft was made from); for a rule set or a text, the version this browser
last read or held. If your account holds another, such as when an editor was left open or another
browser saved it since, the save stays in this browser, marked, and you are asked which to keep: see
[When both have changed](#when-both-have-changed). A rule set or a text this browser never read or held,
which your account has under the same name (as two devices that each make **My rules** do), is asked
about too, not written over it. A layout is written over one it never held only where you chose
**Overwrite**.

A save of edits that are waiting to be sent is written over exactly the version its editor read: a
tab opened before another tab saved them is refused, with the other tab's save kept, rather than
written over it.

**Not signed in**, a save stays in this browser only and is marked as not sent, and the page says so
for as long as it is so: under the layout's name in **Analyze**, and on the **Storage** button,
*Saved in this browser only. Sign in with GitHub to sync it.*, with a **Sign in with GitHub**
button. Once you sign in, what is marked goes up by itself, a message says how many, and nothing is
pressed. A browser that was signed in and no longer is, because the sign-in ended on GitHub's side,
says that instead, with the same button, on every visit until you sign in or out, rather than
carrying on as if nothing had changed.

Only what is marked goes up by itself. A document this browser holds that was never marked is not
sent: a layout you deleted on another browser is not put back in your account by one that still has
it. The copy this browser still holds stays in this browser, and saving it there creates it in your
account again.

Opening a layout, rule set or text from your account, when this browser holds a copy of it, brings
that copy up to the version you opened, so what you edit offline afterwards is an edit of it, but
only if the copy is the version both last held. A copy that differs in any other way is an edit
whose mark was never written or was lost (as with documents saved before edits were marked): it is
kept, shown, and weighed like any other, and asked about if it is not an edit of what your account
holds. Where the account is slow to answer, the copy this browser has is shown after five seconds.
Anything a layout opened in **Analyze** is saved over is the version Analyze opened, or the draft was
made from, however many reads of it have happened since: if your account holds another version, the
save stays here and is asked about. A rule set or a text is weighed against the version this
browser last held.

When you sign in, and at most every twelve hours for each account, this browser's documents are also
compared with your account's by their **contents**, never by when each was saved: the same in both
is recorded as such; one this browser holds an unedited older copy of is brought up to your
account's; any other that differs is marked, and sent or asked about like the rest. A document your
account lacks is not sent by itself, since another browser may have deleted it, but is listed: the
status, above the editor and in **Storage**, names each one, with its kind, and says if a GitHub
account held it before (a recorded version is what tells it; on a browser that has been signed in to
more than one account it may have been another). Each row has **Send**, which sends that one and no
other, and **Delete**, which asks first, in the row, and then deletes it from this browser alone:
nothing is asked of your account, and one it holds under the same id stays there. A document saved
again since, or deleted elsewhere in the app, comes off the list. **Send them** sends all of them.
**Storage** does not show a ✓ until the list is empty. If the comparison cannot finish, it says so,
with a button to run it again.

**If this browser's last account is not the one signed in.** What is marked is held back, and the
status says so, naming both accounts: a browser that someone else used may hold what is theirs. **Send
to my account** releases it. Signing in again to the account the browser last sent to needs no
answer.

If a browser that was signed in gets no answer from the sign-in server within ten seconds, an answer
that is an error, or an answer that is not the server's (a hotel Wi-Fi's page), the page stops waiting and
says so, with a **Try again** button, which it also presses by itself when the browser is back online
or the tab is shown again. It is never taken for there being no sign-in. Meanwhile it shows this
browser's copies, and a layout or rule set kept only in your account is not among them until the
server answers. The request is not cancelled: an answer that comes late is still kept, and one that
comes after you signed out is thrown away.

A layout that takes more than ten seconds to open says so, with a **Reload** button: the usual
cause is another tab of LayerBench, of an older version, keeping this browser's storage closed.
Close that tab and reload. An analysis or a text still loading after thirty seconds says so in the
same way.

### When both have changed

A document that you changed in this browser and that was changed in your account since, from
another browser, is never written over in either place by itself, whether the change here was made
offline or in an editor that was left open: a save that finds your account holding a version it is
not an edit of stays in this browser and is asked about, as is a delete. The page asks you, in one dialog
that holds all of them in turn: it shows the two versions with when each was saved, what differs in a
few lines (a name or a note as it reads in each, a layer as how many keys differ) and, for a layout, a
link that opens the two side by side in **Compare**. **Keep mine** sends this browser's version to
your account; **Keep theirs** makes this browser's copy the account's, and a layout open in
**Analyze** with nothing unsaved is opened again as it. One with edits not saved yet is left as it
is, and when saved is weighed against the version those edits were made on. Neither is done until you choose, and if the account changes again
meanwhile, or this browser's copy was edited after the dialog showed it, nothing is written and you
choose again. The dialog never opens over a field you are typing in, opens onto **Decide later**, and
ignores the two choices for about half a second after it opens by itself, so a tap meant for what was
on the screen does not land on one.

**Decide later**, or closing the dialog any way, leaves both as they are. The status on **Storage**
and under the layout's name says *changed in this browser and in your GitHub account*, with a
**Choose** button, for as long as it is so; the dialog does not open again by itself until the next
visit.

Which version an edit was made on is what tells a conflict from an edit nobody else touched, so
the page keeps, for each document, the version it was made on. An edit made on the version your
account still holds goes up; an edit made on any other, or on one the page has no record of (a
document that was last sent before this was kept), is a conflict, even if its date is later: the
dates, which are the two browsers' clocks, never decide.

A layout with the same name as another one in your account, under a different id, is not a copy of
it but another layout: it stays in this browser, and the status says so. Rename it, or open it and
save to overwrite the other one.

**Deleting** a document while signed in is checked against your account first: if another browser saved
it since this one last held it, nothing is deleted, and with no record of which version this one held, a copy that differs
from your account's is not deleted either; open it first. If your account cannot be reached, nothing is
deleted, edits not sent yet included. A document you edited here that was deleted from your account
since is not a conflict: your edit is sent, and the document is back. If you chose **Keep theirs** for one that has since been deleted
there, nothing is thrown away: your version stays and is sent.

Deleting a layout while you are not signed in is not sent: it comes back from your account the next
time you sign in, and you delete it again. Renaming one while signed out is a new document and a
deletion, so only the new one goes up, and the old name stays in your account until you delete it.

### Copying everything again

**Copy this browser's documents up**, in **Storage** once you are signed in, weighs every layout,
rule set and text this browser holds, whether or not it is marked. It is for what was saved before
edits were marked, and for anything that looks missing; you should not need it otherwise. A document
your account lacks is sent, so use it only for what you want in your account. One that differs from
your account's is never sent over it by the clocks: it is marked, and sent only if your account still
holds the version it was an edit of, and otherwise asked about. It says how many it sent, how many
are the same, how many are waiting for you to choose, how many it left for their names, and which
could not be sent, with why. If it stops partway, what went up stays, and copying again carries on
from there. One tab sends at a time.

### Known limits

- Two tabs of the same browser saving the same document at the same instant are only partly
  protected: sending is one tab at a time, saving is not. Two tabs writing to your account at once can
  each rewrite a gist's list from a read that lacks the other's row; the document is then in your
  account but not listed, and the next send of it writes it again, so it is listed.
- A rule set or a text is weighed against the version this browser last read or held, which any read
  in another tab moves on, not the version its editor opened, as a layout's is.
- Documents here that your account lacks stay in the status until you send them or delete them here:
  one deleted from your account on purpose looks the same as one never sent, but for the note that a
  GitHub account held it before, which only a document whose version was recorded has. The list is as
  of the last comparison, so one sent or deleted from another browser since is only taken off when the
  comparison is next made, and what it calls missing is judged by your account's list of documents: one
  whose row was dropped from that list, while its file is still there, is listed too, and **Send** or
  **Send them** is what lists it again.
- What is not sent is remembered in this browser's site data, apart from the documents. A browser that
  loses it (Safari after a week unused, or a tab killed at the wrong moment) loses the memory of what was
  unsent, not the documents: a copy that differs from your account's is then treated as an edit when
  it is next read, and asked about.
- A very large number of documents waiting is sent a few at a time, and an attempt that takes more than
  two minutes is stopped and resumed; the status may say it could not send while it is progressing.
  Three documents in a row that cannot be sent end an attempt, so documents after them wait until
  those are dealt with.
- A gist takes no conditional write: between the check of a version and its write, one round trip,
  another browser can save the same document, whether by a save, a delete or **Keep mine**. Deleting
  is also not one step: if it is cut short between your account and this browser, the document is gone
  from the account and still listed here until it is deleted again.
- Marks are kept in site data as one entry, so two tabs updating them at once can lose an update for a
  moment; it is found again on the next read or comparison, but the check mark is not to be trusted
  until then.
- Which account this browser belongs to is only asked about for documents with unsent edits. With none,
  an account that signs in becomes the browser's at once, and the comparison can then mark documents
  whose ids collide with that account's.
- A rename done while signed out is a new document and a deletion that is not sent, so the old name
  stays in your account. Signed in, a rename whose new copy could not be sent yet, or is asked about,
  leaves the old copy where it is, here and in your account, and says so.
- **Overwrite**, when saving over another layout of the same name, is bound to that layout's id, not to
  the version the dialog showed: if that layout changed in your account since, the save is asked about
  as any other, but it is not refused for being a different layout.
- When a layout's id is already taken in your account by one of another name, **Keep mine** or **Keep
  theirs** are offered as if the two were versions of one layout; the dialog shows both names, and
  nothing is replaced until you choose.
- A gist file whose text was written with its keys in another order than the app writes them is a
  different version to this browser, though it reads alike: it is asked about once, and the answer
  settles it.
- A document in your account over a megabyte cannot be read, and so cannot be compared or sent.

## Signing out

**Sign out**, in **Storage**, stops saving to GitHub. What was saved from this browser stays in it,
and everything in your GitHub account stays there; what is only in your account leaves the lists
here until you sign in again. What you save while signed out is sent when you sign in again.

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
   request's link, where the maintainer may ask for changes. Its title is written for you, as
   `feat(community): add my-layout`; leave it as it is.

A custom layout that goes by the name of a bundled or community layout is not a new layout:
**Submit** on it opens **Propose change** to that layout instead, as **Save** does on the layout
itself. Submitting the same layout again while its pull request is open updates that pull request
with the layout as it is now, rather than opening another. Once the pull request is merged, the
layout is a community layout. Your own copy stays one of your custom layouts.

### Bundled with the app

The layouts that come with LayerBench are written into it from where their authors published them. A
new one joins them as a custom layout in LayerBench, added unchanged by pull request on GitHub.
Anyone can propose one, their own or someone else's that is published, and it
joins everyone's Library once the pull request is merged.

1. In **Analyze**, give the layout its name, and in **Settings** its author and, if you can, a
   **Link** to where it comes from: the author's firmware, keymap or page. **Save** it.
2. Copy its LayerBench JSON from the editor's **Export** panel.
3. Open a pull request on [layerbench](https://github.com/rafaelromao/layerbench) that adds it as a
   file named by the layout's id, with the two lines of code and the line on the landing page that
   go with it. The [README](../../README.md#bundled-layouts) lists each step.
