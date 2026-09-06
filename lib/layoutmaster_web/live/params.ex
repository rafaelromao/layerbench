defmodule LayoutMasterWeb.Live.Params do
  @moduledoc """
  URL state (SPEC §4.3): layout (library id, saved id or inline compressed JSON), corpus + mix,
  rule set preset, case mode, universe, view.
  """

  alias LayoutMaster.Layout
  alias LayoutMaster.Layouts
  alias LayoutMaster.Rules.Presets
  alias LayoutMaster.Storage

  defstruct layout_ref: "magic-romak",
            corpus: "pt-br-general",
            corpus2: nil,
            mix: 50,
            preset: "layouts_doc",
            case_mode: :fold,
            universe: :no_space,
            layer: 0,
            heat: :usage,
            sample: 300_000

  @type t :: %__MODULE__{}

  def parse(params) when is_map(params) do
    %__MODULE__{
      layout_ref: params["layout"] || params["l"] || "magic-romak",
      corpus: params["corpus"] || "pt-br-general",
      corpus2: blank_to_nil(params["corpus2"]),
      mix: int(params["mix"], 50, 0, 100),
      preset:
        if(
          is_binary(params["rules"]) and
            (params["rules"] in Presets.ids() or String.starts_with?(params["rules"], "saved:")),
          do: params["rules"],
          else: "layouts_doc"
        ),
      case_mode: if(params["case"] == "model", do: :model, else: :fold),
      universe: if(params["space"] == "1", do: :with_space, else: :no_space),
      layer: int(params["layer"], 0, 0, 31),
      heat: heat(params["heat"]),
      sample: int(params["sample"], 300_000, 10_000, 5_000_000)
    }
  end

  def to_query(%__MODULE__{} = p, overrides \\ %{}) do
    p = struct(p, overrides)

    %{
      "layout" => p.layout_ref,
      "corpus" => p.corpus,
      "corpus2" => p.corpus2,
      "mix" => if(p.corpus2, do: p.mix, else: nil),
      "rules" => if(p.preset != "layouts_doc", do: p.preset, else: nil),
      "case" => if(p.case_mode == :model, do: "model", else: nil),
      "space" => if(p.universe == :with_space, do: "1", else: nil),
      "layer" => if(p.layer != 0, do: p.layer, else: nil),
      "heat" => if(p.heat != :usage, do: Atom.to_string(p.heat), else: nil),
      "sample" => if(p.sample != 300_000, do: p.sample, else: nil)
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()
  end

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(v), do: v

  defp int(nil, default, _min, _max), do: default

  defp int(v, default, min, max) when is_binary(v) do
    case Integer.parse(v) do
      {i, _} -> i |> Kernel.max(min) |> Kernel.min(max)
      :error -> default
    end
  end

  defp int(v, _d, min, max) when is_integer(v), do: v |> Kernel.max(min) |> Kernel.min(max)

  @heats ~w(usage sfb effort travel layer_taps)a
  def heats, do: @heats
  defp heat(nil), do: :usage
  defp heat(v), do: Enum.find(@heats, :usage, &(Atom.to_string(&1) == v))

  @doc """
  Resolve a layout reference: `inline:<blob>` (compressed JSON), `saved:<id>` (storage) or a bundled id.
  """
  def resolve_layout(ref) do
    cond do
      String.starts_with?(ref, "inline:") ->
        decode_inline(String.replace_prefix(ref, "inline:", ""))

      String.starts_with?(ref, "saved:") ->
        load_saved(String.replace_prefix(ref, "saved:", ""))

      true ->
        case Layouts.get(ref) do
          nil -> load_saved(ref)
          layout -> {:ok, layout}
        end
    end
  end

  defp load_saved(id) do
    case Storage.get(:layouts, id) do
      {:ok, doc, _meta} -> Layout.from_map(doc)
      {:error, :not_found} -> {:error, ["layout #{id} not found"]}
      {:error, reason} -> {:error, ["storage error: #{inspect(reason)}"]}
    end
  end

  @doc "Compress a layout into a URL-safe blob."
  def encode_inline(%Layout{} = layout) do
    layout |> Layout.encode!() |> :zlib.compress() |> Base.url_encode64(padding: false)
  end

  def decode_inline(blob) do
    with {:ok, bin} <- Base.url_decode64(blob, padding: false),
         json when is_binary(json) <- safe_uncompress(bin) do
      Layout.decode(json)
    else
      _ -> {:error, ["invalid inline layout"]}
    end
  end

  defp safe_uncompress(bin) do
    :zlib.uncompress(bin)
  rescue
    _ -> :error
  end
end
