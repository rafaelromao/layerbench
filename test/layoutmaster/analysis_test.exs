defmodule LayoutMaster.AnalysisTest do
  use ExUnit.Case, async: true

  alias LayoutMaster.Analysis
  alias LayoutMaster.Corpus.Normalize
  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layouts
  alias LayoutMaster.Layouts.Romak
  alias LayoutMaster.Rules.Presets

  @opts [case_mode: :fold, cross_word: :reset]

  defp fixture(name), do: File.read!(Path.join([:code.priv_dir(:layoutmaster), "fixtures", name]))
  defp value(report, id), do: Enum.find(report.results, &(&1.id == id)).value

  describe "relabel after a swap (SPEC §5.6)" do
    test "matches a full re-analysis for every n-gram metric" do
      stream = Normalize.normalize(fixture("fixture_en.txt"), @opts)
      qwerty = Layouts.get("qwerty")
      {:ok, base} = Analysis.analyze(qwerty, stream, @opts)
      c0 = base.compiled

      # e (left top middle) ↔ j (right home index): different hands, very different frequencies
      swapped = Layout.swap_keys(qwerty, 0, "LTM", "RHI")
      {:ok, c1} = Compile.compile(swapped)
      pa = Compile.key_idx!(c0, "LTM")
      pb = Compile.key_idx!(c0, "RHI")

      assert Analysis.relabel_eligible?(c0, 0, pa, pb)
      relabeled = Analysis.relabel_swap(base, c1, 0, pa, pb, Presets.layouts_doc())
      {:ok, full} = Analysis.analyze(swapped, stream, @opts)

      assert relabeled.provisional
      refute full.provisional
      # the swap really changed the layout
      assert abs(value(base, "sfb") - value(full, "sfb")) > 0.01

      for id <-
            ~w(sfb sfs sfb_distance lsb fsb hsb alternation rolls roll_in roll_out redirect
               onehand_in finger_usage hand_balance pinky_off home_row effort layer_taps_per_100) do
        assert_in_delta value(relabeled, id), value(full, id), 1.0e-6, id
      end
    end

    test "is refused for keys that are not plain symbols and for the space key" do
      {:ok, c} = Compile.compile(Romak.magic_romak())
      keys = Tuple.to_list(c.keys)
      thumb = Enum.find_index(keys, & &1.thumb)
      letter = Enum.find_index(keys, &(not &1.thumb and &1.row == 1))

      refute Analysis.relabel_eligible?(c, 0, thumb, letter)

      {:ok, q} = Compile.compile(Layouts.get("qwerty"))
      refute Analysis.relabel_eligible?(q, 0, q.space_key, Compile.key_idx!(q, "LHM"))

      assert Analysis.relabel_eligible?(
               q,
               0,
               Compile.key_idx!(q, "LHM"),
               Compile.key_idx!(q, "RHM")
             )
    end
  end

  test "Layout.swap_keys/4 exchanges two bindings on one layer only" do
    qwerty = Layouts.get("qwerty")
    swapped = Layout.swap_keys(qwerty, 0, "LHP", "RHP")
    [base | _] = swapped.layers
    assert base.bindings["LHP"] == hd(qwerty.layers).bindings["RHP"]
    assert base.bindings["RHP"] == hd(qwerty.layers).bindings["LHP"]
    assert Enum.drop(swapped.layers, 1) == Enum.drop(qwerty.layers, 1)
  end
end
