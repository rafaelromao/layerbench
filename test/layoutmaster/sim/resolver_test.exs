defmodule LayoutMaster.Sim.ResolverTest do
  use ExUnit.Case, async: true

  alias LayoutMaster.Corpus.Normalize
  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layout.Text
  alias LayoutMaster.Layouts
  alias LayoutMaster.Layouts.Romak
  alias LayoutMaster.Sim.Resolver

  @opts [case_mode: :fold, cross_word: :reset]

  defp fixture(name) do
    path = Path.join([:code.priv_dir(:layoutmaster), "fixtures", name])
    File.read!(path)
  end

  defp trace(layout, text, extra \\ []) do
    c = Compile.compile!(layout)
    r = Resolver.explain(c, text, Keyword.merge(@opts, extra))
    keys = r.steps |> Enum.reject(&(&1.kind == :hold_release)) |> Enum.map(& &1.key)
    out = r.steps |> Enum.map(& &1.symbols) |> IO.iodata_to_binary()
    Map.merge(r, %{keys: keys, out: out})
  end

  describe "Romak acceptance traces (SPEC §11.3)" do
    test "ação with the ão macro enabled: a · ² · ç · ão (4 presses)" do
      t = trace(Romak.romak24(), "ação")
      assert t.out == "ação"
      assert t.keys == ["RHM", "R0", "LBM", "LHI"]
      assert t.presses == 4
    end

    test "ação with the ão macro disabled: a · ² · ç · ã · o (5 presses)" do
      t =
        trace(Romak.romak24(), "ação",
          typing_paths: %{
            "ão" => [%{producer: "macro:ccedil/LHI", enabled: false, after_any: nil}]
          }
        )

      assert t.out == "ação"
      assert t.keys == ["RHM", "R0", "LBM", "RHI", "RTM"]
    end

    test "açúcar needs a second alpha-2 activation (from the Ç extension thumb)" do
      t = trace(Romak.romak24(), "açúcar")
      assert t.out == "açúcar"
      assert Enum.count(t.steps, &(&1.key_kind == :layer_tap)) == 2
      assert t.keys == ["RHM", "R0", "LBM", "L1", "RTR", "LBM", "RHM", "RHI"]
    end

    test "chave uses the magic key for h (after consonant) and v (after vowel): 5 presses" do
      t = trace(Romak.magic_romak(), "chave")
      assert t.out == "chave"
      assert t.keys == ["LBM", "RBI", "RHM", "RBI", "RHR"]
    end

    test "doubled letters use the repeat key when the policy says so" do
      t = trace(Romak.magic_romak(), "hello")
      assert t.out == "hello"
      assert t.keys == ["RBI", "RHR", "RTI", "L1", "RTM"]
      t2 = trace(Romak.magic_romak(), "hello", repeat_policy: :tap_twice)
      assert t2.keys == ["RBI", "RHR", "RTI", "RTI", "RTM"]
    end

    test "sentence case (model mode): the letter after '. ' needs no shift press" do
      t = trace(Romak.magic_romak(), "x. Ab", case_mode: :model)
      assert t.out == "x. Ab"
      assert Enum.count(t.steps, &(&1.key_kind == :shift)) == 0
      t2 = trace(Romak.magic_romak(), "Ab", case_mode: :model)
      assert t2.out == "Ab"
      assert Enum.count(t2.steps, &(&1.key_kind == :shift)) == 1
    end

    test "shifted alpha-2 twin: an uppercase accented letter uses shift then the layer key" do
      t = trace(Romak.magic_romak(), "É", case_mode: :model)
      assert t.out == "É"
      assert hd(t.keys) == "R1"
      assert "R0" in t.keys
    end

    test "greedy tokenization: qu is one press" do
      t = trace(Romak.romak24(), "quando")
      assert t.out == "quando"
      assert t.keys == ["R0", "LTM", "RHM", "LHR", "LHP", "RTM"]
    end

    test "Romak 34 types accents and plain letters (ão outside the Ç extension falls back)" do
      t = trace(Romak.romak34(), "não é")
      assert t.out == "não é"
    end
  end

  describe "simulate — tables and coverage" do
    test "unproducible symbols are reported and act as boundaries" do
      c = Compile.compile!(Romak.romak24())
      r = Resolver.simulate(c, Normalize.normalize("ab#cd ok", @opts), @opts)
      assert r.coverage.unproducible == %{}
      assert r.stats.words == 2
      r2 = Resolver.simulate(c, "aßb", @opts)
      assert r2.coverage.unproducible == %{"ß" => 1}
      assert r2.no_space.totals.bigram == 0
    end

    test "no-space universe resets at word boundaries in reset mode; with-space includes space keys" do
      c = Compile.compile!(Romak.romak24())
      stream = Normalize.normalize("ab cd", @opts)
      r = Resolver.simulate(c, stream, @opts)
      assert r.no_space.totals.unigram == 4
      assert r.no_space.totals.bigram == 2
      assert r.with_space.totals.unigram == 5
      assert r.with_space.totals.bigram == 4
      bridged = Resolver.simulate(c, stream, Keyword.put(@opts, :cross_word, :bridge))
      assert bridged.no_space.totals.bigram == 3
    end

    test "layer taps appear in the key stream and layer stats" do
      c = Compile.compile!(Romak.romak24())
      r = Resolver.simulate(c, Normalize.normalize("quero", @opts), @opts)
      assert r.stats.layer_taps == 1
      assert r.stats.keystrokes == 5
      assert r.stats.symbols == 5
    end

    test "every bundled layout simulates the fixture corpus" do
      stream =
        Normalize.normalize(fixture("fixture_en.txt") <> " " <> fixture("fixture_pt.txt"), @opts)

      for layout <- Layouts.all() do
        c = Compile.compile!(layout)
        r = Resolver.simulate(c, stream, @opts)
        assert r.stats.keystrokes > 1000, layout.name
      end
    end

    test "Magic Romak covers the whole Portuguese fixture except soft punctuation" do
      c = Compile.compile!(Romak.magic_romak())
      r = Resolver.simulate(c, Normalize.normalize(fixture("fixture_pt.txt"), @opts), @opts)
      assert Map.keys(r.coverage.unproducible) == []
    end
  end

  describe "layout JSON round trip" do
    test "encode → decode → compile keeps behavior" do
      json = Layout.encode!(Romak.magic_romak())
      {:ok, decoded} = Layout.decode(json)
      c = Compile.compile!(decoded)
      r = Resolver.explain(c, "chave", @opts)
      assert r.steps |> Enum.map(& &1.key) == ["LBM", "RBI", "RHM", "RBI", "RHR"]
    end
  end

  describe "text import" do
    test "imports a cyanophage 34-character string onto 3x5+2" do
      {layout, overflow, _} = Text.import("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", "3x5+2")
      b = hd(layout.layers).bindings
      assert b["LTP"] == %{kind: :kp, symbol: "q"}
      assert b["RTP"] == %{kind: :kp, symbol: "p"}
      assert overflow == ["-", "'"]
    end

    test "imports newline rows with a thumb row" do
      {layout, _, _} =
        Text.import(
          "q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /\ne space",
          "3x5+2"
        )

      assert hd(layout.layers).bindings["L1"] == %{kind: :kp, symbol: "e"}
      assert layout.keys.space == "L0"
    end
  end
end
