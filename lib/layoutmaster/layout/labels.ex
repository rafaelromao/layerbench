defmodule LayoutMaster.Layout.Labels do
  @moduledoc "Display labels for bindings (keyboard legends)."

  alias LayoutMaster.Layout.Compile

  @doc "Tap legend, hold legend and a short kind tag for a binding."
  @spec legend(Compile.t(), map()) :: %{tap: String.t(), hold: String.t() | nil, kind: atom()}
  def legend(%Compile{} = c, binding) do
    %{tap: tap_label(c, binding), hold: hold_label(c, binding), kind: kind(binding)}
  end

  defp layer_name(c, id) do
    case Map.get(c.layer_index, id) do
      nil -> id
      idx -> Compile.layer(c, idx).name
    end
  end

  def tap_label(_c, %{kind: :kp, symbol: " "}), do: "␣"
  def tap_label(_c, %{kind: :kp} = b), do: b[:symbol] || b[:keycode] || ""
  def tap_label(_c, %{kind: :trans}), do: ""
  def tap_label(_c, %{kind: :none}), do: ""
  def tap_label(c, %{kind: :sl, layer: l}), do: "→" <> short(layer_name(c, l))
  def tap_label(c, %{kind: :mo, layer: l}), do: "⇩" <> short(layer_name(c, l))
  def tap_label(c, %{kind: :lt, tap: t}), do: tap_label(c, t)
  def tap_label(c, %{kind: :tog, layer: l}), do: "⇄" <> short(layer_name(c, l))
  def tap_label(c, %{kind: :to, layer: l}), do: "⇒" <> short(layer_name(c, l))

  def tap_label(_c, %{kind: :sk, mod: m}),
    do: if(m in [:LSHIFT, :RSHIFT], do: "⇧", else: mod_label(m))

  def tap_label(_c, %{kind: :mod, mod: m}), do: mod_label(m)
  def tap_label(_c, %{kind: :caps_word}), do: "⇪"
  def tap_label(c, %{kind: :auto_layer, layer: l}), do: "⇪" <> short(layer_name(c, l))
  def tap_label(_c, %{kind: :key_repeat}), do: "⟳"
  def tap_label(c, %{kind: :hold_tap, tap: t}), do: tap_label(c, t)
  def tap_label(c, %{kind: :mod_morph, default: d}), do: tap_label(c, d)
  def tap_label(c, %{kind: :layer_morph, inactive: i}), do: tap_label(c, i)
  def tap_label(c, %{kind: :adaptive} = b), do: adaptive_label(c, b)
  def tap_label(c, %{kind: :tap_dance, bindings: [first | _]}), do: tap_label(c, first)
  def tap_label(_c, %{kind: :tap_dance}), do: ""

  def tap_label(c, %{kind: :macro} = b),
    do: b[:symbols] || (b[:steps] && Enum.map_join(b.steps, "", &tap_label(c, &1))) || "⋯"

  def tap_label(_c, %{kind: :dead_key, diacritic: d}), do: d
  def tap_label(_c, %{kind: :unicode, symbol: s}), do: s
  def tap_label(_c, _), do: ""

  defp adaptive_label(c, b) do
    default = if b[:default], do: tap_label(c, b.default), else: ""

    alts =
      (b[:triggers] || [])
      |> Enum.map(&tap_label(c, &1.binding))
      |> Enum.reject(&(&1 == "" or &1 == default))
      |> Enum.uniq()
      |> Enum.take(2)

    [default | alts] |> Enum.reject(&(&1 == "")) |> Enum.join("|")
  end

  def hold_label(c, %{kind: :hold_tap, hold: h}), do: hold_of(c, h)
  def hold_label(c, %{kind: :lt, layer: l}), do: short(layer_name(c, l))
  def hold_label(c, %{kind: :mod_morph, default: d}), do: hold_label(c, d)
  def hold_label(_c, _), do: nil

  defp hold_of(c, %{kind: :mo, layer: l}), do: short(layer_name(c, l))
  defp hold_of(_c, %{kind: :mod, mod: m}), do: mod_label(m)
  defp hold_of(c, b), do: tap_label(c, b)

  def kind(%{kind: k}) when k in [:kp, :unicode, :macro, :dead_key], do: :alpha
  def kind(%{kind: k}) when k in [:sl, :mo, :lt, :tog, :to], do: :layer
  def kind(%{kind: k}) when k in [:sk, :mod, :caps_word, :auto_layer], do: :mod
  def kind(%{kind: :key_repeat}), do: :repeat
  def kind(%{kind: :adaptive}), do: :magic
  def kind(%{kind: :hold_tap, tap: t}), do: kind(t)
  def kind(%{kind: :mod_morph, default: d}), do: kind(d)
  def kind(%{kind: :layer_morph, inactive: i}), do: kind(i)
  def kind(%{kind: :tap_dance, bindings: [f | _]}), do: kind(f)
  def kind(%{kind: :trans}), do: :trans
  def kind(_), do: :none

  defp mod_label(:LSHIFT), do: "⇧"
  defp mod_label(:RSHIFT), do: "⇧"
  defp mod_label(:LCTRL), do: "⌃"
  defp mod_label(:RCTRL), do: "⌃"
  defp mod_label(:LALT), do: "⌥"
  defp mod_label(:RALT), do: "⌥"
  defp mod_label(:LGUI), do: "⌘"
  defp mod_label(:RGUI), do: "⌘"

  defp short(name) do
    cond do
      String.length(name) <= 4 ->
        name

      String.contains?(name, " ") ->
        name |> String.split(" ") |> Enum.map_join("", &String.first/1) |> String.upcase()

      true ->
        String.slice(name, 0, 4)
    end
  end
end
