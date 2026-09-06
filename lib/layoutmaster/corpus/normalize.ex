defmodule LayoutMaster.Corpus.Normalize do
  @moduledoc """
  Normalize raw text into a symbol stream (SPEC §8): NFC, optional case folding, quote
  unification, whitespace collapsed to single spaces, digits and unlisted symbols dropped.
  The stream is a UTF-8 binary; every character except space is one symbol.
  """

  @default_keep [",", ".", "'", ";", "/", "-", "?", "!"]
  @default_soft ["?", "!"]

  def default_keep, do: @default_keep
  def default_soft, do: @default_soft

  @quote_map %{
    ?’ => "'",
    ?‘ => "'",
    ?‛ => "'",
    ?′ => "'",
    ?“ => "",
    ?” => "",
    ?« => "",
    ?» => "",
    ?– => "-",
    ?— => "-",
    ?… => "."
  }

  @type opts :: [case_mode: :fold | :model, keep: [String.t()], drop_digits: boolean()]

  @spec normalize(String.t(), opts()) :: String.t()
  def normalize(text, opts \\ []) do
    fold = Keyword.get(opts, :case_mode, :fold) == :fold

    keep =
      Keyword.get(opts, :keep, @default_keep) |> Enum.map(fn <<c::utf8>> -> c end) |> MapSet.new()

    drop_digits = Keyword.get(opts, :drop_digits, true)

    text = String.normalize(text, :nfc)
    text = if fold, do: String.downcase(text), else: text
    walk(text, keep, drop_digits, true, [])
  end

  defp walk(<<>>, _keep, _dd, _last_space, acc),
    do: acc |> trim_trailing_space() |> Enum.reverse() |> IO.iodata_to_binary()

  defp walk(<<c::utf8, rest::binary>>, keep, dd, last_space, acc) do
    cond do
      Map.has_key?(@quote_map, c) ->
        case Map.fetch!(@quote_map, c) do
          "" -> walk(rest, keep, dd, last_space, acc)
          <<r::utf8>> -> walk(<<r::utf8, rest::binary>>, keep, dd, last_space, acc)
        end

      space?(c) ->
        if last_space,
          do: walk(rest, keep, dd, true, acc),
          else: walk(rest, keep, dd, true, [" " | acc])

      letter?(c) ->
        walk(rest, keep, dd, false, [<<c::utf8>> | acc])

      digit?(c) ->
        if dd,
          do: walk(rest, keep, dd, last_space, acc),
          else: walk(rest, keep, dd, false, [<<c::utf8>> | acc])

      MapSet.member?(keep, c) ->
        walk(rest, keep, dd, false, [<<c::utf8>> | acc])

      true ->
        walk(rest, keep, dd, last_space, acc)
    end
  end

  defp trim_trailing_space([" " | rest]), do: rest
  defp trim_trailing_space(acc), do: acc

  defp space?(c),
    do: c in [?\s, ?\t, ?\n, ?\r, 0x00A0, 0x2009, 0x202F, 0x3000] or (c >= 0x2000 and c <= 0x200A)

  defp digit?(c), do: c >= ?0 and c <= ?9

  # Fast classification for common scripts, regex fallback elsewhere.
  defp letter?(c) when c >= ?a and c <= ?z, do: true
  defp letter?(c) when c >= ?A and c <= ?Z, do: true
  defp letter?(c) when c < 0x80, do: false
  defp letter?(c) when c >= 0xC0 and c <= 0x24F and c != 0xD7 and c != 0xF7, do: true
  defp letter?(c) when c >= 0x370 and c <= 0x52F, do: true
  defp letter?(c), do: String.match?(<<c::utf8>>, ~r/^\p{L}$/u)

  @doc "Word list of a normalized stream."
  def words(stream), do: String.split(stream, " ", trim: true)

  @doc """
  Symbol-level n-gram facts of a normalized stream (word boundaries reset the window in
  `:reset` mode). Returns maps keyed by strings.
  """
  def facts(stream, cross_word \\ :reset) do
    {uni, bi, tri, sk, words, wc, symbols, _a, _b, word} =
      stream
      |> String.graphemes()
      |> Enum.reduce({%{}, %{}, %{}, %{}, %{}, 0, 0, "", "", []}, fn
        " ", {uni, bi, tri, sk, words, wc, symbols, a, b, word} ->
          {words, wc} = commit_word(words, wc, word)
          {a, b} = if cross_word == :reset, do: {"", ""}, else: {a, b}
          {uni, bi, tri, sk, words, wc, symbols, a, b, []}

        s, {uni, bi, tri, sk, words, wc, symbols, a, b, word} ->
          uni = inc(uni, s)
          bi = if b != "", do: inc(bi, b <> s), else: bi

          {tri, sk} =
            if a != "" and b != "", do: {inc(tri, a <> b <> s), inc(sk, a <> s)}, else: {tri, sk}

          {uni, bi, tri, sk, words, wc, symbols + 1, b, s, [s | word]}
      end)

    {words, wc} = commit_word(words, wc, word)

    %{
      symbols: symbols,
      words: wc,
      unigram: uni,
      bigram: bi,
      trigram: tri,
      skip1: sk,
      word_freq: words
    }
  end

  defp commit_word(words, wc, []), do: {words, wc}

  defp commit_word(words, wc, word),
    do: {inc(words, word |> Enum.reverse() |> IO.iodata_to_binary()), wc + 1}

  defp inc(m, k), do: Map.update(m, k, 1, &(&1 + 1))
end
