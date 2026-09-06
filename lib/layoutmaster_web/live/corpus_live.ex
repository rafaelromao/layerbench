defmodule LayoutMasterWeb.CorpusLive do
  @moduledoc "Corpus view (SPEC §4.1): shipped/saved corpora, facts, custom paste/upload, save to storage."
  use LayoutMasterWeb, :live_view

  import LayoutMasterWeb.Components.Metrics, only: [fmt_num: 2]

  alias LayoutMaster.Corpus
  alias LayoutMaster.Corpus.Normalize
  alias LayoutMaster.Storage

  @impl true
  def mount(_params, _session, socket) do
    corpora = Corpus.available()

    {:ok,
     socket
     |> assign(
       page_title: "Corpus",
       corpora: corpora,
       selected: nil,
       facts: nil,
       custom_text: "",
       custom_name: "My corpus",
       custom_language: "custom",
       custom: nil,
       custom_facts: nil
     )
     |> allow_upload(:file, accept: ~w(.txt .md), max_entries: 1, max_file_size: 5_000_000)}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    case params["id"] || List.first(socket.assigns.corpora) do
      nil -> {:noreply, socket}
      %Corpus{id: id} -> {:noreply, select(socket, id)}
      id -> {:noreply, select(socket, id)}
    end
  end

  defp select(socket, id) do
    case Corpus.load(id) do
      {:ok, corpus} ->
        facts = cached_facts(corpus)
        assign(socket, selected: corpus, facts: facts)

      _ ->
        assign(socket, selected: nil, facts: nil)
    end
  end

  defp cached_facts(%Corpus{} = c) do
    key = {__MODULE__, :facts, c.id}

    case :persistent_term.get(key, nil) do
      nil ->
        stream = Corpus.stream(c, :fold)

        sample =
          if String.length(stream) > 300_000, do: String.slice(stream, 0, 300_000), else: stream

        f = Normalize.facts(sample)
        if not c.custom, do: :persistent_term.put(key, f)
        f

      f ->
        f
    end
  end

  @impl true
  def handle_event("select", %{"id" => id}, socket),
    do: {:noreply, push_patch(socket, to: ~p"/corpus?id=#{id}")}

  def handle_event("custom_change", params, socket) do
    socket =
      assign(socket,
        custom_text: params["text"] || socket.assigns.custom_text,
        custom_name: params["name"] || socket.assigns.custom_name,
        custom_language: params["language"] || socket.assigns.custom_language
      )

    {:noreply, socket}
  end

  def handle_event("custom_build", _params, socket) do
    text =
      case consume_uploaded_entries(socket, :file, fn %{path: path}, _entry ->
             {:ok, File.read!(path)}
           end) do
        [uploaded | _] -> uploaded
        [] -> socket.assigns.custom_text
      end

    if String.length(text) < 1_000 do
      {:noreply, put_flash(socket, :error, "Custom corpus needs at least 1,000 characters")}
    else
      corpus =
        Corpus.custom(text,
          name: socket.assigns.custom_name,
          language: socket.assigns.custom_language
        )
        |> Corpus.register_custom()

      {:noreply,
       assign(socket, custom: corpus, custom_facts: cached_facts(corpus), custom_text: "")}
    end
  end

  def handle_event("custom_save", _, %{assigns: %{custom: %Corpus{} = c}} = socket) do
    id = Storage.slug(c.name)

    if byte_size(c.sample) > 900_000 do
      {:noreply,
       put_flash(
         socket,
         :error,
         "Sample too large to save (limit 900 kB); it is still usable in this session"
       )}
    else
      case Storage.put(:corpora, id, Corpus.to_doc(c), message: "Save corpus #{c.name}") do
        {:ok, _} ->
          {:noreply,
           socket |> assign(corpora: Corpus.available()) |> put_flash(:info, "Saved corpus #{id}")}

        {:error, reason} ->
          {:noreply, put_flash(socket, :error, "Save failed: #{inspect(reason)}")}
      end
    end
  end

  def handle_event("custom_save", _, socket), do: {:noreply, socket}
  def handle_event("validate_upload", _, socket), do: {:noreply, socket}

  defp top(map, n), do: map |> Enum.sort_by(fn {_k, v} -> -v end) |> Enum.take(n)
  defp pct(count, total), do: if(total > 0, do: count / total * 100, else: 0.0)

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside class="space-y-2">
          <h1 class="text-xl font-semibold">Corpora</h1>
          <ul class="menu bg-base-100 border border-base-300 rounded-box w-full">
            <li :for={c <- @corpora}>
              <a
                class={[@selected && @selected.id == c.id && "active"]}
                phx-click="select"
                phx-value-id={c.id}
              >
                <div>
                  <div class="font-medium">{c.name}</div>
                  <div class="text-[11px] opacity-60">
                    {c.language} · {fmt_num(c.words * 1.0, 0)} words
                  </div>
                </div>
              </a>
            </li>
          </ul>
          <.link
            :if={@selected}
            navigate={~p"/?corpus=#{@selected.id}"}
            class="btn btn-sm btn-primary w-full"
          >Analyze with this corpus</.link>
        </aside>

        <main class="space-y-4">
          <section :if={@selected} class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-4 gap-3">
              <h2 class="text-lg font-semibold">{@selected.name}</h2>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt class="opacity-60">Language</dt><dd>{@selected.language}</dd>
                <dt class="opacity-60">License</dt><dd>{@selected.license}</dd>
                <dt class="opacity-60">Source</dt><dd class="break-all">{@selected.source}</dd>
                <dt class="opacity-60">Description</dt><dd>{@selected.description}</dd>
                <dt class="opacity-60">Size</dt><dd>
                  {fmt_num(@selected.words * 1.0, 0)} words · {fmt_num(
                    byte_size(@selected.sample) / 1000,
                    0
                  )} kB
                </dd>
              </dl>
              <.facts :if={@facts} facts={@facts} />
            </div>
          </section>

          <section class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-4 gap-3">
              <h2 class="text-lg font-semibold">Custom corpus</h2>
              <p class="text-sm opacity-70">
                Paste text (≥ 1,000 characters) or upload a .txt/.md file. It is normalized like the shipped corpora and usable in this session; save it to keep it in the data repository.
              </p>
              <form
                id="custom-corpus-form"
                phx-submit="custom_build"
                phx-change="custom_change"
                class="space-y-2"
              >
                <div class="flex flex-wrap gap-2">
                  <input
                    name="name"
                    value={@custom_name}
                    class="input input-sm input-bordered"
                    placeholder="Name"
                  />
                  <select
                    name="language"
                    aria-label="Language"
                    class="select select-sm select-bordered"
                  >
                    <option :for={l <- ~w(en pt-BR custom)} value={l} selected={@custom_language == l}>
                      {l}
                    </option>
                  </select>
                  <.live_file_input
                    upload={@uploads.file}
                    aria-label="Upload a text file"
                    class="file-input file-input-sm file-input-bordered"
                  />
                </div>
                <textarea
                  name="text"
                  rows="6"
                  class="textarea textarea-bordered w-full font-mono text-xs"
                  placeholder="Paste text here…"
                  phx-debounce="500"
                >{@custom_text}</textarea>
                <div class="flex gap-2">
                  <button type="submit" class="btn btn-sm btn-primary">Build corpus</button>
                  <button
                    :if={@custom}
                    type="button"
                    class="btn btn-sm btn-outline"
                    phx-click="custom_save"
                  >Save to data repository</button>
                  <.link
                    :if={@custom}
                    navigate={~p"/?corpus=#{@custom.id}"}
                    class="btn btn-sm btn-outline"
                  >Analyze with it</.link>
                </div>
              </form>
              <div :if={@custom} class="text-sm">
                <p>
                  <span class="font-medium">{@custom.name}</span>
                  · {fmt_num(@custom.words * 1.0, 0)} words · id <code>{@custom.id}</code>
                </p>
                <.facts :if={@custom_facts} facts={@custom_facts} />
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layouts.app>
    """
  end

  attr :facts, :map, required: true

  defp facts(assigns) do
    ~H"""
    <div class="grid gap-3 md:grid-cols-4 text-xs">
      <div>
        <h3 class="font-semibold mb-1">Letters</h3>
        <ol class="space-y-0.5">
          <li :for={{s, c} <- top(@facts.unigram, 15)} class="flex justify-between font-mono">
            <span>{s}</span><span>{fmt_num(pct(c, @facts.symbols), 2)}%</span>
          </li>
        </ol>
      </div>
      <div>
        <h3 class="font-semibold mb-1">Bigrams</h3>
        <ol class="space-y-0.5">
          <li :for={{s, c} <- top(@facts.bigram, 15)} class="flex justify-between font-mono">
            <span>{s}</span><span>{fmt_num(pct(c, @facts.symbols), 2)}%</span>
          </li>
        </ol>
      </div>
      <div>
        <h3 class="font-semibold mb-1">Trigrams</h3>
        <ol class="space-y-0.5">
          <li :for={{s, c} <- top(@facts.trigram, 15)} class="flex justify-between font-mono">
            <span>{s}</span><span>{fmt_num(pct(c, @facts.symbols), 2)}%</span>
          </li>
        </ol>
      </div>
      <div>
        <h3 class="font-semibold mb-1">Words</h3>
        <ol class="space-y-0.5">
          <li :for={{s, c} <- top(@facts.word_freq, 15)} class="flex justify-between font-mono">
            <span class="truncate">{s}</span><span>{fmt_num(pct(c, @facts.words), 2)}%</span>
          </li>
        </ol>
      </div>
    </div>
    """
  end
end
