defmodule LayoutMaster.Analysis do
  @moduledoc """
  Orchestration: layout + corpus + rule set → report (SPEC §10 engine API).
  """

  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Rules.Engine
  alias LayoutMaster.Rules.Presets
  alias LayoutMaster.Sim.Resolver

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
              elapsed_ms: 0

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
