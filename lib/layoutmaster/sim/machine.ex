defmodule LayoutMaster.Sim.Machine do
  @moduledoc """
  Deterministic, timing-free ZMK-like state machine (SPEC §5.1–§5.3).

  The state is an immutable struct; `perform/3` returns the new state and the key events
  produced by one physical action. Because state is immutable, the planner's dry runs are
  free: keep the previous state to "restore".
  """

  import Bitwise

  alias LayoutMaster.Host.Locale
  alias LayoutMaster.Layout.Compile

  defmodule State do
    @moduledoc false
    defstruct persistent_mask: 1,
              locks: 0,
              one_shots: [],
              held: %{},
              sticky_mods: [],
              caps_word: nil,
              auto_layer: nil,
              last_symbol: nil,
              last_keycode: nil,
              pending_dead_key: nil,
              mask: 1
  end

  defmodule Event do
    @moduledoc "One physical key event."
    defstruct kind: :tap,
              pos: 0,
              layer: 0,
              symbols: "",
              key_kind: :alpha,
              label: "",
              leaf_kind: :none,
              producer_kind: nil,
              wasted_one_shot: false,
              under_hold: 0

    @type t :: %__MODULE__{}
  end

  @type action ::
          {:tap, non_neg_integer()}
          | {:tap, non_neg_integer(), pos_integer()}
          | {:hold_press, non_neg_integer()}
          | {:hold_release, non_neg_integer()}
          | {:chord, non_neg_integer()}

  @layer_kinds [:none, :sl, :tog, :to, :mo, :lt, :auto_layer, :caps_word]

  def new(%Compile{} = compiled), do: recompute_mask(%State{}, compiled)

  # ------------------------------------------------------------------- masks

  def recompute_mask(%State{} = s, %Compile{} = c) do
    m = 1 ||| s.persistent_mask ||| held_layer_mask(s)
    m = Enum.reduce(s.one_shots, m, fn os, acc -> acc ||| 1 <<< os.layer end)
    m = if s.auto_layer, do: m ||| 1 <<< s.auto_layer.layer, else: m

    m =
      case c.conditional_layers do
        [] -> m
        conds -> fixed_point(m &&& bnot(c.conditional_then_mask), conds, 0)
      end

    %{s | mask: m}
  end

  defp fixed_point(m, _conds, 33), do: m

  defp fixed_point(m, conds, iter) do
    next =
      Enum.reduce(conds, m, fn {if_mask, then}, acc ->
        if (acc &&& if_mask) == if_mask, do: acc ||| 1 <<< then, else: acc &&& bnot(1 <<< then)
      end)

    if next == m, do: m, else: fixed_point(next, conds, iter + 1)
  end

  def held_layer_mask(%State{held: held}) do
    Enum.reduce(held, 0, fn
      {_pos, %{layer: l}}, acc when is_integer(l) -> acc ||| 1 <<< l
      _, acc -> acc
    end)
  end

  def held_mods(%State{held: held}), do: for({_pos, %{mod: m}} <- held, do: m)

  def highest_active_layer(%State{mask: mask}), do: highest_bit(mask, 0, 0)

  defp highest_bit(0, _i, best), do: best

  defp highest_bit(mask, i, best),
    do: highest_bit(mask >>> 1, i + 1, if((mask &&& 1) == 1, do: i, else: best))

  def layer_active?(%State{mask: mask}, layer), do: (mask &&& 1 <<< layer) != 0

  @doc "Layer walk from the highest active layer down: `trans` passes, `none` swallows."
  def resolve(%Compile{} = c, %State{mask: mask}, pos), do: resolve(c, mask, pos)

  def resolve(%Compile{layers: layers}, mask, pos) when is_integer(mask) do
    do_resolve(layers, tuple_size(layers) - 1, mask, pos)
  end

  defp do_resolve(_layers, li, _mask, _pos) when li < 0, do: {%{kind: :none}, 0}

  defp do_resolve(layers, li, mask, pos) do
    if (mask &&& 1 <<< li) == 0 do
      do_resolve(layers, li - 1, mask, pos)
    else
      case elem(elem(layers, li).bindings, pos) do
        %{kind: :trans} -> do_resolve(layers, li - 1, mask, pos)
        b -> {b, li}
      end
    end
  end

  def active_mods(%State{} = s) do
    MapSet.new(held_mods(s) ++ Enum.map(s.sticky_mods, & &1.mod))
  end

  def combo_available?(%Compile{} = c, %State{} = s, combo_idx) do
    combo = Compile.combo(c, combo_idx)
    combo.layer_mask == nil or (combo.layer_mask &&& 1 <<< highest_active_layer(s)) != 0
  end

  # ----------------------------------------------------------------- actions

  @doc "Perform one physical action; returns `{state, events}`."
  @spec perform(Compile.t(), State.t(), action()) :: {State.t(), [Event.t()]}
  def perform(c, s, {:tap, pos}), do: perform(c, s, {:tap, pos, 1})

  def perform(c, s, {:tap, pos, taps}) do
    Enum.map_reduce(1..taps, s, fn i, st ->
      {st2, ev} = press(c, st, pos, :tap, if(i == taps, do: taps, else: 0))
      {ev, st2}
    end)
    |> then(fn {events, st} -> {st, events} end)
  end

  def perform(c, s, {:hold_press, pos}) do
    {s2, ev} = press(c, s, pos, :hold, 1)
    {s2, [ev]}
  end

  def perform(c, s, {:hold_release, pos}), do: release(c, s, pos)
  def perform(c, s, {:chord, combo}), do: chord(c, s, combo)

  defp new_ctx(mode, pos, taps) do
    %{
      mode: mode,
      pos: pos,
      taps: taps,
      out: [],
      leaf: :none,
      outer: nil,
      emitted_keycode: false,
      modifier_press: false,
      suppress_mods: MapSet.new(),
      depth: 0
    }
  end

  defp press(c, s, pos, mode, taps) do
    armed_before = s.one_shots
    sticky_before = s.sticky_mods
    held_before = held_layer_mask(s)
    {binding, layer} = resolve(c, s, pos)
    ctx = new_ctx(mode, pos, taps)

    {s, ctx} =
      if taps == 0 do
        {s, %{ctx | leaf: :tap_dance, outer: :tap_dance}}
      else
        run(c, s, binding, ctx)
      end

    {s, wasted} = post_step(s, ctx, armed_before, sticky_before, layer)
    s = recompute_mask(s, c)
    text = ctx.out |> Enum.reverse() |> IO.iodata_to_binary()

    {s,
     %Event{
       kind: if(mode == :hold, do: :hold_press, else: :tap),
       pos: pos,
       layer: layer,
       symbols: text,
       key_kind: classify(ctx, mode, text),
       label: label_for(c, ctx, binding, text),
       leaf_kind: ctx.leaf,
       wasted_one_shot: wasted,
       under_hold: held_before
     }}
  end

  defp release(c, s, pos) do
    entry = Map.get(s.held, pos)
    held_before = held_layer_mask(s)
    layer = if(entry && entry[:layer], do: entry.layer, else: highest_active_layer(s))
    s = %{s | held: Map.delete(s.held, pos)} |> recompute_mask(c)

    label =
      cond do
        entry && entry[:layer] -> "⇩" <> Compile.layer(c, entry.layer).name
        entry && entry[:mod] -> "⇩#{entry.mod}"
        true -> "⇩"
      end

    {s,
     [
       %Event{
         kind: :hold_release,
         pos: pos,
         layer: layer,
         symbols: "",
         key_kind: :hold,
         label: label,
         leaf_kind: if(entry && entry[:layer], do: :mo, else: :mod),
         wasted_one_shot: false,
         under_hold: held_before
       }
     ]}
  end

  defp chord(c, s, combo_idx) do
    combo = Compile.combo(c, combo_idx)
    armed_before = s.one_shots
    sticky_before = s.sticky_mods
    held_before = held_layer_mask(s)
    layer = highest_active_layer(s)
    ctx = new_ctx(:tap, combo.pos, 1)

    {s, ctx} =
      if combo_available?(c, s, combo_idx), do: run(c, s, combo.binding, ctx), else: {s, ctx}

    {s, wasted} = post_step(s, ctx, armed_before, sticky_before, layer)
    s = recompute_mask(s, c)
    text = ctx.out |> Enum.reverse() |> IO.iodata_to_binary()

    {s,
     [
       %Event{
         kind: :chord,
         pos: combo.pos,
         layer: layer,
         symbols: text,
         key_kind: :combo,
         label: if(text == "", do: combo.id, else: text),
         leaf_kind: ctx.leaf,
         wasted_one_shot: wasted,
         under_hold: held_before
       }
     ]}
  end

  # One-shot / sticky consumption and caps-word / auto-layer continuation.
  defp post_step(s, ctx, armed_before, sticky_before, layer) do
    {one_shots, wasted} =
      Enum.reduce(armed_before, {s.one_shots, false}, fn os, {list, wasted} ->
        if ctx.modifier_press and os.ignore_modifiers do
          {list, wasted}
        else
          list = List.delete(list, os)
          w = ctx.modifier_press or layer != os.layer or ctx.leaf in @layer_kinds
          {list, wasted or w}
        end
      end)

    sticky =
      Enum.reduce(sticky_before, s.sticky_mods, fn sm, list ->
        consume = ctx.emitted_keycode or (ctx.modifier_press and not sm.ignore_modifiers)
        if consume, do: List.delete(list, sm), else: list
      end)

    s = %{s | one_shots: one_shots, sticky_mods: sticky}

    s =
      if ctx.emitted_keycode do
        out = Enum.reverse(ctx.out)

        s =
          if s.caps_word && breaks_continue?(out, s.caps_word.continue_list),
            do: %{s | caps_word: nil},
            else: s

        if s.auto_layer && breaks_continue?(out, s.auto_layer.continue_list),
          do: %{s | auto_layer: nil},
          else: s
      else
        s
      end

    {s, wasted}
  end

  defp breaks_continue?(out, continue_list) do
    out
    |> Enum.flat_map(&String.graphemes/1)
    |> Enum.any?(fn g -> not (alpha?(g) or g in continue_list) end)
  end

  @doc "Single letter grapheme?"
  def alpha?(g), do: String.match?(g, ~r/^\p{L}$/u)

  defp effective_shift?(s, ctx, for_alpha) do
    held =
      Enum.any?(held_mods(s), fn m ->
        m in [:LSHIFT, :RSHIFT] and not MapSet.member?(ctx.suppress_mods, m)
      end)

    sticky =
      Enum.any?(s.sticky_mods, fn sm ->
        sm.mod in [:LSHIFT, :RSHIFT] and not MapSet.member?(ctx.suppress_mods, sm.mod)
      end)

    caps = for_alpha and s.caps_word != nil and Locale.shift?(s.caps_word.mods)
    held or sticky or caps
  end

  defp emit(s, ctx, symbol, keycode) do
    {text, s} =
      if s.pending_dead_key != nil and symbol != "" do
        {Locale.compose(s.pending_dead_key, symbol), %{s | pending_dead_key: nil}}
      else
        {symbol, s}
      end

    ctx = if text != "", do: %{ctx | out: [text | ctx.out]}, else: ctx
    ctx = %{ctx | emitted_keycode: true}

    s = %{
      s
      | last_symbol: if(symbol != "", do: symbol, else: s.last_symbol),
        last_keycode: keycode || if(symbol != "", do: symbol, else: s.last_keycode)
    }

    {s, ctx}
  end

  defp matches_trigger?(%Compile{host_locale: :symbols}, s, after_any, _strict) do
    case s.last_symbol do
      nil ->
        false

      last ->
        lower = String.downcase(last)
        Enum.any?(after_any, fn a -> a == last or String.downcase(a) == lower end)
    end
  end

  defp matches_trigger?(_c, s, after_any, strict) do
    case s.last_keycode do
      nil ->
        false

      last ->
        Enum.any?(after_any, fn a ->
          a == last or (not strict and String.ends_with?(last, "(#{a})"))
        end)
    end
  end

  defp layer_idx(c, id), do: Compile.layer_idx!(c, id)

  # --------------------------------------------------------------- behaviors

  @doc false
  def run(_c, s, _b, %{depth: d} = ctx) when d > 24, do: {s, ctx}

  def run(c, s, %{kind: kind} = b, ctx) do
    ctx = %{ctx | outer: ctx.outer || kind, depth: ctx.depth + 1}
    {s, ctx} = do_run(c, s, b, ctx)
    {s, %{ctx | depth: ctx.depth - 1}}
  end

  defp do_run(c, s, %{kind: :kp} = b, ctx) do
    ctx = %{ctx | leaf: :kp}

    if c.host_locale == :symbols or b[:keycode] == nil do
      base = b[:symbol] || ""
      shifted = effective_shift?(s, ctx, alpha?(base))
      text = if shifted, do: Locale.shift_symbol(base, b[:shifted]), else: base
      emit(s, ctx, text, nil)
    else
      mods = active_mods(s) |> MapSet.difference(ctx.suppress_mods)
      mods = if s.caps_word, do: MapSet.union(mods, MapSet.new(s.caps_word.mods)), else: mods

      case Locale.translate(c.host_locale, b.keycode, MapSet.to_list(mods)) do
        nil ->
          emit(s, ctx, "", b.keycode)

        {:dead, d} ->
          {%{s | pending_dead_key: d, last_keycode: b.keycode}, %{ctx | emitted_keycode: true}}

        {:symbol, sym} ->
          emit(s, ctx, sym, b.keycode)
      end
    end
  end

  defp do_run(_c, s, %{kind: k}, ctx) when k in [:trans, :none, :ref],
    do: {s, %{ctx | leaf: if(k == :ref, do: :none, else: k)}}

  defp do_run(c, s, %{kind: :mo, layer: l}, ctx) do
    s =
      if ctx.mode == :hold,
        do: %{s | held: Map.put(s.held, ctx.pos, %{layer: layer_idx(c, l)})},
        else: s

    {s, %{ctx | leaf: :mo}}
  end

  defp do_run(c, s, %{kind: :lt, layer: l, tap: tap}, ctx) do
    if ctx.mode == :hold do
      {%{s | held: Map.put(s.held, ctx.pos, %{layer: layer_idx(c, l)})}, %{ctx | leaf: :lt}}
    else
      run(c, s, tap, ctx)
    end
  end

  defp do_run(c, s, %{kind: :hold_tap, tap: tap, hold: hold}, ctx) do
    run(c, s, if(ctx.mode == :hold, do: hold, else: tap), ctx)
  end

  defp do_run(c, s, %{kind: :sl, layer: l} = b, ctx) do
    os = %{
      layer: layer_idx(c, l),
      quick_release: Map.get(b, :quick_release, true),
      ignore_modifiers: Map.get(b, :ignore_modifiers, false)
    }

    {%{s | one_shots: s.one_shots ++ [os]}, %{ctx | leaf: :sl}}
  end

  defp do_run(c, s, %{kind: :tog, layer: l} = b, ctx) do
    bit = 1 <<< layer_idx(c, l)
    on = (s.persistent_mask &&& bit) != 0

    turn_on =
      case Map.get(b, :mode, :flip) do
        :on -> true
        :off -> false
        _ -> not on
      end

    s =
      if turn_on,
        do: %{s | persistent_mask: s.persistent_mask ||| bit, locks: s.locks ||| bit},
        else: %{
          s
          | persistent_mask: s.persistent_mask &&& bnot(bit),
            locks: s.locks &&& bnot(bit)
        }

    {s, %{ctx | leaf: :tog}}
  end

  defp do_run(c, s, %{kind: :to, layer: l}, ctx) do
    bit = 1 <<< layer_idx(c, l)
    held = s.held |> Enum.reject(fn {_k, v} -> Map.has_key?(v, :layer) end) |> Map.new()

    {%{s | persistent_mask: 1 ||| bit, locks: bit, one_shots: [], auto_layer: nil, held: held},
     %{ctx | leaf: :to}}
  end

  defp do_run(_c, s, %{kind: :sk, mod: m} = b, ctx) do
    sm = %{
      mod: m,
      quick_release: Map.get(b, :quick_release, false),
      ignore_modifiers: Map.get(b, :ignore_modifiers, true)
    }

    {%{s | sticky_mods: s.sticky_mods ++ [sm]}, %{ctx | leaf: :sk, modifier_press: true}}
  end

  defp do_run(_c, s, %{kind: :mod, mod: m}, ctx) do
    s = if ctx.mode == :hold, do: %{s | held: Map.put(s.held, ctx.pos, %{mod: m})}, else: s
    {s, %{ctx | leaf: :mod, modifier_press: true}}
  end

  defp do_run(_c, s, %{kind: :caps_word} = b, ctx) do
    s =
      if s.caps_word,
        do: %{s | caps_word: nil},
        else: %{
          s
          | caps_word: %{
              continue_list: Map.get(b, :continue_list, ["_", "Backspace", "Delete"]),
              mods: Map.get(b, :mods, [:LSHIFT])
            }
        }

    {s, %{ctx | leaf: :caps_word}}
  end

  defp do_run(c, s, %{kind: :auto_layer, layer: l} = b, ctx) do
    li = layer_idx(c, l)

    s =
      if s.auto_layer && s.auto_layer.layer == li,
        do: %{s | auto_layer: nil},
        else: %{
          s
          | auto_layer: %{
              layer: li,
              continue_list: Map.get(b, :continue_list, ["_", "Backspace"])
            }
        }

    {s, %{ctx | leaf: :auto_layer}}
  end

  defp do_run(_c, s, %{kind: :key_repeat}, ctx) do
    ctx = %{ctx | leaf: :key_repeat}

    case s.last_symbol do
      nil ->
        {s, %{ctx | emitted_keycode: true}}

      sym ->
        text =
          if effective_shift?(s, ctx, alpha?(sym)), do: Locale.shift_symbol(sym, nil), else: sym

        emit(s, ctx, text, s.last_keycode)
    end
  end

  defp do_run(c, s, %{kind: :adaptive} = b, ctx) do
    strict = Map.get(b, :strict_modifiers, false)

    case Enum.find(Map.get(b, :triggers) || [], fn t ->
           matches_trigger?(c, s, t.after_any, strict)
         end) do
      %{binding: tb} ->
        run(c, s, tb, ctx)

      nil ->
        case Map.get(b, :default) do
          nil -> {s, %{ctx | leaf: :none}}
          d -> run(c, s, d, ctx)
        end
    end
  end

  defp do_run(c, s, %{kind: :mod_morph} = b, ctx) do
    active = active_mods(s)

    hit =
      Enum.any?(b.mods, fn m ->
        MapSet.member?(active, m) and not MapSet.member?(ctx.suppress_mods, m)
      end)

    if hit do
      keep = MapSet.new(Map.get(b, :keep_mods, []))
      saved = ctx.suppress_mods

      suppress =
        Enum.reduce(b.mods, saved, fn m, acc ->
          if MapSet.member?(keep, m), do: acc, else: MapSet.put(acc, m)
        end)

      {s, ctx} = run(c, s, b.morphed, %{ctx | suppress_mods: suppress})
      {s, %{ctx | suppress_mods: saved}}
    else
      run(c, s, b.default, ctx)
    end
  end

  defp do_run(c, s, %{kind: :layer_morph} = b, ctx) do
    bits = Enum.map(b.layers, fn l -> 1 <<< layer_idx(c, l) end)

    on =
      if Map.get(b, :match, :any) == :all,
        do: Enum.all?(bits, &((s.mask &&& &1) != 0)),
        else: Enum.any?(bits, &((s.mask &&& &1) != 0))

    run(c, s, if(on, do: b.active, else: b.inactive), ctx)
  end

  defp do_run(c, s, %{kind: :tap_dance, bindings: bs}, ctx) do
    n = max(1, min(max(ctx.taps, 1), length(bs)))
    run(c, s, Enum.at(bs, n - 1), ctx)
  end

  defp do_run(c, s, %{kind: :macro} = b, ctx) do
    steps =
      cond do
        b[:steps] ->
          b.steps

        b[:symbols] ->
          for g <- LayoutMaster.Layout.Binding.graphemes(b.symbols), do: %{kind: :kp, symbol: g}

        true ->
          []
      end

    steps = steps ++ (b[:then] || [])
    saved_mode = ctx.mode

    {s, ctx} =
      Enum.reduce(steps, {s, %{ctx | mode: :tap}}, fn step, {st, cx} ->
        {st, cx} = run(c, st, step, cx)
        {recompute_mask(st, c), cx}
      end)

    {s, %{ctx | mode: saved_mode, leaf: :macro}}
  end

  defp do_run(_c, s, %{kind: :dead_key, diacritic: d}, ctx) do
    {%{s | pending_dead_key: d}, %{ctx | leaf: :dead_key, emitted_keycode: true}}
  end

  defp do_run(_c, s, %{kind: :unicode} = b, ctx) do
    ctx = %{ctx | leaf: :unicode}
    shifted = effective_shift?(s, ctx, alpha?(b.symbol))
    emit(s, ctx, if(shifted and b[:shifted_symbol], do: b.shifted_symbol, else: b.symbol), nil)
  end

  # ----------------------------------------------------------- classification

  defp classify(_ctx, :hold, _text), do: :hold

  defp classify(ctx, :tap, text) do
    cond do
      text == " " -> :space
      ctx.outer == :adaptive -> :magic
      ctx.outer == :key_repeat or ctx.leaf == :key_repeat -> :repeat
      ctx.leaf in [:sl, :tog, :to, :mo, :lt] -> :layer_tap
      ctx.leaf in [:sk, :mod, :caps_word, :auto_layer] -> :shift
      true -> :alpha
    end
  end

  defp label_for(_c, _ctx, _binding, text) when text != "",
    do: if(text == " ", do: "␣", else: text)

  defp label_for(c, ctx, binding, _text) do
    layer_name = fn id ->
      case Map.get(c.layer_index, id) do
        nil -> id
        idx -> Compile.layer(c, idx).name
      end
    end

    peel(binding, ctx.mode, layer_name)
  end

  defp peel(%{kind: :sl, layer: l}, _mode, name), do: "→" <> name.(l)
  defp peel(%{kind: :mo, layer: l}, _mode, name), do: "⇩" <> name.(l)

  defp peel(%{kind: :lt, layer: l, tap: tap}, mode, name),
    do: if(mode == :hold, do: "⇩" <> name.(l), else: peel(tap, mode, name))

  defp peel(%{kind: :tog, layer: l}, _mode, name), do: "⇄" <> name.(l)
  defp peel(%{kind: :to, layer: l}, _mode, name), do: "⇒" <> name.(l)

  defp peel(%{kind: :sk, mod: m}, _mode, _name),
    do: if(m in [:LSHIFT, :RSHIFT], do: "⇧", else: "◇#{m}")

  defp peel(%{kind: :mod, mod: m}, _mode, _name),
    do: if(m in [:LSHIFT, :RSHIFT], do: "⇧", else: "◆#{m}")

  defp peel(%{kind: :caps_word}, _mode, _name), do: "⇪"
  defp peel(%{kind: :auto_layer, layer: l}, _mode, name), do: "⇪" <> name.(l)
  defp peel(%{kind: :key_repeat}, _mode, _name), do: "⟳"

  defp peel(%{kind: :hold_tap, tap: t, hold: h}, mode, name),
    do: peel(if(mode == :hold, do: h, else: t), mode, name)

  defp peel(%{kind: :mod_morph, default: d}, mode, name), do: peel(d, mode, name)
  defp peel(%{kind: :layer_morph, inactive: i}, mode, name), do: peel(i, mode, name)

  defp peel(%{kind: :adaptive} = b, mode, name),
    do: if(b[:default], do: peel(b.default, mode, name), else: "✦")

  defp peel(%{kind: :tap_dance, bindings: [first | _]}, mode, name), do: peel(first, mode, name)
  defp peel(%{kind: :macro} = b, _mode, _name), do: b[:symbols] || "⋯"
  defp peel(%{kind: :kp} = b, _mode, _name), do: b[:symbol] || b[:keycode] || ""
  defp peel(%{kind: :dead_key, diacritic: d}, _mode, _name), do: d
  defp peel(%{kind: :unicode, symbol: sym}, _mode, _name), do: sym
  defp peel(_, _mode, _name), do: "·"

  @doc "Peel morphs / hold-taps to the binding that would run for `mode` under the current state."
  def peel_binding(c, s, %{kind: :hold_tap, tap: t, hold: h}, mode),
    do: peel_binding(c, s, if(mode == :hold, do: h, else: t), mode)

  def peel_binding(_c, _s, %{kind: :lt, layer: l}, :hold), do: %{kind: :mo, layer: l}
  def peel_binding(c, s, %{kind: :lt, tap: t}, :tap), do: peel_binding(c, s, t, :tap)

  def peel_binding(c, s, %{kind: :mod_morph} = b, mode) do
    active = active_mods(s)

    peel_binding(
      c,
      s,
      if(Enum.any?(b.mods, &MapSet.member?(active, &1)), do: b.morphed, else: b.default),
      mode
    )
  end

  def peel_binding(c, s, %{kind: :layer_morph} = b, mode) do
    bits = Enum.map(b.layers, fn l -> 1 <<< Map.get(c.layer_index, l, 0) end)

    on =
      if Map.get(b, :match, :any) == :all,
        do: Enum.all?(bits, &((s.mask &&& &1) != 0)),
        else: Enum.any?(bits, &((s.mask &&& &1) != 0))

    peel_binding(c, s, if(on, do: b.active, else: b.inactive), mode)
  end

  def peel_binding(_c, _s, b, _mode), do: b
end
