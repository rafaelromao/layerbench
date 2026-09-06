defmodule LayoutMasterWeb.Router do
  use LayoutMasterWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {LayoutMasterWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", LayoutMasterWeb do
    pipe_through :browser

    live_session :default do
      live "/", AnalyzeLive, :index
      live "/edit", EditLive, :index
      live "/compare", CompareLive, :index
      live "/rules", RulesLive, :index
      live "/corpus", CorpusLive, :index
      live "/library", LibraryLive, :index
    end

    get "/l/:id", RedirectController, :layout
  end

  scope "/api", LayoutMasterWeb do
    pipe_through :api
    get "/layouts/:id", ApiController, :layout
  end

  if Application.compile_env(:layoutmaster, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser
      live_dashboard "/dashboard", metrics: LayoutMasterWeb.Telemetry
    end
  end
end
