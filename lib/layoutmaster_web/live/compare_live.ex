defmodule LayoutMasterWeb.CompareLive do
  @moduledoc "Compare two layouts side by side with deltas and bands (SPEC §4.1)."
  use LayoutMasterWeb, :live_view

  import LayoutMasterWeb.Components.Keyboard
  import LayoutMasterWeb.Components.Metrics

  alias LayoutMaster.Analysis.Cache
  alias LayoutMaster.Corpus
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layouts, as: Bundled
  alias LayoutMasterWeb.Live.Params
  alias LayoutMasterWeb.Live.RuleSets

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Compare",
       bundled: Bundled.all(),
       corpora: Corpus.available(),
       a: nil,
       b: nil,
       params: %Params{},
       ref_b: "romak-34",
       error: nil
     )}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    p = Params.parse(params)
    ref_b = params["b"] || "romak-34"
    socket = assign(socket, params: p, ref_b: ref_b, error: nil)
    {:noreply, socket |> start(:a, p.layout_ref) |> start(:b, ref_b)}
  end

  defp start(socket, side, ref) do
    p = socket.assigns.params

    with {:ok, layout} <- Params.resolve_layout(ref),
         {:ok, compiled} <- Compile.compile(layout),
         {:ok, corpus} <- Corpus.load(p.corpus) do
      rule_set = p.preset |> RuleSets.resolve() |> RuleSets.with_universe(p.universe)

      opts = [
        case_mode: p.case_mode,
        cross_word: Map.get(rule_set.globals, :cross_word, :reset),
        max_symbols: p.sample,
        rule_set: rule_set
      ]

      socket = cancel_async(socket, {:analysis, side})

      case Cache.get(Cache.key(layout, corpus.id, opts)) do
        {:ok, report} ->
          assign(socket, side, %{layout: layout, compiled: compiled, report: report})

        :miss ->
          socket
          |> assign(side, %{layout: layout, compiled: compiled, report: nil})
          |> start_async({:analysis, side}, fn -> Cache.analyze(layout, corpus, opts) end)
      end
    else
      {:error, errs} when is_list(errs) ->
        assign(socket, side, nil) |> assign(error: Enum.join(errs, "; "))

      {:error, reason} ->
        assign(socket, side, nil) |> assign(error: inspect(reason))
    end
  end

  @impl true
  def handle_async({:analysis, side}, result, socket) do
    case {socket.assigns[side], result} do
      {%{} = st, {:ok, {:ok, report}}} ->
        {:noreply, assign(socket, side, %{st | report: report})}

      {%{}, {:ok, {:error, errs}}} when is_list(errs) ->
        {:noreply, assign(socket, error: Enum.join(errs, "; "))}

      {%{}, {:ok, {:error, reason}}} ->
        {:noreply, assign(socket, error: inspect(reason))}

      {%{}, {:exit, reason}} ->
        {:noreply, assign(socket, error: "analysis failed: #{inspect(reason)}")}

      _ ->
        {:noreply, socket}
    end
  end

  @impl true
  def handle_event("set", params, socket) do
    p = socket.assigns.params

    query =
      Params.to_query(p)
      |> Map.put("b", socket.assigns.ref_b)
      |> Map.merge(Map.take(params, ~w(layout b corpus rules case space sample)))

    query = query |> Enum.reject(fn {_k, v} -> v in [nil, ""] end) |> Map.new()
    {:noreply, push_patch(socket, to: ~p"/compare?#{query}")}
  end

  defp rows(%{report: ra}, %{report: rb}) when not is_nil(ra) and not is_nil(rb) do
    by_b = Map.new(rb.results, &{&1.id, &1})

    ra.results
    |> Enum.filter(&is_number(&1.value))
    |> Enum.map(fn r ->
      rb_r = Map.get(by_b, r.id)
      vb = rb_r && rb_r.value
      delta = if is_number(vb), do: vb - r.value, else: nil

      lower_better =
        r.band.label != nil and Map.get(r.band, :goodness) != nil and
          direction(r) == :lower_is_better

      winner =
        cond do
          is_nil(delta) or abs(delta) < 1.0e-9 -> :tie
          delta < 0 == lower_better -> :b
          true -> :a
        end

      %{a: r, b: rb_r, delta: delta, winner: winner}
    end)
  end

  defp rows(_, _), do: []

  defp direction(%{id: id}) do
    case id do
      id
      when id in ~w(alternation rolls roll_in roll_out onehand_in onehand_out in_out_ratio home_row adaptive_hit_rate) ->
        :higher_is_better

      _ ->
        :lower_is_better
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <h1 class="sr-only">Compare layouts</h1>
      <div class="space-y-4">
        <form
          id="compare-toolbar"
          phx-change="set"
          class="card bg-base-100 border border-base-300 shadow-sm"
        >
          <div class="card-body p-3 flex-row flex-wrap items-end gap-3">
            <label class="form-control">
              <span class="label-text text-xs">Layout A</span>
              <select name="layout" class="select select-sm select-bordered min-w-44">
                <option :for={l <- @bundled} value={l.id} selected={@params.layout_ref == l.id}>
                  {l.name}
                </option>
                <option
                  :if={Bundled.get(@params.layout_ref) == nil}
                  value={@params.layout_ref}
                  selected
                >
                  {if @a, do: @a.layout.name, else: @params.layout_ref}
                </option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Layout B</span>
              <select name="b" class="select select-sm select-bordered min-w-44">
                <option :for={l <- @bundled} value={l.id} selected={@ref_b == l.id}>{l.name}</option>
                <option :if={Bundled.get(@ref_b) == nil} value={@ref_b} selected>
                  {if @b, do: @b.layout.name, else: @ref_b}
                </option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Corpus</span>
              <select name="corpus" class="select select-sm select-bordered">
                <option :for={c <- @corpora} value={c.id} selected={@params.corpus == c.id}>
                  {c.name}
                </option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Rules</span>
              <select name="rules" class="select select-sm select-bordered">
                <option
                  :for={p <- LayoutMaster.Rules.Presets.all()}
                  value={p.id}
                  selected={@params.preset == p.id}
                >
                  {p.name}
                </option>
              </select>
            </label>
            <label class="label cursor-pointer gap-2 text-xs ml-auto">
              <span>Include space</span>
              <input
                type="checkbox"
                name="space"
                value="1"
                class="toggle toggle-sm"
                checked={@params.universe == :with_space}
              />
            </label>
            <.link navigate={~p"/?#{Params.to_query(@params)}"} class="btn btn-sm btn-outline">Analyze A</.link>
          </div>
        </form>

        <div :if={@error} class="alert alert-error text-sm">{@error}</div>

        <div class="grid gap-4 md:grid-cols-2">
          <.side title="A" state={@a} />
          <.side title="B" state={@b} />
        </div>

        <div
          :if={@a && @b && @a.report && @b.report}
          class="card bg-base-100 border border-base-300 shadow-sm overflow-x-auto"
        >
          <table class="table table-sm table-zebra">
            <thead>
              <tr>
                <th>Metric</th>
                <th class="text-right">{@a.layout.name}</th>
                <th class="text-right">{@b.layout.name}</th>
                <th class="text-right">Δ (B − A)</th>
                <th>Better</th>
              </tr>
            </thead>
            <tbody>
              <tr :for={row <- rows(@a, @b)}>
                <td>
                  <div class="font-medium">{row.a.label}</div>
                  <div class="text-xs opacity-60">{row.a.family}</div>
                </td>
                <td class="text-right font-mono tabular-nums">
                  {format_value(row.a)} <.band_badge band={row.a.band} />
                </td>
                <td class="text-right font-mono tabular-nums">
                  {if row.b, do: format_value(row.b), else: "–"}
                  <.band_badge :if={row.b} band={row.b.band} />
                </td>
                <td class={[
                  "text-right font-mono tabular-nums",
                  row.winner == :b && "text-success",
                  row.winner == :a && "text-error"
                ]}>
                  {if row.delta,
                    do: if(row.delta > 0, do: "+", else: "") <> fmt_num(row.delta * 1.0, 2),
                    else: "–"}
                </td>
                <td>
                  <span :if={row.winner == :a} class="badge badge-sm">{@a.layout.name}</span>
                  <span :if={row.winner == :b} class="badge badge-sm badge-primary">{@b.layout.name}</span>
                  <span :if={row.winner == :tie} class="opacity-40">–</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Layouts.app>
    """
  end

  attr :title, :string, required: true
  attr :state, :any

  defp side(assigns) do
    ~H"""
    <section class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-3 gap-2">
        <h2 class="font-semibold">{@title}: {if @state, do: @state.layout.name, else: "–"}</h2>
        <.keyboard
          :if={@state}
          id={"kb-#{@title}"}
          compiled={@state.compiled}
          layer={0}
          interactive={false}
          show_hold={false}
          heat={if @state.report, do: usage_heat(@state.report), else: %{}}
        />
        <.summary_strip :if={@state && @state.report} results={@state.report.results} />
        <div :if={@state && is_nil(@state.report)} class="text-sm opacity-60">
          <span class="loading loading-dots loading-xs"></span> analyzing…
        </div>
      </div>
    </section>
    """
  end

  defp usage_heat(report) do
    sim = report.simulation

    sim.registry.keys
    |> Enum.reduce(%{}, fn {id, lk}, acc ->
      Map.update(
        acc,
        lk.pos,
        Map.get(sim.no_space.unigram, id, 0),
        &(&1 + Map.get(sim.no_space.unigram, id, 0))
      )
    end)
    |> normalize_heat()
  end
end
