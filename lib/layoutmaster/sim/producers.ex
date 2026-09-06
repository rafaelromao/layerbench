defmodule LayoutMaster.Sim.Producers do
  @moduledoc """
  Enumerate every way to produce each symbol string on a layout (SPEC §5.4.1).
  """

  alias LayoutMaster.Layout.Binding
  alias LayoutMaster.Layout.Compile

  defmodule Step do
    @moduledoc false
    defstruct layer: nil, pos: 0, binding: %{kind: :none}, mode: :tap, taps: 1, combo: nil
  end

  defmodule Producer do
    @moduledoc false
    defstruct id: nil,
              symbols: "",
              kind: :direct,
              steps: [],
              after_any: nil,
              mods: [],
              cost: 1.0,
              dynamic: false

    @type t :: %__MODULE__{}
  end

  defmodule Index do
    @moduledoc false
    defstruct by_symbol: %{},
              by_id: %{},
              max_len: 1,
              multi_starts: MapSet.new(),
              excluded_by_case: []

    @type t :: %__MODULE__{}
  end

  @max_depth 8

  @doc "Static textual outputs of a binding when tapped."
  def static_outputs(binding, depth \\ 0)
  def static_outputs(_b, depth) when depth > @max_depth, do: []

  def static_outputs(%{kind: :kp} = b, _depth) do
    case b[:symbol] do
      nil ->
        []

      sym ->
        out = [
          %{
            symbols: sym,
            taps: 1,
            kind: :direct,
            suffix: "",
            mods: [],
            after_any: nil,
            dynamic: false
          }
        ]

        case b[:shifted] do
          nil ->
            out

          sh ->
            out ++
              [
                %{
                  symbols: sh,
                  taps: 1,
                  kind: :direct,
                  suffix: "#shifted",
                  mods: [:LSHIFT],
                  after_any: nil,
                  dynamic: false
                }
              ]
        end
    end
  end

  def static_outputs(%{kind: :unicode} = b, _depth) do
    out = [
      %{
        symbols: b.symbol,
        taps: 1,
        kind: :direct,
        suffix: "",
        mods: [],
        after_any: nil,
        dynamic: false
      }
    ]

    case b[:shifted_symbol] do
      nil ->
        out

      sh ->
        out ++
          [
            %{
              symbols: sh,
              taps: 1,
              kind: :direct,
              suffix: "#shifted",
              mods: [:LSHIFT],
              after_any: nil,
              dynamic: false
            }
          ]
    end
  end

  def static_outputs(%{kind: :macro} = b, depth) do
    steps =
      cond do
        b[:steps] -> b.steps
        b[:symbols] -> for g <- Binding.graphemes(b.symbols), do: %{kind: :kp, symbol: g}
        true -> []
      end

    steps = steps ++ (b[:then] || [])

    result =
      Enum.reduce_while(steps, [%{symbols: "", after_any: nil, dynamic: false}], fn step,
                                                                                    combos ->
        outs = static_outputs(step, depth + 1)

        cond do
          outs == [] and Binding.emits_text?(step) ->
            {:halt, :dynamic}

          outs == [] ->
            {:cont, combos}

          true ->
            next =
              for c <- combos, o <- outs, o.mods == [] do
                %{
                  symbols: c.symbols <> o.symbols,
                  after_any: c.after_any || o.after_any,
                  dynamic: c.dynamic or o.dynamic
                }
              end

            {:cont, Enum.take(next, 8)}
        end
      end)

    case result do
      :dynamic ->
        []

      combos ->
        combos
        |> Enum.filter(&(&1.symbols != ""))
        |> Enum.with_index()
        |> Enum.map(fn {c, i} ->
          %{
            symbols: c.symbols,
            taps: 1,
            kind: :macro,
            suffix: if(i == 0, do: "", else: "##{i}"),
            mods: [],
            after_any: c.after_any,
            dynamic: c.dynamic
          }
        end)
    end
  end

  def static_outputs(%{kind: :adaptive} = b, depth) do
    triggered =
      (b[:triggers] || [])
      |> Enum.with_index()
      |> Enum.flat_map(fn {t, i} ->
        for o <- static_outputs(t.binding, depth + 1) do
          %{
            o
            | kind: adaptive_kind(o.kind),
              after_any: o.after_any || t.after_any,
              suffix: "#t#{i}" <> o.suffix,
              dynamic: true
          }
        end
      end)

    default =
      case b[:default] do
        nil ->
          []

        d ->
          for o <- static_outputs(d, depth + 1),
              do: %{
                o
                | kind: adaptive_kind(o.kind),
                  suffix: "#default" <> o.suffix,
                  dynamic: true
              }
      end

    triggered ++ default
  end

  def static_outputs(%{kind: :key_repeat}, _depth),
    do: [
      %{symbols: "", taps: 1, kind: :repeat, suffix: "", mods: [], after_any: nil, dynamic: true}
    ]

  def static_outputs(%{kind: :hold_tap, tap: t}, depth), do: static_outputs(t, depth + 1)
  def static_outputs(%{kind: :lt, tap: t}, depth), do: static_outputs(t, depth + 1)

  def static_outputs(%{kind: :mod_morph} = b, depth) do
    static_outputs(b.default, depth + 1) ++
      for o <- static_outputs(b.morphed, depth + 1),
          do: %{o | mods: o.mods ++ b.mods, suffix: "#morph" <> o.suffix}
  end

  def static_outputs(%{kind: :layer_morph} = b, depth) do
    static_outputs(b.inactive, depth + 1) ++
      for o <- static_outputs(b.active, depth + 1),
          do: %{o | suffix: "#lm" <> o.suffix, dynamic: true}
  end

  def static_outputs(%{kind: :tap_dance, bindings: bs}, depth) do
    bs
    |> Enum.with_index()
    |> Enum.flat_map(fn {x, i} ->
      for o <- static_outputs(x, depth + 1),
          do: %{o | taps: i + 1, suffix: "#td#{i + 1}" <> o.suffix}
    end)
  end

  def static_outputs(_b, _depth), do: []

  defp adaptive_kind(k) when k in [:direct, :macro], do: :adaptive
  defp adaptive_kind(k), do: k

  @doc "Enumerate producers for a compiled layout."
  @spec enumerate(Compile.t(), :fold | :model) :: Index.t()
  def enumerate(%Compile{} = c, case_mode) do
    fold = case_mode == :fold

    {producers, excluded} =
      for layer <- Tuple.to_list(c.layers), pos <- 0..(c.n_keys - 1), reduce: {[], []} do
        {acc, excl} ->
          b = elem(layer.bindings, pos)

          if b.kind in [:trans, :none] do
            {acc, excl}
          else
            key_id = Compile.key(c, pos).id

            Enum.reduce(static_outputs(b), {acc, excl}, fn o, {acc, excl} ->
              base =
                case o.kind do
                  :repeat -> "repeat"
                  :adaptive -> "adaptive"
                  :macro -> "macro"
                  _ -> "direct"
                end

              p = %Producer{
                id: "#{base}:#{layer.id}/#{key_id}#{o.suffix}",
                symbols:
                  if(o.kind == :repeat,
                    do: "",
                    else: if(fold, do: String.downcase(o.symbols), else: o.symbols)
                  ),
                kind: o.kind,
                steps: [%Step{layer: layer.idx, pos: pos, binding: b, mode: :tap, taps: o.taps}],
                after_any: o.after_any,
                mods: o.mods,
                cost:
                  o.taps + if(layer.idx == 0, do: 0, else: 1) + if(o.mods != [], do: 1, else: 0),
                dynamic: o.dynamic
              }

              cond do
                fold and o.mods != [] -> {acc, [p | excl]}
                fold and uppercase_only?(o.after_any) -> {acc, [p | excl]}
                true -> {[p | acc], excl}
              end
            end)
          end
      end

    producers =
      Enum.reduce(Tuple.to_list(c.combos), producers, fn combo, acc ->
        if combo.role != :typing do
          acc
        else
          Enum.reduce(static_outputs(combo.binding), acc, fn o, acc ->
            if o.mods != [] do
              acc
            else
              [
                %Producer{
                  id: "combo:#{combo.id}#{o.suffix}",
                  symbols: if(fold, do: String.downcase(o.symbols), else: o.symbols),
                  kind: :combo,
                  steps: [
                    %Step{
                      layer: nil,
                      pos: combo.pos,
                      binding: combo.binding,
                      mode: :chord,
                      taps: 1,
                      combo: combo.idx
                    }
                  ],
                  after_any: o.after_any,
                  mods: [],
                  cost: 1.5,
                  dynamic: o.dynamic
                }
                | acc
              ]
            end
          end)
        end
      end)

    producers = Enum.reverse(producers)

    by_symbol =
      producers
      |> Enum.group_by(& &1.symbols)
      |> Map.new(fn {sym, list} ->
        {sym,
         Enum.sort_by(list, fn p ->
           {p.cost, if(p.dynamic, do: 1, else: 0), if(p.kind == :combo, do: 1, else: 0), p.id}
         end)}
      end)

    {max_len, starts} =
      Enum.reduce(Map.keys(by_symbol), {1, MapSet.new()}, fn sym, {ml, st} ->
        n = String.length(sym)
        if n > 1, do: {max(ml, n), MapSet.put(st, String.first(sym))}, else: {ml, st}
      end)

    %Index{
      by_symbol: by_symbol,
      by_id: Map.new(producers, &{&1.id, &1}),
      max_len: max_len,
      multi_starts: starts,
      excluded_by_case: Enum.reverse(excluded)
    }
  end

  defp uppercase_only?(nil), do: false
  defp uppercase_only?([]), do: false
  defp uppercase_only?(list), do: Enum.all?(list, fn a -> a != String.downcase(a) end)

  @doc "Repeat-key producers (output depends on the previous symbol)."
  def repeat_producers(%Index{by_symbol: bs}), do: Map.get(bs, "", [])
end
