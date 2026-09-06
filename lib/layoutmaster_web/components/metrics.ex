defmodule LayoutMasterWeb.Components.Metrics do
  @moduledoc "Summary strip, metric cards, band badges, item bars (SPEC §4.1)."
  use Phoenix.Component

  alias LayoutMaster.Rules.Bands

  @summary_ids ~w(sfb sfs lsb fsb hsb alternation rolls onehand_in redirect pinky_off hand_balance layer_taps_per_100 extra_keystrokes)

  def summary_ids, do: @summary_ids

  attr :results, :list, required: true
  attr :ids, :list, default: @summary_ids
  attr :on_select, :string, default: "select_metric"

  def summary_strip(assigns) do
    by_id = Map.new(assigns.results, &{&1.id, &1})
    items = assigns.ids |> Enum.map(&Map.get(by_id, &1)) |> Enum.reject(&is_nil/1)
    assigns = assign(assigns, items: items)

    ~H"""
    <div class="flex flex-wrap gap-2" role="list" aria-label="Summary metrics">
      <button
        :for={r <- @items}
        type="button"
        role="listitem"
        phx-click={@on_select}
        phx-value-id={r.id}
        class={[
          "lm-stat rounded-xl border px-3 py-2 text-left transition hover:border-primary",
          quality_border(r.band.quality)
        ]}
        title={r.note || r.label}
      >
        <div class="text-[11px] uppercase tracking-wide opacity-70">{short_label(r)}</div>
        <div class="flex items-baseline gap-2">
          <span class="font-mono text-lg tabular-nums">{format_value(r)}</span>
          <.band_badge band={r.band} />
        </div>
      </button>
    </div>
    """
  end

  attr :band, :map, required: true

  def band_badge(assigns) do
    ~H"""
    <span :if={@band.label} class={["lm-band badge badge-xs", quality_badge(@band.quality)]}>{Bands.human(
      @band.label
    )}</span>
    """
  end

  attr :result, :map, required: true
  attr :compiled, :any, default: nil
  attr :expanded, :boolean, default: true
  attr :selected_item, :integer, default: nil

  def metric_card(assigns) do
    ~H"""
    <section
      class={[
        "lm-card card bg-base-100 border border-base-300 shadow-sm",
        quality_border(@result.band.quality)
      ]}
      id={"metric-#{@result.id}"}
    >
      <div class="card-body p-3 gap-2">
        <header class="flex items-start justify-between gap-2">
          <div>
            <h3 class="font-semibold leading-tight">{@result.label}</h3>
            <p :if={@result.note} class="text-xs opacity-60 leading-snug">{@result.note}</p>
          </div>
          <div class="text-right">
            <div class="font-mono text-xl tabular-nums">{format_value(@result)}</div>
            <.band_badge band={@result.band} />
          </div>
        </header>
        <div :if={@result.per_finger != %{}} class="lm-fingers">
          <.finger_bars values={@result.per_finger} />
        </div>
        <div :if={@result.per_hand != %{}} class="flex gap-2 text-xs font-mono">
          <span :for={{h, v} <- Enum.sort(@result.per_hand)}>{h}: {Float.round(v * 1.0, 1)}%</span>
        </div>
        <div
          :if={@result.breakdown != %{} and @result.per_finger == %{}}
          class="text-xs font-mono flex flex-wrap gap-x-3 gap-y-1"
        >
          <span :for={
            {k, v} <-
              @result.breakdown |> Enum.sort_by(fn {k, _} -> to_string(k) end) |> Enum.take(12)
          }>{k}: {fmt_num(v)}</span>
        </div>
        <ol :if={@result.items != []} class="lm-items space-y-0.5 text-sm">
          <li :for={{item, i} <- Enum.with_index(@result.items)} class="flex items-center gap-2">
            <button
              type="button"
              class={[
                "font-mono w-16 shrink-0 text-left truncate hover:text-primary",
                i == @selected_item && "text-primary font-bold"
              ]}
              phx-click="highlight_item"
              phx-value-rule={@result.id}
              phx-value-index={i}
              title={item.label}
            >
              {item.label}
            </button>
            <div class="flex-1 h-2 rounded bg-base-300 overflow-hidden">
              <div class="h-full bg-primary/70" style={"width: #{bar_width(item, @result.items)}%"}>
              </div>
            </div>
            <span class="font-mono text-xs w-14 text-right tabular-nums">{fmt_item(item)}</span>
          </li>
        </ol>
      </div>
    </section>
    """
  end

  attr :values, :map, required: true

  def finger_bars(assigns) do
    order = [:LP, :LR, :LM, :LI, :LT, :RT, :RI, :RM, :RR, :RP]
    max = assigns.values |> Map.values() |> Enum.max(fn -> 1 end)
    assigns = assign(assigns, order: order, max: if(max > 0, do: max, else: 1))

    ~H"""
    <div class="flex items-end gap-1 h-14" aria-label="Per finger distribution">
      <div
        :for={f <- @order}
        class={["flex flex-col items-center flex-1", f in [:LT, :RT] && "opacity-70"]}
        title={"#{f}: #{fmt_num(Map.get(@values, f, 0.0))}%"}
      >
        <div
          class="w-full rounded-t bg-primary/70"
          style={"height: #{Float.round(Map.get(@values, f, 0.0) / @max * 44, 1)}px"}
        >
        </div>
        <span class="text-[9px] font-mono opacity-60">{f}</span>
      </div>
    </div>
    """
  end

  def format_value(%{value: nil}), do: "–"
  def format_value(%{value: v, unit: :percent}), do: "#{fmt_num(v)}%"
  def format_value(%{value: v, unit: :ratio}), do: fmt_num(v, 2)
  def format_value(%{value: v, unit: :distance}), do: "#{fmt_num(v, 2)}U"
  def format_value(%{value: v, unit: :per100}), do: fmt_num(v, 2)
  def format_value(%{value: v, unit: :length}), do: fmt_num(v, 2)
  def format_value(%{value: v, unit: :effort}), do: fmt_num(v, 1)
  def format_value(%{value: v, unit: :count}), do: fmt_num(v, 0)
  def format_value(%{value: v}), do: fmt_num(v)

  def fmt_num(v, decimals \\ 2)
  def fmt_num(nil, _), do: "–"
  def fmt_num(v, decimals) when is_float(v), do: :erlang.float_to_binary(v, decimals: decimals)
  def fmt_num(v, _decimals) when is_integer(v), do: Integer.to_string(v)
  def fmt_num(v, _), do: to_string(v)

  defp fmt_item(%{percent: p}) when is_number(p),
    do: "#{fmt_num(p * 1.0, if(p < 1, do: 3, else: 2))}%"

  defp fmt_item(%{count: c}), do: fmt_num(c * 1.0, 0)
  defp fmt_item(_), do: ""

  defp bar_width(item, items) do
    max = items |> Enum.map(&(&1[:percent] || &1[:count] || 0)) |> Enum.max(fn -> 1 end)
    v = item[:percent] || item[:count] || 0
    if max > 0, do: Float.round(v / max * 100, 1), else: 0
  end

  defp short_label(%{id: id, label: label}) do
    Map.get(
      %{
        "sfb" => "SFB",
        "sfs" => "SFS",
        "lsb" => "LSB",
        "fsb" => "FSB",
        "hsb" => "HSB",
        "alternation" => "Alt",
        "rolls" => "Rolls",
        "onehand_in" => "Onehand",
        "redirect" => "Redir",
        "pinky_off" => "Pinky off",
        "hand_balance" => "Hand Δ",
        "layer_taps_per_100" => "Layer taps",
        "extra_keystrokes" => "Extra keys"
      },
      id,
      label
    )
  end

  defp quality_border(:good), do: "border-success/60"
  defp quality_border(:ok), do: "border-warning/60"
  defp quality_border(:bad), do: "border-error/60"
  defp quality_border(_), do: "border-base-300"

  defp quality_badge(:good), do: "badge-success"
  defp quality_badge(:ok), do: "badge-warning"
  defp quality_badge(:bad), do: "badge-error"
  defp quality_badge(_), do: "badge-ghost"
end
