defmodule LayoutMaster.Layout.Binding do
  @moduledoc """
  Binding JSON ↔ internal representation (atom-keyed maps) and helpers.

  Kinds: kp, trans, none, mo, lt, sl, tog, to, sk, mod, caps_word, auto_layer, key_repeat,
  mod_morph, layer_morph, tap_dance, macro, adaptive, hold_tap, dead_key, unicode, ref.
  """

  @kinds ~w(kp trans none mo lt sl tog to sk mod caps_word auto_layer key_repeat mod_morph layer_morph tap_dance macro adaptive hold_tap dead_key unicode ref)
  @kind_atoms Enum.map(@kinds, &String.to_atom/1)
  @mods ~w(LSHIFT RSHIFT LCTRL RCTRL LALT RALT LGUI RGUI)

  def kinds, do: @kind_atoms

  @doc "Parse a binding from its JSON map. Accumulates error strings."
  def from_json(map, path, errors) when is_map(map) do
    case Map.get(map, "kind") do
      kind when kind in @kinds -> {convert(String.to_atom(kind), map, path, errors), errors}
      other -> {%{kind: :none}, ["#{path}: unknown binding kind #{inspect(other)}" | errors]}
    end
  end

  def from_json(other, path, errors),
    do: {%{kind: :none}, ["#{path}: binding must be an object, got #{inspect(other)}" | errors]}

  defp child(map, key, path, errors) do
    case Map.get(map, key) do
      nil -> nil
      v -> from_json(v, "#{path}.#{key}", errors) |> elem(0)
    end
  end

  defp children(map, key, path, errors) do
    case Map.get(map, key) do
      list when is_list(list) ->
        Enum.map(list, fn v -> from_json(v, "#{path}.#{key}[]", errors) |> elem(0) end)

      _ ->
        nil
    end
  end

  defp mod(nil), do: nil
  defp mod(m) when m in @mods, do: String.to_atom(m)
  defp mod(_), do: :LSHIFT

  defp mods(nil), do: []

  defp mods(list) when is_list(list),
    do: list |> Enum.filter(&(&1 in @mods)) |> Enum.map(&String.to_atom/1)

  defp convert(:kp, m, _p, _e),
    do:
      %{kind: :kp, symbol: m["symbol"], keycode: m["keycode"], shifted: m["shifted"]}
      |> drop_nils()

  defp convert(:trans, _m, _p, _e), do: %{kind: :trans}
  defp convert(:none, _m, _p, _e), do: %{kind: :none}
  defp convert(:mo, m, _p, _e), do: %{kind: :mo, layer: m["layer"]}

  defp convert(:lt, m, p, e),
    do: %{kind: :lt, layer: m["layer"], tap: child(m, "tap", p, e) || %{kind: :none}}

  defp convert(:sl, m, _p, _e),
    do:
      %{
        kind: :sl,
        layer: m["layer"],
        quick_release: m["quickRelease"],
        ignore_modifiers: m["ignoreModifiers"],
        release_after_ms: m["releaseAfterMs"]
      }
      |> drop_nils()

  defp convert(:tog, m, _p, _e), do: %{kind: :tog, layer: m["layer"], mode: tog_mode(m["mode"])}
  defp convert(:to, m, _p, _e), do: %{kind: :to, layer: m["layer"]}

  defp convert(:sk, m, _p, _e),
    do:
      %{
        kind: :sk,
        mod: mod(m["mod"]) || :LSHIFT,
        quick_release: m["quickRelease"],
        ignore_modifiers: m["ignoreModifiers"],
        release_after_ms: m["releaseAfterMs"]
      }
      |> drop_nils()

  defp convert(:mod, m, _p, _e), do: %{kind: :mod, mod: mod(m["mod"]) || :LSHIFT}

  defp convert(:caps_word, m, _p, _e),
    do: %{
      kind: :caps_word,
      continue_list: m["continueList"] || ["_", "Backspace", "Delete"],
      mods: mods(m["mods"]) |> default_shift()
    }

  defp convert(:auto_layer, m, _p, _e),
    do: %{
      kind: :auto_layer,
      layer: m["layer"],
      continue_list: m["continueList"] || ["_", "Backspace"]
    }

  defp convert(:key_repeat, _m, _p, _e), do: %{kind: :key_repeat}

  defp convert(:mod_morph, m, p, e),
    do: %{
      kind: :mod_morph,
      mods: mods(m["mods"]) |> default_shift(),
      default: child(m, "default", p, e) || %{kind: :none},
      morphed: child(m, "morphed", p, e) || %{kind: :none},
      keep_mods: mods(m["keepMods"])
    }

  defp convert(:layer_morph, m, p, e),
    do: %{
      kind: :layer_morph,
      layers: m["layers"] || [],
      match: if(m["match"] == "all", do: :all, else: :any),
      active: child(m, "active", p, e) || %{kind: :none},
      inactive: child(m, "inactive", p, e) || %{kind: :none}
    }

  defp convert(:tap_dance, m, p, e),
    do: %{kind: :tap_dance, bindings: children(m, "bindings", p, e) || []}

  defp convert(:macro, m, p, e),
    do:
      %{
        kind: :macro,
        steps: children(m, "steps", p, e),
        symbols: m["symbols"],
        then: children(m, "then", p, e),
        ref: m["ref"]
      }
      |> drop_nils()

  defp convert(:adaptive, m, p, e) do
    triggers =
      case m["triggers"] do
        list when is_list(list) ->
          Enum.map(list, fn t ->
            %{
              after_any: t["afterAny"] || [],
              binding:
                from_json(t["binding"] || %{"kind" => "none"}, "#{p}.triggers[]", e) |> elem(0)
            }
          end)

        _ ->
          nil
      end

    %{
      kind: :adaptive,
      default: child(m, "default", p, e),
      triggers: triggers,
      strict_modifiers: m["strictModifiers"],
      dead_keys: m["deadKeys"],
      ref: m["ref"]
    }
    |> drop_nils()
  end

  defp convert(:hold_tap, m, p, e),
    do:
      %{
        kind: :hold_tap,
        tap: child(m, "tap", p, e) || %{kind: :none},
        hold: child(m, "hold", p, e) || %{kind: :none},
        flavor: m["flavor"],
        tapping_term_ms: m["tappingTermMs"]
      }
      |> drop_nils()

  defp convert(:dead_key, m, _p, _e), do: %{kind: :dead_key, diacritic: m["diacritic"] || "´"}

  defp convert(:unicode, m, _p, _e),
    do:
      %{kind: :unicode, symbol: m["symbol"] || "", shifted_symbol: m["shiftedSymbol"]}
      |> drop_nils()

  defp convert(:ref, m, _p, _e), do: %{kind: :ref, ref: m["ref"]}

  defp tog_mode("on"), do: :on
  defp tog_mode("off"), do: :off
  defp tog_mode(_), do: :flip

  defp default_shift([]), do: [:LSHIFT]
  defp default_shift(list), do: list

  defp drop_nils(map), do: map |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()

  @doc "Parse sl/sk option maps (behaviorDefaults)."
  def opts_from_json(m) when is_map(m) do
    %{
      quick_release: m["quickRelease"],
      ignore_modifiers: m["ignoreModifiers"],
      release_after_ms: m["releaseAfterMs"]
    }
    |> drop_nils()
  end

  def opts_from_json(_), do: %{}

  def opts_to_json(m) when is_map(m) do
    %{
      "quickRelease" => m[:quick_release],
      "ignoreModifiers" => m[:ignore_modifiers],
      "releaseAfterMs" => m[:release_after_ms]
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()
  end

  @doc "Convert an internal binding to a JSON-compatible map."
  def to_json(%{kind: kind} = b) do
    base = %{"kind" => Atom.to_string(kind)}

    extra =
      case kind do
        :kp ->
          %{"symbol" => b[:symbol], "keycode" => b[:keycode], "shifted" => b[:shifted]}

        :mo ->
          %{"layer" => b.layer}

        :lt ->
          %{"layer" => b.layer, "tap" => to_json(b.tap)}

        :sl ->
          %{
            "layer" => b.layer,
            "quickRelease" => b[:quick_release],
            "ignoreModifiers" => b[:ignore_modifiers],
            "releaseAfterMs" => b[:release_after_ms]
          }

        :tog ->
          %{"layer" => b.layer, "mode" => Atom.to_string(b[:mode] || :flip)}

        :to ->
          %{"layer" => b.layer}

        :sk ->
          %{
            "mod" => Atom.to_string(b.mod),
            "quickRelease" => b[:quick_release],
            "ignoreModifiers" => b[:ignore_modifiers],
            "releaseAfterMs" => b[:release_after_ms]
          }

        :mod ->
          %{"mod" => Atom.to_string(b.mod)}

        :caps_word ->
          %{
            "continueList" => b[:continue_list],
            "mods" => Enum.map(b[:mods] || [], &Atom.to_string/1)
          }

        :auto_layer ->
          %{"layer" => b.layer, "continueList" => b[:continue_list]}

        :mod_morph ->
          %{
            "mods" => Enum.map(b.mods, &Atom.to_string/1),
            "default" => to_json(b.default),
            "morphed" => to_json(b.morphed),
            "keepMods" => Enum.map(b[:keep_mods] || [], &Atom.to_string/1)
          }

        :layer_morph ->
          %{
            "layers" => b.layers,
            "match" => Atom.to_string(b[:match] || :any),
            "active" => to_json(b.active),
            "inactive" => to_json(b.inactive)
          }

        :tap_dance ->
          %{"bindings" => Enum.map(b.bindings, &to_json/1)}

        :macro ->
          %{
            "steps" => b[:steps] && Enum.map(b.steps, &to_json/1),
            "symbols" => b[:symbols],
            "then" => b[:then] && Enum.map(b.then, &to_json/1),
            "ref" => b[:ref]
          }

        :adaptive ->
          %{
            "default" => b[:default] && to_json(b.default),
            "triggers" =>
              b[:triggers] &&
                Enum.map(
                  b.triggers,
                  &%{"afterAny" => &1.after_any, "binding" => to_json(&1.binding)}
                ),
            "strictModifiers" => b[:strict_modifiers],
            "deadKeys" => b[:dead_keys],
            "ref" => b[:ref]
          }

        :hold_tap ->
          %{
            "tap" => to_json(b.tap),
            "hold" => to_json(b.hold),
            "flavor" => b[:flavor],
            "tappingTermMs" => b[:tapping_term_ms]
          }

        :dead_key ->
          %{"diacritic" => b.diacritic}

        :unicode ->
          %{"symbol" => b.symbol, "shiftedSymbol" => b[:shifted_symbol]}

        :ref ->
          %{"ref" => b.ref}

        _ ->
          %{}
      end

    Map.merge(base, extra) |> Enum.reject(fn {_k, v} -> is_nil(v) or v == [] end) |> Map.new()
  end

  @doc "Layer ids referenced by a binding (for validation)."
  def referenced_layers(b, acc \\ MapSet.new())

  def referenced_layers(%{kind: k, layer: l}, acc) when k in [:mo, :sl, :tog, :to, :auto_layer],
    do: MapSet.put(acc, l)

  def referenced_layers(%{kind: :lt, layer: l, tap: t}, acc),
    do: referenced_layers(t, MapSet.put(acc, l))

  def referenced_layers(%{kind: :hold_tap, tap: t, hold: h}, acc),
    do: referenced_layers(h, referenced_layers(t, acc))

  def referenced_layers(%{kind: :mod_morph, default: d, morphed: m}, acc),
    do: referenced_layers(m, referenced_layers(d, acc))

  def referenced_layers(%{kind: :layer_morph, layers: ls, active: a, inactive: i}, acc),
    do: referenced_layers(i, referenced_layers(a, Enum.reduce(ls, acc, &MapSet.put(&2, &1))))

  def referenced_layers(%{kind: :tap_dance, bindings: bs}, acc),
    do: Enum.reduce(bs, acc, &referenced_layers/2)

  def referenced_layers(%{kind: :macro} = b, acc),
    do: Enum.reduce((b[:steps] || []) ++ (b[:then] || []), acc, &referenced_layers/2)

  def referenced_layers(%{kind: :adaptive} = b, acc) do
    acc = if b[:default], do: referenced_layers(b.default, acc), else: acc
    Enum.reduce(b[:triggers] || [], acc, fn t, a -> referenced_layers(t.binding, a) end)
  end

  def referenced_layers(_, acc), do: acc

  @doc "Does this binding emit text when tapped (kp, unicode, key_repeat, adaptive, macro, dead_key)?"
  def emits_text?(%{kind: k}), do: k in [:kp, :unicode, :key_repeat, :adaptive, :macro, :dead_key]

  @doc "Graphemes of a string (NFC)."
  def graphemes(s) when is_binary(s), do: s |> String.normalize(:nfc) |> String.graphemes()
end
