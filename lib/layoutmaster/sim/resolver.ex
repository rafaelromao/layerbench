defmodule LayoutMaster.Sim.Resolver do
  @moduledoc """
  Text → physical key events → n-gram tables (SPEC §5.4–§5.6).

  The simulator threads an immutable `%Sim{}` through the symbol stream. Producer attempts
  are dry runs: on mismatch the previous machine state is simply kept.
  """

  alias LayoutMaster.Geometry
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Sim.Machine
  alias LayoutMaster.Sim.Machine.Event
  alias LayoutMaster.Sim.Producers
  alias LayoutMaster.Sim.Producers.Producer
  alias LayoutMaster.Tables.Accumulator
  alias LayoutMaster.Tables.Registry
  alias LayoutMaster.Tables.Simulation

  @type opts :: [
          case_mode: :fold | :model,
          cross_word: :reset | :bridge,
          repeat_policy: :repeat_key | :tap_twice,
          typing_paths: map(),
          activators: map(),
          soft_symbols: [String.t()],
          max_symbols: pos_integer() | :infinity,
          collect_events: boolean(),
          producer_index: Producers.Index.t()
        ]

  defstruct compiled: nil,
            opts: [],
            machine: nil,
            index: nil,
            activators: %{},
            user_paths: %{},
            planner_holds: MapSet.new(),
            fold: true,
            cross_word: :reset,
            repeat_policy: :repeat_key,
            registry: nil,
            no_space: nil,
            with_space: nil,
            hand_runs: %{},
            hand_strings: %{},
            finger_runs: %{},
            layer_runs: %{},
            words: nil,
            travel: %{},
            home_keys: %{},
            last_pos: %{},
            last_pos_word: %{},
            stats: %{},
            run_hand: nil,
            run_len: 0,
            run_labels: [],
            run_finger: nil,
            run_finger_len: 0,
            run_layer: -1,
            run_layer_len: 0,
            cur_word: [],
            cur_word_keys: [],
            cur_word_presses: 0,
            events: [],
            collect_events: false,
            soft_symbols: MapSet.new(),
            unproducible: %{},
            soft_dropped: %{}

  @kind_order %{sl: 0, mo: 1, lt: 1, tog: 2, to: 3}

  # ------------------------------------------------------------------ public

  @spec simulate(Compile.t(), String.t(), opts()) :: Simulation.t()
  def simulate(%Compile{} = compiled, stream, opts \\ []) when is_binary(stream) do
    compiled |> new(opts) |> run(stream)
  end

  @doc "Trace how a word (or short text) is typed."
  def explain(%Compile{} = compiled, text, opts \\ []) do
    fold = Keyword.get(opts, :case_mode, :fold) == :fold

    stream =
      text |> String.normalize(:nfc) |> then(fn t -> if fold, do: String.downcase(t), else: t end)

    result = compiled |> new(Keyword.put(opts, :collect_events, true)) |> run(stream)

    steps =
      Enum.map(result.events, fn e ->
        pos = Compile.position(compiled, e.pos)

        %{
          key: pos.id,
          layer: Compile.layer(compiled, e.layer).name,
          finger: if(length(pos.fingers) == 1, do: hd(pos.fingers), else: :multi),
          kind: e.kind,
          key_kind: e.key_kind,
          label: e.label,
          symbols: e.symbols,
          wasted_one_shot: e.wasted_one_shot
        }
      end)

    %{
      steps: steps,
      coverage: result.coverage,
      presses: Enum.count(steps, &(&1.kind != :hold_release))
    }
  end

  # -------------------------------------------------------------------- setup

  def new(%Compile{} = c, opts) do
    case_mode = Keyword.get(opts, :case_mode, :fold)
    fold = case_mode == :fold
    index = Keyword.get(opts, :producer_index) || Producers.enumerate(c, case_mode)
    layout = c.layout

    user_paths =
      (Keyword.get(opts, :typing_paths) || layout.typing_paths || %{})
      |> Map.new(fn {sym, entries} ->
        {if(fold, do: String.downcase(sym), else: sym), entries}
      end)

    home = home_keys(c)
    zero = Map.new(Geometry.fingers(), &{&1, 0.0})

    sim = %__MODULE__{
      compiled: c,
      opts: opts,
      machine: Machine.new(c),
      index: index,
      user_paths: user_paths,
      fold: fold,
      cross_word: Keyword.get(opts, :cross_word, :reset),
      repeat_policy: Keyword.get(opts, :repeat_policy) || layout.repeat_policy || :repeat_key,
      registry: Registry.new(),
      no_space: Accumulator.new(),
      with_space: Accumulator.new(),
      words: :ets.new(:words, [:set, :private]),
      travel: %{
        continuous: zero,
        reset_at_word: zero,
        usage: Map.new(Geometry.fingers(), &{&1, 0})
      },
      home_keys: home,
      last_pos: home,
      last_pos_word: home,
      stats: %{
        symbols: 0,
        words: 0,
        keystrokes: 0,
        space_presses: 0,
        layer_taps: 0,
        one_shot_activations: 0,
        wasted_one_shots: 0,
        hold_presses: 0,
        chords: 0,
        macro_presses: 0,
        adaptive_presses: 0,
        adaptive_trigger_hits: 0,
        repeat_presses: 0,
        per_layer: Map.new(0..(c.n_layers - 1), &{&1, 0})
      },
      collect_events: Keyword.get(opts, :collect_events, false),
      soft_symbols: MapSet.new(Keyword.get(opts, :soft_symbols, ["?", "!"]))
    }

    %{
      sim
      | activators:
          discover_activators(sim, Keyword.get(opts, :activators) || layout.activators || %{})
    }
  end

  @doc "Resting key per finger: home-row key, or the innermost thumb key for thumbs."
  def home_keys(%Compile{} = c) do
    keys = Tuple.to_list(c.keys) |> Enum.with_index()

    Map.new(Geometry.fingers(), fn f ->
      best =
        keys
        |> Enum.filter(fn {k, _i} -> k.finger == f end)
        |> Enum.min_by(
          fn {k, _i} ->
            if k.thumb, do: k.col, else: if(k.home, do: 0, else: 10) + abs(k.row - 1)
          end,
          fn -> nil end
        )

      case best do
        {_k, i} -> {f, i}
        nil -> {f, c.space_key}
      end
    end)
  end

  # ------------------------------------------------------------- activators

  defp collect_layer_targets(c, b, mode, required, depth \\ 0)
  defp collect_layer_targets(_c, _b, _mode, _required, depth) when depth > 8, do: []

  defp collect_layer_targets(c, %{kind: k, layer: l}, :tap, req, _d) when k in [:sl, :tog, :to],
    do: layer_target(c, l, :tap, k, req)

  defp collect_layer_targets(c, %{kind: :mo, layer: l}, :hold, req, _d),
    do: layer_target(c, l, :hold, :mo, req)

  defp collect_layer_targets(c, %{kind: :lt, layer: l}, :hold, req, _d),
    do: layer_target(c, l, :hold, :lt, req)

  defp collect_layer_targets(c, %{kind: :lt, tap: t}, :tap, req, d),
    do: collect_layer_targets(c, t, :tap, req, d + 1)

  defp collect_layer_targets(c, %{kind: :hold_tap, tap: t, hold: h}, mode, req, d),
    do: collect_layer_targets(c, if(mode == :hold, do: h, else: t), mode, req, d + 1)

  defp collect_layer_targets(c, %{kind: :mod_morph} = b, mode, req, d) do
    collect_layer_targets(c, b.default, mode, req, d + 1) ++
      collect_layer_targets(c, b.morphed, mode, req ++ [hd(b.mods)], d + 1)
  end

  defp collect_layer_targets(c, %{kind: :layer_morph} = b, mode, req, d),
    do:
      collect_layer_targets(c, b.inactive, mode, req, d + 1) ++
        collect_layer_targets(c, b.active, mode, req, d + 1)

  defp collect_layer_targets(c, %{kind: :tap_dance, bindings: [first | _]}, mode, req, d),
    do: collect_layer_targets(c, first, mode, req, d + 1)

  defp collect_layer_targets(c, %{kind: :adaptive} = b, mode, req, d) do
    case b[:default] do
      nil -> []
      dflt -> collect_layer_targets(c, dflt, mode, req, d + 1)
    end
  end

  defp collect_layer_targets(_c, _b, _mode, _req, _d), do: []

  defp layer_target(c, layer_id, mode, kind, req) do
    case Map.get(c.layer_index, layer_id) do
      nil -> []
      idx -> [%{mode: mode, target: idx, kind: kind, required_mods: req}]
    end
  end

  defp discover_activators(%__MODULE__{compiled: c}, user) do
    auto =
      for layer <- Tuple.to_list(c.layers),
          pos <- 0..(c.n_keys - 1),
          mode <- [:tap, :hold],
          reduce: {%{}, 0} do
        {acc, order} ->
          b = elem(layer.bindings, pos)

          if b.kind in [:trans, :none] do
            {acc, order}
          else
            Enum.reduce(collect_layer_targets(c, b, mode, []), {acc, order}, fn t, {acc, order} ->
              cand = %{
                pos: pos,
                via_layer: layer.idx,
                mode: mode,
                target: t.target,
                user: false,
                order:
                  Map.get(@kind_order, t.kind, 5) * 1000 +
                    if(t.required_mods != [], do: 500, else: 0) + order,
                required_mods: t.required_mods,
                from: nil
              }

              {Map.update(acc, t.target, [cand], &[cand | &1]), order + 1}
            end)
          end
      end
      |> elem(0)

    with_user =
      Enum.reduce(user, auto, fn {target_id, defs}, acc ->
        case Map.get(c.layer_index, target_id) do
          nil ->
            acc

          target ->
            defs
            |> Enum.with_index()
            |> Enum.reduce(acc, fn {d, i}, acc ->
              case Regex.run(~r/^key:([^\/]+)\/(.+)$/, d.via || "") do
                [_, layer_id, key_id] ->
                  via_layer = Map.get(c.layer_index, layer_id)
                  pos = Map.get(c.key_index, key_id)

                  if via_layer == nil or pos == nil do
                    acc
                  else
                    existing =
                      Enum.find(
                        Map.get(acc, target, []),
                        &(&1.pos == pos and &1.via_layer == via_layer)
                      )

                    cand = %{
                      pos: pos,
                      via_layer: via_layer,
                      mode: if(existing, do: existing.mode, else: :tap),
                      target: target,
                      user: true,
                      order: -1000 + i,
                      required_mods:
                        if(d.requires_mods != [],
                          do: d.requires_mods,
                          else: if(existing, do: existing.required_mods, else: [])
                        ),
                      from:
                        if(d.from in [nil, "*"], do: nil, else: Map.get(c.layer_index, d.from))
                    }

                    Map.update(acc, target, [cand], &[cand | &1])
                  end

                _ ->
                  acc
              end
            end)
        end
      end)

    Map.new(with_user, fn {k, list} -> {k, Enum.sort_by(list, & &1.order)} end)
  end

  # ---------------------------------------------------------------- planning

  defp candidates_for(sim, token) do
    m = sim.machine
    last = m.last_symbol
    last_cmp = if last == nil, do: nil, else: if(sim.fold, do: String.downcase(last), else: last)

    repeat =
      if sim.repeat_policy == :repeat_key and last_cmp != nil and last_cmp == token,
        do: Producers.repeat_producers(sim.index),
        else: []

    base = Map.get(sim.index.by_symbol, token, [])

    if not sim.fold and String.downcase(token) != token do
      lower = String.downcase(token)
      lower_producers = Map.get(sim.index.by_symbol, lower, [])

      composites =
        for p <- lower_producers, p.kind not in [:combo, :repeat] do
          %{p | id: p.id <> "+shift", mods: p.mods ++ [:LSHIFT], cost: p.cost + 1}
        end

      apply_user_order(sim, lower, repeat ++ lower_producers ++ base ++ composites)
    else
      apply_user_order(sim, token, repeat ++ base)
    end
  end

  defp apply_user_order(sim, symbol, list) do
    case Map.get(sim.user_paths, symbol) do
      nil ->
        list

      _ when list == [] ->
        list

      entries ->
        by_id = Map.new(list, &{&1.id, &1})
        last = sim.machine.last_symbol

        {ordered, disabled} =
          Enum.reduce(entries, {[], MapSet.new()}, fn e, {ordered, disabled} ->
            cond do
              e.enabled == false ->
                {ordered, MapSet.put(disabled, e.producer)}

              e[:after_any] != nil and
                  (last == nil or
                     not Enum.any?(
                       e.after_any,
                       &(&1 == last or String.downcase(&1) == String.downcase(last))
                     )) ->
                {ordered, MapSet.put(disabled, e.producer)}

              true ->
                case Map.get(by_id, e.producer) do
                  nil -> {ordered, disabled}
                  p -> if(p in ordered, do: {ordered, disabled}, else: {ordered ++ [p], disabled})
                end
            end
          end)

        ordered ++ Enum.reject(list, fn p -> p in ordered or MapSet.member?(disabled, p.id) end)
    end
  end

  # Returns {:ok, sim, events} with the target layer active, or :error (sim unchanged).
  defp activate(_sim, _target, _events, depth) when depth > 2, do: :error

  defp activate(sim, target, events, depth) do
    m = sim.machine

    if Machine.layer_active?(m, target) do
      {:ok, sim, events}
    else
      top = Machine.highest_active_layer(m)

      ranked =
        sim.activators
        |> Map.get(target, [])
        |> Enum.reject(fn cand -> cand.from != nil and cand.from != top end)
        |> Enum.sort_by(fn cand ->
          via_rank =
            cond do
              cand.via_layer == top -> 0
              Machine.layer_active?(m, cand.via_layer) -> 1
              true -> 2
            end

          {via_rank, cand.order}
        end)

      Enum.reduce_while(ranked, :error, fn cand, _acc ->
        case try_activator(sim, cand, target, events, depth) do
          {:ok, _, _} = ok -> {:halt, ok}
          :error -> {:cont, :error}
        end
      end)
    end
  end

  defp try_activator(sim, cand, target, events, depth) do
    with {:ok, sim, events, mod_holds} <- ensure_mods(sim, cand.required_mods, events),
         {:ok, sim, events} <-
           if(Machine.layer_active?(sim.machine, cand.via_layer),
             do: {:ok, sim, events},
             else: activate(sim, cand.via_layer, events, depth + 1)
           ),
         {:ok, sim} <- check_activator_binding(sim, cand),
         {:ok, sim, events} <- press_activator(sim, cand, events) do
      if Machine.layer_active?(sim.machine, target) do
        holds = Enum.reduce(mod_holds, sim.planner_holds, &MapSet.put(&2, &1))
        {:ok, %{sim | planner_holds: holds}, events}
      else
        :error
      end
    else
      _ -> :error
    end
  end

  defp check_activator_binding(sim, cand) do
    {binding, layer} = Machine.resolve(sim.compiled, sim.machine, cand.pos)

    if layer != cand.via_layer do
      :error
    else
      peeled = Machine.peel_binding(sim.compiled, sim.machine, binding, cand.mode)
      kinds = if cand.mode == :hold, do: [:mo, :lt], else: [:sl, :tog, :to, :adaptive, :macro]
      if peeled.kind in kinds, do: {:ok, sim}, else: :error
    end
  end

  defp press_activator(sim, cand, events) do
    action = if cand.mode == :hold, do: {:hold_press, cand.pos}, else: {:tap, cand.pos}
    {m2, evs} = Machine.perform(sim.compiled, sim.machine, action)

    if Enum.any?(evs, &(&1.symbols != "")) do
      :error
    else
      holds =
        if cand.mode == :hold,
          do: MapSet.put(sim.planner_holds, cand.pos),
          else: sim.planner_holds

      {:ok, %{sim | machine: m2, planner_holds: holds}, events ++ evs}
    end
  end

  # Ensure the given modifiers are active (sticky or held). Returns {:ok, sim, events, mod_holds} | :error.
  defp ensure_mods(sim, [], events), do: {:ok, sim, events, []}

  defp ensure_mods(sim, [mod | rest], events) do
    m = sim.machine

    if MapSet.member?(Machine.active_mods(m), mod) do
      ensure_mods(sim, rest, events)
    else
      case press_mod_source(sim, mod, events) do
        {:ok, sim, events, holds} ->
          if MapSet.member?(Machine.active_mods(sim.machine), mod) do
            case ensure_mods(sim, rest, events) do
              {:ok, sim, events, more} -> {:ok, sim, events, holds ++ more}
              :error -> :error
            end
          else
            :error
          end

        :error ->
          :error
      end
    end
  end

  defp press_mod_source(sim, mod, events) do
    c = sim.compiled
    m = sim.machine
    shift? = mod in [:LSHIFT, :RSHIFT]

    case {shift?, c.shift_key} do
      {true, %{key: key, kind: kind}} ->
        {binding, _layer} = Machine.resolve(c, m, key)
        peeled = Machine.peel_binding(c, m, binding, if(kind == :hold, do: :hold, else: :tap))

        cond do
          kind == :sk and peeled.kind in [:sk, :mod_morph, :adaptive] ->
            {m2, evs} = Machine.perform(c, m, {:tap, key})
            {:ok, %{sim | machine: m2}, events ++ evs, []}

          kind == :hold and peeled.kind == :mod ->
            {m2, evs} = Machine.perform(c, m, {:hold_press, key})
            {:ok, %{sim | machine: m2}, events ++ evs, [key]}

          true ->
            :error
        end

      _ ->
        Enum.reduce_while(0..(c.n_keys - 1), :error, fn pos, _ ->
          {binding, _layer} = Machine.resolve(c, m, pos)
          tap_peeled = Machine.peel_binding(c, m, binding, :tap)
          hold_peeled = Machine.peel_binding(c, m, binding, :hold)

          cond do
            tap_peeled.kind == :sk and tap_peeled.mod == mod ->
              {m2, evs} = Machine.perform(c, m, {:tap, pos})
              {:halt, {:ok, %{sim | machine: m2}, events ++ evs, []}}

            hold_peeled.kind == :mod and hold_peeled.mod == mod ->
              {m2, evs} = Machine.perform(c, m, {:hold_press, pos})
              {:halt, {:ok, %{sim | machine: m2}, events ++ evs, [pos]}}

            true ->
              {:cont, :error}
          end
        end)
    end
  end

  defp try_producer(sim, %Producer{} = p, token) do
    with {:ok, sim1, events, mod_holds} <- ensure_mods(sim, p.mods, []),
         {:ok, sim2, events} <- run_steps(sim1, p.steps, events) do
      {sim3, events} =
        Enum.reduce(mod_holds, {sim2, events}, fn pos, {s, evs} ->
          {m2, rel} = Machine.perform(s.compiled, s.machine, {:hold_release, pos})
          {%{s | machine: m2}, evs ++ rel}
        end)

      emitted = events |> Enum.map(& &1.symbols) |> IO.iodata_to_binary()
      ok = if sim.fold, do: String.downcase(emitted) == token, else: emitted == token

      if ok do
        events =
          Enum.map(events, fn e ->
            if e.producer_kind == nil, do: %{e | producer_kind: p.kind}, else: e
          end)

        {:ok, sim3, events}
      else
        :error
      end
    else
      _ -> :error
    end
  end

  defp run_steps(sim, [], events), do: {:ok, sim, events}

  defp run_steps(sim, [%{mode: :chord, combo: combo} | rest], events) when combo != nil do
    case ensure_combo_available(sim, combo, events) do
      {:ok, sim, events} ->
        {m2, evs} = Machine.perform(sim.compiled, sim.machine, {:chord, combo})
        run_steps(%{sim | machine: m2}, rest, events ++ evs)

      :error ->
        :error
    end
  end

  defp run_steps(_sim, [%{mode: :chord} | _], _events), do: :error

  defp run_steps(sim, [step | rest], events) do
    case ensure_step_resolvable(sim, step, events) do
      {:ok, sim, events} ->
        {m2, evs} = Machine.perform(sim.compiled, sim.machine, {:tap, step.pos, step.taps})
        run_steps(%{sim | machine: m2}, rest, events ++ evs)

      :error ->
        :error
    end
  end

  # A combo fires only when the highest active layer is in its layer list; activate one of those
  # layers first when needed (ZMK filters candidates against the single highest active layer).
  defp ensure_combo_available(sim, combo_idx, events) do
    if Machine.combo_available?(sim.compiled, sim.machine, combo_idx) do
      {:ok, sim, events}
    else
      combo = Compile.combo(sim.compiled, combo_idx)

      case combo.layer_mask do
        nil ->
          :error

        mask ->
          top = Machine.highest_active_layer(sim.machine)

          candidates =
            for li <- 0..(sim.compiled.n_layers - 1),
                Bitwise.band(mask, Bitwise.bsl(1, li)) != 0,
                li > top,
                do: li

          Enum.reduce_while(candidates, :error, fn layer, _ ->
            case activate(sim, layer, events, 0) do
              {:ok, sim2, events2} ->
                if Machine.combo_available?(sim2.compiled, sim2.machine, combo_idx),
                  do: {:halt, {:ok, sim2, events2}},
                  else: {:cont, :error}

              :error ->
                {:cont, :error}
            end
          end)
      end
    end
  end

  defp ensure_step_resolvable(sim, step, events) do
    if step_matches?(sim, step) do
      {:ok, sim, events}
    else
      case step.layer do
        nil ->
          :error

        layer ->
          case activate(sim, layer, events, 0) do
            {:ok, sim, events} ->
              if step_matches?(sim, step), do: {:ok, sim, events}, else: :error

            :error ->
              :error
          end
      end
    end
  end

  defp step_matches?(sim, step) do
    {binding, layer} = Machine.resolve(sim.compiled, sim.machine, step.pos)
    layer == step.layer and binding == step.binding
  end

  defp release_holds(sim) do
    {sim, events} =
      Enum.reduce(sim.planner_holds, {sim, []}, fn pos, {s, evs} ->
        {m2, rel} = Machine.perform(s.compiled, s.machine, {:hold_release, pos})
        {%{s | machine: m2}, evs ++ rel}
      end)

    {%{sim | planner_holds: MapSet.new()}, events}
  end

  # ------------------------------------------------------------ accumulation

  defp commit(sim, events, is_space) do
    Enum.reduce(events, sim, fn ev, sim -> commit_event(sim, ev, is_space) end)
  end

  defp commit_event(sim, %Event{kind: :hold_release} = ev, _is_space) do
    if sim.collect_events, do: %{sim | events: [ev | sim.events]}, else: sim
  end

  defp commit_event(sim, %Event{} = ev, is_space) do
    c = sim.compiled
    sim = if sim.collect_events, do: %{sim | events: [ev | sim.events]}, else: sim
    st = sim.stats

    st = %{
      st
      | keystrokes: st.keystrokes + 1,
        per_layer: Map.update(st.per_layer, ev.layer, 1, &(&1 + 1)),
        hold_presses: st.hold_presses + b2i(ev.kind == :hold_press),
        chords: st.chords + b2i(ev.kind == :chord),
        layer_taps: st.layer_taps + b2i(ev.key_kind == :layer_tap),
        one_shot_activations: st.one_shot_activations + b2i(ev.leaf_kind == :sl),
        wasted_one_shots: st.wasted_one_shots + b2i(ev.wasted_one_shot),
        macro_presses: st.macro_presses + b2i(ev.leaf_kind == :macro),
        adaptive_presses: st.adaptive_presses + b2i(ev.key_kind == :magic),
        adaptive_trigger_hits:
          st.adaptive_trigger_hits + b2i(ev.key_kind == :magic and ev.producer_kind == :adaptive),
        repeat_presses: st.repeat_presses + b2i(ev.key_kind == :repeat),
        space_presses: st.space_presses + b2i(ev.key_kind == :space)
    }

    {registry, id} = Registry.id_for(sim.registry, ev)
    with_space = Accumulator.push(sim.with_space, id)
    pos = Compile.position(c, ev.pos)

    # finger travel & usage
    {travel, last_pos, last_pos_word} =
      Enum.reduce(pos.members, {sim.travel, sim.last_pos, sim.last_pos_word}, fn member,
                                                                                 {tr, lp, lpw} ->
        key = Compile.key(c, member)
        f = key.finger
        prev = Map.get(lp, f)
        prev_w = Map.get(lpw, f)

        d1 =
          if prev != nil and prev >= 0,
            do: Geometry.distance(Compile.key(c, prev), key, :euclid) || 0.0,
            else: 0.0

        d2 =
          if prev_w != nil and prev_w >= 0,
            do: Geometry.distance(Compile.key(c, prev_w), key, :euclid) || 0.0,
            else: 0.0

        tr = %{
          tr
          | usage: Map.update(tr.usage, f, 1, &(&1 + 1)),
            continuous: Map.update(tr.continuous, f, d1, &(&1 + d1)),
            reset_at_word: Map.update(tr.reset_at_word, f, d2, &(&1 + d2))
        }

        {tr, Map.put(lp, f, member), Map.put(lpw, f, member)}
      end)

    sim = %{
      sim
      | stats: st,
        registry: registry,
        with_space: with_space,
        travel: travel,
        last_pos: last_pos,
        last_pos_word: last_pos_word
    }

    if ev.key_kind == :space or is_space do
      sim
    else
      no_space = Accumulator.push(sim.no_space, id)

      sim = %{
        sim
        | no_space: no_space,
          cur_word_keys: [id | sim.cur_word_keys],
          cur_word_presses: sim.cur_word_presses + 1
      }

      sim = hand_run(sim, pos.hand, ev.label)
      sim = finger_run(sim, if(length(pos.fingers) == 1, do: hd(pos.fingers), else: nil))
      layer_run(sim, ev.layer)
    end
  end

  defp b2i(true), do: 1
  defp b2i(false), do: 0

  defp hand_run(sim, hand, label) do
    if hand == sim.run_hand and hand != :both do
      %{sim | run_len: sim.run_len + 1, run_labels: [label | sim.run_labels]}
    else
      sim = flush_hand_run(sim)
      %{sim | run_hand: hand, run_len: if(hand == :both, do: 0, else: 1), run_labels: [label]}
    end
  end

  defp flush_hand_run(%{run_len: len} = sim) when len > 0 do
    runs = Map.update(sim.hand_runs, len, 1, &(&1 + 1))

    strings =
      if len >= 4 do
        s = sim.run_labels |> Enum.reverse() |> IO.iodata_to_binary()
        Map.update(sim.hand_strings, s, 1, &(&1 + 1))
      else
        sim.hand_strings
      end

    %{sim | hand_runs: runs, hand_strings: strings, run_len: 0, run_labels: [], run_hand: nil}
  end

  defp flush_hand_run(sim), do: %{sim | run_len: 0, run_labels: [], run_hand: nil}

  defp finger_run(sim, finger) do
    if finger != nil and finger == sim.run_finger do
      %{sim | run_finger_len: sim.run_finger_len + 1}
    else
      sim = flush_finger_run(sim)
      %{sim | run_finger: finger, run_finger_len: if(finger == nil, do: 0, else: 1)}
    end
  end

  defp flush_finger_run(%{run_finger_len: len} = sim) when len > 0,
    do: %{
      sim
      | finger_runs: Map.update(sim.finger_runs, len, 1, &(&1 + 1)),
        run_finger_len: 0,
        run_finger: nil
    }

  defp flush_finger_run(sim), do: %{sim | run_finger_len: 0, run_finger: nil}

  defp layer_run(sim, layer) do
    if layer == sim.run_layer do
      %{sim | run_layer_len: sim.run_layer_len + 1}
    else
      sim = flush_layer_run(sim)
      %{sim | run_layer: layer, run_layer_len: 1}
    end
  end

  defp flush_layer_run(%{run_layer_len: len, run_layer: layer} = sim) when len > 0 and layer > 0,
    do: %{
      sim
      | layer_runs: Map.update(sim.layer_runs, len, 1, &(&1 + 1)),
        run_layer_len: 0,
        run_layer: -1
    }

  defp flush_layer_run(sim), do: %{sim | run_layer_len: 0, run_layer: -1}

  defp word_boundary(sim, hard) do
    sim =
      case sim.cur_word do
        [] ->
          sim

        tokens ->
          word = tokens |> Enum.reverse() |> IO.iodata_to_binary()
          keys = Enum.reverse(sim.cur_word_keys)
          :ets.update_counter(sim.words, word, {2, 1}, {word, 0, sim.cur_word_presses, keys})
          %{sim | stats: %{sim.stats | words: sim.stats.words + 1}}
      end

    sim = %{sim | cur_word: [], cur_word_keys: [], cur_word_presses: 0}

    sim =
      if sim.cross_word == :reset or hard do
        sim
        |> flush_hand_run()
        |> flush_finger_run()
        |> flush_layer_run()
        |> then(&%{&1 | no_space: Accumulator.boundary(&1.no_space)})
      else
        sim
      end

    sim = if hard, do: %{sim | with_space: Accumulator.boundary(sim.with_space)}, else: sim
    %{sim | last_pos_word: sim.home_keys}
  end

  # ------------------------------------------------------------------ driver

  defp type_token(sim, token, attempt \\ 0) do
    cands = candidates_for(sim, token)

    result =
      Enum.reduce_while(cands, :error, fn p, _ ->
        case try_producer(sim, p, token) do
          {:ok, sim2, events} -> {:halt, {:ok, commit(sim2, events, false)}}
          :error -> {:cont, :error}
        end
      end)

    case result do
      {:ok, _} = ok ->
        ok

      :error when attempt == 0 and map_size(sim.planner_holds.map) > 0 ->
        {sim2, rel} = release_holds(sim)
        type_token(commit(sim2, rel, false), token, 1)

      :error ->
        :error
    end
  end

  defp type_space(sim) do
    c = sim.compiled
    {m2, events} = Machine.perform(c, sim.machine, {:tap, c.space_key})

    {sim, events} =
      if events |> Enum.map(& &1.symbols) |> IO.iodata_to_binary() == " " do
        {%{sim | machine: m2}, events}
      else
        {sim2, rel} = release_holds(sim)
        sim2 = commit(sim2, rel, false)
        {m3, events} = Machine.perform(c, sim2.machine, {:tap, c.space_key})

        events =
          Enum.map(events, fn e ->
            if e.symbols == " ", do: e, else: %{e | symbols: " ", key_kind: :space, label: "␣"}
          end)

        {%{sim2 | machine: m3}, events}
      end

    events =
      Enum.map(events, fn e -> if e.symbols == " ", do: %{e | key_kind: :space}, else: e end)

    commit(sim, events, true)
  end

  @doc false
  def run(%__MODULE__{} = sim, stream) do
    max = Keyword.get(sim.opts, :max_symbols, :infinity)
    sim = loop(sim, stream, 0, max)
    sim = word_boundary(sim, false)
    {sim, rel} = release_holds(sim)
    sim = commit(sim, rel, false)

    words =
      sim.words
      |> :ets.tab2list()
      |> Map.new(fn {word, count, presses, keys} ->
        {word, %{word: word, count: count, presses: presses, keys: keys}}
      end)

    :ets.delete(sim.words)

    %Simulation{
      registry: sim.registry,
      no_space: Accumulator.finish(sim.no_space),
      with_space: Accumulator.finish(sim.with_space),
      runs: %{
        hand_runs: sim.hand_runs,
        hand_strings: sim.hand_strings,
        finger_runs: sim.finger_runs,
        layer_runs: sim.layer_runs
      },
      words: words,
      travel: sim.travel,
      stats: sim.stats,
      coverage: %{
        unproducible: sim.unproducible,
        soft_dropped: sim.soft_dropped,
        excluded_by_case: Enum.map(sim.index.excluded_by_case, & &1.id)
      },
      events: if(sim.collect_events, do: Enum.reverse(sim.events), else: nil),
      producers: sim.index
    }
  end

  defp loop(sim, <<>>, _n, _max), do: sim
  defp loop(sim, _rest, n, max) when is_integer(max) and n >= max, do: sim

  defp loop(sim, <<" ", rest::binary>>, n, max) do
    sim |> word_boundary(false) |> type_space() |> loop(rest, n, max)
  end

  defp loop(sim, <<c::utf8, rest::binary>> = bin, n, max) do
    first = <<c::utf8>>

    candidates =
      if MapSet.member?(sim.index.multi_starts, first) do
        multi_tokens(bin, sim.index.max_len, sim.index.by_symbol) ++ [{first, 1, rest}]
      else
        [{first, 1, rest}]
      end

    typed =
      Enum.reduce_while(candidates, :error, fn {token, len, remaining}, _ ->
        case type_token(sim, token) do
          {:ok, sim2} ->
            {:halt,
             {:ok,
              %{
                sim2
                | cur_word: [token | sim2.cur_word],
                  stats: %{sim2.stats | symbols: sim2.stats.symbols + len}
              }, len, remaining}}

          :error ->
            {:cont, :error}
        end
      end)

    case typed do
      {:ok, sim2, len, remaining} ->
        loop(sim2, remaining, n + len, max)

      :error ->
        sim2 =
          if MapSet.member?(sim.soft_symbols, first),
            do: %{sim | soft_dropped: Map.update(sim.soft_dropped, first, 1, &(&1 + 1))},
            else: %{sim | unproducible: Map.update(sim.unproducible, first, 1, &(&1 + 1))}

        sim2 |> word_boundary(true) |> loop(rest, n + 1, max)
    end
  end

  # Multi-grapheme candidates (longest first) that exist in the producer index and don't cross a space.
  defp multi_tokens(bin, max_len, by_symbol) do
    for len <- max_len..2//-1,
        {:ok, token, rest} <- [take(bin, len)],
        Map.has_key?(by_symbol, token),
        do: {token, len, rest}
  end

  defp take(bin, len), do: do_take(bin, len, [])
  defp do_take(rest, 0, acc), do: {:ok, acc |> Enum.reverse() |> IO.iodata_to_binary(), rest}
  defp do_take(<<>>, _n, _acc), do: :error
  defp do_take(<<" ", _::binary>>, _n, _acc), do: :error
  defp do_take(<<c::utf8, rest::binary>>, n, acc), do: do_take(rest, n - 1, [<<c::utf8>> | acc])
end
