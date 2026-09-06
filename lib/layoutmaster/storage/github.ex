defmodule LayoutMaster.Storage.GitHub do
  @moduledoc """
  GitHub Contents API storage adapter (SPEC §4.3): documents are JSON files in an app-owned
  data repository. Reads are cached in ETS with ETag revalidation; writes use the blob `sha`
  for optimistic concurrency.

  Configuration (runtime env):

      config :layoutmaster, LayoutMaster.Storage.GitHub,
        token: System.get_env("GITHUB_TOKEN"),
        repo: System.get_env("DATA_REPO"),        # "owner/name"
        branch: System.get_env("DATA_BRANCH", "main"),
        path: System.get_env("DATA_PATH", "data"),
        committer: %{name: "LayoutMaster", email: "layoutmaster@users.noreply.github.com"}

  Uses Erlang's `:httpc` (no extra dependency).
  """
  @behaviour LayoutMaster.Storage

  alias LayoutMaster.Storage

  @api "https://api.github.com"
  @cache :layoutmaster_github_cache

  def config, do: Application.get_env(:layoutmaster, __MODULE__, [])

  def configured? do
    cfg = config()
    is_binary(cfg[:token]) and cfg[:token] != "" and is_binary(cfg[:repo]) and cfg[:repo] != ""
  end

  # ------------------------------------------------------------------ callbacks

  @impl true
  def list(collection) do
    case read_file(Storage.index_path(collection)) do
      {:ok, json, _meta} -> {:ok, JSON.decode!(json)}
      {:error, :not_found} -> {:ok, []}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def get(collection, id) do
    case read_file(Storage.path(collection, id)) do
      {:ok, json, meta} -> {:ok, JSON.decode!(json), meta}
      other -> other
    end
  end

  @impl true
  def put(collection, id, doc, opts) do
    path = Storage.path(collection, id)
    json = JSON.encode!(doc)
    message = Keyword.get(opts, :message) || "Save #{collection} #{doc["name"] || id}"

    sha =
      case Keyword.get(opts, :expected_sha) do
        nil ->
          case read_file(path) do
            {:ok, _, %{sha: s}} -> s
            _ -> nil
          end

        s ->
          s
      end

    with {:ok, meta} <- write_file(path, json, message, sha),
         :ok <- update_index(collection, id, doc, :put, message) do
      {:ok, meta}
    end
  end

  @impl true
  def delete(collection, id, opts) do
    path = Storage.path(collection, id)
    message = Keyword.get(opts, :message) || "Delete #{collection} #{id}"

    with {:ok, _json, %{sha: sha}} <- read_file(path),
         :ok <- delete_file(path, message, sha),
         :ok <- update_index(collection, id, nil, :delete, message) do
      :ok
    else
      {:error, :not_found} -> :ok
      other -> other
    end
  end

  # ------------------------------------------------------------------ internals

  defp update_index(collection, id, doc, op, message) do
    {:ok, entries} = list(collection)
    entries = Enum.reject(entries, &(&1["id"] == id))
    entries = if op == :put, do: [Storage.summary(collection, id, doc) | entries], else: entries
    entries = Enum.sort_by(entries, & &1["name"])
    idx_path = Storage.index_path(collection)

    sha =
      case read_file(idx_path) do
        {:ok, _, %{sha: s}} -> s
        _ -> nil
      end

    case write_file(idx_path, JSON.encode!(entries), message <> " (index)", sha) do
      {:ok, _} -> :ok
      other -> other
    end
  end

  defp ensure_cache do
    if :ets.whereis(@cache) == :undefined do
      :ets.new(@cache, [:named_table, :public, :set, read_concurrency: true])
    end

    :ok
  end

  defp full_path(path) do
    prefix = config()[:path] || "data"
    prefix = String.trim(prefix, "/")
    if prefix == "", do: path, else: prefix <> "/" <> path
  end

  defp contents_url(path) do
    repo = config()[:repo]
    branch = config()[:branch] || "main"

    "#{@api}/repos/#{repo}/contents/#{URI.encode(full_path(path))}?ref=#{URI.encode_www_form(branch)}"
  end

  defp headers(extra \\ []) do
    [
      {~c"authorization", String.to_charlist("Bearer " <> (config()[:token] || ""))},
      {~c"accept", ~c"application/vnd.github+json"},
      {~c"user-agent", ~c"layoutmaster"},
      {~c"x-github-api-version", ~c"2022-11-28"}
    ] ++ extra
  end

  @doc false
  def read_file(path) do
    ensure_cache()
    cached = :ets.lookup(@cache, path)

    etag_hdr =
      case cached do
        [{_, %{etag: etag}}] when is_binary(etag) ->
          [{~c"if-none-match", String.to_charlist(etag)}]

        _ ->
          []
      end

    case request(:get, contents_url(path), headers(etag_hdr), nil) do
      {:ok, 304, _h, _b} ->
        [{_, %{content: json, sha: sha, etag: etag}}] = cached
        {:ok, json, %{sha: sha, etag: etag}}

      {:ok, 200, h, body} ->
        data = JSON.decode!(body)
        json = data["content"] |> String.replace(~r/\s/, "") |> Base.decode64!()
        etag = header(h, "etag")
        :ets.insert(@cache, {path, %{content: json, sha: data["sha"], etag: etag}})
        {:ok, json, %{sha: data["sha"], etag: etag}}

      {:ok, 404, _h, _b} ->
        {:error, :not_found}

      {:ok, status, _h, body} ->
        {:error, {:github, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp write_file(path, content, message, sha) do
    cfg = config()

    payload =
      %{
        "message" => message,
        "content" => Base.encode64(content),
        "branch" => cfg[:branch] || "main",
        "sha" => sha,
        "committer" =>
          cfg[:committer] &&
            %{"name" => cfg[:committer][:name], "email" => cfg[:committer][:email]}
      }
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)
      |> Map.new()

    case request(:put, contents_url(path), headers(), JSON.encode!(payload)) do
      {:ok, status, _h, body} when status in [200, 201] ->
        data = JSON.decode!(body)

        :ets.insert(
          @cache,
          {path, %{content: content, sha: get_in(data, ["content", "sha"]), etag: nil}}
        )

        {:ok, %{sha: get_in(data, ["content", "sha"]), commit: get_in(data, ["commit", "sha"])}}

      {:ok, 409, _h, _body} ->
        :ets.delete(@cache, path)
        {:error, :conflict}

      {:ok, 422, _h, body} ->
        :ets.delete(@cache, path)

        if String.contains?(body, "sha"),
          do: {:error, :conflict},
          else: {:error, {:github, 422, body}}

      {:ok, status, _h, body} ->
        {:error, {:github, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp delete_file(path, message, sha) do
    payload = %{"message" => message, "sha" => sha, "branch" => config()[:branch] || "main"}

    case request(:delete, contents_url(path), headers(), JSON.encode!(payload)) do
      {:ok, 200, _h, _b} ->
        :ets.delete(@cache, path)
        :ok

      {:ok, status, _h, body} ->
        {:error, {:github, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp header(headers, name) do
    Enum.find_value(headers, fn {k, v} ->
      if String.downcase(to_string(k)) == name, do: to_string(v)
    end)
  end

  # :httpc request with sane defaults; honours HTTPS_PROXY for local development behind a proxy.
  defp request(method, url, hdrs, body) do
    :inets.start()
    :ssl.start()
    http_opts = [timeout: 20_000, connect_timeout: 10_000, ssl: ssl_opts()] ++ proxy_opts()

    req =
      case body do
        nil -> {String.to_charlist(url), hdrs}
        b -> {String.to_charlist(url), hdrs, ~c"application/json", b}
      end

    case :httpc.request(method, req, http_opts, body_format: :binary) do
      {:ok, {{_, status, _}, resp_headers, resp_body}} -> {:ok, status, resp_headers, resp_body}
      {:error, reason} -> {:error, reason}
    end
  end

  defp ssl_opts do
    [
      verify: :verify_peer,
      cacerts: :public_key.cacerts_get(),
      depth: 3,
      customize_hostname_check: [match_fun: :public_key.pkix_verify_hostname_match_fun(:https)]
    ]
  rescue
    _ -> [verify: :verify_none]
  end

  defp proxy_opts do
    case System.get_env("HTTPS_PROXY") || System.get_env("https_proxy") do
      nil ->
        []

      url ->
        uri = URI.parse(url)

        if uri.host do
          :httpc.set_options(proxy: {{String.to_charlist(uri.host), uri.port || 8080}, []})

          case uri.userinfo do
            nil ->
              []

            info ->
              [user, pass] = String.split(info, ":", parts: 2)
              [proxy_auth: {String.to_charlist(user), String.to_charlist(pass)}]
          end
        else
          []
        end
    end
  end
end
