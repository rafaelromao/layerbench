defmodule LayoutMaster.Rules.Engine do
  @moduledoc """
  Evaluate a rule set against a simulation (SPEC §7).

  A rule is a map with `:source` (`:ngram`, `:run`, `:word`, `:stat`), an optional predicate tree
  (`:where`), an aggregation and presentation metadata. Results carry the value, band, top items
  and per-key / per-finger contributions.
  """

  alias LayoutMaster.Geometry
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Rules.Attrs
  alias LayoutMaster.Rules.Bands
  alias LayoutMaster.Rules.Predicates
  alias LayoutMaster.Tables
  alias LayoutMaster.Tables.Simulation

  @default_globals %{
    universe: :no_space,
    cross_word: :reset,
    repeats_count_as_sfb: false,
    skip_weights: [0.5, 0.25, 0.125],
    distance_model: :euclid,
    normalization: :percent_of_ngrams,
    lsb_adjacent_u: 2.0,
    lsb_semi_adjacent_u: 3.5,
    top_items: 12,
    space_per_word_in_keystrokes: false
  }

  def default_globals, do: @default_globals

  defmodule Result do
    @moduledoc false
    defstruct id: nil,
              label: nil,
              family: nil,
              value: nil,
              unit: :percent,
              band: %{index: nil, label: nil, quality: :neutral},
              items: [],
              per_finger: %{},
              per_key: %{},
              per_hand: %{},
              breakdown: %{},
              note: nil,
              enabled: true,
              score_weight: 0.0,
              normalized: nil

    @type t :: %__MODULE__{}
  end

  @doc "Evaluate a rule set (`%{rules: [...], globals: %{...}}`)."
  def evaluate(%Simulation{} = sim, %Compile{} = compiled, rule_set) do
    globals = Map.merge(@default_globals, Map.new(Map.get(rule_set, :globals, %{})))
    attrs = Attrs.build(compiled, sim.registry)
    tables = if globals.universe == :with_space, do: sim.with_space, else: sim.no_space

    ctx = %{
      sim: sim,
      compiled: compiled,
      attrs: attrs,
      tables: tables,
      globals: globals,
      params: %{}
    }

    results =
      rule_set.rules
      |> Enum.filter(&Map.get(&1, :enabled, true))
      |> Enum.reject(&(&1[:aggregate] == :ratio))
      |> Enum.map(&evaluate_rule(&1, ctx))

    by_id = Map.new(results, &{&1.id, &1})

    ratios =
      rule_set.rules
      |> Enum.filter(&(Map.get(&1, :enabled, true) and &1[:aggregate] == :ratio))
      |> Enum.map(fn rule ->
        a = Map.get(by_id, rule.aggregate_opts.numerator)
        b = Map.get(by_id, rule.aggregate_opts.denominator)

        value =
          if a && b && is_number(a.value) && is_number(b.value) && b.value > 0,
            do: a.value / b.value,
            else: nil

        finish(rule, value, %{unit: :ratio})
      end)

    all = results ++ ratios
    score = score(all, rule_set)
    %{results: all, score: score, globals: globals}
  end

  # ------------------------------------------------------------------ dispatch

  defp evaluate_rule(rule, ctx) do
    ctx = %{ctx | params: Map.get(rule, :params, %{})}

    case Map.get(rule, :source, :ngram) do
      :ngram -> eval_ngram(rule, ctx)
      :run -> eval_run(rule, ctx)
      :word -> eval_word(rule, ctx)
      :stat -> eval_stat(rule, ctx)
      :travel -> eval_travel(rule, ctx)
    end
  end

  # ------------------------------------------------------------------- n-grams

  defp eval_ngram(rule, ctx) do
    spec = Map.get(rule, :ngram, %{n: 2, skip: 0})
    n = Map.get(spec, :n, 2)
    skip = Map.get(spec, :skip, 0)
    tables = ctx.tables

    sources =
      case {n, skip} do
        {1, _} ->
          [{tables.unigram, tables.totals.unigram, 1.0}]

        {2, 0} ->
          [{tables.bigram, tables.totals.bigram, 1.0}]

        {2, k} when is_integer(k) and k > 0 ->
          [{elem(tables.skip, k - 1), elem(tables.totals.skip, k - 1), 1.0}]

        {2, list} when is_list(list) ->
          for k <- list,
              do:
                {elem(tables.skip, k - 1), elem(tables.totals.skip, k - 1),
                 Enum.at(ctx.globals.skip_weights, k - 1, 0.0)}

        {3, _} ->
          [{tables.trigram, tables.totals.trigram, 1.0}]
      end

    where = Map.get(rule, :where)
    weight_spec = Map.get(rule, :weight)
    aggregate = Map.get(rule, :aggregate, :percent_of_ngrams)
    model = ctx.globals.distance_model

    {matched, total, items, per_key, per_finger, per_hand, breakdown, weighted_distance} =
      Enum.reduce(sources, {0.0, 0.0, [], %{}, %{}, %{}, %{}, 0.0}, fn {table, tot, skip_w},
                                                                       {m, t, items, pk, pf, ph,
                                                                        bd, wd} ->
        Enum.reduce(table, {m, t + tot * skip_w, items, pk, pf, ph, bd, wd}, fn {key, count},
                                                                                {m, t, items, pk,
                                                                                 pf, ph, bd, wd} ->
          ids = unpack(n, key)
          ngram = Enum.map(ids, &Map.fetch!(ctx.attrs, &1))

          if Predicates.match?(where, ngram, ctx) do
            w = weight(weight_spec, ngram) * skip_w
            c = count * w
            d = pair_distance(ngram, model)

            {m + c, t, [{ngram, c, d} | items], add_keys(pk, ngram, c),
             add_finger(pf, ngram, c, aggregate), add_hand(ph, ngram, c),
             add_breakdown(bd, ngram, c, Map.get(rule, :breakdown_by)), wd + c * (d || 0.0)}
          else
            {m, t, items, pk, pf, ph, bd, wd}
          end
        end)
      end)

    keystrokes =
      ctx.sim.stats.keystrokes +
        if(ctx.globals.space_per_word_in_keystrokes, do: ctx.sim.stats.words, else: 0)

    hand_pct = distribute(per_hand, matched)

    {value, unit} =
      case aggregate do
        :percent_of_ngrams ->
          {pct(matched, total), :percent}

        :percent_of_keystrokes ->
          {pct(matched, keystrokes), :percent}

        :count ->
          {matched, :count}

        :per100 ->
          {per100(matched, ctx.sim.stats, Map.get(rule, :aggregate_opts, %{per: :symbols})),
           :per100}

        :sum_distance ->
          {if(total > 0, do: weighted_distance / total * 100, else: nil), :distance}

        :mean_distance ->
          {if(matched > 0, do: weighted_distance / matched, else: nil), :distance}

        # distributions: headline = spread (max − min share) so bands can rate imbalance
        :per_finger ->
          {spread(distribute(per_finger, matched)), :percent}

        :per_hand ->
          {abs(Map.get(hand_pct, :L, 0.0) - Map.get(hand_pct, :R, 0.0)), :percent}

        :per_layer ->
          {spread(distribute(breakdown, matched)), :percent}

        :per_row ->
          {spread(distribute(breakdown, matched)), :percent}

        :per_col ->
          {spread(distribute(breakdown, matched)), :percent}

        :weighted_sum ->
          {weighted_sum(items, ctx, rule), :effort}

        _ ->
          {pct(matched, total), :percent}
      end

    items_out =
      items
      |> Enum.sort_by(fn {_ng, c, _d} -> -c end)
      |> Enum.take(ctx.globals.top_items)
      |> Enum.map(fn {ngram, c, d} ->
        %{
          label: Enum.map_join(ngram, if(n == 2 and skip != 0, do: "_", else: ""), & &1.label),
          keys: Enum.map(ngram, & &1.pos),
          percent: if(total > 0, do: c / total * 100, else: 0.0),
          count: c,
          distance: d
        }
      end)

    per_finger =
      if aggregate in [:per_finger, :per_hand],
        do: distribute(per_finger, matched),
        else: distribute(per_finger, matched)

    per_key = per_key

    finish(rule, value, %{
      unit: unit,
      items: items_out,
      per_key: per_key,
      per_finger: per_finger,
      per_hand: distribute(per_hand, matched),
      breakdown:
        if(aggregate in [:per_layer, :per_row, :per_col],
          do: distribute(breakdown, matched),
          else: distribute(breakdown, matched)
        )
    })
  end

  defp unpack(1, key), do: [key]
  defp unpack(2, key), do: Tuple.to_list(Tables.unpack2(key))
  defp unpack(3, key), do: Tuple.to_list(Tables.unpack3(key))

  defp pct(_m, t) when t <= 0, do: 0.0
  defp pct(m, t), do: m / t * 100

  defp per100(m, stats, %{per: per}) do
    denom =
      case per do
        :symbols -> stats.symbols
        :keystrokes -> stats.keystrokes
        :words -> stats.words
        _ -> stats.symbols
      end

    if denom > 0, do: m / denom * 100, else: 0.0
  end

  defp weight(nil, _ngram), do: 1.0

  defp weight(spec, ngram) when is_map(spec) do
    pair = Enum.take(ngram, 2)

    case pair do
      [a, b] ->
        cond do
          Map.has_key?(spec, :adjacent_fingers) and Attrs.adjacent_fingers?(a, b) ->
            spec.adjacent_fingers * 1.0

          Map.has_key?(spec, :non_adjacent_fingers) and not Attrs.adjacent_fingers?(a, b) ->
            spec.non_adjacent_fingers * 1.0

          true ->
            Map.get(spec, :default, 1.0) * 1.0
        end

      _ ->
        Map.get(spec, :default, 1.0) * 1.0
    end
  end

  defp pair_distance([a, b], model), do: Attrs.distance(a, b, model)
  defp pair_distance([a, _b, c], model), do: Attrs.distance(a, c, model)
  defp pair_distance(_, _), do: nil

  defp add_keys(pk, ngram, c) do
    share = c / length(ngram)

    Enum.reduce(ngram, pk, fn k, acc ->
      Enum.reduce(k.members, acc, fn m, a -> Map.update(a, m, share, &(&1 + share)) end)
    end)
  end

  defp add_finger(pf, ngram, c, _aggregate) do
    # attribute to the finger of the last key (for SFB both are the same); chords split among members
    last = List.last(ngram)
    fingers = if last.fingers == [], do: [], else: last.fingers
    share = if fingers == [], do: 0.0, else: c / length(fingers)
    Enum.reduce(fingers, pf, fn f, acc -> Map.update(acc, f, share, &(&1 + share)) end)
  end

  defp add_hand(ph, ngram, c) do
    last = List.last(ngram)
    if last.hand == :both, do: ph, else: Map.update(ph, last.hand, c, &(&1 + c))
  end

  defp add_breakdown(bd, _ngram, _c, nil), do: bd

  defp add_breakdown(bd, ngram, c, by) do
    last = List.last(ngram)

    key =
      case by do
        :layer -> last.layer
        :row -> last.row
        :col -> last.col
        :key_kind -> last.key_kind
        :hand -> last.hand
        _ -> :all
      end

    Map.update(bd, key, c, &(&1 + c))
  end

  defp spread(map) when map_size(map) == 0, do: nil
  defp spread(map), do: (map |> Map.values() |> Enum.max()) - (map |> Map.values() |> Enum.min())

  defp distribute(map, _total) when map_size(map) == 0, do: %{}

  defp distribute(map, total) do
    sum = if total > 0, do: total, else: map |> Map.values() |> Enum.sum()
    if sum > 0, do: Map.new(map, fn {k, v} -> {k, v / sum * 100} end), else: map
  end

  # Per-key effort grid: Σ count × effort(key) / keystrokes. Effort table in params (key id → effort) or defaults.
  defp weighted_sum(items, ctx, rule) do
    table = Map.get(ctx.params, :effort, %{})
    default = default_effort(ctx.compiled)

    total =
      Enum.reduce(items, 0.0, fn {ngram, c, _d}, acc ->
        e =
          ngram
          |> Enum.flat_map(& &1.members)
          |> Enum.map(fn m -> key_effort(ctx.compiled, m, table, default) end)
          |> Enum.sum()

        acc + c * e
      end)

    k = ctx.sim.stats.keystrokes
    scale = Map.get(rule, :scale, 1.0)
    if k > 0, do: total / k * scale, else: 0.0
  end

  defp key_effort(compiled, member, table, default) do
    key = Compile.key(compiled, member)
    Map.get(table, key.id) || Map.get(default, key.id) || 1.0
  end

  @doc "Default per-key effort (cyanophage-like grid extended to thumbs = 1, inner column = 5)."
  def default_effort(%Compile{} = c) do
    c.keys
    |> Tuple.to_list()
    |> Map.new(fn k ->
      name = if k.finger, do: Geometry.finger_name(k.finger), else: :index

      e =
        cond do
          k.thumb ->
            1.0

          k.inner ->
            if k.row == 1, do: 5.0, else: 7.0

          k.col == 0 ->
            if k.row == 1, do: 5.0, else: 7.0

          true ->
            base =
              case name do
                :pinky -> %{0 => 3.0, 1 => 1.0, 2 => 3.0}
                :ring -> %{0 => 2.0, 1 => 0.0, 2 => 2.0}
                :middle -> %{0 => 1.0, 1 => 0.0, 2 => 2.0}
                _ -> %{0 => 2.0, 1 => 0.0, 2 => 1.0}
              end

            Map.get(base, k.row, 2.0)
        end

      {k.id, e}
    end)
  end

  # --------------------------------------------------------------------- runs

  defp eval_run(rule, ctx) do
    runs = ctx.sim.runs
    by = get_in(rule, [:run, :by]) || :hand

    hist =
      case by do
        :hand -> runs.hand_runs
        :finger -> runs.finger_runs
        :layer -> runs.layer_runs
        _ -> runs.hand_runs
      end

    case Map.get(rule, :aggregate, :histogram) do
      :histogram ->
        total = hist |> Map.values() |> Enum.sum()
        # mean run length as headline value
        mean =
          if total > 0,
            do: Enum.reduce(hist, 0, fn {len, c}, acc -> acc + len * c end) / total,
            else: 0.0

        items =
          hist
          |> Enum.sort()
          |> Enum.map(fn {len, c} ->
            %{
              label: Integer.to_string(len),
              percent: if(total > 0, do: c / total * 100, else: 0.0),
              count: c,
              keys: []
            }
          end)

        finish(rule, mean, %{
          unit: :length,
          items: items,
          breakdown: Map.new(hist, fn {k, v} -> {k, v} end)
        })

      :top_strings ->
        total = ctx.sim.stats.words
        min_len = get_in(rule, [:run, :min_len]) || 4

        items =
          runs.hand_strings
          |> Enum.filter(fn {s, _c} -> String.length(s) >= min_len end)
          |> Enum.sort_by(fn {s, c} -> -(c * String.length(s)) end)
          |> Enum.take(ctx.globals.top_items)
          |> Enum.map(fn {s, c} ->
            %{
              label: s,
              count: c,
              percent: if(total > 0, do: c / total * 100, else: 0.0),
              keys: []
            }
          end)

        long =
          runs.hand_strings
          |> Enum.filter(fn {s, _} -> String.length(s) >= min_len end)
          |> Enum.map(&elem(&1, 1))
          |> Enum.sum()

        finish(rule, if(total > 0, do: long / total * 100, else: 0.0), %{
          unit: :percent,
          items: items
        })
    end
  end

  # -------------------------------------------------------------------- words

  defp eval_word(rule, ctx) do
    words = ctx.sim.words
    min_len = Map.get(rule, :min_length, 4)
    min_count = Map.get(rule, :min_count, 2)
    table = Map.get(ctx.params, :effort, %{})
    default = default_effort(ctx.compiled)
    attrs = ctx.attrs

    scored =
      words
      |> Enum.filter(fn {w, t} -> String.length(w) >= min_len and t.count >= min_count end)
      |> Enum.map(fn {w, t} ->
        effort =
          t.keys
          |> Enum.flat_map(fn id -> Map.fetch!(attrs, id).members end)
          |> Enum.map(fn m -> key_effort(ctx.compiled, m, table, default) end)
          |> Enum.sum()

        # extra keystrokes (layer taps etc.) count as effort too
        per_char = (effort + (t.presses - String.length(w)) * 1.0) / String.length(w)
        {w, t, effort, per_char}
      end)

    items =
      scored
      |> Enum.sort_by(fn {_w, _t, _e, pc} -> -pc end)
      |> Enum.take(ctx.globals.top_items)
      |> Enum.map(fn {w, t, e, pc} ->
        %{
          label: w,
          count: t.count,
          percent: pc,
          distance: e,
          keys: Enum.map(t.keys, &Map.fetch!(attrs, &1).pos)
        }
      end)

    total_words = ctx.sim.stats.words
    weighted = Enum.reduce(scored, 0.0, fn {_w, t, _e, pc}, acc -> acc + pc * t.count end)

    finish(rule, if(total_words > 0, do: weighted / total_words, else: 0.0), %{
      unit: :effort,
      items: items
    })
  end

  # -------------------------------------------------------------------- stats

  defp eval_stat(rule, ctx) do
    st = ctx.sim.stats
    key = Map.get(rule, :stat)

    value =
      case key do
        :layer_taps_per_100 -> ratio(st.layer_taps, st.symbols) * 100
        :one_shots_per_word -> ratio(st.one_shot_activations, st.words)
        :wasted_one_shots_pct -> ratio(st.wasted_one_shots, st.one_shot_activations) * 100
        :macro_pct -> ratio(st.macro_presses, st.keystrokes) * 100
        :adaptive_hit_rate -> ratio(st.adaptive_trigger_hits, st.adaptive_presses) * 100
        :combo_pct -> ratio(st.chords, st.keystrokes) * 100
        :extra_keystrokes -> if st.symbols > 0, do: st.keystrokes / st.symbols - 1.0, else: 0.0
        :keystrokes -> st.keystrokes * 1.0
        :hold_pct -> ratio(st.hold_presses, st.keystrokes) * 100
        :repeat_pct -> ratio(st.repeat_presses, st.keystrokes) * 100
        _ -> nil
      end

    breakdown =
      if key == :layer_taps_per_100 do
        Map.new(st.per_layer, fn {l, c} -> {l, ratio(c, st.keystrokes) * 100} end)
      else
        %{}
      end

    finish(rule, value, %{unit: Map.get(rule, :unit, :percent), breakdown: breakdown})
  end

  defp ratio(_a, 0), do: 0.0
  defp ratio(_a, b) when b == 0.0, do: 0.0
  defp ratio(a, b), do: a / b

  # ------------------------------------------------------------------- travel

  defp eval_travel(rule, ctx) do
    tr = ctx.sim.travel
    mode = Map.get(rule, :travel_mode, :continuous)
    src = if mode == :reset_at_word, do: tr.reset_at_word, else: tr.continuous
    k = ctx.sim.stats.keystrokes
    total = src |> Map.values() |> Enum.sum()
    per_finger = if total > 0, do: Map.new(src, fn {f, d} -> {f, d / total * 100} end), else: %{}

    left =
      src
      |> Enum.filter(fn {f, _} -> Geometry.finger_hand(f) == :L end)
      |> Enum.map(&elem(&1, 1))
      |> Enum.sum()

    right = total - left
    per_hand = if total > 0, do: %{L: left / total * 100, R: right / total * 100}, else: %{}
    value = if k > 0, do: total / k, else: 0.0

    finish(rule, value, %{
      unit: :distance,
      per_finger: per_finger,
      per_hand: per_hand,
      breakdown: src
    })
  end

  # ------------------------------------------------------------------- finish

  defp finish(rule, value, extra) do
    band = Bands.classify(value, Map.get(rule, :bands))

    struct(
      Result,
      Map.merge(
        %{
          id: rule.id,
          label: Map.get(rule, :label, rule.id),
          family: Map.get(rule, :family, :other),
          value: value,
          band: band,
          enabled: true,
          score_weight: get_in(rule, [:score, :weight]) || 0.0,
          note: Map.get(rule, :description)
        },
        extra
      )
    )
  end

  # -------------------------------------------------------------------- score

  defp score(results, rule_set) do
    enabled = Map.get(rule_set, :score_enabled, false)

    weighted =
      results
      |> Enum.filter(&(&1.score_weight > 0 and is_number(&1.value) and &1.band.index != nil))
      |> Enum.map(fn r -> {r.score_weight, Map.get(r.band, :goodness, 0.5)} end)

    total_w = weighted |> Enum.map(&elem(&1, 0)) |> Enum.sum()

    value =
      if total_w > 0,
        do: Enum.reduce(weighted, 0.0, fn {w, g}, acc -> acc + w * g end) / total_w * 100,
        else: nil

    %{enabled: enabled, value: value}
  end
end
