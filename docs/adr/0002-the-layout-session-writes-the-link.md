# The layout session is the only writer of the layout in the link

In Analyze the link carries the layout being edited, and the layout session is the only thing that
writes it there: a change of `layout=` that the session did not make means a followed link, Back or
the picker, and opens the layout afresh. Anything else writing `layout=` would be taken for one of
those and reopen the layout, losing its undo history. A view that writes the link itself has to tell
the session about each write before it happens, and the order is easy to get wrong. So the session
reaches the router through a small link port (read, write, follow), adapted to the router in the app
and kept in memory in tests, and the same contract tests run against both.
