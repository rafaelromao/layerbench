defmodule LayoutMaster.Storage do
  @moduledoc """
  Persistent storage of user data (layouts, rule sets, corpora metadata) — SPEC §4.3.

  Two adapters implement this behaviour: `LayoutMaster.Storage.Local` (filesystem, dev/test)
  and `LayoutMaster.Storage.GitHub` (Contents API of an app-owned data repository).
  Documents are JSON maps stored at `<collection>/<id>.json`; each collection has an
  `index.json` listing ids with summary metadata.
  """

  @type collection :: :layouts | :rulesets | :corpora
  @type id :: String.t()
  @type doc :: map()
  @type meta :: %{optional(atom()) => term()}

  @callback list(collection()) :: {:ok, [map()]} | {:error, term()}
  @callback get(collection(), id()) ::
              {:ok, doc(), meta()} | {:error, :not_found} | {:error, term()}
  @callback put(collection(), id(), doc(), keyword()) ::
              {:ok, meta()} | {:error, :conflict} | {:error, term()}
  @callback delete(collection(), id(), keyword()) :: :ok | {:error, term()}

  def adapter,
    do: Application.get_env(:layoutmaster, :storage_adapter, LayoutMaster.Storage.Local)

  def list(collection), do: adapter().list(collection)
  def get(collection, id), do: adapter().get(collection, id)
  def put(collection, id, doc, opts \\ []), do: adapter().put(collection, id, doc, opts)
  def delete(collection, id, opts \\ []), do: adapter().delete(collection, id, opts)

  @doc "Slug for ids: lowercase, ascii, dashes."
  def slug(name) when is_binary(name) do
    name
    |> String.normalize(:nfd)
    |> String.replace(~r/[^\x00-\x7F]/u, "")
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/, "-")
    |> String.trim("-")
    |> case do
      "" -> "item-" <> Base.url_encode64(:crypto.strong_rand_bytes(4), padding: false)
      s -> s
    end
  end

  @doc "Summary entry for an index from a document."
  def summary(collection, id, doc) do
    base = %{
      "id" => id,
      "name" => doc["name"] || id,
      "updatedAt" => DateTime.utc_now() |> DateTime.to_iso8601()
    }

    extra =
      case collection do
        :layouts ->
          %{
            "author" => doc["author"],
            "languages" => doc["languages"],
            "geometry" => get_in(doc, ["geometry", "preset"]),
            "layers" => length(doc["layers"] || [])
          }

        :rulesets ->
          %{"description" => doc["description"], "rules" => length(doc["rules"] || [])}

        :corpora ->
          %{"language" => doc["language"], "license" => doc["license"], "words" => doc["words"]}
      end

    base |> Map.merge(extra) |> Enum.reject(fn {_k, v} -> is_nil(v) end) |> Map.new()
  end

  def path(collection, id), do: "#{collection}/#{id}.json"
  def index_path(collection), do: "#{collection}/index.json"
end
