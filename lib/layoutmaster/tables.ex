defmodule LayoutMaster.Tables do
  @moduledoc """
  N-gram tables over *logical keys* (layer × position × kind × label), SPEC §3/§5.6.

  Accumulation uses ETS counters for speed; `finish/1` turns them into plain maps.
  Keys are packed integers: 10 bits per logical key id (max 1024 logical keys).
  """

  import Bitwise

  @shift 10
  @max_keys 1 <<< @shift
  @mask @max_keys - 1

  def max_keys, do: @max_keys

  def pack2(a, b), do: a <<< @shift ||| b
  def unpack2(k), do: {k >>> @shift, k &&& @mask}
  def pack3(a, b, c), do: a <<< (2 * @shift) ||| b <<< @shift ||| c
  def unpack3(k), do: {k >>> (2 * @shift), k >>> @shift &&& @mask, k &&& @mask}

  defmodule LogicalKey do
    @moduledoc false
    defstruct id: 0, layer: 0, pos: 0, key_kind: :alpha, label: ""
  end

  defmodule Registry do
    @moduledoc "Registry of logical keys (immutable map-based)."
    defstruct index: %{}, keys: %{}, next: 0

    def new, do: %__MODULE__{}

    @doc "Id for an event's logical key, registering it if new."
    def id_for(%__MODULE__{} = r, %{layer: layer, pos: pos, key_kind: kind, label: label}) do
      k = {layer, pos, kind, label}

      case Map.fetch(r.index, k) do
        {:ok, id} ->
          {r, id}

        :error ->
          id = r.next

          if id >= LayoutMaster.Tables.max_keys() do
            raise "too many logical keys"
          end

          lk = %LayoutMaster.Tables.LogicalKey{
            id: id,
            layer: layer,
            pos: pos,
            key_kind: kind,
            label: label
          }

          {%{r | index: Map.put(r.index, k, id), keys: Map.put(r.keys, id, lk), next: id + 1}, id}
      end
    end

    def get(%__MODULE__{keys: keys}, id), do: Map.fetch!(keys, id)
    def all(%__MODULE__{keys: keys}), do: keys |> Map.values() |> Enum.sort_by(& &1.id)

    @doc "Relabel: move a logical key to another position (metadata only)."
    def set_position(%__MODULE__{} = r, id, pos) do
      %{r | keys: Map.update!(r.keys, id, &%{&1 | pos: pos})}
    end
  end

  defmodule Ngrams do
    @moduledoc "Finished n-gram tables for one universe."
    defstruct unigram: %{},
              bigram: %{},
              trigram: %{},
              skip: {%{}, %{}, %{}},
              totals: %{unigram: 0, bigram: 0, trigram: 0, skip: {0, 0, 0}}

    @type t :: %__MODULE__{}
  end

  defmodule Accumulator do
    @moduledoc "Streaming ETS-backed accumulator for one universe."
    defstruct tabs: nil, buf: [], totals: %{unigram: 0, bigram: 0, trigram: 0, skip: {0, 0, 0}}

    def new do
      tabs =
        for kind <- [:uni, :bi, :tri, :s1, :s2, :s3], into: %{} do
          {kind,
           :ets.new(kind, [:set, :private, write_concurrency: false, read_concurrency: false])}
        end

      %__MODULE__{tabs: tabs}
    end

    defp inc(tab, key), do: :ets.update_counter(tab, key, {2, 1}, {key, 0})

    @doc "Push a logical key id."
    def push(%__MODULE__{tabs: t, buf: buf, totals: tot} = acc, id) do
      inc(t.uni, id)
      tot = %{tot | unigram: tot.unigram + 1}

      tot =
        case buf do
          [] ->
            tot

          [p1] ->
            inc(t.bi, LayoutMaster.Tables.pack2(p1, id))
            %{tot | bigram: tot.bigram + 1}

          [p1, p2] ->
            inc(t.bi, LayoutMaster.Tables.pack2(p1, id))
            inc(t.tri, LayoutMaster.Tables.pack3(p2, p1, id))
            inc(t.s1, LayoutMaster.Tables.pack2(p2, id))
            {a, b, c} = tot.skip
            %{tot | bigram: tot.bigram + 1, trigram: tot.trigram + 1, skip: {a + 1, b, c}}

          [p1, p2, p3] ->
            inc(t.bi, LayoutMaster.Tables.pack2(p1, id))
            inc(t.tri, LayoutMaster.Tables.pack3(p2, p1, id))
            inc(t.s1, LayoutMaster.Tables.pack2(p2, id))
            inc(t.s2, LayoutMaster.Tables.pack2(p3, id))
            {a, b, c} = tot.skip
            %{tot | bigram: tot.bigram + 1, trigram: tot.trigram + 1, skip: {a + 1, b + 1, c}}

          [p1, p2, p3, p4 | _] ->
            inc(t.bi, LayoutMaster.Tables.pack2(p1, id))
            inc(t.tri, LayoutMaster.Tables.pack3(p2, p1, id))
            inc(t.s1, LayoutMaster.Tables.pack2(p2, id))
            inc(t.s2, LayoutMaster.Tables.pack2(p3, id))
            inc(t.s3, LayoutMaster.Tables.pack2(p4, id))
            {a, b, c} = tot.skip
            %{tot | bigram: tot.bigram + 1, trigram: tot.trigram + 1, skip: {a + 1, b + 1, c + 1}}
        end

      # keep the most recent 4 ids, newest first
      buf = Enum.take([id | buf], 4)
      %{acc | buf: buf, totals: tot}
    end

    def boundary(%__MODULE__{} = acc), do: %{acc | buf: []}

    @doc "Materialize into maps and delete the ETS tables."
    def finish(%__MODULE__{tabs: t, totals: tot}) do
      to_map = fn tab ->
        m = :ets.tab2list(tab) |> Map.new()
        :ets.delete(tab)
        m
      end

      %Ngrams{
        unigram: to_map.(t.uni),
        bigram: to_map.(t.bi),
        trigram: to_map.(t.tri),
        skip: {to_map.(t.s1), to_map.(t.s2), to_map.(t.s3)},
        totals: tot
      }
    end
  end

  defmodule Simulation do
    @moduledoc "Result of a simulation."
    defstruct registry: nil,
              no_space: %Ngrams{},
              with_space: %Ngrams{},
              runs: %{hand_runs: %{}, hand_strings: %{}, finger_runs: %{}, layer_runs: %{}},
              words: %{},
              travel: %{continuous: %{}, reset_at_word: %{}, usage: %{}},
              stats: %{},
              coverage: %{unproducible: %{}, soft_dropped: %{}, excluded_by_case: []},
              events: nil,
              producers: nil

    @type t :: %__MODULE__{}
  end
end
