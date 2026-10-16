# A user's documents are custom, and links name them `custom:`

The layouts, rule sets and texts a user keeps are all one thing, a custom document, as opposed to
the ones that come with the app, and the code, the words on the page and the links all say so. A
link names one as `custom:<id>`; it used to say `saved:`, which read as a verb in some places and a
kind of document in others. Saving is still the verb, so **Save** and the "Saved {name}" message
stay as they were, and the storage format, the gist names and the paths on the `layerbench-data`
branch are unchanged. Links with `saved:` in them no longer open, and nothing converts them, as when
the app was renamed to LayerBench: the cost is a few old links, and the gain is that nothing in the
code has to know a second spelling.
