defmodule LayoutMasterWeb.Components.Nav do
  @moduledoc "Top navigation used by the app layout."
  use Phoenix.Component
  use Phoenix.VerifiedRoutes, endpoint: LayoutMasterWeb.Endpoint, router: LayoutMasterWeb.Router

  attr :current, :string, default: nil

  def nav(assigns) do
    ~H"""
    <nav class="navbar bg-base-100 border-b border-base-300 px-3 min-h-12" aria-label="Main">
      <div class="flex-1 flex items-center gap-3">
        <.link navigate={~p"/"} class="font-semibold tracking-tight">
          <span class="text-primary">Layout</span>Master
        </.link>
        <ul class="menu menu-horizontal menu-sm px-0 hidden sm:flex">
          <li :for={{path, label} <- items()}>
            <.link navigate={path} class={[@current == path && "active"]}>{label}</.link>
          </li>
        </ul>
      </div>
      <div class="flex-none flex items-center gap-2">
        <details class="dropdown dropdown-end sm:hidden">
          <summary class="btn btn-ghost btn-sm">Menu</summary>
          <ul class="menu dropdown-content bg-base-100 rounded-box z-10 w-40 p-2 shadow border border-base-300">
            <li :for={{path, label} <- items()}><.link navigate={path}>{label}</.link></li>
          </ul>
        </details>
        <a
          href="https://github.com/rafaelromao/layoutmaster"
          class="btn btn-ghost btn-xs"
          target="_blank"
          rel="noopener"
        >spec</a>
      </div>
    </nav>
    """
  end

  defp items do
    [
      {~p"/", "Analyze"},
      {~p"/edit", "Edit"},
      {~p"/compare", "Compare"},
      {~p"/rules", "Rules"},
      {~p"/corpus", "Corpus"},
      {~p"/library", "Library"}
    ]
  end
end
