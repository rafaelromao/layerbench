defmodule LayoutMasterWeb.Components.Keyboard do
  @moduledoc """
  SVG keyboard canvas (SPEC §4.2): keys with tap/hold legends for one layer, heat colors,
  highlighted keys and arcs between keys (typing paths, n-gram highlights).
  """
  use Phoenix.Component

  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layout.Labels

  @unit 64
  @gap 6

  attr :compiled, :any, required: true
  attr :layer, :integer, default: 0
  attr :heat, :map, default: %{}, doc: "position index → 0..1"
  attr :highlight, :list, default: [], doc: "position indices to outline"
  attr :selected, :string, default: nil, doc: "selected key id"
  attr :arcs, :list, default: [], doc: "[{from_pos, to_pos}] arrows"
  attr :interactive, :boolean, default: true
  attr :click_event, :string, default: "key_click"
  attr :class, :string, default: ""
  attr :show_hold, :boolean, default: true
  attr :draggable, :boolean, default: false

  def keyboard(assigns) do
    c = assigns.compiled
    keys = Tuple.to_list(c.keys)
    {min_x, max_x} = keys |> Enum.map(& &1.x) |> Enum.min_max()
    {min_y, max_y} = keys |> Enum.map(& &1.y) |> Enum.min_max()
    pad = 0.8
    ox = min_x - pad
    oy = min_y - pad
    width = (max_x - min_x + 2 * pad) * @unit
    height = (max_y - min_y + 2 * pad) * @unit
    layer = Compile.layer(c, min(assigns.layer, c.n_layers - 1))

    key_data =
      keys
      |> Enum.with_index()
      |> Enum.map(fn {k, idx} ->
        binding = elem(layer.bindings, idx)
        legend = Labels.legend(c, binding)
        explicit = elem(layer.explicit, idx)

        %{
          id: k.id,
          idx: idx,
          cx: (k.x - ox) * @unit,
          cy: (k.y - oy) * @unit,
          w: k.w * @unit - @gap,
          h: k.h * @unit - @gap,
          rot: k.rotation,
          legend: legend,
          heat: Map.get(assigns.heat, idx, 0.0),
          explicit: explicit,
          trans: legend.kind == :trans or (not explicit and layer.idx > 0),
          home: k.home,
          thumb: k.thumb,
          highlighted: idx in assigns.highlight,
          selected: assigns.selected == k.id
        }
      end)

    arcs =
      for {a, b} <- assigns.arcs,
          ka = Enum.find(key_data, &(&1.idx == a)),
          kb = Enum.find(key_data, &(&1.idx == b)) do
        %{x1: ka.cx, y1: ka.cy, x2: kb.cx, y2: kb.cy}
      end

    assigns =
      assign(assigns, keys: key_data, width: width, height: height, arcs: arcs, unit: @unit)

    ~H"""
    <svg
      class={["lm-keyboard w-full h-auto select-none", @class]}
      viewBox={"0 0 #{@width} #{@height}"}
      role={if @interactive, do: "group", else: "img"}
      aria-label="Keyboard layout"
      phx-hook={if @draggable, do: "DragDrop", else: nil}
      id={if @draggable, do: "keyboard-drag", else: nil}
    >
      <defs>
        <marker
          id="lm-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" class="fill-primary" />
        </marker>
      </defs>
      <g
        :for={k <- @keys}
        transform={"translate(#{fmt(k.cx)} #{fmt(k.cy)}) rotate(#{fmt(k.rot)})"}
        class={[
          "lm-key",
          k.trans && "lm-key-trans",
          k.thumb && "lm-key-thumb",
          k.selected && "lm-key-selected"
        ]}
        phx-click={@interactive && @click_event}
        phx-keydown={@interactive && @click_event}
        phx-key={@interactive && "Enter"}
        phx-value-id={k.id}
        role={@interactive && "button"}
        tabindex={@interactive && "0"}
        aria-label={key_label(k)}
        data-key={k.id}
        style={"cursor: #{if @interactive, do: "pointer", else: "default"}"}
      >
        <rect
          x={fmt(-k.w / 2)}
          y={fmt(-k.h / 2)}
          width={fmt(k.w)}
          height={fmt(k.h)}
          rx="9"
          class={["lm-key-cap", k.highlighted && "lm-key-highlight"]}
          style={"fill: color-mix(in oklab, var(--lm-key-bg) #{fmt(100 - k.heat * 100)}%, var(--lm-heat) #{fmt(k.heat * 100)}%)"}
        />
        <circle :if={k.home} cx="0" cy={fmt(k.h / 2 - 9)} r="2.2" class="lm-key-home" />
        <text
          x="0"
          y={if k.legend.hold && @show_hold, do: "-2", else: "4"}
          text-anchor="middle"
          class={["lm-key-tap", "lm-kind-#{k.legend.kind}"]}
          font-size={if String.length(k.legend.tap) > 2, do: 15, else: 22}
        >
          {k.legend.tap}
        </text>
        <text
          :if={k.legend.hold && @show_hold}
          x="0"
          y={fmt(k.h / 2 - 12)}
          text-anchor="middle"
          class="lm-key-hold"
          font-size="10"
        >
          {k.legend.hold}
        </text>
      </g>
      <g :for={a <- @arcs} class="lm-arc">
        <path
          d={arc_path(a)}
          fill="none"
          class="stroke-primary"
          stroke-width="3"
          marker-end="url(#lm-arrow)"
          opacity="0.85"
        />
      </g>
    </svg>
    """
  end

  defp fmt(n) when is_float(n), do: :erlang.float_to_binary(n, decimals: 2)
  defp fmt(n), do: to_string(n)

  # Accessible name for a key: id, tap legend and (when present) hold legend.
  defp key_label(k) do
    tap = if k.legend.tap in [nil, ""], do: "empty", else: k.legend.tap
    hold = if k.legend.hold, do: ", hold #{k.legend.hold}", else: ""
    "Key #{k.id}: #{tap}#{hold}"
  end

  defp arc_path(%{x1: x1, y1: y1, x2: x2, y2: y2}) do
    mx = (x1 + x2) / 2
    my = (y1 + y2) / 2 - abs(x2 - x1) * 0.25 - 12
    "M #{fmt(x1)} #{fmt(y1)} Q #{fmt(mx)} #{fmt(my)} #{fmt(x2)} #{fmt(y2)}"
  end

  @doc "Normalize a position → value map into 0..1 heat."
  def normalize_heat(map) when map_size(map) == 0, do: %{}

  def normalize_heat(map) do
    max = map |> Map.values() |> Enum.max()
    if max > 0, do: Map.new(map, fn {k, v} -> {k, v / max} end), else: %{}
  end
end
