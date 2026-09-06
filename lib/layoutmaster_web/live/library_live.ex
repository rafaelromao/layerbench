defmodule LayoutMasterWeb.LibraryLive do
  @moduledoc "Library view (SPEC §4.1): bundled and saved layouts, import text/JSON, share links."
  use LayoutMasterWeb, :live_view

  import LayoutMasterWeb.Components.Keyboard

  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Layout.Text
  alias LayoutMaster.Layouts, as: Bundled
  alias LayoutMaster.Storage
  alias LayoutMasterWeb.Live.Params

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(
       page_title: "Library",
       bundled: Enum.map(Bundled.all(), &{&1, Compile.compile!(&1)}),
       saved: saved(),
       import_text: "",
       import_preset: "3x5+2",
       import_name: "Imported layout",
       import_error: nil,
       import_preview: nil,
       storage_ok: storage_ok?()
     )}
  end

  defp saved do
    case Storage.list(:layouts) do
      {:ok, list} -> list
      _ -> []
    end
  end

  defp storage_ok? do
    case Storage.list(:layouts) do
      {:ok, _} -> true
      _ -> false
    end
  end

  @impl true
  def handle_event("import_change", params, socket) do
    text = params["text"] || socket.assigns.import_text
    preset = params["preset"] || socket.assigns.import_preset
    name = params["name"] || socket.assigns.import_name
    socket = assign(socket, import_text: text, import_preset: preset, import_name: name)

    cond do
      String.trim(text) == "" ->
        {:noreply, assign(socket, import_preview: nil, import_error: nil)}

      String.starts_with?(String.trim(text), "{") ->
        case Layout.decode(text) do
          {:ok, layout} ->
            case Compile.compile(layout) do
              {:ok, compiled} ->
                {:noreply,
                 assign(socket, import_preview: {layout, compiled, []}, import_error: nil)}

              {:error, errs} ->
                {:noreply,
                 assign(socket, import_preview: nil, import_error: Enum.join(errs, "; "))}
            end

          {:error, errs} ->
            {:noreply, assign(socket, import_preview: nil, import_error: Enum.join(errs, "; "))}
        end

      true ->
        {layout, overflow, warnings} = Text.import(text, preset, name)

        case Compile.compile(layout) do
          {:ok, compiled} ->
            {:noreply,
             assign(socket,
               import_preview: {layout, compiled, overflow ++ warnings},
               import_error: nil
             )}

          {:error, errs} ->
            {:noreply, assign(socket, import_preview: nil, import_error: Enum.join(errs, "; "))}
        end
    end
  end

  def handle_event("import_open", _, %{assigns: %{import_preview: {layout, _c, _w}}} = socket) do
    ref = "inline:" <> Params.encode_inline(layout)
    {:noreply, push_navigate(socket, to: ~p"/?layout=#{ref}")}
  end

  def handle_event("import_open", _, socket), do: {:noreply, socket}

  def handle_event("import_save", _, %{assigns: %{import_preview: {layout, _c, _w}}} = socket) do
    id = Storage.slug(layout.name)
    layout = %{layout | id: id}

    case Storage.put(:layouts, id, Layout.to_map(layout), message: "Import layout #{layout.name}") do
      {:ok, _} ->
        {:noreply,
         socket
         |> assign(saved: saved(), import_preview: nil, import_text: "")
         |> put_flash(:info, "Saved #{layout.name} as #{id}")}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, "Save failed: #{inspect(reason)}")}
    end
  end

  def handle_event("import_save", _, socket), do: {:noreply, socket}

  def handle_event("delete", %{"id" => id}, socket) do
    case Storage.delete(:layouts, id, message: "Delete layout #{id}") do
      :ok ->
        {:noreply, socket |> assign(saved: saved()) |> put_flash(:info, "Deleted #{id}")}

      {:error, reason} ->
        {:noreply, put_flash(socket, :error, "Delete failed: #{inspect(reason)}")}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="space-y-6">
        <section>
          <h1 class="text-xl font-semibold mb-3">Bundled layouts</h1>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article
              :for={{layout, compiled} <- @bundled}
              class="card bg-base-100 border border-base-300 shadow-sm"
            >
              <div class="card-body p-3 gap-2">
                <header class="flex items-start justify-between gap-2">
                  <div>
                    <h2 class="font-semibold">{layout.name}</h2>
                    <p class="text-xs opacity-60">
                      {layout.author} · {compiled.geometry.id} · {compiled.n_layers} layer(s) · {Enum.join(
                        layout.languages,
                        ", "
                      )}
                    </p>
                  </div>
                  <.link navigate={~p"/?layout=#{layout.id}"} class="btn btn-sm btn-primary">Analyze</.link>
                </header>
                <.keyboard
                  id={"kb-#{layout.id}"}
                  compiled={compiled}
                  layer={0}
                  interactive={false}
                  show_hold={false}
                  class="opacity-90"
                />
                <p :if={layout.description} class="text-xs opacity-70">{layout.description}</p>
              </div>
            </article>
          </div>
        </section>

        <section>
          <div class="flex items-center justify-between mb-3">
            <h1 class="text-xl font-semibold">Saved layouts</h1>
            <span :if={not @storage_ok} class="badge badge-warning">storage unavailable</span>
          </div>
          <p :if={@saved == []} class="text-sm opacity-60">
            Nothing saved yet. Save from the editor or import below.
          </p>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article :for={s <- @saved} class="card bg-base-100 border border-base-300 shadow-sm">
              <div class="card-body p-3 gap-2">
                <header class="flex items-start justify-between gap-2">
                  <div>
                    <h2 class="font-semibold">{s["name"]}</h2>
                    <p class="text-xs opacity-60">
                      {s["author"]} · {s["geometry"]} · {s["layers"]} layer(s) · updated {String.slice(
                        s["updatedAt"] || "",
                        0,
                        10
                      )}
                    </p>
                  </div>
                  <div class="flex gap-1">
                    <.link
                      navigate={~p"/?layout=#{"saved:" <> s["id"]}"}
                      class="btn btn-sm btn-primary"
                    >Analyze</.link>
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      phx-click="delete"
                      phx-value-id={s["id"]}
                      data-confirm="Delete this saved layout?"
                    >Delete</button>
                  </div>
                </header>
              </div>
            </article>
          </div>
        </section>

        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-4 gap-3">
            <h1 class="text-xl font-semibold">Import</h1>
            <p class="text-sm opacity-70">
              Paste a native JSON layout, three rows of letters (space separated, optional 4th row for thumbs with <code>space</code>), a 30-character cmini string, or a cyanophage 34-character string.
            </p>
            <form
              id="import-form"
              phx-change="import_change"
              phx-submit="import_open"
              class="grid gap-3 md:grid-cols-[1fr_auto]"
            >
              <textarea
                name="text"
                rows="5"
                class="textarea textarea-bordered font-mono text-sm"
                placeholder="q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /\nspace"
                phx-debounce="400"
              >{@import_text}</textarea>
              <div class="flex flex-col gap-2">
                <label class="form-control">
                  <span class="label-text text-xs">Name</span>
                  <input name="name" value={@import_name} class="input input-sm input-bordered" />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">Geometry (text import)</span>
                  <select name="preset" class="select select-sm select-bordered">
                    <option
                      :for={p <- LayoutMaster.Geometry.preset_ids()}
                      value={p}
                      selected={@import_preset == p}
                    >
                      {p}
                    </option>
                  </select>
                </label>
                <button
                  type="submit"
                  class="btn btn-sm btn-primary"
                  disabled={is_nil(@import_preview)}
                >Open in analyzer</button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  phx-click="import_save"
                  disabled={is_nil(@import_preview) or not @storage_ok}
                >Save to library</button>
              </div>
            </form>
            <p :if={@import_error} class="text-error text-sm">{@import_error}</p>
            <div :if={@import_preview} class="grid gap-2 md:grid-cols-2">
              <% {_layout, compiled, warnings} = @import_preview %>
              <.keyboard
                id="kb-import"
                compiled={compiled}
                layer={0}
                interactive={false}
                show_hold={false}
              />
              <ul :if={warnings != []} class="text-xs text-warning">
                <li :for={w <- warnings}>overflow / warning: {w}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </Layouts.app>
    """
  end
end
