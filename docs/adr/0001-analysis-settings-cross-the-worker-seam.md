# Analysis settings cross the worker seam

What a layout is analyzed on is one core module, the analysis settings, and the engine is asked with
the layout as written plus those settings, not with a request each view derives for itself. Every
view, the generator and the CI reports therefore type and score a layout the same way: the mix, the
features left out, the cross-word rule (always the rule set's) and Space are worked out behind the
seam, once. The Library ranks on the same settings with the sample capped at 100,000 symbols, and its
links carry the cap, so a layout it opens shows the numbers its card showed.

## Considered Options

- **Each view builds its request**: the copies drift. One view hard-codes a cross-word rule, another
  ignores a mix its own summary names.
- **The main thread derives the request with the core module**: one definition too, but every caller
  must remember to call it, and the worker cannot tell a derived request from a hand-built one.
