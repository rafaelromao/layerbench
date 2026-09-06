defmodule LayoutMasterWeb.RulesLive do
  @moduledoc "Rules view (SPEC §4.1): presets, per-rule toggles/weights/params, composer, import/export, save."
  use LayoutMasterWeb, :live_view

  alias LayoutMaster.Rules.Catalog
  alias LayoutMaster.Rules.Presets
  alias LayoutMaster.Rules.Serialize
  alias LayoutMaster.Storage
  alias LayoutMasterWeb.Live.RuleSets

  @families [
    {:bigram, "Bigrams"},
    {:skipgram, "Skipgrams"},
    {:trigram, "Trigrams"},
    {:usage, "Usage & balance"},
    {:effort, "Effort"},
    {:layer, "Layers"},
    {:other, "Other"}
  ]

  @predicate_types [
    {"same_hand", "same hand", :bool},
    {"same_finger", "same finger", :bool},
    {"same_key", "same key", :bool},
    {"adjacent_fingers", "adjacent fingers", :bool},
    {"any_thumb", "involves thumb", :bool},
    {"is_inner", "inner column (all keys)", :bool},
    {"any_inner", "involves inner column", :bool},
    {"row_delta_abs", "rows apart (=)", :int},
    {"row_delta_abs_min", "rows apart (≥)", :int},
    {"rank_delta", "finger rank distance (=)", :int},
    {"x_distance_min", "horizontal distance ≥ U", :float},
    {"direction", "direction (inward/outward)", :direction},
    {"hand_pattern", "hand pattern (aba, aab, aaa…)", :text},
    {"monotone", "same direction (3-key)", :bool},
    {"changes_direction", "changes direction (3-key)", :bool},
    {"finger_name", "finger (all keys)", :finger},
    {"includes_finger_name", "involves finger", :finger},
    {"row", "row (all keys)", :row},
    {"key_kind", "key kind (all keys)", :kind},
    {"finger_height_preference", "finger height preference violated", :flag}
  ]

  @impl true
  def mount(_params, _session, socket) do
    rs = Presets.layouts_doc()

    {:ok,
     socket
     |> assign(
       page_title: "Rules",
       presets: Presets.all(),
       saved: RuleSets.saved(),
       rule_set: rs,
       source_ref: "layouts_doc",
       families: @families,
       predicate_types: @predicate_types,
       composer: new_composer(),
       json_text: "",
       json_error: nil,
       save_name: rs.name,
       dirty: false
     )}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    case params["rules"] do
      nil ->
        {:noreply, socket}

      ref ->
        {:noreply, assign(socket, rule_set: RuleSets.resolve(ref), source_ref: ref, dirty: false)}
    end
  end

  defp new_composer do
    %{
      id: "",
      label: "",
      family: "bigram",
      n: "2",
      skip: "0",
      aggregate: "percent_of_ngrams",
      combinator: "all",
      predicates: [%{type: "same_hand", value: "true"}],
      direction: "lower_is_better",
      weight: "0"
    }
  end

  # ------------------------------------------------------------------ events

  @impl true
  def handle_event("load_preset", %{"ref" => ref}, socket) do
    {:noreply,
     socket
     |> assign(
       rule_set: RuleSets.resolve(ref),
       source_ref: ref,
       dirty: false,
       save_name: RuleSets.resolve(ref).name
     )
     |> push_patch(to: ~p"/rules?rules=#{ref}")}
  end

  def handle_event("toggle_rule", %{"id" => id}, socket) do
    {:noreply,
     update_rule(socket, id, fn r -> Map.put(r, :enabled, not Map.get(r, :enabled, true)) end)}
  end

  def handle_event("remove_rule", %{"id" => id}, socket) do
    rs = socket.assigns.rule_set

    {:noreply,
     assign(socket, rule_set: %{rs | rules: Enum.reject(rs.rules, &(&1.id == id))}, dirty: true)}
  end

  def handle_event("restore_rule", %{"id" => id}, socket) do
    case Catalog.get(id) do
      nil ->
        {:noreply, socket}

      rule ->
        rs = socket.assigns.rule_set
        {:noreply, assign(socket, rule_set: %{rs | rules: rs.rules ++ [rule]}, dirty: true)}
    end
  end

  def handle_event("set_weight", %{"rule" => id, "value" => v}, socket) do
    w = parse_float(v, 0.0)
    {:noreply, update_rule(socket, id, fn r -> Map.put(r, :score, %{weight: w}) end)}
  end

  def handle_event("set_bounds", %{"rule" => id, "value" => v}, socket) do
    bounds =
      v
      |> String.split(~r/[,\s]+/, trim: true)
      |> Enum.map(&parse_float(&1, nil))
      |> Enum.reject(&is_nil/1)

    {:noreply,
     update_rule(socket, id, fn r ->
       if bounds == [],
         do: Map.delete(r, :bands),
         else:
           Map.put(
             r,
             :bands,
             Map.merge(r[:bands] || %{direction: :lower_is_better}, %{bounds: bounds})
           )
     end)}
  end

  def handle_event("set_global", %{"name" => name, "value" => v}, socket) do
    rs = socket.assigns.rule_set
    key = String.to_existing_atom(name)

    value =
      case key do
        :skip_weights ->
          v |> String.split(~r/[,\s]+/, trim: true) |> Enum.map(&parse_float(&1, 0.0))

        k when k in [:lsb_adjacent_u, :lsb_semi_adjacent_u] ->
          parse_float(v, 2.0)

        :top_items ->
          String.to_integer(v)

        :repeats_count_as_sfb ->
          v == "true"

        :space_per_word_in_keystrokes ->
          v == "true"

        _ ->
          String.to_existing_atom(v)
      end

    {:noreply,
     assign(socket, rule_set: %{rs | globals: Map.put(rs.globals, key, value)}, dirty: true)}
  end

  def handle_event("toggle_score", _, socket) do
    rs = socket.assigns.rule_set

    {:noreply,
     assign(socket,
       rule_set: %{rs | score_enabled: not Map.get(rs, :score_enabled, false)},
       dirty: true
     )}
  end

  def handle_event("composer_change", %{"composer" => c}, socket) do
    predicates =
      (c["predicates"] || %{})
      |> Enum.sort_by(fn {k, _} -> String.to_integer(k) end)
      |> Enum.map(fn {_k, v} -> %{type: v["type"] || "same_hand", value: v["value"] || ""} end)

    composer =
      socket.assigns.composer
      |> Map.merge(atomize_composer(c))
      |> Map.put(
        :predicates,
        if(predicates == [], do: socket.assigns.composer.predicates, else: predicates)
      )

    {:noreply, assign(socket, composer: composer)}
  end

  def handle_event("composer_add_predicate", _, socket) do
    c = socket.assigns.composer

    {:noreply,
     assign(socket,
       composer: %{c | predicates: c.predicates ++ [%{type: "same_finger", value: "true"}]}
     )}
  end

  def handle_event("composer_remove_predicate", %{"index" => i}, socket) do
    c = socket.assigns.composer

    {:noreply,
     assign(socket,
       composer: %{c | predicates: List.delete_at(c.predicates, String.to_integer(i))}
     )}
  end

  def handle_event("composer_add_rule", params, socket) do
    # Prefer the submitted form values (a submit may arrive without a prior phx-change).
    c =
      case params do
        %{"composer" => submitted} when is_map(submitted) ->
          predicates =
            (submitted["predicates"] || %{})
            |> Enum.sort_by(fn {k, _} -> String.to_integer(k) end)
            |> Enum.map(fn {_k, v} ->
              %{type: v["type"] || "same_hand", value: v["value"] || ""}
            end)

          socket.assigns.composer
          |> Map.merge(atomize_composer(submitted))
          |> Map.put(
            :predicates,
            if(predicates == [], do: socket.assigns.composer.predicates, else: predicates)
          )

        _ ->
          socket.assigns.composer
      end

    id =
      if c.id == "",
        do: "custom_" <> Integer.to_string(System.unique_integer([:positive])),
        else: Storage.slug(c.id)

    rule = build_rule(c, id)
    rs = socket.assigns.rule_set

    {:noreply,
     socket
     |> assign(rule_set: %{rs | rules: rs.rules ++ [rule]}, composer: new_composer(), dirty: true)
     |> put_flash(:info, "Rule #{id} added")}
  end

  def handle_event("export", _, socket) do
    {:noreply,
     assign(socket, json_text: Serialize.to_json(socket.assigns.rule_set), json_error: nil)}
  end

  def handle_event("import_change", %{"json" => json}, socket),
    do: {:noreply, assign(socket, json_text: json)}

  def handle_event("import", %{"json" => json}, socket) do
    case Serialize.from_json(json) do
      {:ok, %{rules: rules} = rs} when is_list(rules) ->
        {:noreply,
         assign(socket,
           rule_set: Map.merge(Presets.layouts_doc(), rs),
           json_error: nil,
           dirty: true
         )}

      {:ok, _} ->
        {:noreply, assign(socket, json_error: "rule set needs a rules list")}

      {:error, e} ->
        {:noreply, assign(socket, json_error: e)}
    end
  end

  def handle_event("save", %{"name" => name}, socket) do
    rs = %{socket.assigns.rule_set | name: name}
    id = Storage.slug(name)
    rs = Map.put(rs, :id, id)

    case Storage.put(:rulesets, id, Serialize.to_map(rs), message: "Save rule set #{name}") do
      {:ok, _} ->
        {:noreply,
         socket
         |> assign(
           rule_set: rs,
           saved: RuleSets.saved(),
           source_ref: "saved:" <> id,
           dirty: false
         )
         |> put_flash(:info, "Saved rule set #{id}")}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, "Save failed: #{inspect(reason)}")}
    end
  end

  # ----------------------------------------------------------------- helpers

  defp update_rule(socket, id, fun) do
    rs = socket.assigns.rule_set

    assign(socket,
      rule_set: %{rs | rules: Enum.map(rs.rules, fn r -> if r.id == id, do: fun.(r), else: r end)},
      dirty: true
    )
  end

  defp parse_float(v, default) do
    case Float.parse(String.trim(to_string(v))) do
      {f, _} -> f
      :error -> default
    end
  end

  defp atomize_composer(c) do
    c
    |> Map.take(~w(id label family n skip aggregate combinator direction weight))
    |> Map.new(fn {k, v} -> {String.to_atom(k), v} end)
  end

  defp build_rule(c, id) do
    preds = Enum.map(c.predicates, &predicate_leaf/1) |> Enum.reject(&is_nil/1)

    where =
      case c.combinator do
        "any" -> %{any: preds}
        "none" -> %{none: preds}
        _ -> %{all: preds}
      end

    n = String.to_integer(c.n)

    skip =
      case c.skip do
        "1-3" -> [1, 2, 3]
        s -> String.to_integer(s)
      end

    %{
      id: id,
      label: if(c.label == "", do: id, else: c.label),
      family: String.to_existing_atom(c.family),
      enabled: true,
      source: :ngram,
      ngram: %{n: n, skip: skip},
      params: %{finger_height_preference: %{middle: 3, ring: 2, pinky: 1, index: 0}},
      where: where,
      aggregate: String.to_existing_atom(c.aggregate),
      bands: nil,
      score: %{weight: parse_float(c.weight, 0.0)},
      description: "Custom rule"
    }
    |> Map.reject(fn {_k, v} -> is_nil(v) end)
  end

  defp predicate_leaf(%{type: type, value: value}) do
    case type do
      "row_delta_abs" -> %{row_delta: %{abs: String.to_integer(value)}}
      "row_delta_abs_min" -> %{row_delta: %{abs_min: String.to_integer(value)}}
      "rank_delta" -> %{rank_delta: %{eq: String.to_integer(value)}}
      "x_distance_min" -> %{x_distance: %{min: parse_float(value, 2.0)}}
      "direction" -> %{direction: String.to_existing_atom(value)}
      "hand_pattern" -> %{hand_pattern: value}
      "finger_name" -> %{finger_name: %{in: [String.to_existing_atom(value)]}}
      "includes_finger_name" -> %{includes_finger_name: %{in: [String.to_existing_atom(value)]}}
      "row" -> %{row: %{in: [String.to_integer(value)]}}
      "key_kind" -> %{key_kind: %{in: [String.to_existing_atom(value)]}}
      "finger_height_preference" -> %{finger_height_preference: :violated}
      bool_type -> %{String.to_existing_atom(bool_type) => value == "true"}
    end
  rescue
    _ -> nil
  end

  defp rules_by_family(rs, family),
    do: Enum.filter(rs.rules, &(Map.get(&1, :family, :other) == family))

  defp removed_builtin(rs),
    do: Enum.reject(Catalog.all(), fn c -> Enum.any?(rs.rules, &(&1.id == c.id)) end)

  defp describe_where(nil), do: "—"

  defp describe_where(%{all: list}),
    do: "all(" <> Enum.map_join(list, ", ", &describe_where/1) <> ")"

  defp describe_where(%{any: list}),
    do: "any(" <> Enum.map_join(list, ", ", &describe_where/1) <> ")"

  defp describe_where(%{none: list}),
    do: "none(" <> Enum.map_join(list, ", ", &describe_where/1) <> ")"

  defp describe_where(leaf) when is_map(leaf) do
    leaf |> Enum.map_join(" ", fn {k, v} -> "#{k}=#{inspect(v)}" end)
  end

  defp bounds_text(%{bands: %{bounds: b}}), do: Enum.map_join(b, ", ", &to_string/1)
  defp bounds_text(_), do: ""

  # ------------------------------------------------------------------ render

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <h1 class="sr-only">Rules</h1>
      <div class="space-y-4">
        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-3 gap-3">
            <div class="flex flex-wrap items-end gap-3">
              <form id="rule-set-form" phx-change="load_preset" class="form-control">
                <span class="label-text text-xs">Rule set</span>
                <select
                  name="ref"
                  aria-label="Rule set"
                  class="select select-sm select-bordered min-w-56"
                >
                  <optgroup label="Presets">
                    <option :for={p <- @presets} value={p.id} selected={@source_ref == p.id}>
                      {p.name}
                    </option>
                  </optgroup>
                  <optgroup :if={@saved != []} label="Saved">
                    <option
                      :for={s <- @saved}
                      value={"saved:" <> s["id"]}
                      selected={@source_ref == "saved:" <> s["id"]}
                    >
                      {s["name"]}
                    </option>
                  </optgroup>
                </select>
              </form>
              <p class="text-sm opacity-70 max-w-xl">{@rule_set.description}</p>
              <span :if={@dirty} class="badge badge-warning badge-sm">unsaved changes</span>
              <form phx-submit="save" class="ml-auto flex items-end gap-2">
                <label class="form-control">
                  <span class="label-text text-xs">Save as</span>
                  <input name="name" value={@save_name} class="input input-sm input-bordered" />
                </label>
                <button type="submit" class="btn btn-sm btn-primary">Save</button>
              </form>
              <.link
                :if={@source_ref}
                navigate={~p"/?rules=#{@source_ref}"}
                class="btn btn-sm btn-outline"
              >Analyze with this set</.link>
            </div>

            <form
              id="globals-form"
              phx-change="set_global"
              class="flex flex-wrap items-end gap-3 text-xs border-t border-base-300 pt-3"
            >
              <.global_select
                name="universe"
                label="Universe"
                value={Map.get(@rule_set.globals, :universe, :no_space)}
                options={[no_space: "no space", with_space: "with space"]}
              />
              <.global_select
                name="cross_word"
                label="Word boundary"
                value={Map.get(@rule_set.globals, :cross_word, :reset)}
                options={[reset: "reset n-grams", bridge: "bridge words"]}
              />
              <.global_select
                name="distance_model"
                label="Distance"
                value={Map.get(@rule_set.globals, :distance_model, :euclid)}
                options={[euclid: "euclid", squared: "squared", manhattan: "manhattan"]}
              />
              <.global_select
                name="normalization"
                label="Normalization"
                value={Map.get(@rule_set.globals, :normalization, :percent_of_ngrams)}
                options={[percent_of_ngrams: "% of n-grams", percent_of_keystrokes: "% of keystrokes"]}
              />
              <label class="form-control">
                <span class="label-text text-xs">Skip weights</span>
                <input
                  name="value"
                  phx-value-name="skip_weights"
                  value={
                    Enum.join(Map.get(@rule_set.globals, :skip_weights, [0.5, 0.25, 0.125]), ", ")
                  }
                  class="input input-xs input-bordered w-32"
                  data-name="skip_weights"
                />
                <input type="hidden" name="name" value="skip_weights" />
              </label>
              <label class="form-control">
                <span class="label-text text-xs">LSB adjacent (U)</span>
                <input
                  type="number"
                  step="0.25"
                  name="value"
                  value={Map.get(@rule_set.globals, :lsb_adjacent_u, 2.0)}
                  class="input input-xs input-bordered w-20"
                />
                <input type="hidden" name="name" value="lsb_adjacent_u" />
              </label>
              <label class="label cursor-pointer gap-2">
                <span>Composite score</span>
                <input
                  type="checkbox"
                  class="toggle toggle-xs"
                  checked={Map.get(@rule_set, :score_enabled, false)}
                  phx-click="toggle_score"
                />
              </label>
            </form>
          </div>
        </section>

        <section
          :for={{family, title} <- @families}
          :if={rules_by_family(@rule_set, family) != []}
          class="card bg-base-100 border border-base-300 shadow-sm"
        >
          <div class="card-body p-3 gap-2">
            <h2 class="font-semibold">{title}</h2>
            <div class="overflow-x-auto">
              <table class="table table-xs min-w-[56rem]">
                <thead>
                  <tr>
                    <th></th><th>Rule</th><th>Definition</th><th>Aggregate</th><th>
                      Bands (upper bounds)
                    </th><th>Weight</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    :for={r <- rules_by_family(@rule_set, family)}
                    class={[not Map.get(r, :enabled, true) && "opacity-40"]}
                  >
                    <td>
                      <input
                        type="checkbox"
                        class="checkbox checkbox-xs"
                        aria-label={"Enable #{r.label}"}
                        checked={Map.get(r, :enabled, true)}
                        phx-click="toggle_rule"
                        phx-value-id={r.id}
                      />
                    </td>
                    <td>
                      <div class="font-medium">{r.label}</div>
                      <div class="text-[11px] opacity-60 max-w-xs">{Map.get(r, :description)}</div>
                      <div class="text-[10px] font-mono opacity-50">{r.id}</div>
                    </td>
                    <td class="font-mono text-[11px] max-w-md break-words">
                      <span :if={Map.get(r, :source, :ngram) == :ngram}>n={get_in(r, [:ngram, :n])} skip={inspect(
                        get_in(r, [:ngram, :skip])
                      )} · </span>
                      <span :if={Map.get(r, :source, :ngram) != :ngram}>source={r.source} {Map.get(
                        r,
                        :stat
                      )} · </span>
                      {describe_where(Map.get(r, :where))}
                    </td>
                    <td class="text-[11px]">{Map.get(r, :aggregate, :percent_of_ngrams)}</td>
                    <td>
                      <form id={"bounds-#{r.id}"} phx-change="set_bounds">
                        <input type="hidden" name="rule" value={r.id} />
                        <input
                          name="value"
                          value={bounds_text(r)}
                          placeholder="e.g. 0.5, 1, 1.5"
                          aria-label={"Band bounds for #{r.label}"}
                          class="input input-xs input-bordered w-44 font-mono"
                          phx-debounce="500"
                        />
                      </form>
                    </td>
                    <td>
                      <form id={"weight-#{r.id}"} phx-change="set_weight">
                        <input type="hidden" name="rule" value={r.id} />
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          name="value"
                          value={get_in(r, [:score, :weight]) || 0}
                          aria-label={"Score weight for #{r.label}"}
                          class="input input-xs input-bordered w-16"
                          phx-debounce="500"
                        />
                      </form>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        phx-click="remove_rule"
                        phx-value-id={r.id}
                        title="Remove rule"
                      >✕</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section :if={removed_builtin(@rule_set) != []} class="text-sm">
          <span class="opacity-70">Removed built-ins:</span>
          <button
            :for={r <- removed_builtin(@rule_set)}
            type="button"
            class="btn btn-xs btn-outline ml-1"
            phx-click="restore_rule"
            phx-value-id={r.id}
          >+ {r.label}</button>
        </section>

        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-3 gap-3">
            <h2 class="font-semibold">Compose a new rule</h2>
            <form
              id="composer-form"
              phx-change="composer_change"
              phx-submit="composer_add_rule"
              class="space-y-3"
            >
              <div class="flex flex-wrap gap-3 items-end">
                <label class="form-control"><span class="label-text text-xs">Id</span><input
                  name="composer[id]"
                  value={@composer.id}
                  class="input input-sm input-bordered w-36"
                  placeholder="my_rule"
                /></label>
                <label class="form-control"><span class="label-text text-xs">Label</span><input
                  name="composer[label]"
                  value={@composer.label}
                  class="input input-sm input-bordered w-56"
                /></label>
                <label class="form-control">
                  <span class="label-text text-xs">Family</span>
                  <select name="composer[family]" class="select select-sm select-bordered">
                    <option
                      :for={{f, t} <- @families}
                      value={f}
                      selected={@composer.family == Atom.to_string(f)}
                    >
                      {t}
                    </option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">N-gram</span>
                  <select name="composer[n]" class="select select-sm select-bordered">
                    <option :for={n <- ["1", "2", "3"]} value={n} selected={@composer.n == n}>
                      {n}
                    </option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">Skip</span>
                  <select name="composer[skip]" class="select select-sm select-bordered">
                    <option
                      :for={s <- ["0", "1", "2", "3", "1-3"]}
                      value={s}
                      selected={@composer.skip == s}
                    >
                      {s}
                    </option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">Aggregate</span>
                  <select name="composer[aggregate]" class="select select-sm select-bordered">
                    <option
                      :for={
                        a <-
                          ~w(percent_of_ngrams percent_of_keystrokes count sum_distance mean_distance per_finger per_hand)
                      }
                      value={a}
                      selected={@composer.aggregate == a}
                    >
                      {a}
                    </option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">Combine</span>
                  <select name="composer[combinator]" class="select select-sm select-bordered">
                    <option
                      :for={c <- ~w(all any none)}
                      value={c}
                      selected={@composer.combinator == c}
                    >
                      {c}
                    </option>
                  </select>
                </label>
                <label class="form-control"><span class="label-text text-xs">Score weight</span><input
                  type="number"
                  step="0.5"
                  min="0"
                  name="composer[weight]"
                  value={@composer.weight}
                  class="input input-sm input-bordered w-20"
                /></label>
              </div>
              <div class="space-y-2">
                <div
                  :for={{p, i} <- Enum.with_index(@composer.predicates)}
                  class="flex items-center gap-2"
                >
                  <select
                    name={"composer[predicates][#{i}][type]"}
                    aria-label={"Predicate #{i + 1} type"}
                    class="select select-sm select-bordered"
                  >
                    <option
                      :for={{t, label, _kind} <- @predicate_types}
                      value={t}
                      selected={p.type == t}
                    >
                      {label}
                    </option>
                  </select>
                  <.predicate_value
                    type={p.type}
                    value={p.value}
                    name={"composer[predicates][#{i}][value]"}
                    types={@predicate_types}
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs"
                    phx-click="composer_remove_predicate"
                    phx-value-index={i}
                    aria-label={"Remove predicate #{i + 1}"}
                  >✕</button>
                </div>
                <button
                  type="button"
                  class="btn btn-xs btn-outline"
                  phx-click="composer_add_predicate"
                >+ predicate</button>
              </div>
              <button type="submit" class="btn btn-sm btn-primary">Add rule to set</button>
            </form>
          </div>
        </section>

        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-3 gap-2">
            <div class="flex items-center gap-2">
              <h2 class="font-semibold">JSON</h2>
              <button type="button" class="btn btn-xs btn-outline" phx-click="export">Export current</button>
            </div>
            <form
              id="rules-json-form"
              phx-submit="import"
              phx-change="import_change"
              class="space-y-2"
            >
              <textarea
                name="json"
                aria-label="Rule set JSON"
                rows="8"
                class="textarea textarea-bordered w-full font-mono text-xs"
                phx-debounce="500"
              >{@json_text}</textarea>
              <p :if={@json_error} class="text-error text-sm">{@json_error}</p>
              <button type="submit" class="btn btn-xs btn-outline">Import (replace current)</button>
            </form>
          </div>
        </section>
      </div>
    </Layouts.app>
    """
  end

  attr :name, :string, required: true
  attr :label, :string, required: true
  attr :value, :any, required: true
  attr :options, :list, required: true

  defp global_select(assigns) do
    ~H"""
    <label class="form-control">
      <span class="label-text text-xs">{@label}</span>
      <select
        name="value"
        class="select select-xs select-bordered"
        phx-change="set_global"
        data-name={@name}
      >
        <option :for={{v, l} <- @options} value={v} selected={@value == v}>{l}</option>
      </select>
      <input type="hidden" name="name" value={@name} />
    </label>
    """
  end

  attr :type, :string, required: true
  attr :value, :string, required: true
  attr :name, :string, required: true
  attr :types, :list, required: true

  defp predicate_value(assigns) do
    kind = Enum.find_value(assigns.types, :text, fn {t, _l, k} -> if t == assigns.type, do: k end)
    assigns = assign(assigns, kind: kind)

    ~H"""
    <select
      :if={@kind == :bool}
      name={@name}
      aria-label="Predicate value"
      class="select select-sm select-bordered"
    >
      <option value="true" selected={@value == "true"}>true</option>
      <option value="false" selected={@value == "false"}>false</option>
    </select>
    <select
      :if={@kind == :direction}
      name={@name}
      aria-label="Predicate value"
      class="select select-sm select-bordered"
    >
      <option :for={d <- ~w(inward outward)} value={d} selected={@value == d}>{d}</option>
    </select>
    <select
      :if={@kind == :finger}
      name={@name}
      aria-label="Predicate value"
      class="select select-sm select-bordered"
    >
      <option :for={f <- ~w(pinky ring middle index thumb)} value={f} selected={@value == f}>
        {f}
      </option>
    </select>
    <select
      :if={@kind == :row}
      name={@name}
      aria-label="Predicate value"
      class="select select-sm select-bordered"
    >
      <option
        :for={{r, l} <- [{"0", "top"}, {"1", "home"}, {"2", "bottom"}, {"3", "thumb"}]}
        value={r}
        selected={@value == r}
      >
        {l}
      </option>
    </select>
    <select
      :if={@kind == :kind}
      name={@name}
      aria-label="Predicate value"
      class="select select-sm select-bordered"
    >
      <option
        :for={k <- ~w(alpha layer_tap shift space repeat magic combo hold)}
        value={k}
        selected={@value == k}
      >
        {k}
      </option>
    </select>
    <input
      :if={@kind in [:int, :float, :text]}
      name={@name}
      value={@value}
      aria-label="Predicate value"
      class="input input-sm input-bordered w-28"
    />
    <input :if={@kind == :flag} type="hidden" name={@name} value="violated" />
    """
  end
end
