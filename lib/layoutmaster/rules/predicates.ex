defmodule LayoutMaster.Rules.Predicates do
  @moduledoc """
  Declarative predicate vocabulary over n-grams of logical keys (SPEC §7.3).

  A predicate is a map: combinators `%{all: [...]}`, `%{any: [...]}`, `%{none: [...]}`, or a leaf
  such as `%{same_finger: true}`, `%{row_delta: %{abs: 2}}`, `%{hand_pattern: "aba"}`.
  Pairwise leaves accept `at: [i, j]` to restrict to a sub-pair (default: consecutive pairs
  for bigrams, the whole n-gram for trigrams where applicable). Values may be `"$global.<name>"`.
  """

  alias LayoutMaster.Rules.Attrs

  @type ngram :: [Attrs.t()]

  @doc "Evaluate a predicate tree against an n-gram (list of attrs). Returns boolean."
  def match?(nil, _ngram, _ctx), do: true
  def match?(%{all: list}, ngram, ctx), do: Enum.all?(list, &match?(&1, ngram, ctx))
  def match?(%{any: list}, ngram, ctx), do: Enum.any?(list, &match?(&1, ngram, ctx))
  def match?(%{none: list}, ngram, ctx), do: not Enum.any?(list, &match?(&1, ngram, ctx))

  def match?(leaf, ngram, ctx) when is_map(leaf) do
    {at, leaf} = Map.pop(leaf, :at)
    leaf = Map.new(leaf, fn {k, v} -> {k, resolve(v, ctx)} end)
    keys = select(ngram, at)
    Enum.all?(leaf, fn {name, value} -> leaf?(name, value, keys, ngram, ctx) end)
  end

  defp resolve("$global." <> name, ctx), do: Map.get(ctx.globals, String.to_atom(name))
  defp resolve(v, _ctx), do: v

  # Sub-selection: `at: [i, j]` picks two keys; default is the whole n-gram.
  defp select(ngram, nil), do: ngram
  defp select(ngram, [i, j]), do: [Enum.at(ngram, i), Enum.at(ngram, j)]
  defp select(ngram, [i]), do: [Enum.at(ngram, i)]

  # ---- single-key attributes: evaluated over all selected keys ("all keys satisfy") unless `any_` prefix

  defp leaf?(:hand, v, keys, _ng, _ctx), do: Enum.all?(keys, &(&1.hand == atom(v)))
  defp leaf?(:finger, v, keys, _ng, _ctx), do: Enum.all?(keys, &in_set?(&1.finger, v))
  defp leaf?(:includes_finger, v, keys, _ng, _ctx), do: Enum.any?(keys, &in_set?(&1.finger, v))

  defp leaf?(:finger_name, v, keys, _ng, _ctx),
    do:
      Enum.all?(
        keys,
        &(&1.finger != nil and in_set?(LayoutMaster.Geometry.finger_name(&1.finger), v))
      )

  defp leaf?(:includes_finger_name, v, keys, _ng, _ctx),
    do:
      Enum.any?(
        keys,
        &(&1.finger != nil and in_set?(LayoutMaster.Geometry.finger_name(&1.finger), v))
      )

  defp leaf?(:row, v, keys, _ng, _ctx), do: Enum.all?(keys, &in_set?(&1.row, v))
  defp leaf?(:col, v, keys, _ng, _ctx), do: Enum.all?(keys, &in_set?(&1.col, v))
  defp leaf?(:is_thumb, v, keys, _ng, _ctx), do: Enum.all?(keys, &(&1.thumb == v))
  defp leaf?(:any_thumb, v, keys, _ng, _ctx), do: Enum.any?(keys, & &1.thumb) == v
  defp leaf?(:is_home, v, keys, _ng, _ctx), do: Enum.all?(keys, &(&1.home == v))
  defp leaf?(:is_inner, v, keys, _ng, _ctx), do: Enum.all?(keys, &(&1.inner == v))
  defp leaf?(:any_inner, v, keys, _ng, _ctx), do: Enum.any?(keys, & &1.inner) == v
  defp leaf?(:key_kind, v, keys, _ng, _ctx), do: Enum.all?(keys, &in_set?(&1.key_kind, v))
  defp leaf?(:any_key_kind, v, keys, _ng, _ctx), do: Enum.any?(keys, &in_set?(&1.key_kind, v))
  defp leaf?(:layer, v, keys, _ng, _ctx), do: Enum.all?(keys, &in_set?(&1.layer, v))
  defp leaf?(:any_layer, v, keys, _ng, _ctx), do: Enum.any?(keys, &in_set?(&1.layer, v))
  defp leaf?(:is_chord, v, keys, _ng, _ctx), do: Enum.all?(keys, &(length(&1.members) > 1)) == v

  # ---- pairwise attributes: evaluated over consecutive pairs of the selected keys ("all pairs")

  defp leaf?(:same_hand, v, keys, _ng, _ctx),
    do: all_pairs(keys, &(Attrs.same_hand?(&1, &2) == v))

  defp leaf?(:same_finger, v, keys, _ng, _ctx),
    do: all_pairs(keys, &(Attrs.same_finger?(&1, &2) == v))

  defp leaf?(:same_key, v, keys, _ng, _ctx), do: all_pairs(keys, &(&1.pos == &2.pos == v))

  defp leaf?(:adjacent_fingers, v, keys, _ng, _ctx),
    do: all_pairs(keys, &(Attrs.adjacent_fingers?(&1, &2) == v))

  defp leaf?(:rank_delta, v, keys, _ng, _ctx),
    do: all_pairs(keys, &num?(Attrs.rank_delta(&1, &2), v))

  defp leaf?(:row_delta, v, keys, _ng, _ctx), do: all_pairs(keys, &num?(&1.row - &2.row, v))
  defp leaf?(:col_delta, v, keys, _ng, _ctx), do: all_pairs(keys, &num?(&1.col - &2.col, v))

  defp leaf?(:x_distance, v, keys, _ng, _ctx),
    do: all_pairs(keys, &(Attrs.same_hand?(&1, &2) and num?(abs(&1.x - &2.x), v)))

  defp leaf?(:y_distance, v, keys, _ng, _ctx),
    do: all_pairs(keys, &(Attrs.same_hand?(&1, &2) and num?(abs(&1.y - &2.y), v)))

  defp leaf?(:distance, v, keys, _ng, ctx),
    do:
      all_pairs(keys, fn a, b ->
        (d = Attrs.distance(a, b, Map.get(ctx.globals, :distance_model, :euclid))) != nil and
          num?(d, v)
      end)

  defp leaf?(:direction, v, keys, _ng, _ctx),
    do: all_pairs(keys, &(Attrs.direction(&1, &2) == atom(v)))

  defp leaf?(:finger_name_pair, v, keys, _ng, _ctx) do
    wanted = v |> Enum.map(&atom/1) |> Enum.sort()

    all_pairs(keys, fn a, b ->
      a.finger != nil and b.finger != nil and Attrs.same_hand?(a, b) and
        Enum.sort([
          LayoutMaster.Geometry.finger_name(a.finger),
          LayoutMaster.Geometry.finger_name(b.finger)
        ]) == wanted
    end)
  end

  defp leaf?(:finger_height_preference, :violated, keys, _ng, ctx),
    do: all_pairs(keys, &height_violated?(&1, &2, ctx))

  defp leaf?(:finger_height_preference, "violated", keys, ng, ctx),
    do: leaf?(:finger_height_preference, :violated, keys, ng, ctx)

  # ---- whole n-gram attributes

  defp leaf?(:hand_pattern, v, _keys, ng, _ctx), do: hand_pattern?(ng, v)
  defp leaf?(:monotone, v, _keys, ng, _ctx), do: monotone?(ng) == v
  defp leaf?(:changes_direction, v, _keys, ng, _ctx), do: changes_direction?(ng) == v

  defp leaf?(:distinct_fingers, v, keys, _ng, _ctx),
    do: keys |> Enum.map(& &1.finger) |> Enum.uniq() |> length() == length(keys) == v

  defp leaf?(:min_run, _v, _keys, _ng, _ctx), do: true

  defp leaf?(other, _v, _keys, _ng, _ctx),
    do: raise(ArgumentError, "unknown predicate #{inspect(other)}")

  # ------------------------------------------------------------------ helpers

  defp atom(v) when is_atom(v), do: v
  defp atom(v) when is_binary(v), do: String.to_atom(v)

  defp in_set?(x, %{in: list}), do: Enum.any?(list, &same_val?(&1, x))
  defp in_set?(x, list) when is_list(list), do: Enum.any?(list, &same_val?(&1, x))
  defp in_set?(x, v), do: same_val?(v, x)

  defp same_val?(a, b) when is_binary(a) and is_atom(b), do: String.to_atom(a) == b
  defp same_val?(a, b), do: a == b

  defp num?(x, %{abs: n}), do: abs(x) == n

  defp num?(x, %{abs_min: n} = m),
    do: abs(x) >= n and (not Map.has_key?(m, :abs_max) or abs(x) <= m.abs_max)

  defp num?(x, %{abs_max: n}), do: abs(x) <= n
  defp num?(x, %{eq: n}), do: x == n

  defp num?(x, %{} = m),
    do:
      (not Map.has_key?(m, :min) or x >= m.min) and (not Map.has_key?(m, :max) or x <= m.max) and
        (not Map.has_key?(m, :gt) or x > m.gt) and (not Map.has_key?(m, :lt) or x < m.lt)

  defp num?(x, n) when is_number(n), do: x == n

  defp all_pairs([_] = _keys, _fun), do: false

  defp all_pairs(keys, fun),
    do: keys |> Enum.chunk_every(2, 1, :discard) |> Enum.all?(fn [a, b] -> fun.(a, b) end)

  @default_height %{middle: 3, ring: 2, pinky: 1, index: 0, thumb: -1}

  # "The finger that prefers being higher is lower" (Layouts Doc ch. 6). y grows downward.
  defp height_violated?(a, b, ctx) do
    with true <- Attrs.same_hand?(a, b),
         false <- Attrs.same_finger?(a, b),
         fa when fa != nil <- a.finger,
         fb when fb != nil <- b.finger do
      table = Map.merge(@default_height, ctx.params[:finger_height_preference] || %{})
      pa = Map.get(table, LayoutMaster.Geometry.finger_name(fa), 0)
      pb = Map.get(table, LayoutMaster.Geometry.finger_name(fb), 0)

      cond do
        pa == pb -> false
        pa > pb -> a.y > b.y
        true -> b.y > a.y
      end
    else
      _ -> false
    end
  end

  defp hand_pattern?(ng, pattern) when is_binary(pattern) do
    chars = String.graphemes(pattern)

    if length(chars) != length(ng) do
      false
    else
      if Enum.all?(chars, &(&1 in ["L", "R"])) do
        Enum.zip(chars, ng) |> Enum.all?(fn {c, k} -> Atom.to_string(k.hand) == c end)
      else
        # symbolic: a/b (first hand = a, other = b)
        first = hd(ng).hand

        first != :both and
          Enum.zip(chars, ng)
          |> Enum.all?(fn
            {"a", k} -> k.hand == first
            {"b", k} -> k.hand != :both and k.hand != first
            _ -> false
          end)
      end
    end
  end

  defp monotone?(ng) when length(ng) < 3, do: false

  defp monotone?(ng) do
    dirs =
      ng |> Enum.chunk_every(2, 1, :discard) |> Enum.map(fn [a, b] -> Attrs.direction(a, b) end)

    Enum.all?(dirs, &(&1 in [:inward, :outward])) and length(Enum.uniq(dirs)) == 1
  end

  defp changes_direction?(ng) when length(ng) < 3, do: false

  defp changes_direction?(ng) do
    dirs =
      ng |> Enum.chunk_every(2, 1, :discard) |> Enum.map(fn [a, b] -> Attrs.direction(a, b) end)

    Enum.all?(dirs, &(&1 in [:inward, :outward])) and length(Enum.uniq(dirs)) > 1
  end
end
