# Intentional differences from the reference reports

The files in this directory were dumped from the Elixir implementation on `main` and pin every
number this engine produces. Three behaviors are deliberately **not** reproduced, because they are
defects in the reference rather than definitions worth keeping. Everything else must match to 1e-6.

## 1. `lsb` and `lss` are always zero in the reference

Both rules compare a horizontal distance against a rule-set global:

```
{ x_distance: { min: "$global.lsb_adjacent_u" } }
```

The reference resolves `$global.` references only when the whole predicate value is a string. Here
the reference sits one level deeper, inside the numeric condition, so it is never substituted, and
the surviving comparison is `number >= "$global.lsb_adjacent_u"` — which in Erlang term order is
false for every number. Lateral stretches therefore never match and both rules report `0` with no
items, even though the metric glossary documents them with bands and the summary strip shows them.

This engine resolves globals wherever they appear, so `lsb` and `lss` carry real values.

## 2. Heat map id `travel`

The Analyze view offers a `travel` heat mode but looks the rule up by that id, while the catalog
calls the rule `finger_travel`. The lookup silently falls back to usage heat. This engine maps the
heat mode to the correct rule id.

## 3. Shift key in `relabel_eligible?`

The eligibility check compares a position index against `shift_key`, which is a map of
`{key, kind}`, so the comparison never excludes the shift key. This engine compares against
`shift_key.key`, which is what the surrounding documentation describes.

## Not compared

`elapsed_ms`, the structure hash (a different hash function), and the ordering of items that tie on
count — the reference emits those in map-hash order, so the parity suite sorts both sides and drops
the trailing tie group.
