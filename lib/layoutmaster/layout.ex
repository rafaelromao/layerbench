defmodule LayoutMaster.Layout do
  @moduledoc """
  Native layout format (`layoutmaster/layout@1`, SPEC §9): parsing from JSON maps,
  validation, and conversion back to JSON-compatible maps.

  Internally bindings are maps with atom keys and an atom `:kind`, e.g.
  `%{kind: :kp, symbol: "a"}`, `%{kind: :sl, layer: "alpha2"}`.
  """

  alias LayoutMaster.Layout.Binding

  @format "layoutmaster/layout@1"
  @mods [:LSHIFT, :RSHIFT, :LCTRL, :RCTRL, :LALT, :RALT, :LGUI, :RGUI]
  @host_locales [:symbols, :us, :us_intl, :abnt2]

  defstruct format: @format,
            id: nil,
            name: "Untitled",
            author: nil,
            description: nil,
            languages: [],
            host_locale: :symbols,
            geometry: %{preset: "3x5+2"},
            fingering: :standard,
            keys: %{space: "L0", shift: nil},
            behavior_defaults: %{},
            layers: [],
            behaviors: %{},
            combos: [],
            conditional_layers: [],
            typing_paths: %{},
            repeat_policy: :repeat_key,
            activators: %{}

  @type binding :: map()
  @type layer :: %{
          id: String.t(),
          name: String.t(),
          shifted_twin: String.t() | nil,
          bindings: %{String.t() => binding()}
        }
  @type combo :: %{
          id: String.t(),
          keys: [String.t()],
          binding: binding(),
          layers: [String.t()] | nil,
          role: :typing | :command,
          timeout_ms: non_neg_integer() | nil,
          slow_release: boolean()
        }
  @type t :: %__MODULE__{}

  def format, do: @format
  def mods, do: @mods
  def host_locales, do: @host_locales

  # ------------------------------------------------------------------ parsing

  @doc "Parse a JSON string into a layout."
  @spec decode(String.t()) :: {:ok, t()} | {:error, [String.t()]}
  def decode(json) when is_binary(json) do
    case JSON.decode(json) do
      {:ok, map} when is_map(map) -> from_map(map)
      {:ok, _} -> {:error, ["layout must be a JSON object"]}
      {:error, reason} -> {:error, ["invalid JSON: #{inspect(reason)}"]}
    end
  end

  @doc "Build a layout from a decoded JSON map (string keys, camelCase) and validate it."
  @spec from_map(map()) :: {:ok, t()} | {:error, [String.t()]}
  def from_map(map) when is_map(map) do
    errors = []

    {format, errors} = str(map, "format", errors, required: true)

    errors =
      if format not in [nil, @format],
        do: ["unsupported format #{inspect(format)}" | errors],
        else: errors

    {name, errors} = str(map, "name", errors, required: true)
    {host_locale, errors} = enum(map, "hostLocale", @host_locales, :symbols, errors)

    {layers, errors} =
      case Map.get(map, "layers") do
        list when is_list(list) and list != [] ->
          Enum.map_reduce(list, errors, fn l, errs -> parse_layer(l, errs) end)

        _ ->
          {[], ["layers must be a non-empty list" | errors]}
      end

    {behaviors, errors} =
      case Map.get(map, "behaviors", %{}) do
        m when is_map(m) ->
          Enum.map_reduce(m, errors, fn {k, v}, errs ->
            {b, errs} = Binding.from_json(v, "behaviors.#{k}", errs)
            {{k, b}, errs}
          end)
          |> then(fn {pairs, errs} -> {Map.new(pairs), errs} end)

        _ ->
          {%{}, ["behaviors must be an object" | errors]}
      end

    {combos, errors} =
      case Map.get(map, "combos", []) do
        list when is_list(list) ->
          Enum.with_index(list)
          |> Enum.map_reduce(errors, fn {c, i}, errs -> parse_combo(c, i, errs) end)

        _ ->
          {[], ["combos must be a list" | errors]}
      end

    keys_map = Map.get(map, "keys", %{})

    {space, errors} =
      case keys_map do
        %{"space" => s} when is_binary(s) -> {s, errors}
        _ -> {nil, ["keys.space is required" | errors]}
      end

    shift =
      case Map.get(keys_map, "shift") do
        %{"key" => k, "kind" => kind} when kind in ["sk", "hold"] ->
          %{key: k, kind: String.to_atom(kind)}

        _ ->
          nil
      end

    geometry =
      case Map.get(map, "geometry", %{}) do
        %{"preset" => p} = g ->
          offsets =
            for {k, v} <- Map.get(g, "columnOffsets", %{}), into: %{} do
              {String.to_integer(k), v * 1.0}
            end

          %{preset: p, column_offsets: offsets}

        %{"custom" => keys} = g when is_list(keys) ->
          %{
            custom: Enum.map(keys, &parse_geometry_key/1),
            family: atomize_family(Map.get(g, "family")),
            name: Map.get(g, "name")
          }

        _ ->
          %{preset: "3x5+2", column_offsets: %{}}
      end

    fingering =
      case Map.get(map, "fingering") do
        "angle-mod" -> :angle_mod
        m when is_map(m) -> Map.new(m, fn {k, v} -> {k, String.to_atom(v)} end)
        _ -> :standard
      end

    behavior_defaults =
      case Map.get(map, "behaviorDefaults") do
        m when is_map(m) ->
          Map.new(m, fn {k, v} -> {String.to_atom(k), Binding.opts_from_json(v)} end)

        _ ->
          %{}
      end

    conditional_layers =
      for %{"if" => ifs, "then" => then} <- Map.get(map, "conditionalLayers", []) || [],
          is_list(ifs),
          do: %{if: ifs, then: then}

    typing_paths =
      case Map.get(map, "typingPaths") do
        m when is_map(m) ->
          Map.new(m, fn {sym, entries} ->
            {sym,
             Enum.map(entries || [], fn e ->
               %{
                 producer: Map.get(e, "producer"),
                 enabled: Map.get(e, "enabled", true),
                 after_any: get_in(e, ["when", "afterAny"])
               }
             end)}
          end)

        _ ->
          %{}
      end

    repeat_policy =
      case get_in(map, ["repeatPolicy", "doubledLetters"]) do
        "tapTwice" -> :tap_twice
        _ -> :repeat_key
      end

    activators =
      case Map.get(map, "activators") do
        m when is_map(m) ->
          Map.new(m, fn {layer, defs} ->
            {layer,
             Enum.map(defs || [], fn d ->
               %{
                 from: Map.get(d, "from"),
                 via: Map.get(d, "via"),
                 requires_mods:
                   (get_in(d, ["requires", "mods"]) || []) |> Enum.map(&String.to_atom/1)
               }
             end)}
          end)

        _ ->
          %{}
      end

    layout = %__MODULE__{
      id: Map.get(map, "id"),
      name: name || "Untitled",
      author: Map.get(map, "author"),
      description: Map.get(map, "description"),
      languages: Map.get(map, "languages", []) || [],
      host_locale: host_locale,
      geometry: geometry,
      fingering: fingering,
      keys: %{space: space, shift: shift},
      behavior_defaults: behavior_defaults,
      layers: layers,
      behaviors: behaviors,
      combos: combos,
      conditional_layers: conditional_layers,
      typing_paths: typing_paths,
      repeat_policy: repeat_policy,
      activators: activators
    }

    case errors do
      [] -> {:ok, layout}
      errs -> {:error, Enum.reverse(errs)}
    end
  end

  defp parse_layer(%{"id" => id, "bindings" => bindings} = l, errors)
       when is_binary(id) and is_map(bindings) do
    {parsed, errors} =
      Enum.map_reduce(bindings, errors, fn {k, v}, errs ->
        {b, errs} = Binding.from_json(v, "layers.#{id}.#{k}", errs)
        {{k, b}, errs}
      end)

    {%{
       id: id,
       name: Map.get(l, "name", id),
       shifted_twin: Map.get(l, "shiftedTwin"),
       bindings: Map.new(parsed)
     }, errors}
  end

  defp parse_layer(other, errors),
    do:
      {%{id: "invalid", name: "invalid", shifted_twin: nil, bindings: %{}},
       ["invalid layer #{inspect(other)}" | errors]}

  defp parse_combo(%{"keys" => keys, "binding" => b} = c, i, errors) when is_list(keys) do
    {binding, errors} = Binding.from_json(b, "combos[#{i}]", errors)

    {%{
       id: Map.get(c, "id", "combo#{i}"),
       keys: keys,
       binding: binding,
       layers: Map.get(c, "layers"),
       role: if(Map.get(c, "role") == "typing", do: :typing, else: :command),
       timeout_ms: Map.get(c, "timeoutMs"),
       slow_release: Map.get(c, "slowRelease", false)
     }, errors}
  end

  defp parse_combo(other, i, errors),
    do:
      {%{
         id: "invalid#{i}",
         keys: [],
         binding: %{kind: :none},
         layers: nil,
         role: :command,
         timeout_ms: nil,
         slow_release: false
       }, ["invalid combo #{inspect(other)}" | errors]}

  defp parse_geometry_key(m) do
    %LayoutMaster.Geometry.Key{
      id: m["id"],
      hand: String.to_atom(m["hand"]),
      finger: String.to_atom(m["finger"]),
      row: m["row"],
      col: m["col"],
      x: m["x"] * 1.0,
      y: m["y"] * 1.0,
      w: Map.get(m, "w", 1) * 1.0,
      h: Map.get(m, "h", 1) * 1.0,
      rotation: Map.get(m, "rotation", 0) * 1.0,
      home: Map.get(m, "home", m["row"] == 1),
      thumb: Map.get(m, "thumb", m["row"] == 3),
      inner: Map.get(m, "inner", m["col"] == 5)
    }
  end

  defp atomize_family("rowstagger"), do: :rowstagger
  defp atomize_family(_), do: :columnar

  defp str(map, key, errors, opts) do
    required = Keyword.get(opts, :required, false)

    case Map.get(map, key) do
      v when is_binary(v) -> {v, errors}
      nil -> if required, do: {nil, ["#{key} is required" | errors]}, else: {nil, errors}
      _ -> {nil, ["#{key} must be a string" | errors]}
    end
  end

  defp enum(map, key, allowed, default, errors) do
    case Map.get(map, key) do
      nil ->
        {default, errors}

      v when is_binary(v) ->
        atom = v |> String.replace("-", "_") |> String.to_atom()

        if atom in allowed,
          do: {atom, errors},
          else: {default, ["#{key}: unknown value #{v}" | errors]}

      _ ->
        {default, ["#{key} must be a string" | errors]}
    end
  end

  # ----------------------------------------------------------------- encoding

  @doc "Convert a layout back to a JSON-compatible map (camelCase keys)."
  @spec to_map(t()) :: map()
  def to_map(%__MODULE__{} = l) do
    %{
      "format" => @format,
      "id" => l.id,
      "name" => l.name,
      "author" => l.author,
      "description" => l.description,
      "languages" => l.languages,
      "hostLocale" => l.host_locale |> Atom.to_string() |> String.replace("_", "-"),
      "geometry" => geometry_to_map(l.geometry),
      "fingering" => fingering_to_json(l.fingering),
      "keys" => %{
        "space" => l.keys.space,
        "shift" =>
          if(l.keys.shift,
            do: %{"key" => l.keys.shift.key, "kind" => Atom.to_string(l.keys.shift.kind)}
          )
      },
      "behaviorDefaults" =>
        Map.new(l.behavior_defaults, fn {k, v} -> {Atom.to_string(k), Binding.opts_to_json(v)} end),
      "layers" =>
        Enum.map(l.layers, fn layer ->
          %{
            "id" => layer.id,
            "name" => layer.name,
            "shiftedTwin" => layer.shifted_twin,
            "bindings" => Map.new(layer.bindings, fn {k, b} -> {k, Binding.to_json(b)} end)
          }
          |> compact()
        end),
      "behaviors" => Map.new(l.behaviors, fn {k, b} -> {k, Binding.to_json(b)} end),
      "combos" =>
        Enum.map(l.combos, fn c ->
          %{
            "id" => c.id,
            "keys" => c.keys,
            "binding" => Binding.to_json(c.binding),
            "layers" => c.layers,
            "role" => Atom.to_string(c.role),
            "timeoutMs" => c.timeout_ms,
            "slowRelease" => c.slow_release
          }
          |> compact()
        end),
      "conditionalLayers" => Enum.map(l.conditional_layers, &%{"if" => &1.if, "then" => &1.then}),
      "typingPaths" =>
        Map.new(l.typing_paths, fn {sym, entries} ->
          {sym,
           Enum.map(entries, fn e ->
             %{
               "producer" => e.producer,
               "enabled" => e.enabled,
               "when" => if(e.after_any, do: %{"afterAny" => e.after_any})
             }
             |> compact()
           end)}
        end),
      "repeatPolicy" => %{
        "doubledLetters" => if(l.repeat_policy == :tap_twice, do: "tapTwice", else: "repeatKey")
      },
      "activators" =>
        Map.new(l.activators, fn {layer, defs} ->
          {layer,
           Enum.map(defs, fn d ->
             %{
               "from" => d.from,
               "via" => d.via,
               "requires" =>
                 if(d.requires_mods != [],
                   do: %{"mods" => Enum.map(d.requires_mods, &Atom.to_string/1)}
                 )
             }
             |> compact()
           end)}
        end)
    }
    |> compact()
  end

  def encode!(%__MODULE__{} = l), do: JSON.encode!(to_map(l))

  defp geometry_to_map(%{preset: p} = g) do
    %{
      "preset" => p,
      "columnOffsets" =>
        Map.new(Map.get(g, :column_offsets, %{}), fn {k, v} -> {Integer.to_string(k), v} end)
    }
    |> then(fn m -> if m["columnOffsets"] == %{}, do: Map.delete(m, "columnOffsets"), else: m end)
  end

  defp geometry_to_map(%{custom: keys} = g) do
    %{
      "custom" =>
        Enum.map(keys, fn k ->
          %{
            "id" => k.id,
            "hand" => Atom.to_string(k.hand),
            "finger" => Atom.to_string(k.finger),
            "row" => k.row,
            "col" => k.col,
            "x" => k.x,
            "y" => k.y,
            "w" => k.w,
            "h" => k.h,
            "rotation" => k.rotation,
            "home" => k.home,
            "thumb" => k.thumb,
            "inner" => k.inner
          }
        end),
      "family" => Atom.to_string(Map.get(g, :family, :columnar)),
      "name" => Map.get(g, :name)
    }
    |> compact()
  end

  defp fingering_to_json(:standard), do: nil
  defp fingering_to_json(:angle_mod), do: "angle-mod"

  defp fingering_to_json(map) when is_map(map),
    do: Map.new(map, fn {k, v} -> {k, Atom.to_string(v)} end)

  @doc false
  def compact(map) when is_map(map) do
    map |> Enum.reject(fn {_k, v} -> is_nil(v) or v == %{} or v == [] end) |> Map.new()
  end
end
