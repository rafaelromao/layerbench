defmodule LayoutMaster.Analysis do
  @moduledoc """
  Orchestration: layout + corpus + rule set → report (SPEC §10 engine API).
  """

  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Rules.Engine
  alias LayoutMaster.Rules.Presets
  alias LayoutMaster.Sim.Resolver
  alias LayoutMaster.Tables.Registry

  defmodule Report do
    @moduledoc false
    defstruct layout: nil,
              compiled: nil,
              simulation: nil,
              results: [],
              score: %{enabled: false, value: nil},
              globals: %{},
              coverage: %{},
              stats: %{},
              options: [],
              elapsed_ms: 0,
              provisional: false

    @type t :: %__MODULE__{}
  end

  @type opts :: [
          case_mode: :fold | :model,
          cross_word: :reset | :bridge,
          max_symbols: pos_integer() | :infinity,
          rule_set: map(),
          typing_paths: map()
        ]

  @doc "Analyze a layout against a normalized symbol stream."
  @spec analyze(Layout.t() | Compile.t(), String.t(), opts()) ::
          {:ok, Report.t()} | {:error, [String.t()]}
  def analyze(layout_or_compiled, stream, opts \\ []) do
    with {:ok, compiled} <- ensure_compiled(layout_or_compiled) do
      started = System.monotonic_time(:millisecond)
      rule_set = Keyword.get(opts, :rule_set) || Presets.layouts_doc()

      cross_word =
        Keyword.get(opts, :cross_word) || Map.get(rule_set.globals, :cross_word, :reset)

      sim_opts =
        [case_mode: Keyword.get(opts, :case_mode, :fold), cross_word: cross_word]
        |> maybe_put(:max_symbols, Keyword.get(opts, :max_symbols))
        |> maybe_put(:typing_paths, Keyword.get(opts, :typing_paths))

      simulation = Resolver.simulate(compiled, stream, sim_opts)

      %{results: results, score: score, globals: globals} =
        Engine.evaluate(simulation, compiled, rule_set)

      {:ok,
       %Report{
         layout: compiled.layout,
         compiled: compiled,
         simulation: simulation,
         results: results,
         score: score,
         globals: globals,
         coverage: simulation.coverage,
         stats: simulation.stats,
         options: sim_opts,
         elapsed_ms: System.monotonic_time(:millisecond) - started
       }}
    end
  end

  @doc "Re-run only the rules (e.g. after editing the rule set) on an existing report."
  def reevaluate(%Report{} = report, rule_set) do
    %{results: results, score: score, globals: globals} =
      Engine.evaluate(report.simulation, report.compiled, rule_set)

    %Report{report | results: results, score: score, globals: globals}
  end

  @doc """
  Whether swapping the bindings at `pos_a` and `pos_b` on layer `layer_idx` is a metadata-only
  change (SPEC §5.6): both are explicit plain `kp` bindings, neither is the space or shift key and
  no user typing path refers to either key.
  """
  def relabel_eligible?(%Compile{} = c, layer_idx, pos_a, pos_b)
      when is_integer(pos_a) and is_integer(pos_b) and pos_a != pos_b do
    layer = Compile.layer(c, layer_idx)
    ids = [elem(c.keys, pos_a).id, elem(c.keys, pos_b).id]

    plain? = fn pos ->
      elem(layer.explicit, pos) and match?(%{kind: :kp}, elem(layer.bindings, pos))
    end

    referenced? =
      Enum.any?(c.layout.typing_paths || %{}, fn {_sym, entries} ->
        Enum.any?(entries, fn e ->
          producer = to_string(Map.get(e, :producer) || "")
          Enum.any?(ids, &String.contains?(producer, "/" <> &1))
        end)
      end)

    plain?.(pos_a) and plain?.(pos_b) and pos_a not in [c.space_key, c.shift_key] and
      pos_b not in [c.space_key, c.shift_key] and not referenced?
  end

  def relabel_eligible?(_c, _layer_idx, _pos_a, _pos_b), do: false

  @doc """
  Metadata-only re-evaluation after swapping two plain keys (SPEC §5.6): the logical keys that
  lived at the swapped positions on `layer_idx` move to their new positions and the rules run
  again on the existing tables. Exact for n-gram metrics; travel, run and word statistics stay
  as simulated, so the report is marked `provisional` until the next full analysis.
  """
  def relabel_swap(%Report{} = report, %Compile{} = compiled, layer_idx, pos_a, pos_b, rule_set) do
    moves = %{pos_a => pos_b, pos_b => pos_a}
    registry0 = report.simulation.registry

    registry =
      registry0
      |> Registry.all()
      |> Enum.filter(&(&1.layer == layer_idx and Map.has_key?(moves, &1.pos)))
      |> Enum.reduce(registry0, fn lk, r ->
        Registry.set_position(r, lk.id, Map.fetch!(moves, lk.pos))
      end)

    simulation = %{report.simulation | registry: registry}

    %{results: results, score: score, globals: globals} =
      Engine.evaluate(simulation, compiled, rule_set)

    %Report{
      report
      | layout: compiled.layout,
        compiled: compiled,
        simulation: simulation,
        results: results,
        score: score,
        globals: globals,
        provisional: true
    }
  end

  @doc "Structure hash: everything that affects simulation except relabel-eligible symbols (SPEC §5.6)."
  def structure_hash(%Layout{} = layout, opts \\ []) do
    payload = %{
      layout: Layout.to_map(layout),
      case_mode: Keyword.get(opts, :case_mode, :fold),
      cross_word: Keyword.get(opts, :cross_word, :reset),
      max_symbols: Keyword.get(opts, :max_symbols, :infinity),
      corpus: Keyword.get(opts, :corpus_id)
    }

    :crypto.hash(:sha256, :erlang.term_to_binary(payload))
    |> Base.url_encode64(padding: false)
    |> binary_part(0, 22)
  end

  defp ensure_compiled(%Compile{} = c), do: {:ok, c}
  defp ensure_compiled(%Layout{} = l), do: Compile.compile(l)

  defp maybe_put(kw, _k, nil), do: kw
  defp maybe_put(kw, k, v), do: Keyword.put(kw, k, v)
end
