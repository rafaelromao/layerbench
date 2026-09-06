defmodule LayoutMasterWeb.RedirectController do
  use LayoutMasterWeb, :controller

  @doc "Short link for saved layouts: /l/<id> → analyzer."
  def layout(conn, %{"id" => id}) do
    redirect(conn, to: ~p"/?layout=#{"saved:" <> id}")
  end
end

defmodule LayoutMasterWeb.ApiController do
  use LayoutMasterWeb, :controller

  alias LayoutMaster.Layout
  alias LayoutMaster.Layouts
  alias LayoutMaster.Storage

  @doc "JSON export of a bundled or saved layout."
  def layout(conn, %{"id" => id}) do
    case Layouts.get(id) do
      nil ->
        case Storage.get(:layouts, id) do
          {:ok, doc, _} -> json(conn, doc)
          _ -> conn |> put_status(404) |> json(%{error: "not found"})
        end

      layout ->
        json(conn, Layout.to_map(layout))
    end
  end
end
