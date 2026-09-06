defmodule LayoutMaster.Layout.Text do
  @moduledoc """
  Classic text layouts ↔ native layouts (SPEC §6.1, §9).

  Accepted input: rows separated by newlines (tokens separated by spaces, multi-character
  tokens allowed; optional 4th row = thumbs, `space` marks the space key), a 30-character
  cmini string, or a cyanophage 33–35 character string.
  """

  alias LayoutMaster.Geometry
  alias LayoutMaster.Layout

  @doc "Parse text into `%{rows: [[token]], thumbs: [token], extras: [token]}`."
  def parse(text) do
    trimmed = String.trim(text)

    lines =
      cond do
        String.contains?(trimmed, "\n") ->
          String.split(trimmed, ~r/\n+/)

        String.contains?(trimmed, "/") and String.length(trimmed) > 34 ->
          String.split(trimmed, "/")

        true ->
          nil
      end

    cond do
      lines != nil and length(lines) >= 3 ->
        rows = lines |> Enum.take(3) |> Enum.map(&tokens/1)
        thumbs = if length(lines) > 3, do: tokens(Enum.at(lines, 3)), else: []
        %{rows: rows, thumbs: thumbs, extras: []}

      true ->
        chars = trimmed |> String.replace(~r/\s+/, "") |> String.graphemes()

        case length(chars) do
          30 ->
            %{
              rows: [
                Enum.slice(chars, 0, 10),
                Enum.slice(chars, 10, 10),
                Enum.slice(chars, 20, 10)
              ],
              thumbs: [],
              extras: []
            }

          n when n >= 33 and n <= 35 ->
            rows = [
              Enum.slice(chars, 0, 10),
              Enum.slice(chars, 11, 10),
              Enum.slice(chars, 22, 10)
            ]

            extras = [Enum.at(chars, 10), Enum.at(chars, 21)]
            rest = chars |> Enum.drop(32) |> Enum.reject(&(&1 in ["\\", "^"]))
            %{rows: rows, thumbs: rest, extras: extras}

          _ ->
            toks = tokens(trimmed)
            per = div(length(toks) + 2, 3)

            %{
              rows: [
                Enum.slice(toks, 0, per),
                Enum.slice(toks, per, per),
                Enum.drop(toks, 2 * per)
              ],
              thumbs: [],
              extras: []
            }
        end
    end
  end

  defp tokens(line), do: line |> String.trim() |> String.split(~r/\s+/, trim: true)

  @doc "Map a text layout onto a geometry preset's base layer. Returns `{layout, overflow, warnings}`."
  def import(text, preset \\ "3x5+2", name \\ "Imported layout") do
    geometry = Geometry.preset(preset)
    %{rows: rows, thumbs: thumbs, extras: extras} = parse(text)

    {bindings, overflow} =
      extras
      |> Enum.with_index()
      |> Enum.reduce({%{}, []}, fn {tok, r}, {b, of} ->
        case Enum.find(
               Enum.at(geometry.text_rows, r, []),
               &(String.starts_with?(&1, "R") and String.ends_with?(&1, "O"))
             ) do
          nil -> {b, of ++ [tok]}
          id -> {Map.put(b, id, kp(tok)), of}
        end
      end)

    {bindings, overflow} =
      rows
      |> Enum.with_index()
      |> Enum.reduce({bindings, overflow}, fn {toks, r}, {b, of} ->
        ids = Enum.at(geometry.text_rows, r, [])
        {placed, extra} = place_row(toks, ids)
        {Enum.reduce(placed, b, fn {id, tok}, acc -> Map.put(acc, id, kp(tok)) end), of ++ extra}
      end)

    thumb_ids = geometry.text_thumbs
    default_space = Enum.at(thumb_ids, div(length(thumb_ids), 2)) || List.first(thumb_ids)

    {bindings, space, overflow} =
      thumbs
      |> Enum.with_index()
      |> Enum.reduce({bindings, default_space, overflow}, fn {tok, i}, {b, space, of} ->
        case Enum.at(thumb_ids, i) do
          nil -> {b, space, of ++ [tok]}
          id when tok in ["space", "␣", "_"] -> {b, id, of}
          id -> {Map.put(b, id, kp(tok)), space, of}
        end
      end)

    {bindings, space, warnings} =
      cond do
        not Map.has_key?(bindings, space) ->
          {Map.put(bindings, space, kp(" ")), space, []}

        true ->
          case Enum.find(thumb_ids, &(not Map.has_key?(bindings, &1))) do
            nil -> {bindings, space, ["no free thumb key for space; space shares a key"]}
            free -> {Map.put(bindings, free, kp(" ")), free, []}
          end
      end

    layout = %Layout{
      name: name,
      host_locale: :symbols,
      geometry: %{preset: preset, column_offsets: %{}},
      keys: %{space: space, shift: nil},
      layers: [%{id: "base", name: "Base", shifted_twin: nil, bindings: bindings}]
    }

    {layout, overflow, warnings}
  end

  defp kp(sym), do: %{kind: :kp, symbol: sym}

  defp place_row(toks, ids) when length(toks) == length(ids), do: {Enum.zip(ids, toks), []}

  defp place_row(toks, ids) do
    half = div(length(toks) + 1, 2)
    {left, right} = Enum.split(toks, half)
    left_ids = Enum.filter(ids, &String.starts_with?(&1, "L"))
    right_ids = Enum.filter(ids, &String.starts_with?(&1, "R"))
    left_start = max(0, length(left_ids) - length(left))

    {placed_l, over_l} =
      left
      |> Enum.with_index()
      |> Enum.reduce({[], []}, fn {t, i}, {p, o} ->
        case Enum.at(left_ids, left_start + i) do
          nil -> {p, o ++ [t]}
          id -> {p ++ [{id, t}], o}
        end
      end)

    {placed_r, over_r} =
      right
      |> Enum.with_index()
      |> Enum.reduce({[], []}, fn {t, i}, {p, o} ->
        case Enum.at(right_ids, i) do
          nil -> {p, o ++ [t]}
          id -> {p ++ [{id, t}], o}
        end
      end)

    {placed_l ++ placed_r, over_l ++ over_r}
  end

  @doc "Render a layer's bindings as text rows (`·` empty, `_` transparent)."
  def export_layer(%Geometry{} = geometry, bindings) do
    label = fn
      nil -> "·"
      %{kind: :kp, symbol: " "} -> "␣"
      %{kind: :kp} = b -> b[:symbol] || b[:keycode] || "·"
      %{kind: :macro} = b -> b[:symbols] || "⋯"
      %{kind: :trans} -> "_"
      %{kind: :none} -> "·"
      %{kind: :sl, layer: l} -> "→" <> l
      %{kind: :sk} -> "⇧"
      %{kind: k} -> Atom.to_string(k)
    end

    rows =
      Enum.map(geometry.text_rows, fn ids ->
        Enum.map_join(ids, " ", &label.(Map.get(bindings, &1)))
      end)

    rows =
      if geometry.text_thumbs != [],
        do: rows ++ [Enum.map_join(geometry.text_thumbs, " ", &label.(Map.get(bindings, &1)))],
        else: rows

    Enum.join(rows, "\n")
  end
end
