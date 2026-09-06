defmodule LayoutMaster.Sim.MachineTest do
  use ExUnit.Case, async: true

  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layouts.Romak
  alias LayoutMaster.Sim.Machine

  defp mini(layers, extra \\ %{}) do
    struct!(
      %Layout{
        name: "mini",
        geometry: %{preset: "3x5+2", column_offsets: %{}},
        keys: %{space: "L0", shift: nil},
        layers: Enum.map(layers, fn l -> Map.merge(%{name: l.id, shifted_twin: nil}, l) end)
      },
      extra
    )
  end

  defp kp(s), do: %{kind: :kp, symbol: s}

  defp machine_for(layout) do
    c = Compile.compile!(layout)
    %{c: c, m: Machine.new(c)}
  end

  defp press(%{c: c, m: m} = ctx, id) do
    {m2, [ev]} = Machine.perform(c, m, {:tap, Compile.key_idx!(c, id)})
    {%{ctx | m: m2}, ev}
  end

  defp hold(%{c: c, m: m} = ctx, id) do
    {m2, [ev]} = Machine.perform(c, m, {:hold_press, Compile.key_idx!(c, id)})
    {%{ctx | m: m2}, ev}
  end

  defp release(%{c: c, m: m} = ctx, id) do
    {m2, [ev]} = Machine.perform(c, m, {:hold_release, Compile.key_idx!(c, id)})
    {%{ctx | m: m2}, ev}
  end

  defp active?(%{c: c, m: m}, layer), do: Machine.layer_active?(m, Compile.layer_idx!(c, layer))

  describe "one-shot layers" do
    test "sticky layer is consumed by exactly one press" do
      ctx = machine_for(Romak.romak24())
      {ctx, ev} = press(ctx, "R0")
      assert ev.leaf_kind == :sl
      assert active?(ctx, "alpha2")
      {ctx, q} = press(ctx, "LTR")
      assert q.symbols == "q"
      assert q.layer == Compile.layer_idx!(ctx.c, "alpha2")
      refute active?(ctx, "alpha2")
      {_ctx, s} = press(ctx, "LHM")
      assert s.symbols == "s"
    end

    test "sticky layer + modifier press consumes the one-shot without output (wasted)" do
      layout =
        mini([
          %{
            id: "base",
            bindings: %{
              "LHP" => kp("a"),
              "LHR" => %{kind: :sl, layer: "one"},
              "LHM" => %{kind: :sk, mod: :LSHIFT},
              "L0" => kp(" ")
            }
          },
          %{id: "one", bindings: %{"LHP" => kp("b")}}
        ])

      ctx = machine_for(layout)
      {ctx, _} = press(ctx, "LHR")
      {ctx, ev} = press(ctx, "LHM")
      assert ev.symbols == ""
      assert ev.wasted_one_shot
      refute active?(ctx, "one")
      {_ctx, a} = press(ctx, "LHP")
      assert a.symbols == "A"
    end

    test "a one-shot consumed by a transparent key falling to base is wasted" do
      ctx = machine_for(Romak.romak24())
      {ctx, _} = press(ctx, "R0")
      {_ctx, ev} = press(ctx, "L0")
      assert ev.symbols == " "
      assert ev.wasted_one_shot
    end

    test "macro arms a one-shot layer (ç → Ç extension)" do
      ctx = machine_for(Romak.romak24())
      {ctx, _} = press(ctx, "R0")
      {ctx, c} = press(ctx, "LBM")
      assert c.symbols == "ç"
      {ctx, a} = press(ctx, "RHI")
      assert a.symbols == "ã"
      assert a.layer == Compile.layer_idx!(ctx.c, "ccedil")
      {_ctx, o} = press(ctx, "RTM")
      assert o.symbols == "o"
    end

    test "last symbol is not changed by layer taps" do
      ctx = machine_for(Romak.romak24())
      {ctx, _} = press(ctx, "RHM")
      assert ctx.m.last_symbol == "a"
      {ctx, _} = press(ctx, "R0")
      assert ctx.m.last_symbol == "a"
    end
  end

  describe "adaptive keys" do
    test "magic key outputs h by default and v after vowels" do
      ctx = machine_for(Romak.magic_romak())
      {ctx, _} = press(ctx, "LBM")
      {ctx, h} = press(ctx, "RBI")
      assert h.symbols == "h"
      {ctx, _} = press(ctx, "RHM")
      {_ctx, v} = press(ctx, "RBI")
      assert v.symbols == "v"
    end

    test "adaptive chains: alt-repeat on the accent layer falls back to the base repeat" do
      ctx = machine_for(Romak.magic_romak())
      {ctx, _} = press(ctx, "RHM")
      {ctx, _} = press(ctx, "R0")
      {ctx, e} = press(ctx, "RHR")
      assert e.symbols == "é"
      {ctx, x} = press(ctx, "L1")
      assert x.symbols == "x"
      {_ctx, ev} = press(ctx, "L1")
      assert ev.symbols == ""
      assert ev.leaf_kind == :sl
    end

    test "macro sets last symbol to its last emitted grapheme (qu → u → ê)" do
      ctx = machine_for(Romak.magic_romak())
      {ctx, _} = press(ctx, "R0")
      {ctx, qu} = press(ctx, "LTM")
      assert qu.symbols == "qu"
      {_ctx, e} = press(ctx, "L1")
      assert e.symbols == "ê"
    end
  end

  describe "toggles, to-layer, locking, conditional layers" do
    defp cond_layout do
      mini(
        [
          %{
            id: "base",
            bindings: %{
              "LHP" => kp("a"),
              "LHR" => %{kind: :tog, layer: "one", mode: :flip},
              "LHM" => %{kind: :to, layer: "two"},
              "LHI" => %{kind: :mo, layer: "one"},
              "LHC" => %{kind: :mo, layer: "two"},
              "L0" => kp(" ")
            }
          },
          %{id: "one", bindings: %{"LHP" => kp("b")}},
          %{id: "two", bindings: %{"LHP" => kp("c")}},
          %{id: "three", bindings: %{"LHP" => kp("d")}}
        ],
        %{conditional_layers: [%{if: ["one", "two"], then: "three"}]}
      )
    end

    test "tog flips and locks; a mo release cannot deactivate a locked layer" do
      ctx = machine_for(cond_layout())
      {ctx, _} = hold(ctx, "LHI")
      {ctx, _} = press(ctx, "LHR")
      {ctx, _} = release(ctx, "LHI")
      assert active?(ctx, "one")
      {ctx, b} = press(ctx, "LHP")
      assert b.symbols == "b"
      {ctx, _} = press(ctx, "LHR")
      {_ctx, a} = press(ctx, "LHP")
      assert a.symbols == "a"
    end

    test "to-layer deactivates every other layer except base" do
      ctx = machine_for(cond_layout())
      {ctx, _} = press(ctx, "LHR")
      {ctx, _} = press(ctx, "LHM")
      refute active?(ctx, "one")
      assert active?(ctx, "two")
      {_ctx, c} = press(ctx, "LHP")
      assert c.symbols == "c"
    end

    test "conditional layer is forced on when both if-layers are active and off otherwise" do
      ctx = machine_for(cond_layout())
      {ctx, _} = hold(ctx, "LHI")
      refute active?(ctx, "three")
      {ctx, _} = hold(ctx, "LHC")
      assert active?(ctx, "three")
      {ctx, d} = press(ctx, "LHP")
      assert d.symbols == "d"
      {ctx, _} = release(ctx, "LHC")
      refute active?(ctx, "three")
    end
  end

  describe "combos, caps word, holds" do
    test "combo fires only when the highest active layer is in its layer list" do
      ctx = machine_for(Romak.romak24())
      q = Enum.find_index(Tuple.to_list(ctx.c.combos), &(&1.id == "ns"))
      {m2, [ev]} = Machine.perform(ctx.c, ctx.m, {:chord, q})
      assert ev.symbols == "q"
      ctx = %{ctx | m: m2}
      {ctx, _} = press(ctx, "R0")
      refute Machine.combo_available?(ctx.c, ctx.m, q)
      {_m3, [ev2]} = Machine.perform(ctx.c, ctx.m, {:chord, q})
      assert ev2.symbols == ""
    end

    test "caps word ends on a non-continue key" do
      layout =
        mini([
          %{
            id: "base",
            bindings: %{
              "LHP" => kp("a"),
              "LHR" => kp(","),
              "LHM" => %{kind: :caps_word, continue_list: ["_"], mods: [:LSHIFT]},
              "L0" => kp(" ")
            }
          }
        ])

      ctx = machine_for(layout)
      {ctx, _} = press(ctx, "LHM")
      {ctx, a1} = press(ctx, "LHP")
      assert a1.symbols == "A"
      {ctx, a2} = press(ctx, "LHP")
      assert a2.symbols == "A"
      {ctx, comma} = press(ctx, "LHR")
      assert comma.symbols == ","
      {_ctx, a3} = press(ctx, "LHP")
      assert a3.symbols == "a"
    end

    test "hold press activates the layer until release" do
      layout =
        mini([
          %{
            id: "base",
            bindings: %{
              "LHP" => kp("a"),
              "LHI" => %{kind: :lt, layer: "one", tap: kp("t")},
              "L0" => kp(" ")
            }
          },
          %{id: "one", bindings: %{"LHP" => kp("b")}}
        ])

      ctx = machine_for(layout)
      {ctx, t} = press(ctx, "LHI")
      assert t.symbols == "t"
      {ctx, h} = hold(ctx, "LHI")
      assert h.kind == :hold_press
      assert h.symbols == ""
      {ctx, b} = press(ctx, "LHP")
      assert b.symbols == "b"
      {ctx, r} = release(ctx, "LHI")
      assert r.kind == :hold_release
      {_ctx, a} = press(ctx, "LHP")
      assert a.symbols == "a"
    end

    test "sticky shift capitalizes exactly one key" do
      ctx = machine_for(Romak.romak24())
      {ctx, _} = press(ctx, "R1")
      {ctx, a} = press(ctx, "RHM")
      assert a.symbols == "A"
      {_ctx, a2} = press(ctx, "RHM")
      assert a2.symbols == "a"
    end
  end
end
