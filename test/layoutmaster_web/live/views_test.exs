defmodule LayoutMasterWeb.ViewsTest do
  use LayoutMasterWeb.ConnCase, async: false

  import Phoenix.LiveViewTest

  setup do
    root = Path.join(System.tmp_dir!(), "layoutmaster-web-#{System.unique_integer([:positive])}")
    File.mkdir_p!(root)
    prev = Application.get_env(:layoutmaster, :storage_local_root)
    Application.put_env(:layoutmaster, :storage_local_root, root)
    on_exit(fn -> Application.put_env(:layoutmaster, :storage_local_root, prev) end)
    :ok
  end

  test "analyze view renders Magic Romak and completes the analysis", %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/?layout=magic-romak&corpus=pt-br-work&sample=20000")
    assert html =~ "Alpha 1"
    assert html =~ "Ç extension"
    # wait for the async analysis
    assert render_async(view, 30_000) =~ "Same finger bigrams"
    html = render(view)
    assert html =~ "Layer taps per 100 symbols"
    assert html =~ "all symbols producible"
  end

  test "explain shows the typing path", %{conn: conn} do
    {:ok, view, _} = live(conn, ~p"/?layout=romak-24&corpus=pt-br-work&sample=20000")
    render_async(view, 30_000)
    html = view |> element("form[phx-submit=explain]") |> render_submit(%{"text" => "ação"})
    assert html =~ "4 presses"
  end

  test "library lists bundled layouts and imports text", %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/library")
    assert html =~ "Bundled layouts"
    assert html =~ "Graphite"

    html =
      view
      |> element("form[phx-change=import_change]")
      |> render_change(%{
        "text" => "q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /",
        "preset" => "3x5+2",
        "name" => "Test"
      })

    assert html =~ "Open in analyzer"
  end

  test "rules view loads presets and adds a composed rule", %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/rules")
    assert html =~ "Same finger bigrams"

    html =
      view
      |> element("form[phx-submit=composer_add_rule]")
      |> render_submit(%{
        "composer" => %{
          "id" => "my rule",
          "label" => "My rule",
          "family" => "bigram",
          "n" => "2",
          "skip" => "0",
          "aggregate" => "percent_of_ngrams",
          "combinator" => "all",
          "weight" => "0",
          "predicates" => %{"0" => %{"type" => "same_finger", "value" => "true"}}
        }
      })

    assert html =~ "My rule"
  end

  test "compare and corpus views render", %{conn: conn} do
    {:ok, _view, html} =
      live(conn, ~p"/compare?layout=romak-24&b=romak-34&corpus=pt-br-work&sample=20000")

    assert html =~ "Layout A"
    {:ok, _view, html} = live(conn, ~p"/corpus")
    assert html =~ "Corpora"
    assert html =~ "Leipzig"
  end

  test "edit view swaps two keys and saves", %{conn: conn} do
    {:ok, view, _} = live(conn, ~p"/edit?layout=qwerty&corpus=en-work&sample=20000")
    render_async(view, 30_000)
    html = render_hook(view, "swap", %{"from" => "LTP", "to" => "LTR"})
    assert html =~ "unsaved"
    # two plain keys: the report is relabeled instantly while the full re-analysis runs
    assert html =~ "estimate after swap"
    assert render_async(view, 30_000) =~ "Quick analysis"
    refute render(view) =~ "estimate after swap"

    view |> element("button[phx-value-panel=save]") |> render_click()

    html =
      view |> element("form[phx-submit=save]") |> render_submit(%{"name" => "Qwerty swapped"})

    assert html =~ "Saved as qwerty-swapped"
  end
end
