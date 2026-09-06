defmodule LayoutMaster.Rules.EngineTest do
  use ExUnit.Case, async: true

  alias LayoutMaster.Analysis
  alias LayoutMaster.Corpus.Normalize
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layouts
  alias LayoutMaster.Layouts.Romak
  alias LayoutMaster.Rules.{Bands, Catalog, Engine, Presets, Serialize}
  alias LayoutMaster.Sim.Resolver

  @opts [case_mode: :fold, cross_word: :reset]

  defp fixture(name), do: File.read!(Path.join([:code.priv_dir(:layoutmaster), "fixtures", name]))

  defp result(report, id), do: Enum.find(report.results, &(&1.id == id))

  setup_all do
    stream =
      Normalize.normalize(fixture("fixture_en.txt") <> " " <> fixture("fixture_pt.txt"), @opts)

    {:ok, qwerty} = Analysis.analyze(Layouts.get("qwerty"), stream, @opts)
    {:ok, magic} = Analysis.analyze(Romak.magic_romak(), stream, @opts)
    %{stream: stream, qwerty: qwerty, magic: magic}
  end

  test "every catalog rule evaluates and yields a numeric or nil value", %{qwerty: r} do
    assert length(r.results) == length(Catalog.all())
    for res <- r.results, do: assert(is_number(res.value) or is_nil(res.value), res.id)
  end

  test "Qwerty has high SFB and the famous ed/de bigrams", %{qwerty: r} do
    sfb = result(r, "sfb")
    assert sfb.value > 3.0
    labels = Enum.map(sfb.items, & &1.label)
    assert Enum.any?(labels, &(&1 in ["ed", "de"]))
    assert sfb.band.quality == :bad
  end

  test "trigram categories are disjoint and sum to ≤ 100%", %{qwerty: r} do
    ids = ~w(alternation roll_in roll_out onehand_in onehand_out redirect)
    total = ids |> Enum.map(&result(r, &1).value) |> Enum.sum()
    assert total > 60.0 and total <= 100.0
    # rolls = roll_in + roll_out
    assert_in_delta result(r, "rolls").value,
                    result(r, "roll_in").value + result(r, "roll_out").value,
                    1.0e-6
  end

  test "usage rules distribute to 100%", %{qwerty: r} do
    fu = result(r, "finger_usage")
    assert_in_delta fu.per_finger |> Map.values() |> Enum.sum(), 100.0, 0.01
    hb = result(r, "hand_balance")
    assert_in_delta hb.per_hand |> Map.values() |> Enum.sum(), 100.0, 0.01
  end

  test "Magic Romak shows layer-family metrics and lower SFB than Qwerty", %{qwerty: q, magic: m} do
    assert result(m, "sfb").value < result(q, "sfb").value
    assert result(m, "layer_taps_per_100").value > 0
    assert result(m, "extra_keystrokes").value > 0
    assert result(q, "layer_taps_per_100").value == 0
    assert result(m, "adaptive_hit_rate").value >= 0
    layers = result(m, "layer_distribution").breakdown
    assert map_size(layers) >= 2
  end

  test "in:out ratio is a ratio rule computed after the others", %{qwerty: r} do
    ratio = result(r, "in_out_ratio")
    ri = result(r, "roll_in").value
    ro = result(r, "roll_out").value
    assert_in_delta ratio.value, ri / ro, 1.0e-6
  end

  test "bands classify per Doc thresholds" do
    assert Bands.classify(0.5, Catalog.bands().sfb).label == :min
    assert Bands.classify(1.2, Catalog.bands().sfb).label == :mid_high
    assert Bands.classify(2.0, Catalog.bands().sfb).quality == :bad
    assert Bands.classify(40.0, Catalog.bands().alt).quality == :good
  end

  test "presets change definitions and normalization", %{stream: stream} do
    c = Compile.compile!(Layouts.get("qwerty"))
    sim = Resolver.simulate(c, stream, @opts)
    doc = Engine.evaluate(sim, c, Presets.layouts_doc())
    cy = Engine.evaluate(sim, c, Presets.cyanophage())
    sfb_doc = Enum.find(doc.results, &(&1.id == "sfb")).value
    sfb_cy = Enum.find(cy.results, &(&1.id == "sfb")).value

    # keystroke normalization (with one space per word) yields a smaller percentage than bigram normalization
    assert sfb_cy < sfb_doc
    romak = Engine.evaluate(sim, c, Presets.romak_author())
    assert romak.score.enabled
    assert is_number(romak.score.value)
  end

  test "rule sets round-trip through JSON" do
    json = Serialize.to_json(Presets.romak_author())
    {:ok, back} = Serialize.from_json(json)
    assert back.id == "romak_author"
    sfb = Enum.find(back.rules, &(&1.id == "sfb"))
    assert sfb.where == Catalog.sfb_where()
    assert sfb.ngram == %{n: 2, skip: 0}
    assert sfb.aggregate == :percent_of_ngrams
    assert sfb.bands.direction == :lower_is_better
    lsb = Enum.find(back.rules, &(&1.id == "lsb"))
    assert lsb.where == Catalog.lsb_where()
  end

  test "custom composed rule: ring lower than middle, one row apart", %{stream: stream} do
    c = Compile.compile!(Layouts.get("qwerty"))
    sim = Resolver.simulate(c, stream, @opts)

    rule = %{
      id: "custom_rm",
      label: "Ring below middle (1 row)",
      family: :bigram,
      enabled: true,
      source: :ngram,
      ngram: %{n: 2, skip: 0},
      where: %{
        all: [%{same_hand: true}, %{finger_name_pair: [:ring, :middle]}, %{row_delta: %{abs: 1}}]
      },
      aggregate: :percent_of_ngrams,
      score: %{weight: 0.0}
    }

    %{results: [res]} = Engine.evaluate(sim, c, %{globals: %{}, rules: [rule]})
    assert res.value > 0
    assert res.items != []
  end

  test "structure hash is stable and changes with case mode" do
    l = Romak.magic_romak()
    assert Analysis.structure_hash(l) == Analysis.structure_hash(l)
    assert Analysis.structure_hash(l, case_mode: :model) != Analysis.structure_hash(l)
  end
end
