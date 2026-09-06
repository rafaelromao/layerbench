defmodule LayoutMaster.Analysis.Cache do
  @moduledoc """
  ETS cache of analysis reports keyed by `{structure_hash, corpus_id, case_mode, max_symbols}`.
  LiveViews run `analyze/3` inside `start_async` tasks so results are cached across views and
  sessions while each socket keeps control (and cancellation) of its own work.
  """

  use GenServer

  alias LayoutMaster.Analysis
  alias LayoutMaster.Corpus
  alias LayoutMaster.Layout

  @table :layoutmaster_analysis_cache
  @max_entries 64

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @impl true
  def init(_opts) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    {:ok, %{}}
  end

  @doc "Cache key for a request."
  def key(%Layout{} = layout, corpus_id, opts) do
    {Analysis.structure_hash(layout, Keyword.put(opts, :corpus_id, corpus_id)),
     Keyword.get(opts, :case_mode, :fold), Keyword.get(opts, :cross_word, :reset),
     Keyword.get(opts, :max_symbols, :infinity)}
  end

  def get(key) do
    case :ets.lookup(@table, key) do
      [{^key, report, _at}] -> {:ok, report}
      [] -> :miss
    end
  end

  def put(key, report) do
    if :ets.info(@table, :size) >= @max_entries, do: evict()
    :ets.insert(@table, {key, report, System.monotonic_time(:millisecond)})
    :ok
  end

  defp evict do
    case :ets.tab2list(@table)
         |> Enum.sort_by(fn {_k, _r, at} -> at end)
         |> Enum.take(div(@max_entries, 4)) do
      [] -> :ok
      old -> Enum.each(old, fn {k, _, _} -> :ets.delete(@table, k) end)
    end
  end

  def clear, do: :ets.delete_all_objects(@table)

  @doc "Analyze with caching. `corpus` is a `%Corpus{}`; `opts` are `LayoutMaster.Analysis` options."
  def analyze(%Layout{} = layout, %Corpus{} = corpus, opts) do
    key = key(layout, corpus.id, opts)

    case get(key) do
      {:ok, report} ->
        {:ok, report}

      :miss ->
        stream = Corpus.stream(corpus, Keyword.get(opts, :case_mode, :fold))

        with {:ok, report} <- Analysis.analyze(layout, stream, opts) do
          put(key, report)
          {:ok, report}
        end
    end
  end
end
