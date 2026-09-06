defmodule LayoutMaster.Storage.Local do
  @moduledoc "Filesystem storage adapter (dev/test). Root: `config :layoutmaster, :storage_local_root` or `priv/data`."
  @behaviour LayoutMaster.Storage

  alias LayoutMaster.Storage

  def root,
    do:
      Application.get_env(:layoutmaster, :storage_local_root) ||
        Path.join(:code.priv_dir(:layoutmaster), "data")

  @impl true
  def list(collection) do
    path = Path.join(root(), Storage.index_path(collection))

    case File.read(path) do
      {:ok, json} -> {:ok, JSON.decode!(json)}
      {:error, :enoent} -> {:ok, rebuild_index(collection)}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def get(collection, id) do
    path = Path.join(root(), Storage.path(collection, id))

    case File.read(path) do
      {:ok, json} ->
        {:ok, JSON.decode!(json),
         %{sha: :crypto.hash(:sha, json) |> Base.encode16(case: :lower), path: path}}

      {:error, :enoent} ->
        {:error, :not_found}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl true
  def put(collection, id, doc, opts) do
    path = Path.join(root(), Storage.path(collection, id))
    File.mkdir_p!(Path.dirname(path))

    with :ok <- check_conflict(path, Keyword.get(opts, :expected_sha)) do
      json = JSON.encode!(doc)
      File.write!(path, json)
      update_index(collection, id, doc, :put)
      {:ok, %{sha: :crypto.hash(:sha, json) |> Base.encode16(case: :lower), path: path}}
    end
  end

  @impl true
  def delete(collection, id, _opts) do
    path = Path.join(root(), Storage.path(collection, id))
    File.rm(path)
    update_index(collection, id, nil, :delete)
    :ok
  end

  defp check_conflict(_path, nil), do: :ok

  defp check_conflict(path, expected) do
    case File.read(path) do
      {:ok, json} ->
        if :crypto.hash(:sha, json) |> Base.encode16(case: :lower) == expected,
          do: :ok,
          else: {:error, :conflict}

      {:error, :enoent} ->
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp update_index(collection, id, doc, op) do
    {:ok, entries} = list(collection)
    entries = Enum.reject(entries, &(&1["id"] == id))
    entries = if op == :put, do: [Storage.summary(collection, id, doc) | entries], else: entries
    entries = Enum.sort_by(entries, & &1["name"])
    path = Path.join(root(), Storage.index_path(collection))
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, JSON.encode!(entries))
  end

  defp rebuild_index(collection) do
    dir = Path.join(root(), Atom.to_string(collection))

    case File.ls(dir) do
      {:ok, files} ->
        files
        |> Enum.filter(&(String.ends_with?(&1, ".json") and &1 != "index.json"))
        |> Enum.map(fn f ->
          id = String.trim_trailing(f, ".json")
          doc = File.read!(Path.join(dir, f)) |> JSON.decode!()
          Storage.summary(collection, id, doc)
        end)
        |> Enum.sort_by(& &1["name"])

      _ ->
        []
    end
  end
end
