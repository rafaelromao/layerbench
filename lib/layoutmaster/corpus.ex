defmodule LayoutMaster.Corpus do
  @moduledoc """
  Shipped and custom corpora (SPEC §8).

  A corpus on disk is a directory `priv/corpora/<id>/` with `manifest.json` (name, language,
  license, source, sizes) and `sample.txt` (normalized, cased text ≤ ~1 MB). Loading returns a
  `%Corpus{}` whose `stream` is the normalized symbol stream for the requested case mode.
  Loaded corpora are cached in `:persistent_term`.
  """

  alias LayoutMaster.Corpus.Normalize

  defstruct id: nil,
            name: nil,
            language: "en",
            license: nil,
            source: nil,
            description: nil,
            sample: "",
            symbols: 0,
            words: 0,
            custom: false

  @type t :: %__MODULE__{}

  def dir,
    do:
      Application.get_env(:layoutmaster, :corpora_dir) ||
        Path.join(:code.priv_dir(:layoutmaster), "corpora")

  @doc "Manifests of all shipped corpora."
  def list do
    case File.ls(dir()) do
      {:ok, ids} ->
        ids
        |> Enum.sort()
        |> Enum.flat_map(fn id ->
          case read_manifest(id) do
            {:ok, m} -> [m]
            _ -> []
          end
        end)

      _ ->
        []
    end
  end

  def read_manifest(id) do
    path = Path.join([dir(), id, "manifest.json"])

    with {:ok, json} <- File.read(path), {:ok, m} <- JSON.decode(json) do
      {:ok,
       %__MODULE__{
         id: id,
         name: m["name"] || id,
         language: m["language"] || "en",
         license: m["license"],
         source: m["source"],
         description: m["description"],
         symbols: m["symbols"] || 0,
         words: m["words"] || 0
       }}
    end
  end

  @doc """
  Load a corpus by id (cached): in-memory custom corpora first (`custom-…`), then saved corpora
  from storage (`saved:<id>`), then shipped corpora.
  """
  @spec load(String.t()) :: {:ok, t()} | {:error, term()}
  def load("custom-" <> _ = id) do
    case :persistent_term.get({__MODULE__, :custom, id}, nil) do
      nil -> {:error, :not_found}
      corpus -> {:ok, corpus}
    end
  end

  def load("saved:" <> id) do
    key = {__MODULE__, id}

    case :persistent_term.get(key, nil) do
      nil ->
        case LayoutMaster.Storage.get(:corpora, id) do
          {:ok, doc, _meta} ->
            corpus = %__MODULE__{
              id: "saved:" <> id,
              name: doc["name"] || id,
              language: doc["language"] || "custom",
              license: doc["license"],
              source: doc["source"],
              description: doc["description"],
              sample: doc["sample"] || "",
              symbols: doc["symbols"] || 0,
              words: doc["words"] || 0,
              custom: false
            }

            :persistent_term.put(key, corpus)
            {:ok, corpus}

          other ->
            other
        end

      corpus ->
        {:ok, corpus}
    end
  end

  def load(id) do
    key = {__MODULE__, id}

    case :persistent_term.get(key, nil) do
      nil ->
        with {:ok, m} <- read_manifest(id),
             {:ok, sample} <- File.read(Path.join([dir(), id, "sample.txt"])) do
          corpus = %__MODULE__{m | sample: sample}
          :persistent_term.put(key, corpus)
          {:ok, corpus}
        end

      corpus ->
        {:ok, corpus}
    end
  end

  @doc "Register an in-memory custom corpus so it can be referenced by id from URLs."
  def register_custom(%__MODULE__{custom: true} = corpus) do
    :persistent_term.put({__MODULE__, :custom, corpus.id}, corpus)
    corpus
  end

  @doc "Document for persisting a corpus to storage."
  def to_doc(%__MODULE__{} = c) do
    %{
      "name" => c.name,
      "language" => c.language,
      "license" => c.license,
      "source" => c.source,
      "description" => c.description,
      "sample" => c.sample,
      "symbols" => c.symbols,
      "words" => c.words
    }
  end

  @doc "All corpora available for selection: shipped + saved."
  def available do
    saved =
      case LayoutMaster.Storage.list(:corpora) do
        {:ok, list} ->
          Enum.map(list, fn e ->
            %__MODULE__{
              id: "saved:" <> e["id"],
              name: e["name"],
              language: e["language"] || "custom",
              license: e["license"],
              words: e["words"] || 0
            }
          end)

        _ ->
          []
      end

    list() ++ saved
  end

  def load!(id) do
    case load(id) do
      {:ok, c} -> c
      {:error, reason} -> raise ArgumentError, "cannot load corpus #{id}: #{inspect(reason)}"
    end
  end

  @doc "Build a custom corpus from raw text (not persisted)."
  def custom(text, opts \\ []) do
    sample = Normalize.normalize(text, case_mode: :model)

    id =
      "custom-" <>
        (:crypto.hash(:sha256, sample) |> Base.url_encode64(padding: false) |> binary_part(0, 12))

    %__MODULE__{
      id: id,
      name: Keyword.get(opts, :name, "Custom corpus"),
      language: Keyword.get(opts, :language, "custom"),
      license: "user-provided",
      sample: sample,
      symbols: String.length(sample) - length(String.split(sample, " ", trim: true)) + 1,
      words: length(String.split(sample, " ", trim: true)),
      custom: true
    }
  end

  @doc """
  Mix corpora by weights (`[{corpus, weight}]`): sentences are interleaved proportionally so the
  result has roughly the requested share of each source, capped at `max_chars`.
  """
  def mix(weighted, max_chars \\ 1_500_000) do
    total_w = weighted |> Enum.map(&elem(&1, 1)) |> Enum.sum()

    parts =
      for {corpus, w} <- weighted, w > 0 do
        budget = trunc(max_chars * w / total_w)
        sentences = sentences(corpus.sample)
        take_chars(sentences, budget)
      end

    sample = parts |> interleave() |> Enum.join(" ")

    %__MODULE__{
      id: "mix-" <> Enum.map_join(weighted, "+", fn {c, w} -> "#{c.id}:#{w}" end),
      name: "Mix",
      language:
        weighted |> Enum.map(fn {c, _} -> c.language end) |> Enum.uniq() |> Enum.join("+"),
      license: "see components",
      sample: sample,
      symbols: String.length(sample),
      words: length(String.split(sample, " ", trim: true))
    }
  end

  @doc "Normalized symbol stream for a corpus in the given case mode (cached)."
  def stream(%__MODULE__{} = corpus, case_mode) do
    key = {__MODULE__, :stream, corpus.id, case_mode}

    case :persistent_term.get(key, nil) do
      nil ->
        s = Normalize.normalize(corpus.sample, case_mode: case_mode)
        if not corpus.custom, do: :persistent_term.put(key, s)
        s

      s ->
        s
    end
  end

  defp sentences(text), do: String.split(text, ~r/(?<=[.!?])\s+/, trim: true)

  defp take_chars(sentences, budget) do
    Enum.reduce_while(sentences, {[], 0}, fn s, {acc, n} ->
      if n >= budget, do: {:halt, {acc, n}}, else: {:cont, {[s | acc], n + String.length(s) + 1}}
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  defp interleave(lists) do
    lists = Enum.reject(lists, &(&1 == []))

    if lists == [] do
      []
    else
      max = lists |> Enum.map(&length/1) |> Enum.max()

      for i <- 0..(max - 1),
          list <- lists,
          s = Enum.at(list, rem(i, max(1, length(list)))),
          i < length(list) * div(max + length(list) - 1, length(list)) do
        s
      end
      |> Enum.uniq()
    end
  end
end
