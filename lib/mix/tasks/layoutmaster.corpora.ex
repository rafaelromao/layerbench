defmodule Mix.Tasks.Layoutmaster.Corpora do
  @shortdoc "Build shipped corpora (priv/corpora) from raw sources (priv/corpora_src)"
  @moduledoc """
  Builds `priv/corpora/<id>/{manifest.json,sample.txt}` from `priv/corpora_src/<id>.txt`
  plus a `sources.json` describing name, language, license and provenance.

      mix layoutmaster.corpora            # build all
      mix layoutmaster.corpora en-work    # build one

  Samples are normalized (NFC, cased, whitespace collapsed) and capped at 1 MB at a sentence boundary.
  """

  use Mix.Task

  alias LayoutMaster.Corpus.Normalize

  @max_sample 1_000_000

  @impl Mix.Task
  def run(args) do
    Mix.Task.run("app.config")
    src_dir = Path.join(File.cwd!(), "priv/corpora_src")
    out_dir = Path.join(File.cwd!(), "priv/corpora")
    sources = Path.join(src_dir, "sources.json") |> File.read!() |> JSON.decode!()
    ids = if args == [], do: Map.keys(sources), else: args

    for id <- ids do
      meta = Map.fetch!(sources, id)
      raw = File.read!(Path.join(src_dir, meta["file"]))
      sample = raw |> Normalize.normalize(case_mode: :model) |> cap(@max_sample)
      words = sample |> String.split(" ", trim: true) |> length()

      manifest = %{
        "id" => id,
        "name" => meta["name"],
        "language" => meta["language"],
        "license" => meta["license"],
        "source" => meta["source"],
        "description" => meta["description"],
        "symbols" => String.length(sample) - words + 1,
        "words" => words,
        "built_at" => DateTime.utc_now() |> DateTime.to_iso8601()
      }

      dir = Path.join(out_dir, id)
      File.mkdir_p!(dir)
      File.write!(Path.join(dir, "sample.txt"), sample)
      File.write!(Path.join(dir, "manifest.json"), JSON.encode!(manifest))
      Mix.shell().info("#{id}: #{byte_size(sample)} bytes, #{words} words")
    end
  end

  defp cap(text, max) when byte_size(text) <= max, do: text

  defp cap(text, max) do
    head = binary_part(text, 0, max)
    # cut at the last sentence end to keep sentence-case modeling sane
    case :binary.matches(head, [". ", "! ", "? "]) do
      [] ->
        String.trim(head)

      matches ->
        {pos, _} = List.last(matches)
        head |> binary_part(0, pos + 1) |> String.trim()
    end
  end
end
