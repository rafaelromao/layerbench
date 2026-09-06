defmodule LayoutMaster.Layout.Compile do
  @moduledoc """
  Compile a `LayoutMaster.Layout` into an indexed, validated structure used by the simulator.

  * behavior references (`ref`) are resolved and merged;
  * `sl`/`sk` defaults are applied;
  * layers get per-position binding tuples (`*` default applied);
  * combos get virtual positions (chord centroids) appended after the physical keys.
  """

  alias LayoutMaster.Geometry
  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Binding

  defmodule Layer do
    @moduledoc false
    defstruct idx: 0, id: nil, name: nil, shifted_twin: nil, bindings: {}, explicit: {}
  end

  defmodule Combo do
    @moduledoc false
    defstruct idx: 0,
              id: nil,
              keys: [],
              binding: %{kind: :none},
              layer_mask: nil,
              role: :command,
              pos: 0
  end

  defmodule Position do
    @moduledoc "Physical key or chord virtual position."
    defstruct idx: 0,
              id: nil,
              key: nil,
              members: [],
              hand: :L,
              fingers: [],
              x: 0.0,
              y: 0.0,
              row: 1,
              col: 3,
              thumb: false,
              home: false,
              inner: false
  end

  defstruct layout: nil,
            geometry: nil,
            keys: {},
            positions: {},
            key_index: %{},
            layers: {},
            layer_index: %{},
            combos: {},
            conditional_layers: [],
            conditional_then_mask: 0,
            space_key: 0,
            shift_key: nil,
            host_locale: :symbols,
            behavior_defaults: %{},
            n_keys: 0,
            n_layers: 0

  @type t :: %__MODULE__{}

  @child_keys [:tap, :hold, :default, :morphed, :active, :inactive]

  @doc "Compile a layout; returns `{:ok, compiled}` or `{:error, [message]}`."
  @spec compile(Layout.t()) :: {:ok, t()} | {:error, [String.t()]}
  def compile(%Layout{} = layout) do
    geometry = build_geometry(layout)
    keys = geometry.keys
    key_index = keys |> Enum.with_index() |> Map.new(fn {k, i} -> {k.id, i} end)
    layer_ids = Enum.map(layout.layers, & &1.id)
    layer_index = layer_ids |> Enum.with_index() |> Map.new()

    errors =
      []
      |> then(fn e ->
        if length(layer_ids) != length(Enum.uniq(layer_ids)),
          do: ["duplicate layer ids" | e],
          else: e
      end)
      |> then(fn e ->
        if length(layer_ids) > 32, do: ["at most 32 layers are supported" | e], else: e
      end)

    defaults = resolve_defaults(layout.behavior_defaults)

    prep = fn b, errs ->
      b
      |> resolve_refs(layout.behaviors, 0, errs)
      |> then(fn {b2, errs2} -> {apply_defaults(b2, defaults), errs2} end)
    end

    {layers, errors} =
      layout.layers
      |> Enum.with_index()
      |> Enum.map_reduce(errors, fn {l, idx}, errs ->
        {fallback, errs} =
          case Map.get(l.bindings, "*") do
            nil -> {if(idx == 0, do: %{kind: :none}, else: %{kind: :trans}), errs}
            b -> prep.(b, errs)
          end

        {bindings, explicit, errs} =
          Enum.reduce(
            l.bindings,
            {List.duplicate(fallback, length(keys)), List.duplicate(false, length(keys)), errs},
            fn
              {"*", _}, acc ->
                acc

              {key_id, b}, {bs, ex, errs} ->
                case Map.get(key_index, key_id) do
                  nil ->
                    {bs, ex, ["layer #{l.id}: unknown key id #{key_id}" | errs]}

                  ki ->
                    {b2, errs} = prep.(b, errs)
                    {List.replace_at(bs, ki, b2), List.replace_at(ex, ki, true), errs}
                end
            end
          )

        errs =
          Enum.reduce(bindings, errs, fn b, e ->
            Enum.reduce(Binding.referenced_layers(b), e, fn ref, e2 ->
              if Map.has_key?(layer_index, ref),
                do: e2,
                else: ["layer #{l.id}: binding references unknown layer #{ref}" | e2]
            end)
          end)

        twin =
          case l.shifted_twin do
            nil -> nil
            t -> Map.get(layer_index, t)
          end

        errs =
          if l.shifted_twin && is_nil(twin),
            do: ["layer #{l.id}: unknown shiftedTwin #{l.shifted_twin}" | errs],
            else: errs

        {%Layer{
           idx: idx,
           id: l.id,
           name: l.name || l.id,
           shifted_twin: twin,
           bindings: List.to_tuple(bindings),
           explicit: List.to_tuple(explicit)
         }, errs}
      end)

    positions =
      keys
      |> Enum.with_index()
      |> Enum.map(fn {k, idx} ->
        %Position{
          idx: idx,
          id: k.id,
          key: k,
          members: [idx],
          hand: k.hand,
          fingers: [k.finger],
          x: k.x,
          y: k.y,
          row: k.row,
          col: k.col,
          thumb: k.thumb,
          home: k.home,
          inner: k.inner
        }
      end)

    {combos, positions, errors} =
      layout.combos
      |> Enum.with_index()
      |> Enum.reduce({[], positions, errors}, fn {c, idx}, {combos, positions, errs} ->
        {member_idx, errs} =
          Enum.reduce(c.keys, {[], errs}, fn kid, {acc, e} ->
            case Map.get(key_index, kid) do
              nil -> {acc, ["combo #{c.id}: unknown key id #{kid}" | e]}
              ki -> {acc ++ [ki], e}
            end
          end)

        {layer_mask, errs} =
          case c.layers do
            nil ->
              {nil, errs}

            list ->
              Enum.reduce(list, {0, errs}, fn lid, {mask, e} ->
                case Map.get(layer_index, lid) do
                  nil -> {mask, ["combo #{c.id}: unknown layer #{lid}" | e]}
                  li -> {Bitwise.bor(mask, Bitwise.bsl(1, li)), e}
                end
              end)
          end

        {binding, errs} = prep.(c.binding, errs)
        member_keys = Enum.map(member_idx, &Enum.at(keys, &1))
        hands = member_keys |> Enum.map(& &1.hand) |> Enum.uniq()
        n = max(1, length(member_keys))
        pos = length(positions)

        position = %Position{
          idx: pos,
          id: "combo:#{c.id}",
          key: nil,
          members: member_idx,
          hand: if(length(hands) == 1, do: hd(hands), else: :both),
          fingers: member_keys |> Enum.map(& &1.finger) |> Enum.uniq(),
          x: Enum.sum(Enum.map(member_keys, & &1.x)) / n,
          y: Enum.sum(Enum.map(member_keys, & &1.y)) / n,
          row:
            if(member_keys == [],
              do: 1,
              else: round(Enum.sum(Enum.map(member_keys, & &1.row)) / n)
            ),
          col:
            if(member_keys == [],
              do: 3,
              else: round(Enum.sum(Enum.map(member_keys, & &1.col)) / n)
            ),
          thumb: member_keys != [] and Enum.all?(member_keys, & &1.thumb),
          home: member_keys != [] and Enum.all?(member_keys, & &1.home),
          inner: Enum.any?(member_keys, & &1.inner)
        }

        combo = %Combo{
          idx: idx,
          id: c.id,
          keys: member_idx,
          binding: binding,
          layer_mask: layer_mask,
          role: c.role,
          pos: pos
        }

        {combos ++ [combo], positions ++ [position], errs}
      end)

    {conditional, errors} =
      Enum.map_reduce(layout.conditional_layers, errors, fn c, errs ->
        {if_mask, errs} =
          Enum.reduce(c.if, {0, errs}, fn lid, {mask, e} ->
            case Map.get(layer_index, lid) do
              nil -> {mask, ["conditional layer: unknown layer #{lid}" | e]}
              li -> {Bitwise.bor(mask, Bitwise.bsl(1, li)), e}
            end
          end)

        case Map.get(layer_index, c.then) do
          nil -> {{if_mask, 0}, ["conditional layer: unknown then-layer #{c.then}" | errs]}
          then -> {{if_mask, then}, errs}
        end
      end)

    then_mask =
      Enum.reduce(conditional, 0, fn {_if, then}, m -> Bitwise.bor(m, Bitwise.bsl(1, then)) end)

    {space_key, errors} =
      case Map.get(key_index, layout.keys.space) do
        nil -> {0, ["unknown space key #{inspect(layout.keys.space)}" | errors]}
        i -> {i, errors}
      end

    {shift_key, errors} =
      case layout.keys.shift do
        nil ->
          {nil, errors}

        %{key: k, kind: kind} ->
          case Map.get(key_index, k) do
            nil -> {nil, ["unknown shift key #{k}" | errors]}
            i -> {%{key: i, kind: kind}, errors}
          end
      end

    case errors do
      [] ->
        {:ok,
         %__MODULE__{
           layout: layout,
           geometry: geometry,
           keys: List.to_tuple(keys),
           positions: List.to_tuple(positions),
           key_index: key_index,
           layers: List.to_tuple(layers),
           layer_index: layer_index,
           combos: List.to_tuple(combos),
           conditional_layers: conditional,
           conditional_then_mask: then_mask,
           space_key: space_key,
           shift_key: shift_key,
           host_locale: layout.host_locale,
           behavior_defaults: defaults,
           n_keys: length(keys),
           n_layers: length(layers)
         }}

      errs ->
        {:error, Enum.reverse(Enum.uniq(errs))}
    end
  end

  def compile!(layout) do
    case compile(layout) do
      {:ok, c} -> c
      {:error, errs} -> raise ArgumentError, "layout does not compile:\n" <> Enum.join(errs, "\n")
    end
  end

  # ------------------------------------------------------------------ helpers

  def build_geometry(%Layout{geometry: %{preset: p} = g, fingering: f}) do
    Geometry.preset(p, Map.get(g, :column_offsets, %{})) |> Geometry.apply_fingering(f)
  end

  def build_geometry(%Layout{geometry: %{custom: keys} = g, fingering: f}) do
    sorted = Enum.sort_by(keys, & &1.x)
    rows = for r <- [0, 1, 2], do: sorted |> Enum.filter(&(&1.row == r)) |> Enum.map(& &1.id)
    thumbs = sorted |> Enum.filter(&(&1.row == 3)) |> Enum.map(& &1.id)
    family = Map.get(g, :family, :columnar)

    %Geometry{
      id: "custom",
      name: Map.get(g, :name) || "Custom geometry",
      family: family,
      keys: keys,
      supports_angle_mod: family == :rowstagger,
      text_rows: rows,
      text_thumbs: thumbs
    }
    |> Geometry.apply_fingering(f)
  end

  defp resolve_defaults(d) do
    sl = Map.get(d, :sl, %{})
    sk = Map.get(d, :sk, %{})

    %{
      sl: %{
        quick_release: Map.get(sl, :quick_release, true),
        ignore_modifiers: Map.get(sl, :ignore_modifiers, false),
        release_after_ms: Map.get(sl, :release_after_ms, 1000)
      },
      sk: %{
        quick_release: Map.get(sk, :quick_release, false),
        ignore_modifiers: Map.get(sk, :ignore_modifiers, true),
        release_after_ms: Map.get(sk, :release_after_ms, 1000)
      }
    }
  end

  defp resolve_refs(b, _behaviors, depth, errors) when depth > 16 do
    {b, ["behavior reference chain too deep (cycle?)" | errors]}
  end

  defp resolve_refs(%{kind: :ref, ref: name}, behaviors, depth, errors) do
    case Map.get(behaviors, name) do
      nil -> {%{kind: :none}, ["unknown behavior reference #{inspect(name)}" | errors]}
      target -> resolve_refs(target, behaviors, depth + 1, errors)
    end
  end

  defp resolve_refs(%{ref: name} = b, behaviors, depth, errors) when is_binary(name) do
    case Map.get(behaviors, name) do
      nil ->
        {%{kind: :none}, ["unknown behavior reference #{inspect(name)}" | errors]}

      %{kind: k} = target when k == b.kind ->
        merged = Map.merge(target, Map.delete(b, :ref))
        resolve_refs(merged, behaviors, depth + 1, errors)

      %{kind: k} ->
        {%{kind: :none}, ["behavior #{name} is #{k} but referenced as #{b.kind}" | errors]}
    end
  end

  defp resolve_refs(b, behaviors, depth, errors) when is_map(b) do
    {b, errors} =
      Enum.reduce(@child_keys, {b, errors}, fn key, {acc, errs} ->
        case Map.get(acc, key) do
          child when is_map(child) ->
            {c2, errs} = resolve_refs(child, behaviors, depth + 1, errs)
            {Map.put(acc, key, c2), errs}

          _ ->
            {acc, errs}
        end
      end)

    {b, errors} =
      case b do
        %{kind: :tap_dance, bindings: bs} ->
          {bs2, errs} = Enum.map_reduce(bs, errors, &resolve_refs(&1, behaviors, depth + 1, &2))
          {%{b | bindings: bs2}, errs}

        %{kind: :macro} ->
          {steps, errs} =
            Enum.map_reduce(b[:steps] || [], errors, &resolve_refs(&1, behaviors, depth + 1, &2))

          {thens, errs} =
            Enum.map_reduce(b[:then] || [], errs, &resolve_refs(&1, behaviors, depth + 1, &2))

          b2 =
            b
            |> then(fn m -> if b[:steps], do: Map.put(m, :steps, steps), else: m end)
            |> then(fn m -> if b[:then], do: Map.put(m, :then, thens), else: m end)

          {b2, errs}

        %{kind: :adaptive} ->
          {triggers, errs} =
            Enum.map_reduce(b[:triggers] || [], errors, fn t, e ->
              {tb, e} = resolve_refs(t.binding, behaviors, depth + 1, e)
              {%{t | binding: tb}, e}
            end)

          {if(b[:triggers], do: Map.put(b, :triggers, triggers), else: b), errs}

        _ ->
          {b, errors}
      end

    {b, errors}
  end

  defp apply_defaults(%{kind: :sl} = b, d) do
    b
    |> Map.put_new(:quick_release, d.sl.quick_release)
    |> Map.put_new(:ignore_modifiers, d.sl.ignore_modifiers)
    |> Map.put_new(:release_after_ms, d.sl.release_after_ms)
  end

  defp apply_defaults(%{kind: :sk} = b, d) do
    b
    |> Map.put_new(:quick_release, d.sk.quick_release)
    |> Map.put_new(:ignore_modifiers, d.sk.ignore_modifiers)
    |> Map.put_new(:release_after_ms, d.sk.release_after_ms)
  end

  defp apply_defaults(%{kind: :lt, tap: t} = b, d), do: %{b | tap: apply_defaults(t, d)}

  defp apply_defaults(%{kind: :hold_tap, tap: t, hold: h} = b, d),
    do: %{b | tap: apply_defaults(t, d), hold: apply_defaults(h, d)}

  defp apply_defaults(%{kind: :mod_morph} = b, d),
    do: %{b | default: apply_defaults(b.default, d), morphed: apply_defaults(b.morphed, d)}

  defp apply_defaults(%{kind: :layer_morph} = b, d),
    do: %{b | active: apply_defaults(b.active, d), inactive: apply_defaults(b.inactive, d)}

  defp apply_defaults(%{kind: :tap_dance} = b, d),
    do: %{b | bindings: Enum.map(b.bindings, &apply_defaults(&1, d))}

  defp apply_defaults(%{kind: :macro} = b, d) do
    b
    |> then(fn m ->
      if m[:steps], do: Map.put(m, :steps, Enum.map(m.steps, &apply_defaults(&1, d))), else: m
    end)
    |> then(fn m ->
      if m[:then], do: Map.put(m, :then, Enum.map(m.then, &apply_defaults(&1, d))), else: m
    end)
  end

  defp apply_defaults(%{kind: :adaptive} = b, d) do
    b
    |> then(fn m ->
      if m[:default], do: Map.put(m, :default, apply_defaults(m.default, d)), else: m
    end)
    |> then(fn m ->
      if m[:triggers],
        do:
          Map.put(
            m,
            :triggers,
            Enum.map(m.triggers, fn t -> %{t | binding: apply_defaults(t.binding, d)} end)
          ),
        else: m
    end)
  end

  defp apply_defaults(b, _d), do: b

  # ---------------------------------------------------------------- accessors

  def key(%__MODULE__{keys: keys}, idx), do: elem(keys, idx)
  def position(%__MODULE__{positions: ps}, idx), do: elem(ps, idx)
  def layer(%__MODULE__{layers: ls}, idx), do: elem(ls, idx)

  def binding(%__MODULE__{layers: ls}, layer_idx, pos),
    do: elem(elem(ls, layer_idx).bindings, pos)

  def combo(%__MODULE__{combos: cs}, idx), do: elem(cs, idx)
  def layer_idx!(%__MODULE__{layer_index: li}, id), do: Map.fetch!(li, id)
  def key_idx!(%__MODULE__{key_index: ki}, id), do: Map.fetch!(ki, id)
end
