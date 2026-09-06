defmodule LayoutMaster.Rules.Serialize do
  @moduledoc """
  Rule sets ↔ JSON. Keys are snake_case strings in JSON; atoms internally.
  Only known keys are atomized (no atom-table growth from user input).
  """

  @known_keys ~w(
    id name description globals rules score_enabled label family enabled source ngram n skip params where all any none at
    weight adjacent_fingers non_adjacent_fingers default aggregate aggregate_opts numerator denominator per bands direction bounds labels
    score breakdown_by scale stat unit travel_mode run by min_len min_length min_count effort finger_height_preference
    universe cross_word repeats_count_as_sfb skip_weights distance_model normalization lsb_adjacent_u lsb_semi_adjacent_u top_items space_per_word_in_keystrokes
    same_hand same_finger same_key adjacent_fingers rank_delta row_delta col_delta x_distance y_distance distance direction finger_height_preference
    hand_pattern monotone changes_direction distinct_fingers hand finger includes_finger finger_name includes_finger_name finger_name_pair row col
    is_thumb any_thumb is_home is_inner any_inner key_kind any_key_kind layer any_layer is_chord in abs abs_min abs_max eq min max gt lt
    middle ring pinky index thumb
  )a

  @atom_values ~w(
    ngram run word stat travel percent_of_ngrams percent_of_keystrokes count per100 sum_distance mean_distance per_finger per_hand per_layer
    per_row per_col weighted_sum ratio histogram top_strings lower_is_better higher_is_better bigram skipgram trigram usage effort layer other
    inward outward violated L R both alpha layer_tap shift space repeat magic combo hold pinky ring middle index thumb
    symbols keystrokes words no_space with_space reset bridge euclid squared manhattan continuous reset_at_word
    layer_taps_per_100 one_shots_per_word wasted_one_shots_pct macro_pct adaptive_hit_rate combo_pct extra_keystrokes hold_pct repeat_pct
    percent ratio distance length per100 min very_low low mid_low mid mid_high high very_high max even leans heavy very_heavy
    hand finger layer row col key_kind
  )a

  @known Map.new(@known_keys, &{Atom.to_string(&1), &1})
  @values Map.new(@atom_values, &{Atom.to_string(&1), &1})

  def to_json(rule_set) when is_map(rule_set), do: JSON.encode!(to_map(rule_set))

  def to_map(term), do: encode(term)

  defp encode(%{} = m), do: Map.new(m, fn {k, v} -> {encode_key(k), encode(v)} end)
  defp encode(list) when is_list(list), do: Enum.map(list, &encode/1)
  defp encode(a) when is_atom(a) and a not in [nil, true, false], do: Atom.to_string(a)
  defp encode(v), do: v

  defp encode_key(k) when is_atom(k), do: Atom.to_string(k)
  defp encode_key(k), do: k

  def from_json(json) when is_binary(json) do
    case JSON.decode(json) do
      {:ok, map} when is_map(map) -> {:ok, from_map(map)}
      {:ok, _} -> {:error, "rule set must be an object"}
      {:error, r} -> {:error, "invalid JSON: #{inspect(r)}"}
    end
  end

  def from_map(map) when is_map(map), do: decode(map, :root)

  # Keys: known keys become atoms; unknown keys stay strings (e.g. effort tables keyed by key id, weights by rule id).
  defp decode(%{} = m, ctx) do
    Map.new(m, fn {k, v} ->
      key = Map.get(@known, k, k)
      {key, decode_value(key, v, ctx)}
    end)
  end

  defp decode(list, ctx) when is_list(list), do: Enum.map(list, &decode(&1, ctx))
  defp decode(v, _ctx), do: v

  # Values that are enumerations become atoms; free-form strings (ids, labels, descriptions, hand patterns) stay strings.
  @string_keys [:id, :name, :description, :label, :hand_pattern, :numerator, :denominator, :stat]
  defp decode_value(key, v, _ctx) when key in @string_keys and is_binary(v) and key != :stat,
    do: v

  defp decode_value(:stat, v, _ctx) when is_binary(v), do: Map.get(@values, v, v)

  defp decode_value(_key, v, _ctx) when is_binary(v),
    do: if(String.starts_with?(v, "$global."), do: v, else: Map.get(@values, v, v))

  defp decode_value(_key, v, ctx), do: decode(v, ctx)
end
