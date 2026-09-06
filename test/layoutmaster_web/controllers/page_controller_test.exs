defmodule LayoutMasterWeb.PageControllerTest do
  use LayoutMasterWeb.ConnCase

  test "GET / renders the analyzer", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "LayoutMaster"
  end

  test "GET /l/:id redirects to the analyzer with a saved layout ref", %{conn: conn} do
    conn = get(conn, ~p"/l/some-layout")
    assert redirected_to(conn) =~ "layout=saved%3Asome-layout"
  end
end
