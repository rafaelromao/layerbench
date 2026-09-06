defmodule LayoutMaster.CorpusTest do
  use ExUnit.Case, async: true

  alias LayoutMaster.Corpus
  alias LayoutMaster.Corpus.Normalize

  test "normalize folds case, unifies quotes, drops digits and unknown symbols, collapses whitespace" do
    s =
      Normalize.normalize("Olá,  Mundo! It’s 2026 — “quoted” text.\nNext line", case_mode: :fold)

    assert s == "olá, mundo! it's - quoted text. next line"
    cased = Normalize.normalize("Olá Mundo", case_mode: :model)
    assert cased == "Olá Mundo"
  end

  test "facts count symbols, words and n-grams" do
    f = Normalize.facts("ab ab c")
    assert f.symbols == 5
    assert f.words == 3
    assert f.unigram["a"] == 2
    assert f.bigram["ab"] == 2
    assert f.word_freq["ab"] == 2
  end

  test "shipped corpora load with manifests and streams" do
    ids = Corpus.list() |> Enum.map(& &1.id)
    assert "en-work" in ids
    assert "pt-br-work" in ids
    assert "en-general" in ids
    assert "pt-br-general" in ids
    {:ok, c} = Corpus.load("pt-br-general")
    assert c.language == "pt-BR"
    assert String.contains?(c.license, "CC BY")
    stream = Corpus.stream(c, :fold)
    assert String.length(stream) > 100_000
    assert String.contains?(stream, "ã")
  end

  test "mixing corpora interleaves sentences proportionally" do
    {:ok, en} = Corpus.load("en-work")
    {:ok, pt} = Corpus.load("pt-br-work")
    mix = Corpus.mix([{en, 1}, {pt, 1}], 200_000)
    assert String.length(mix.sample) > 150_000
    assert String.contains?(mix.sample, "ã")
    assert String.contains?(mix.sample, " the ")
  end

  test "custom corpus is normalized and hashed" do
    c = Corpus.custom("Some custom TEXT, with words.")
    assert c.custom
    assert String.starts_with?(c.id, "custom-")
    assert c.words == 5
  end
end
