# Dumps Elixir engine reports as JSON goldens for the TypeScript port.
# Run on branch `main`:  mix run tmp/golden_dump.exs
alias LayoutMaster.{Analysis, Layout, Layouts}
alias LayoutMaster.Corpus.Normalize
alias LayoutMaster.Layout.Compile
alias LayoutMaster.Rules.Presets
alias LayoutMaster.Sim.Resolver
alias LayoutMaster.Tables.Registry

out = Path.join(File.cwd!(), "tmp/golden")
File.mkdir_p!(Path.join(out, "layouts"))

# ---------------------------------------------------------------- json helpers
defmodule G do
  def j(%_{} = s), do: s |> Map.from_struct() |> j()
  def j(m) when is_map(m), do: Map.new(m, fn {k, v} -> {key(k), j(v)} end)
  def j(t) when is_tuple(t), do: t |> Tuple.to_list() |> j()
  def j(l) when is_list(l), do: Enum.map(l, &j/1)
  def j(a) when is_atom(a) and a not in [nil, true, false], do: Atom.to_string(a)
  def j(v), do: v

  defp key(k) when is_atom(k), do: Atom.to_string(k)
  defp key(k) when is_integer(k), do: Integer.to_string(k)
  defp key(k) when is_binary(k), do: k
  defp key(k), do: inspect(k)

  def write!(path, term) do
    File.write!(path, JSON.encode!(j(term)))
    {path, File.stat!(path).size}
  end
end

# ---------------------------------------------------------------- inputs
fixture_en = File.read!("priv/fixtures/fixture_en.txt")
fixture_pt = File.read!("priv/fixtures/fixture_pt.txt")

corpora = [
  {"fixture_en", fixture_en},
  {"fixture_pt", fixture_pt},
  {"fixture_enpt", fixture_en <> " " <> fixture_pt}
]

layouts = ~w(magic-romak romak-34 qwerty)
presets = ~w(layouts_doc cyanophage)
universes = [:no_space, :with_space]

explain_words = ~w(ação açúcar chave hello quando não é ll qu ões the work vocês ótimo shift)

# ---------------------------------------------------------------- one report
dump = fn layout_id, corpus_name, corpus_text, preset_id, case_mode, universe ->
  layout = Layouts.get(layout_id)
  {:ok, compiled} = Compile.compile(layout)
  stream = Normalize.normalize(corpus_text, case_mode: case_mode)

  base = Presets.get(preset_id)
  rule_set = %{base | globals: Map.merge(base.globals, %{universe: universe, top_items: 50})}

  {:ok, r} = Analysis.analyze(compiled, stream, case_mode: case_mode, rule_set: rule_set)
  sim = r.simulation

  totals = fn ng -> %{unigram: ng.totals.unigram, bigram: ng.totals.bigram, trigram: ng.totals.trigram, skip: Tuple.to_list(ng.totals.skip)} end

  payload = %{
    meta: %{
      layout: layout_id,
      corpus: corpus_name,
      preset: preset_id,
      case_mode: case_mode,
      universe: universe,
      cross_word: r.globals.cross_word,
      stream_length: String.length(stream)
    },
    globals: r.globals,
    stats: sim.stats,
    coverage: sim.coverage,
    totals: %{no_space: totals.(sim.no_space), with_space: totals.(sim.with_space)},
    registry: Registry.all(sim.registry) |> Enum.map(&Map.take(&1, [:id, :layer, :pos, :key_kind, :label])),
    unigram_no_space: sim.no_space.unigram,
    unigram_with_space: sim.with_space.unigram,
    travel: sim.travel,
    runs: sim.runs,
    words_count: map_size(sim.words),
    results: Enum.map(r.results, &Map.from_struct/1),
    score: r.score,
    producers: sim.producers.by_symbol |> Map.new(fn {s, ps} -> {s, Enum.map(ps, & &1.id)} end),
    explain:
      Map.new(explain_words, fn w ->
        e = Resolver.explain(compiled, w, case_mode: case_mode)
        {w, %{presses: e.presses, steps: e.steps, coverage: e.coverage}}
      end)
  }

  name = "#{layout_id}__#{corpus_name}__#{preset_id}__#{case_mode}__#{universe}.json"
  G.write!(Path.join(out, name), payload)
end

# ---------------------------------------------------------------- matrix
combos =
  for l <- layouts, {cn, ct} <- corpora, p <- presets, u <- universes do
    {l, cn, ct, p, :fold, u}
  end ++
    for cn <- ["fixture_en", "fixture_pt"] do
      {ct} = {Enum.find_value(corpora, fn {n, t} -> n == cn && t end)}
      {"magic-romak", cn, ct, "layouts_doc", :model, :no_space}
    end

total_bytes =
  Enum.reduce(combos, 0, fn {l, cn, ct, p, cm, u}, acc ->
    {path, size} = dump.(l, cn, ct, p, cm, u)
    IO.puts("#{Path.basename(path)}  #{div(size, 1024)} kB")
    acc + size
  end)

# ---------------------------------------------------------------- bundled layouts + inline blob
for layout <- Layouts.all() do
  G.write!(Path.join([out, "layouts", "#{layout.id}.json"]), Layout.to_map(layout))
end

blob =
  Layouts.get("magic-romak")
  |> Layout.encode!()
  |> :zlib.compress()
  |> Base.url_encode64(padding: false)

File.write!(Path.join(out, "inline-magic-romak.txt"), blob)

IO.puts("\n#{length(combos)} reports, #{div(total_bytes, 1024)} kB total")
IO.puts("#{length(Layouts.all())} bundled layout JSONs, inline blob #{byte_size(blob)} bytes")
