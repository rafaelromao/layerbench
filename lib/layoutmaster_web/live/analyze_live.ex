defmodule LayoutMasterWeb.AnalyzeLive do
  @moduledoc "Analyze view (SPEC §4.1): keyboard heat-map with layer tabs, summary strip, metric cards, explain-word, coverage."
  use LayoutMasterWeb, :live_view

  import LayoutMasterWeb.Components.Keyboard
  import LayoutMasterWeb.Components.Metrics

  alias LayoutMaster.Analysis.Cache
  alias LayoutMaster.Corpus
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layouts, as: Bundled
  alias LayoutMaster.Rules.Presets
  alias LayoutMaster.Sim.Resolver
  alias LayoutMaster.Storage
  alias LayoutMasterWeb.Live.Params

  @families [
    {:bigram, "Bigrams"},
    {:skipgram, "Skipgrams"},
    {:trigram, "Trigrams"},
    {:usage, "Usage & balance"},
    {:effort, "Effort"},
    {:layer, "Layers"}
  ]

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(
       page_title: "Analyze",
       params: %Params{},
       kb: nil,
       compiled: nil,
       corpus: nil,
       corpora: Corpus.list(),
       saved: saved_layouts(),
       bundled: Bundled.all(),
       presets: Presets.all(),
       report: nil,
       loading: false,
       error: nil,
       highlight: [],
       arcs: [],
       selected_rule: nil,
       selected_item: nil,
       explain_text: "",
       explain: nil,
       families: @families
     )}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    p = Params.parse(params)
    socket = assign(socket, params: p, page_title: "Analyze")

    case Params.resolve_layout(p.layout_ref) do
      {:ok, layout} ->
        case Compile.compile(layout) do
          {:ok, compiled} ->
            socket = assign(socket, kb: layout, compiled: compiled, error: nil)
            {:noreply, socket |> load_corpus() |> start_analysis()}

          {:error, errs} ->
            {:noreply, assign(socket, error: Enum.join(errs, "; "), report: nil, loading: false)}
        end

      {:error, errs} ->
        {:noreply, assign(socket, error: Enum.join(errs, "; "), report: nil, loading: false)}
    end
  end

  defp saved_layouts do
    case Storage.list(:layouts) do
      {:ok, list} -> list
      _ -> []
    end
  end

  defp load_corpus(socket) do
    p = socket.assigns.params

    corpus =
      with {:ok, c1} <- Corpus.load(p.corpus) do
        case p.corpus2 && Corpus.load(p.corpus2) do
          {:ok, c2} -> Corpus.mix([{c1, p.mix}, {c2, 100 - p.mix}], 1_500_000)
          _ -> c1
        end
      else
        _ -> nil
      end

    assign(socket, corpus: corpus)
  end

  defp analysis_opts(p) do
    rule_set = rule_set_for(p)

    [
      case_mode: p.case_mode,
      cross_word: Map.get(rule_set.globals, :cross_word, :reset),
      max_symbols: p.sample,
      rule_set: rule_set
    ]
  end

  defp rule_set_for(p) do
    p.preset
    |> LayoutMasterWeb.Live.RuleSets.resolve()
    |> LayoutMasterWeb.Live.RuleSets.with_universe(p.universe)
  end

  defp start_analysis(%{assigns: %{corpus: nil}} = socket),
    do: assign(socket, error: "corpus not found", report: nil, loading: false)

  defp start_analysis(socket) do
    %{kb: layout, corpus: corpus, params: p} = socket.assigns
    opts = analysis_opts(p)
    socket = cancel_async(socket, :analysis)

    case Cache.get(Cache.key(layout, corpus.id, opts)) do
      {:ok, report} ->
        socket |> assign(report: report, loading: false, error: nil) |> refresh_explain()

      :miss ->
        socket
        |> assign(loading: true)
        |> start_async(:analysis, fn -> Cache.analyze(layout, corpus, opts) end)
    end
  end

  @impl true
  def handle_async(:analysis, {:ok, {:ok, report}}, socket) do
    {:noreply, socket |> assign(report: report, loading: false, error: nil) |> refresh_explain()}
  end

  def handle_async(:analysis, {:ok, {:error, reason}}, socket),
    do: {:noreply, assign(socket, loading: false, error: format_reason(reason))}

  def handle_async(:analysis, {:exit, reason}, socket),
    do: {:noreply, assign(socket, loading: false, error: "analysis failed: #{inspect(reason)}")}

  defp format_reason(errs) when is_list(errs), do: Enum.join(errs, "; ")
  defp format_reason(other), do: inspect(other)

  # ------------------------------------------------------------------ events

  @impl true
  def handle_event("set", %{"field" => field, "value" => value}, socket),
    do: {:noreply, patch(socket, %{field => value})}

  def handle_event("set", params, socket) do
    overrides = Map.take(params, ~w(layout corpus corpus2 mix rules case space layer heat sample))
    {:noreply, patch(socket, overrides)}
  end

  def handle_event("select_layer", %{"layer" => layer}, socket),
    do: {:noreply, patch(socket, %{"layer" => layer})}

  def handle_event("select_heat", %{"heat" => heat}, socket),
    do: {:noreply, patch(socket, %{"heat" => heat})}

  def handle_event("toggle_case", _, socket) do
    p = socket.assigns.params
    {:noreply, patch(socket, %{"case" => if(p.case_mode == :fold, do: "model", else: "fold")})}
  end

  def handle_event("toggle_space", _, socket) do
    p = socket.assigns.params
    {:noreply, patch(socket, %{"space" => if(p.universe == :no_space, do: "1", else: "0")})}
  end

  def handle_event("select_metric", %{"id" => id}, socket) do
    {:noreply,
     socket
     |> assign(selected_rule: id, selected_item: nil)
     |> push_event("scroll_to", %{id: "metric-#{id}"})}
  end

  def handle_event("highlight_item", %{"rule" => rule_id, "index" => index}, socket) do
    with %{results: results} <- socket.assigns.report,
         %{items: items} <- Enum.find(results, &(&1.id == rule_id)),
         {i, _} <- Integer.parse(index),
         item when not is_nil(item) <- Enum.at(items, i) do
      keys = item[:keys] || []
      arcs = keys |> Enum.chunk_every(2, 1, :discard) |> Enum.map(fn [a, b] -> {a, b} end)

      {:noreply,
       assign(socket,
         highlight: keys,
         arcs: arcs,
         selected_rule: rule_id,
         selected_item: i,
         explain: nil
       )}
    else
      _ -> {:noreply, socket}
    end
  end

  def handle_event("key_click", %{"id" => id}, socket) do
    case socket.assigns.compiled do
      nil -> {:noreply, socket}
      c -> {:noreply, assign(socket, highlight: [Compile.key_idx!(c, id)], arcs: [])}
    end
  end

  def handle_event("explain", %{"text" => text}, socket) do
    {:noreply, socket |> assign(explain_text: text) |> refresh_explain()}
  end

  def handle_event("clear_highlight", _, socket),
    do: {:noreply, assign(socket, highlight: [], arcs: [], explain: nil, selected_item: nil)}

  defp refresh_explain(%{assigns: %{explain_text: ""}} = socket), do: socket

  defp refresh_explain(%{assigns: %{compiled: nil}} = socket), do: socket

  defp refresh_explain(socket) do
    %{compiled: c, params: p, explain_text: text} = socket.assigns

    result =
      Resolver.explain(c, String.slice(text, 0, 80), case_mode: p.case_mode, cross_word: :reset)

    positions =
      result.steps
      |> Enum.reject(&(&1.kind == :hold_release))
      |> Enum.map(&Compile.key_idx!(c, &1.key))

    arcs = positions |> Enum.chunk_every(2, 1, :discard) |> Enum.map(fn [a, b] -> {a, b} end)

    assign(socket,
      explain: result,
      highlight: Enum.uniq(positions),
      arcs: arcs,
      selected_item: nil
    )
  end

  defp patch(socket, overrides) do
    p = socket.assigns.params

    query =
      Params.to_query(p)
      |> Map.merge(Map.new(overrides, fn {k, v} -> {to_string(k), v} end))
      |> Enum.reject(fn {_k, v} -> v in [nil, ""] end)
      |> Map.new()

    query = normalize_query(query)
    push_patch(socket, to: ~p"/?#{query}")
  end

  defp normalize_query(q) do
    q
    |> then(fn q -> if q["space"] == "0", do: Map.delete(q, "space"), else: q end)
    |> then(fn q -> if q["case"] == "fold", do: Map.delete(q, "case"), else: q end)
    |> then(fn q -> if q["layer"] in ["0", 0], do: Map.delete(q, "layer"), else: q end)
    |> then(fn q -> if q["heat"] == "usage", do: Map.delete(q, "heat"), else: q end)
    |> then(fn q -> if q["rules"] == "layouts_doc", do: Map.delete(q, "rules"), else: q end)
    |> then(fn q ->
      if q["corpus2"] in [nil, ""], do: Map.drop(q, ["corpus2", "mix"]), else: q
    end)
  end

  # ------------------------------------------------------------------ helpers

  defp heat_map(nil, _p, _c), do: %{}

  defp heat_map(report, p, compiled) do
    sim = report.simulation
    layer = min(p.layer, compiled.n_layers - 1)

    raw =
      case p.heat do
        :usage ->
          usage_by_pos(sim, layer)

        :layer_taps ->
          sim.registry.keys
          |> Enum.filter(fn {_id, lk} -> lk.key_kind == :layer_tap end)
          |> Enum.reduce(%{}, fn {id, lk}, acc ->
            Map.update(
              acc,
              lk.pos,
              Map.get(sim.no_space.unigram, id, 0),
              &(&1 + Map.get(sim.no_space.unigram, id, 0))
            )
          end)

        rule_id ->
          case Enum.find(report.results, &(&1.id == Atom.to_string(rule_id))) do
            nil -> usage_by_pos(sim, layer)
            r -> r.per_key
          end
      end

    normalize_heat(raw)
  end

  defp usage_by_pos(sim, layer) do
    Enum.reduce(sim.registry.keys, %{}, fn {id, lk}, acc ->
      if lk.layer == layer or lk.key_kind in [:layer_tap, :shift, :space] do
        Map.update(
          acc,
          lk.pos,
          Map.get(sim.no_space.unigram, id, 0),
          &(&1 + Map.get(sim.no_space.unigram, id, 0))
        )
      else
        acc
      end
    end)
  end

  defp results_for(report, family), do: Enum.filter(report.results, &(&1.family == family))

  defp coverage_items(report) do
    (report.coverage.unproducible || %{}) |> Enum.sort_by(fn {_s, c} -> -c end) |> Enum.take(12)
  end

  # ------------------------------------------------------------------ render

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <h1 class="sr-only">Analyze</h1>
      <div class="lm-analyze space-y-4">
        <.toolbar {assigns} />

        <div :if={@error} class="alert alert-error text-sm">{@error}</div>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3 gap-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div :if={@compiled} role="tablist" class="tabs tabs-box tabs-sm">
                  <button
                    :for={layer <- Tuple.to_list(@compiled.layers)}
                    role="tab"
                    type="button"
                    class={[
                      "tab",
                      layer.idx == min(@params.layer, @compiled.n_layers - 1) && "tab-active"
                    ]}
                    phx-click="select_layer"
                    phx-value-layer={layer.idx}
                  >
                    {layer.name}
                  </button>
                </div>
                <form id="heat-form" phx-change="select_heat" class="flex items-center gap-2 text-xs">
                  <label for="heat">Heat</label>
                  <select id="heat" name="heat" class="select select-xs">
                    <option :for={h <- Params.heats()} value={h} selected={@params.heat == h}>
                      {heat_label(h)}
                    </option>
                  </select>
                  <span
                    :if={@loading}
                    class="loading loading-spinner loading-xs"
                    aria-label="Analyzing"
                  ></span>
                </form>
              </div>

              <div :if={@compiled} class="relative">
                <.keyboard
                  id="kb-analyze"
                  compiled={@compiled}
                  layer={@params.layer}
                  heat={heat_map(@report, @params, @compiled)}
                  highlight={@highlight}
                  arcs={@arcs}
                />
              </div>

              <form
                id="explain-form"
                phx-submit="explain"
                phx-change="explain"
                class="flex items-center gap-2"
              >
                <label class="text-xs whitespace-nowrap" for="explain-text">How is this typed?</label>
                <input
                  id="explain-text"
                  name="text"
                  value={@explain_text}
                  phx-debounce="300"
                  placeholder="ação · chave · hello"
                  class="input input-sm input-bordered flex-1 font-mono"
                  autocomplete="off"
                />
                <button
                  :if={@highlight != []}
                  type="button"
                  class="btn btn-ghost btn-xs"
                  phx-click="clear_highlight"
                >clear</button>
              </form>
              <ol :if={@explain} class="flex flex-wrap gap-1 text-xs">
                <li
                  :for={s <- @explain.steps}
                  class={[
                    "badge badge-outline gap-1 font-mono",
                    s.wasted_one_shot && "badge-warning",
                    s.kind == :hold_release && "opacity-50"
                  ]}
                  title={"#{s.key} · #{s.layer} · #{s.finger}"}
                >
                  <span class="opacity-60">{s.key}</span>
                  <span>{if s.symbols == "",
                    do: s.label,
                    else: if(s.symbols == " ", do: "␣", else: s.symbols)}</span>
                  <span class="opacity-50">{s.layer}</span>
                </li>
                <li class="badge badge-ghost font-mono">{@explain.presses} presses</li>
              </ol>

              <div :if={@report} class="flex flex-wrap items-center gap-2 text-xs">
                <span class="opacity-70">Coverage:</span>
                <span :if={coverage_items(@report) == []} class="badge badge-success badge-xs">all symbols producible</span>
                <span
                  :for={{sym, count} <- coverage_items(@report)}
                  class="badge badge-error badge-xs font-mono"
                  title="unproducible symbol"
                >{sym} ×{count}</span>
                <span
                  :for={{sym, count} <- Enum.take(@report.coverage.soft_dropped || %{}, 4)}
                  class="badge badge-ghost badge-xs font-mono"
                  title="soft symbol dropped"
                >{sym} ×{count}</span>
                <span class="ml-auto opacity-60 font-mono">
                  {fmt_num(@report.stats.keystrokes * 1.0, 0)} keystrokes · {fmt_num(
                    @report.stats.words * 1.0,
                    0
                  )} words · {@report.elapsed_ms} ms
                </span>
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <div :if={@report} class="card bg-base-100 border border-base-300 shadow-sm">
              <div class="card-body p-3 gap-2">
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold">Summary</h2>
                  <div class="text-xs opacity-70 font-mono">
                    {if @params.universe == :with_space, do: "with space", else: "no space"} · {if @params.case_mode ==
                                                                                                     :model,
                                                                                                   do:
                                                                                                     "shift modeled",
                                                                                                   else:
                                                                                                     "case folded"} · {@report.globals.normalization}
                  </div>
                </div>
                <.summary_strip results={@report.results} />
                <div :if={@report.score.enabled and @report.score.value} class="text-sm">
                  Composite score:
                  <span class="font-mono font-semibold">{fmt_num(@report.score.value, 1)}</span>
                  / 100
                </div>
              </div>
            </div>
            <div
              :if={@loading and is_nil(@report)}
              class="card bg-base-100 border border-base-300 p-6 text-center opacity-70"
            >
              <span class="loading loading-dots loading-md"></span>
              <p class="text-sm">Simulating {fmt_num(@params.sample * 1.0, 0)} symbols…</p>
            </div>
          </section>
        </div>

        <div :if={@report} class="space-y-4">
          <section :for={{family, title} <- @families} :if={results_for(@report, family) != []}>
            <h2 class="text-sm uppercase tracking-wide opacity-60 mb-2">{title}</h2>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <.metric_card
                :for={r <- results_for(@report, family)}
                result={r}
                compiled={@compiled}
                selected_item={if @selected_rule == r.id, do: @selected_item, else: nil}
              />
            </div>
          </section>
        </div>
      </div>
    </Layouts.app>
    """
  end

  attr :params, :any, required: true
  attr :kb, :any
  attr :corpora, :list, required: true
  attr :saved, :list, required: true
  attr :bundled, :list, required: true
  attr :presets, :list, required: true
  attr :rest, :global

  defp toolbar(assigns) do
    ~H"""
    <form
      id="analyze-toolbar"
      phx-change="set"
      class="card bg-base-100 border border-base-300 shadow-sm"
    >
      <div class="card-body p-3 flex-row flex-wrap items-end gap-3">
        <label class="form-control">
          <span class="label-text text-xs">Layout</span>
          <select name="layout" class="select select-sm select-bordered min-w-48">
            <optgroup label="Bundled">
              <option :for={l <- @bundled} value={l.id} selected={@params.layout_ref == l.id}>
                {l.name}
              </option>
            </optgroup>
            <optgroup :if={@saved != []} label="Saved">
              <option
                :for={s <- @saved}
                value={"saved:" <> s["id"]}
                selected={@params.layout_ref == "saved:" <> s["id"]}
              >
                {s["name"]}
              </option>
            </optgroup>
            <option
              :if={String.starts_with?(@params.layout_ref, "inline:")}
              value={@params.layout_ref}
              selected
            >
              {if @kb, do: @kb.name, else: "inline layout"}
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
          <span class="label-text text-xs">Mix with</span>
          <select name="corpus2" class="select select-sm select-bordered">
            <option value="" selected={is_nil(@params.corpus2)}>—</option>
            <option :for={c <- @corpora} value={c.id} selected={@params.corpus2 == c.id}>
              {c.name}
            </option>
          </select>
        </label>
        <label :if={@params.corpus2} class="form-control w-36">
          <span class="label-text text-xs">{@params.mix}% first · {100 - @params.mix}% second</span>
          <input
            type="range"
            name="mix"
            min="0"
            max="100"
            step="5"
            value={@params.mix}
            class="range range-xs"
            phx-debounce="300"
          />
        </label>
        <label class="form-control">
          <span class="label-text text-xs">Rules</span>
          <select name="rules" class="select select-sm select-bordered">
            <option :for={p <- @presets} value={p.id} selected={@params.preset == p.id}>
              {p.name}
            </option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text text-xs">Sample</span>
          <select name="sample" class="select select-sm select-bordered">
            <option :for={n <- [100_000, 300_000, 1_000_000]} value={n} selected={@params.sample == n}>
              {div(n, 1000)}k symbols
            </option>
          </select>
        </label>
        <div class="flex flex-wrap items-center gap-3 ml-auto">
          <label class="label cursor-pointer gap-2 text-xs">
            <span>Model shift</span>
            <input
              type="checkbox"
              name="case"
              value="model"
              class="toggle toggle-sm"
              checked={@params.case_mode == :model}
            />
          </label>
          <label class="label cursor-pointer gap-2 text-xs">
            <span>Include space</span>
            <input
              type="checkbox"
              name="space"
              value="1"
              class="toggle toggle-sm"
              checked={@params.universe == :with_space}
            />
          </label>
          <.link navigate={~p"/edit?#{Params.to_query(@params)}"} class="btn btn-sm btn-outline">Edit</.link>
          <.link navigate={~p"/compare?#{Params.to_query(@params)}"} class="btn btn-sm btn-outline">Compare</.link>
        </div>
      </div>
    </form>
    """
  end

  defp heat_label(:usage), do: "Usage"
  defp heat_label(:sfb), do: "SFB contribution"
  defp heat_label(:effort), do: "Effort"
  defp heat_label(:travel), do: "Finger travel"
  defp heat_label(:layer_taps), do: "Layer taps"
  defp heat_label(h), do: to_string(h)
end
