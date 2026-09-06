defmodule LayoutMasterWeb.PageController do
  use LayoutMasterWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
