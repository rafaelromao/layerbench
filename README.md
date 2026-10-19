# LayerBench community layouts

This is the `layerbench-data` branch of LayerBench: the community layouts, layouts other people
made, accepted into the Library. It is kept apart from `main`, and the app reads it from GitHub
each time the Library opens, so a layout merged here is in every visitor's Library at their next
load, with no deploy.

- `community/<id>.json`: one layout, exactly as LayerBench saves it, named by its id, with an
  author and a description that links to where it comes from. One that is not is left out.
- `community/index.json`: the list of them, kept by `.github/workflows/community-index.yml` on
  every push that changes `community/`. Do not edit it by hand.

A layout is proposed by a pull request into this branch that adds one file; merging it is the
maintainer's acceptance. The README on `main` says more.
