defmodule LayoutMasterWeb.EditLive do
  @moduledoc """
  Edit view (SPEC §4.1): drag/drop keys within a layer, binding editor, layers, combos, behaviors
  (JSON), geometry picker, keys (space/shift), typing paths, save to storage, open in analyzer.
  """
  use LayoutMasterWeb, :live_view

  import LayoutMasterWeb.Components.Keyboard
  import LayoutMasterWeb.Components.Metrics

  alias LayoutMaster.Analysis.Cache
  alias LayoutMaster.Corpus
  alias LayoutMaster.Geometry
  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Binding
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layout.Labels
  alias LayoutMaster.Sim.Producers
  alias LayoutMaster.Storage
  alias LayoutMasterWeb.Live.Params
  alias LayoutMasterWeb.Live.RuleSets

  @kinds ~w(kp trans none sl mo lt tog to sk mod key_repeat macro caps_word auto_layer ref)

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(
       page_title: "Edit",
       params: %Params{},
       kb: nil,
       compiled: nil,
       error: nil,
       layer: 0,
       selected: nil,
       swap_from: nil,
       dirty: false,
       report: nil,
       pending_ref: nil,
       corpus: nil,
       producers: nil,
       behaviors_json: "",
       behaviors_error: nil,
       json_text: "",
       json_error: nil,
       kinds: @kinds,
       panel: :binding
     )}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    p = Params.parse(params)

    case Params.resolve_layout(p.layout_ref) do
      {:ok, layout} ->
        socket = assign(socket, params: p, layer: min(p.layer, max(0, length(layout.layers) - 1)))
        {:noreply, socket |> set_layout(layout, false) |> load_corpus()}

      {:error, errs} ->
        {:noreply, assign(socket, params: p, error: Enum.join(errs, "; "))}
    end
  end

  defp load_corpus(socket) do
    case Corpus.load(socket.assigns.params.corpus) do
      {:ok, c} -> socket |> assign(corpus: c) |> start_analysis()
      _ -> assign(socket, corpus: nil)
    end
  end

  defp set_layout(socket, %Layout{} = layout, dirty) do
    case Compile.compile(layout) do
      {:ok, compiled} ->
        socket
        |> assign(
          kb: layout,
          compiled: compiled,
          error: nil,
          dirty: dirty,
          producers: Producers.enumerate(compiled, socket.assigns.params.case_mode),
          behaviors_json:
            JSON.encode!(Map.new(layout.behaviors, fn {k, b} -> {k, Binding.to_json(b)} end))
        )
        |> then(fn s -> if dirty, do: start_analysis(s), else: s end)

      {:error, errs} ->
        assign(socket, error: Enum.join(errs, "; "))
    end
  end

  defp start_analysis(%{assigns: %{corpus: nil}} = socket), do: socket
  defp start_analysis(%{assigns: %{kb: nil}} = socket), do: socket

  defp start_analysis(socket) do
    %{kb: layout, corpus: corpus, params: p} = socket.assigns
    rule_set = p.preset |> RuleSets.resolve() |> RuleSets.with_universe(p.universe)

    opts = [
      case_mode: p.case_mode,
      cross_word: :reset,
      max_symbols: min(p.sample, 100_000),
      rule_set: rule_set
    ]

    case Cache.analyze_async(layout, corpus, opts) do
      {:cached, report} -> assign(socket, report: report, pending_ref: nil)
      {:running, ref} -> assign(socket, pending_ref: ref)
    end
  end

  @impl true
  def handle_info(
        {:analysis_result, ref, {:ok, report}},
        %{assigns: %{pending_ref: ref}} = socket
      ),
      do: {:noreply, assign(socket, report: report, pending_ref: nil)}

  def handle_info({:analysis_result, _ref, _}, socket), do: {:noreply, socket}

  # ------------------------------------------------------------ key editing

  @impl true
  def handle_event("select_layer", %{"layer" => l}, socket),
    do: {:noreply, assign(socket, layer: String.to_integer(l), selected: nil, swap_from: nil)}

  def handle_event("key_click", %{"id" => id}, socket) do
    case socket.assigns.swap_from do
      nil -> {:noreply, assign(socket, selected: id)}
      from when from == id -> {:noreply, assign(socket, swap_from: nil)}
      from -> {:noreply, socket |> swap_keys(from, id) |> assign(swap_from: nil, selected: id)}
    end
  end

  def handle_event("start_swap", _, socket),
    do: {:noreply, assign(socket, swap_from: socket.assigns.selected)}

  def handle_event("swap", %{"from" => from, "to" => to}, socket),
    do: {:noreply, socket |> swap_keys(from, to) |> assign(selected: to)}

  def handle_event("set_binding", %{"binding" => b}, socket) do
    with id when is_binary(id) <- socket.assigns.selected,
         {binding, []} <- Binding.from_json(binding_json(b), "editor", []) do
      {:noreply, update_layer_bindings(socket, fn bindings -> Map.put(bindings, id, binding) end)}
    else
      {_b, errs} -> {:noreply, put_flash(socket, :error, Enum.join(errs, "; "))}
      _ -> {:noreply, socket}
    end
  end

  def handle_event("clear_binding", _, %{assigns: %{selected: id}} = socket) when is_binary(id) do
    {:noreply, update_layer_bindings(socket, fn bindings -> Map.delete(bindings, id) end)}
  end

  def handle_event("clear_binding", _, socket), do: {:noreply, socket}

  # ---------------------------------------------------------------- layers

  def handle_event("add_layer", %{"name" => name}, socket) do
    layout = socket.assigns.kb
    id = Storage.slug(if(name == "", do: "layer #{length(layout.layers) + 1}", else: name))

    id =
      if Enum.any?(layout.layers, &(&1.id == id)), do: id <> "-#{length(layout.layers)}", else: id

    layers =
      layout.layers ++
        [
          %{
            id: id,
            name: if(name == "", do: id, else: name),
            shifted_twin: nil,
            bindings: %{"*" => %{kind: :trans}}
          }
        ]

    {:noreply,
     socket |> set_layout(%{layout | layers: layers}, true) |> assign(layer: length(layers) - 1)}
  end

  def handle_event("remove_layer", %{"id" => id}, socket) do
    layout = socket.assigns.kb

    if length(layout.layers) <= 1 or hd(layout.layers).id == id do
      {:noreply, put_flash(socket, :error, "cannot remove the base layer")}
    else
      layers = Enum.reject(layout.layers, &(&1.id == id))
      {:noreply, socket |> set_layout(%{layout | layers: layers}, true) |> assign(layer: 0)}
    end
  end

  def handle_event("rename_layer", %{"layer_id" => id, "name" => name}, socket) do
    layout = socket.assigns.kb
    layers = Enum.map(layout.layers, fn l -> if l.id == id, do: %{l | name: name}, else: l end)
    {:noreply, set_layout(socket, %{layout | layers: layers}, true)}
  end

  def handle_event("set_twin", %{"layer_id" => id, "twin" => twin}, socket) do
    layout = socket.assigns.kb

    layers =
      Enum.map(layout.layers, fn l ->
        if l.id == id, do: %{l | shifted_twin: if(twin == "", do: nil, else: twin)}, else: l
      end)

    {:noreply, set_layout(socket, %{layout | layers: layers}, true)}
  end

  # -------------------------------------------------------------- geometry

  def handle_event("set_geometry", %{"preset" => preset} = params, socket) do
    layout = socket.assigns.kb

    fingering =
      case params["fingering"] do
        "angle-mod" -> :angle_mod
        _ -> :standard
      end

    geometry = Geometry.preset(preset)
    valid = MapSet.new(Enum.map(geometry.keys, & &1.id))

    layers =
      Enum.map(layout.layers, fn l ->
        %{
          l
          | bindings:
              Map.filter(l.bindings, fn {k, _} -> k == "*" or MapSet.member?(valid, k) end)
        }
      end)

    space =
      if MapSet.member?(valid, layout.keys.space),
        do: layout.keys.space,
        else: List.first(geometry.text_thumbs)

    shift =
      if layout.keys.shift && MapSet.member?(valid, layout.keys.shift.key),
        do: layout.keys.shift,
        else: nil

    dropped =
      Enum.flat_map(layout.layers, fn l ->
        Map.keys(l.bindings) |> Enum.reject(&(&1 == "*" or MapSet.member?(valid, &1)))
      end)
      |> Enum.uniq()

    new = %{
      layout
      | geometry: %{preset: preset, column_offsets: %{}},
        fingering: fingering,
        layers: layers,
        keys: %{space: space, shift: shift}
    }

    socket =
      if dropped != [],
        do:
          put_flash(
            socket,
            :info,
            "Dropped bindings on keys not in #{preset}: #{Enum.join(dropped, ", ")}"
          ),
        else: socket

    {:noreply, set_layout(socket, new, true)}
  end

  def handle_event("set_keys", params, socket) do
    layout = socket.assigns.kb

    shift =
      case params["shift"] do
        "" -> nil
        nil -> layout.keys.shift
        key -> %{key: key, kind: if(params["shift_kind"] == "hold", do: :hold, else: :sk)}
      end

    keys = %{space: params["space"] || layout.keys.space, shift: shift}
    repeat = if params["repeat"] == "tap_twice", do: :tap_twice, else: :repeat_key
    {:noreply, set_layout(socket, %{layout | keys: keys, repeat_policy: repeat}, true)}
  end

  def handle_event("set_meta", params, socket) do
    layout = socket.assigns.kb

    new = %{
      layout
      | name: params["name"] || layout.name,
        author: params["author"] || layout.author,
        description: params["description"] || layout.description
    }

    {:noreply, set_layout(socket, new, true)}
  end

  # ----------------------------------------------------------------- combos

  def handle_event("add_combo", %{"keys" => keys, "symbol" => symbol, "role" => role}, socket) do
    layout = socket.assigns.kb
    key_ids = keys |> String.split(~r/[\s,+]+/, trim: true) |> Enum.map(&String.upcase/1)

    if length(key_ids) < 2 or symbol == "" do
      {:noreply, put_flash(socket, :error, "a combo needs at least two keys and an output")}
    else
      layer_id = Enum.at(layout.layers, socket.assigns.layer).id

      combo = %{
        id: Storage.slug(Enum.join(key_ids, "-")),
        keys: key_ids,
        binding: %{kind: :kp, symbol: symbol},
        layers: [layer_id],
        role: if(role == "typing", do: :typing, else: :command),
        timeout_ms: 50,
        slow_release: false
      }

      {:noreply, set_layout(socket, %{layout | combos: layout.combos ++ [combo]}, true)}
    end
  end

  def handle_event("remove_combo", %{"id" => id}, socket) do
    layout = socket.assigns.kb

    {:noreply,
     set_layout(socket, %{layout | combos: Enum.reject(layout.combos, &(&1.id == id))}, true)}
  end

  def handle_event("toggle_combo_role", %{"id" => id}, socket) do
    layout = socket.assigns.kb

    combos =
      Enum.map(layout.combos, fn c ->
        if c.id == id,
          do: %{c | role: if(c.role == :typing, do: :command, else: :typing)},
          else: c
      end)

    {:noreply, set_layout(socket, %{layout | combos: combos}, true)}
  end

  # -------------------------------------------------------------- behaviors

  def handle_event("behaviors_change", %{"json" => json}, socket),
    do: {:noreply, assign(socket, behaviors_json: json)}

  def handle_event("behaviors_apply", %{"json" => json}, socket) do
    with {:ok, map} when is_map(map) <- JSON.decode(json),
         {behaviors, []} <- parse_behaviors(map) do
      {:noreply,
       socket
       |> set_layout(%{socket.assigns.kb | behaviors: behaviors}, true)
       |> assign(behaviors_error: nil)}
    else
      {_b, errs} when is_list(errs) ->
        {:noreply, assign(socket, behaviors_error: Enum.join(errs, "; "))}

      {:error, r} ->
        {:noreply, assign(socket, behaviors_error: "invalid JSON: #{inspect(r)}")}

      _ ->
        {:noreply, assign(socket, behaviors_error: "behaviors must be an object")}
    end
  end

  # ----------------------------------------------------------- typing paths

  def handle_event("path_toggle", %{"symbol" => sym, "producer" => pid}, socket) do
    layout = socket.assigns.kb
    entries = current_path_entries(socket, sym)

    entries =
      Enum.map(entries, fn e ->
        if e.producer == pid, do: %{e | enabled: not e.enabled}, else: e
      end)

    {:noreply,
     set_layout(
       socket,
       %{layout | typing_paths: Map.put(layout.typing_paths, sym, entries)},
       true
     )}
  end

  def handle_event("path_move", %{"symbol" => sym, "producer" => pid, "dir" => dir}, socket) do
    layout = socket.assigns.kb
    entries = current_path_entries(socket, sym)
    i = Enum.find_index(entries, &(&1.producer == pid))
    j = if dir == "up", do: i - 1, else: i + 1

    entries =
      if i != nil and j >= 0 and j < length(entries) do
        entries |> List.delete_at(i) |> List.insert_at(j, Enum.at(entries, i))
      else
        entries
      end

    {:noreply,
     set_layout(
       socket,
       %{layout | typing_paths: Map.put(layout.typing_paths, sym, entries)},
       true
     )}
  end

  # ------------------------------------------------------------ save / json

  def handle_event("save", %{"name" => name}, socket) do
    layout = %{socket.assigns.kb | name: name}

    # Saved layouts keep their id when renamed; bundled/inline layouts get an id from the name.
    id =
      if layout.id && LayoutMaster.Layouts.get(layout.id) == nil &&
           String.starts_with?(socket.assigns.params.layout_ref, "saved:") do
        Storage.slug(layout.id)
      else
        Storage.slug(name)
      end

    layout = %{layout | id: id}

    case Storage.put(:layouts, id, Layout.to_map(layout), message: "Save layout #{name}") do
      {:ok, _} ->
        {:noreply,
         socket
         |> set_layout(layout, false)
         |> put_flash(:info, "Saved as #{id}")
         |> push_patch(
           to: ~p"/edit?#{Params.to_query(socket.assigns.params, %{layout_ref: "saved:" <> id})}"
         )}

      {:error, :conflict} ->
        {:noreply,
         put_flash(socket, :error, "Someone else changed this layout; reload and retry")}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, "Save failed: #{inspect(reason)}")}
    end
  end

  def handle_event("open_analyzer", _, socket) do
    ref = "inline:" <> Params.encode_inline(socket.assigns.kb)

    {:noreply,
     push_navigate(socket,
       to: ~p"/?#{Params.to_query(socket.assigns.params, %{layout_ref: ref})}"
     )}
  end

  def handle_event("export_json", _, socket),
    do:
      {:noreply,
       assign(socket,
         json_text: JSON.encode!(Layout.to_map(socket.assigns.kb)),
         json_error: nil,
         panel: :json
       )}

  def handle_event("json_change", %{"json" => json}, socket),
    do: {:noreply, assign(socket, json_text: json)}

  def handle_event("import_json", %{"json" => json}, socket) do
    case Layout.decode(json) do
      {:ok, layout} -> {:noreply, socket |> set_layout(layout, true) |> assign(json_error: nil)}
      {:error, errs} -> {:noreply, assign(socket, json_error: Enum.join(errs, "; "))}
    end
  end

  def handle_event("panel", %{"panel" => panel}, socket),
    do: {:noreply, assign(socket, panel: String.to_existing_atom(panel))}

  # ---------------------------------------------------------------- helpers

  defp parse_behaviors(map) do
    Enum.reduce(map, {%{}, []}, fn {k, v}, {acc, errs} ->
      {b, errs} = Binding.from_json(v, "behaviors.#{k}", errs)
      {Map.put(acc, k, b), errs}
    end)
  end

  defp current_path_entries(socket, sym) do
    layout = socket.assigns.kb

    case Map.get(layout.typing_paths, sym) do
      nil ->
        socket.assigns.producers.by_symbol
        |> Map.get(sym, [])
        |> Enum.map(&%{producer: &1.id, enabled: true, after_any: nil})

      entries ->
        entries
    end
  end

  defp swap_keys(socket, from, to) do
    update_layer_bindings(socket, fn bindings ->
      a = Map.get(bindings, from)
      b = Map.get(bindings, to)
      bindings = bindings |> Map.delete(from) |> Map.delete(to)
      bindings = if b, do: Map.put(bindings, from, b), else: bindings
      if a, do: Map.put(bindings, to, a), else: bindings
    end)
  end

  defp update_layer_bindings(socket, fun) do
    layout = socket.assigns.kb
    idx = socket.assigns.layer
    layers = List.update_at(layout.layers, idx, fn l -> %{l | bindings: fun.(l.bindings)} end)
    set_layout(socket, %{layout | layers: layers}, true)
  end

  # Build a JSON-shaped binding map from the editor form.
  defp binding_json(b) do
    kind = b["kind"] || "kp"

    case kind do
      "kp" ->
        %{"kind" => "kp", "symbol" => b["symbol"] || ""} |> maybe("shifted", b["shifted"])

      "macro" ->
        %{"kind" => "macro", "symbols" => b["symbol"] || ""}
        |> then(fn m ->
          if b["then_layer"] not in [nil, ""],
            do: Map.put(m, "then", [%{"kind" => "sl", "layer" => b["then_layer"]}]),
            else: m
        end)

      k when k in ["sl", "mo", "tog", "to", "auto_layer"] ->
        %{"kind" => k, "layer" => b["layer"] || ""}

      "lt" ->
        %{
          "kind" => "lt",
          "layer" => b["layer"] || "",
          "tap" => %{"kind" => "kp", "symbol" => b["symbol"] || ""}
        }

      k when k in ["sk", "mod"] ->
        %{"kind" => k, "mod" => b["mod"] || "LSHIFT"}

      "ref" ->
        %{"kind" => "ref", "ref" => b["ref"] || ""}

      k ->
        %{"kind" => k}
    end
  end

  defp maybe(map, _k, nil), do: map
  defp maybe(map, _k, ""), do: map
  defp maybe(map, k, v), do: Map.put(map, k, v)

  defp selected_binding(%{layout: layout, layer: layer, selected: id}) when is_binary(id) do
    l = Enum.at(layout.layers, layer)
    Map.get(l.bindings, id) || Map.get(l.bindings, "*") || %{kind: :trans}
  end

  defp selected_binding(_), do: nil

  defp editor_fields(nil), do: %{"kind" => "kp", "symbol" => ""}

  defp editor_fields(b) do
    base = %{"kind" => Atom.to_string(b.kind)}

    case b do
      %{kind: :kp} ->
        Map.merge(base, %{"symbol" => b[:symbol] || "", "shifted" => b[:shifted] || ""})

      %{kind: :macro} ->
        Map.merge(base, %{
          "symbol" => b[:symbols] || "",
          "then_layer" =>
            (b[:then] || [])
            |> Enum.find_value("", fn
              %{kind: :sl, layer: l} -> l
              _ -> nil
            end)
        })

      %{kind: k} when k in [:sl, :mo, :tog, :to, :auto_layer] ->
        Map.put(base, "layer", b.layer)

      %{kind: :lt} ->
        Map.merge(base, %{"layer" => b.layer, "symbol" => b.tap[:symbol] || ""})

      %{kind: k} when k in [:sk, :mod] ->
        Map.put(base, "mod", Atom.to_string(b.mod))

      %{kind: :ref} ->
        Map.put(base, "ref", b.ref)

      _ ->
        base
    end
  end

  defp multi_producer_symbols(nil), do: []

  defp multi_producer_symbols(%Producers.Index{by_symbol: bs}) do
    bs
    |> Enum.filter(fn {sym, list} -> sym != "" and length(list) > 1 end)
    |> Enum.map(&elem(&1, 0))
    |> Enum.sort()
  end

  defp producer_label(%Producers.Index{by_id: by_id}, pid) do
    case Map.get(by_id, pid) do
      nil -> pid
      p -> "#{p.kind} · #{pid} · #{p.cost} presses"
    end
  end

  # ------------------------------------------------------------------ render

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <h1 class="sr-only">Edit layout</h1>
      <div :if={@error} class="alert alert-error text-sm">{@error}</div>
      <div :if={@kb} class="space-y-4">
        <form phx-change="set_meta" class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-3 flex-row flex-wrap items-end gap-3">
            <label class="form-control"><span class="label-text text-xs">Name</span><input
              name="name"
              value={@kb.name}
              class="input input-sm input-bordered"
              phx-debounce="500"
            /></label>
            <label class="form-control"><span class="label-text text-xs">Author</span><input
              name="author"
              value={@kb.author}
              class="input input-sm input-bordered"
              phx-debounce="500"
            /></label>
            <label class="form-control grow"><span class="label-text text-xs">Description</span><input
              name="description"
              value={@kb.description}
              class="input input-sm input-bordered w-full"
              phx-debounce="500"
            /></label>
            <span :if={@dirty} class="badge badge-warning badge-sm">unsaved</span>
            <button type="button" class="btn btn-sm btn-outline" phx-click="open_analyzer">Analyze</button>
            <button type="button" class="btn btn-sm btn-outline" phx-click="export_json">JSON</button>
          </div>
        </form>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3 gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <div role="tablist" class="tabs tabs-box tabs-sm">
                  <button
                    :for={{l, i} <- Enum.with_index(@kb.layers)}
                    role="tab"
                    type="button"
                    class={["tab", i == @layer && "tab-active"]}
                    phx-click="select_layer"
                    phx-value-layer={i}
                  >{l.name}</button>
                </div>
                <form phx-submit="add_layer" class="flex gap-1">
                  <input
                    name="name"
                    placeholder="new layer"
                    class="input input-xs input-bordered w-28"
                  />
                  <button type="submit" class="btn btn-xs btn-outline">+ layer</button>
                </form>
                <span class="text-xs opacity-60 ml-auto">click a key to select · drag a key onto another to swap</span>
              </div>
              <.keyboard
                compiled={@compiled}
                layer={@layer}
                selected={@selected}
                highlight={if @swap_from, do: [Compile.key_idx!(@compiled, @swap_from)], else: []}
                draggable={true}
                click_event="key_click"
              />
              <div :if={@report} class="space-y-1">
                <.summary_strip
                  results={@report.results}
                  ids={
                    ~w(sfb sfs lsb fsb alternation rolls redirect pinky_off layer_taps_per_100 extra_keystrokes)
                  }
                />
                <p class="text-[11px] opacity-60">
                  Quick analysis on {fmt_num(min(@params.sample, 100_000) * 1.0, 0)} symbols of {@corpus &&
                    @corpus.name}<span :if={@pending_ref}> · updating…</span>
                </p>
              </div>
            </div>
          </section>

          <section class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3 gap-3">
              <div role="tablist" class="tabs tabs-bordered tabs-sm">
                <button
                  :for={
                    {p, label} <- [
                      binding: "Key",
                      layers: "Layers",
                      geometry: "Geometry",
                      combos: "Combos",
                      behaviors: "Behaviors",
                      paths: "Typing paths",
                      json: "JSON",
                      save: "Save"
                    ]
                  }
                  role="tab"
                  type="button"
                  class={["tab", @panel == p && "tab-active"]}
                  phx-click="panel"
                  phx-value-panel={p}
                >{label}</button>
              </div>

              <div :if={@panel == :binding}>
                <p :if={is_nil(@selected)} class="text-sm opacity-60">
                  Select a key on the keyboard.
                </p>
                <div :if={@selected} class="space-y-2">
                  <% fields = editor_fields(selected_binding(assigns)) %>
                  <div class="flex items-center gap-2">
                    <span class="badge badge-neutral font-mono">{@selected}</span>
                    <span class="text-xs opacity-60">layer {Enum.at(@kb.layers, @layer).name} · current: {Labels.tap_label(
                      @compiled,
                      selected_binding(assigns)
                    )}</span>
                    <button
                      type="button"
                      class="btn btn-xs btn-outline ml-auto"
                      phx-click="start_swap"
                    >{if @swap_from, do: "click target key…", else: "swap with…"}</button>
                    <button type="button" class="btn btn-xs btn-ghost" phx-click="clear_binding">clear</button>
                  </div>
                  <form phx-submit="set_binding" class="grid grid-cols-2 gap-2 text-sm">
                    <label class="form-control">
                      <span class="label-text text-xs">Kind</span>
                      <select name="binding[kind]" class="select select-sm select-bordered">
                        <option :for={k <- @kinds} value={k} selected={fields["kind"] == k}>
                          {k}
                        </option>
                      </select>
                    </label>
                    <label class="form-control"><span class="label-text text-xs">Symbol / macro text</span><input
                      name="binding[symbol]"
                      value={fields["symbol"]}
                      class="input input-sm input-bordered font-mono"
                    /></label>
                    <label class="form-control"><span class="label-text text-xs">Shifted symbol (kp)</span><input
                      name="binding[shifted]"
                      value={fields["shifted"]}
                      class="input input-sm input-bordered font-mono"
                    /></label>
                    <label class="form-control">
                      <span class="label-text text-xs">Layer (sl/mo/lt/tog/to/auto)</span>
                      <select name="binding[layer]" class="select select-sm select-bordered">
                        <option :for={l <- @kb.layers} value={l.id} selected={fields["layer"] == l.id}>
                          {l.name}
                        </option>
                      </select>
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">Arm layer after macro</span>
                      <select name="binding[then_layer]" class="select select-sm select-bordered">
                        <option value="">—</option>
                        <option
                          :for={l <- @kb.layers}
                          value={l.id}
                          selected={fields["then_layer"] == l.id}
                        >
                          {l.name}
                        </option>
                      </select>
                    </label>
                    <label class="form-control">
                      <span class="label-text text-xs">Modifier (sk/mod)</span>
                      <select name="binding[mod]" class="select select-sm select-bordered">
                        <option
                          :for={m <- Layout.mods()}
                          value={m}
                          selected={fields["mod"] == Atom.to_string(m)}
                        >
                          {m}
                        </option>
                      </select>
                    </label>
                    <label class="form-control col-span-2">
                      <span class="label-text text-xs">Behavior reference (ref)</span>
                      <select name="binding[ref]" class="select select-sm select-bordered">
                        <option value="">—</option>
                        <option :for={{k, _} <- @kb.behaviors} value={k} selected={fields["ref"] == k}>
                          {k}
                        </option>
                      </select>
                    </label>
                    <button type="submit" class="btn btn-sm btn-primary col-span-2">Apply to {@selected}</button>
                  </form>
                </div>
              </div>

              <div :if={@panel == :layers} class="space-y-2 text-sm">
                <div
                  :for={l <- @kb.layers}
                  class="flex flex-wrap items-center gap-2 border-b border-base-300 pb-2"
                >
                  <form phx-change="rename_layer" class="flex items-center gap-2">
                    <input type="hidden" name="layer_id" value={l.id} />
                    <span class="font-mono text-xs opacity-60 w-20 truncate">{l.id}</span>
                    <input
                      name="name"
                      value={l.name}
                      class="input input-xs input-bordered w-36"
                      phx-debounce="500"
                    />
                  </form>
                  <form phx-change="set_twin" class="flex items-center gap-1 text-xs">
                    <input type="hidden" name="layer_id" value={l.id} />
                    <span class="opacity-60">shifted twin</span>
                    <select name="twin" class="select select-xs select-bordered">
                      <option value="" selected={is_nil(l.shifted_twin)}>—</option>
                      <option
                        :for={t <- @kb.layers}
                        :if={t.id != l.id}
                        value={t.id}
                        selected={l.shifted_twin == t.id}
                      >
                        {t.name}
                      </option>
                    </select>
                  </form>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs ml-auto"
                    phx-click="remove_layer"
                    phx-value-id={l.id}
                    data-confirm="Remove this layer?"
                  >remove</button>
                </div>
              </div>

              <div :if={@panel == :geometry} class="space-y-3 text-sm">
                <form phx-change="set_geometry" class="flex flex-wrap gap-2 items-end">
                  <label class="form-control">
                    <span class="label-text text-xs">Preset</span>
                    <select name="preset" class="select select-sm select-bordered">
                      <option
                        :for={p <- Geometry.preset_ids()}
                        value={p}
                        selected={@kb.geometry[:preset] == p}
                      >
                        {p}
                      </option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">Fingering</span>
                    <select
                      name="fingering"
                      class="select select-sm select-bordered"
                      disabled={not @compiled.geometry.supports_angle_mod}
                    >
                      <option value="standard" selected={@kb.fingering == :standard}>standard</option>
                      <option value="angle-mod" selected={@kb.fingering == :angle_mod}>
                        angle mod
                      </option>
                    </select>
                  </label>
                </form>
                <form phx-change="set_keys" class="flex flex-wrap gap-2 items-end">
                  <label class="form-control">
                    <span class="label-text text-xs">Space key</span>
                    <select name="space" class="select select-sm select-bordered">
                      <option
                        :for={k <- Tuple.to_list(@compiled.keys)}
                        value={k.id}
                        selected={@kb.keys.space == k.id}
                      >
                        {k.id}
                      </option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">Shift key</span>
                    <select name="shift" class="select select-sm select-bordered">
                      <option value="" selected={is_nil(@kb.keys.shift)}>—</option>
                      <option
                        :for={k <- Tuple.to_list(@compiled.keys)}
                        value={k.id}
                        selected={@kb.keys.shift && @kb.keys.shift.key == k.id}
                      >
                        {k.id}
                      </option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">Shift kind</span>
                    <select name="shift_kind" class="select select-sm select-bordered">
                      <option value="sk" selected={@kb.keys.shift && @kb.keys.shift.kind == :sk}>
                        sticky (one-shot)
                      </option>
                      <option value="hold" selected={@kb.keys.shift && @kb.keys.shift.kind == :hold}>
                        hold
                      </option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">Doubled letters</span>
                    <select name="repeat" class="select select-sm select-bordered">
                      <option value="repeat_key" selected={@kb.repeat_policy == :repeat_key}>
                        repeat key
                      </option>
                      <option value="tap_twice" selected={@kb.repeat_policy == :tap_twice}>
                        tap twice
                      </option>
                    </select>
                  </label>
                </form>
              </div>

              <div :if={@panel == :combos} class="space-y-2 text-sm">
                <table class="table table-xs">
                  <thead>
                    <tr>
                      <th>Keys</th><th>Output</th><th>Layers</th><th>Role</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr :for={c <- @kb.combos}>
                      <td class="font-mono">{Enum.join(c.keys, "+")}</td>
                      <td class="font-mono">{Labels.tap_label(@compiled, c.binding)}</td>
                      <td class="text-xs">
                        {if c.layers, do: Enum.join(c.layers, ", "), else: "all"}
                      </td>
                      <td>
                        <button
                          type="button"
                          class={["badge badge-xs", c.role == :typing && "badge-primary"]}
                          phx-click="toggle_combo_role"
                          phx-value-id={c.id}
                        >{c.role}</button>
                      </td>
                      <td>
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          phx-click="remove_combo"
                          phx-value-id={c.id}
                        >✕</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <form phx-submit="add_combo" class="flex flex-wrap gap-2 items-end">
                  <label class="form-control"><span class="label-text text-xs">Keys (e.g. LHR+LHM)</span><input
                    name="keys"
                    class="input input-sm input-bordered font-mono w-40"
                  /></label>
                  <label class="form-control"><span class="label-text text-xs">Output</span><input
                    name="symbol"
                    class="input input-sm input-bordered font-mono w-20"
                  /></label>
                  <label class="form-control">
                    <span class="label-text text-xs">Role</span>
                    <select name="role" class="select select-sm select-bordered"><option value="typing">
                      typing
                    </option><option value="command">command</option></select>
                  </label>
                  <button type="submit" class="btn btn-sm btn-outline">Add combo on {Enum.at(
                    @kb.layers,
                    @layer
                  ).name}</button>
                </form>
                <p class="text-xs opacity-60">
                  Only <em>typing</em> combos are offered to the simulator as ways to type a symbol.
                </p>
              </div>

              <div :if={@panel == :behaviors} class="space-y-2 text-sm">
                <p class="text-xs opacity-70">
                  Named behaviors (adaptive/magic keys, mod-morphs, macros) as JSON. Reference them from keys with kind <code>ref</code>.
                </p>
                <form phx-submit="behaviors_apply" phx-change="behaviors_change">
                  <textarea
                    name="json"
                    rows="14"
                    class="textarea textarea-bordered w-full font-mono text-xs"
                    phx-debounce="500"
                  >{@behaviors_json}</textarea>
                  <p :if={@behaviors_error} class="text-error text-xs">{@behaviors_error}</p>
                  <button type="submit" class="btn btn-sm btn-primary mt-2">Apply behaviors</button>
                </form>
              </div>

              <div :if={@panel == :paths} class="space-y-3 text-sm">
                <p class="text-xs opacity-70">
                  Symbols that can be typed in more than one way. Order = preference; disabled producers are never used.
                </p>
                <p :if={multi_producer_symbols(@producers) == []} class="opacity-60">
                  Every symbol has a single producer.
                </p>
                <div
                  :for={sym <- multi_producer_symbols(@producers)}
                  class="border-b border-base-300 pb-2"
                >
                  <div class="font-mono font-semibold">{sym}</div>
                  <ol class="space-y-1">
                    <li
                      :for={{e, i} <- Enum.with_index(current_path_entries(assigns, sym))}
                      class={["flex items-center gap-2 text-xs", not e.enabled && "opacity-40"]}
                    >
                      <input
                        type="checkbox"
                        class="checkbox checkbox-xs"
                        checked={e.enabled}
                        phx-click="path_toggle"
                        phx-value-symbol={sym}
                        phx-value-producer={e.producer}
                      />
                      <span class="font-mono">{producer_label(@producers, e.producer)}</span>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        phx-click="path_move"
                        phx-value-symbol={sym}
                        phx-value-producer={e.producer}
                        phx-value-dir="up"
                        disabled={i == 0}
                      >↑</button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        phx-click="path_move"
                        phx-value-symbol={sym}
                        phx-value-producer={e.producer}
                        phx-value-dir="down"
                      >↓</button>
                    </li>
                  </ol>
                </div>
              </div>

              <div :if={@panel == :json} class="space-y-2">
                <form phx-submit="import_json" phx-change="json_change">
                  <textarea
                    name="json"
                    rows="16"
                    class="textarea textarea-bordered w-full font-mono text-xs"
                    phx-debounce="500"
                  >{@json_text}</textarea>
                  <p :if={@json_error} class="text-error text-xs">{@json_error}</p>
                  <div class="flex gap-2 mt-2">
                    <button type="button" class="btn btn-xs btn-outline" phx-click="export_json">Refresh from editor</button>
                    <button type="submit" class="btn btn-xs btn-primary">Load into editor</button>
                  </div>
                </form>
              </div>

              <div :if={@panel == :save} class="space-y-2 text-sm">
                <form phx-submit="save" class="flex items-end gap-2">
                  <label class="form-control grow"><span class="label-text text-xs">Name</span><input
                    name="name"
                    value={@kb.name}
                    class="input input-sm input-bordered w-full"
                  /></label>
                  <button type="submit" class="btn btn-sm btn-primary">Save to data repository</button>
                </form>
                <p class="text-xs opacity-60">
                  Saved layouts appear in the Library and can be referenced as <code>saved:&lt;id&gt;</code>.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layouts.app>
    """
  end
end
