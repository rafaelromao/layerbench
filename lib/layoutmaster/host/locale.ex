defmodule LayoutMaster.Host.Locale do
  @moduledoc """
  Host-side translation: what the operating system shows for a ZMK keycode + modifier set,
  including dead-key composition for US-International and ABNT2 (SPEC §5.2 step 5).
  `:symbols` layouts bypass this module.
  """

  @us_base %{
    "A" => {"a", "A"},
    "B" => {"b", "B"},
    "C" => {"c", "C"},
    "D" => {"d", "D"},
    "E" => {"e", "E"},
    "F" => {"f", "F"},
    "G" => {"g", "G"},
    "H" => {"h", "H"},
    "I" => {"i", "I"},
    "J" => {"j", "J"},
    "K" => {"k", "K"},
    "L" => {"l", "L"},
    "M" => {"m", "M"},
    "N" => {"n", "N"},
    "O" => {"o", "O"},
    "P" => {"p", "P"},
    "Q" => {"q", "Q"},
    "R" => {"r", "R"},
    "S" => {"s", "S"},
    "T" => {"t", "T"},
    "U" => {"u", "U"},
    "V" => {"v", "V"},
    "W" => {"w", "W"},
    "X" => {"x", "X"},
    "Y" => {"y", "Y"},
    "Z" => {"z", "Z"},
    "N1" => {"1", "!"},
    "N2" => {"2", "@"},
    "N3" => {"3", "#"},
    "N4" => {"4", "$"},
    "N5" => {"5", "%"},
    "N6" => {"6", "^"},
    "N7" => {"7", "&"},
    "N8" => {"8", "*"},
    "N9" => {"9", "("},
    "N0" => {"0", ")"},
    "MINUS" => {"-", "_"},
    "EQUAL" => {"=", "+"},
    "LBKT" => {"[", "{"},
    "RBKT" => {"]", "}"},
    "BSLH" => {"\\", "|"},
    "SEMI" => {";", ":"},
    "SQT" => {"'", "\""},
    "GRAVE" => {"`", "~"},
    "COMMA" => {",", "<"},
    "DOT" => {".", ">"},
    "FSLH" => {"/", "?"},
    "SPACE" => {" ", " "},
    "SPC" => {" ", " "}
  }

  @aliases %{
    "APOS" => "SQT",
    "APOSTROPHE" => "SQT",
    "QUOTE" => "SQT",
    "SEMICOLON" => "SEMI",
    "COLON" => "SEMI",
    "PERIOD" => "DOT",
    "SLASH" => "FSLH",
    "BACKSLASH" => "BSLH",
    "LEFT_BRACKET" => "LBKT",
    "RIGHT_BRACKET" => "RBKT",
    "UNDER" => "MINUS",
    "UNDERSCORE" => "MINUS",
    "EXCL" => "N1",
    "AT" => "N2",
    "HASH" => "N3",
    "DLLR" => "N4",
    "PRCNT" => "N5",
    "CARET" => "N6",
    "AMPS" => "N7",
    "STAR" => "N8",
    "LPAR" => "N9",
    "RPAR" => "N0",
    "TILDE" => "GRAVE",
    "QMARK" => "FSLH",
    "DQT" => "SQT",
    "PLUS" => "EQUAL",
    "LBRC" => "LBKT",
    "RBRC" => "RBKT",
    "PIPE" => "BSLH",
    "LT" => "COMMA",
    "GT" => "DOT"
  }

  @implicit_shift ~w(EXCL AT HASH DLLR PRCNT CARET AMPS STAR LPAR RPAR TILDE QMARK DQT PLUS LBRC RBRC PIPE LT GT COLON UNDER UNDERSCORE)

  @us_intl_dead %{"SQT" => {"´", "¨"}, "GRAVE" => {"`", "~"}, "N6" => {nil, "^"}}
  @abnt2_dead %{"LBKT" => {"´", "`"}, "SQT" => {"~", "^"}, "N6" => {nil, "¨"}}
  @abnt2_overrides %{
    "SEMI" => {"ç", "Ç"},
    "FSLH" => {";", ":"},
    "INT1" => {"/", "?"},
    "RBKT" => {"[", "{"},
    "BSLH" => {"]", "}"},
    "GRAVE" => {"'", "\""}
  }

  @compose %{
    "´" => %{
      "a" => "á",
      "e" => "é",
      "i" => "í",
      "o" => "ó",
      "u" => "ú",
      "c" => "ç",
      "y" => "ý",
      "A" => "Á",
      "E" => "É",
      "I" => "Í",
      "O" => "Ó",
      "U" => "Ú",
      "C" => "Ç",
      "Y" => "Ý"
    },
    "`" => %{
      "a" => "à",
      "e" => "è",
      "i" => "ì",
      "o" => "ò",
      "u" => "ù",
      "A" => "À",
      "E" => "È",
      "I" => "Ì",
      "O" => "Ò",
      "U" => "Ù"
    },
    "~" => %{"a" => "ã", "o" => "õ", "n" => "ñ", "A" => "Ã", "O" => "Õ", "N" => "Ñ"},
    "^" => %{
      "a" => "â",
      "e" => "ê",
      "i" => "î",
      "o" => "ô",
      "u" => "û",
      "A" => "Â",
      "E" => "Ê",
      "I" => "Î",
      "O" => "Ô",
      "U" => "Û"
    },
    "¨" => %{
      "a" => "ä",
      "e" => "ë",
      "i" => "ï",
      "o" => "ö",
      "u" => "ü",
      "A" => "Ä",
      "E" => "Ë",
      "I" => "Ï",
      "O" => "Ö",
      "U" => "Ü"
    }
  }
  @dead_standalone %{"´" => "'", "`" => "`", "~" => "~", "^" => "^", "¨" => "\""}

  @wrappers %{
    "LS" => :LSHIFT,
    "RS" => :RSHIFT,
    "LC" => :LCTRL,
    "RC" => :RCTRL,
    "LA" => :LALT,
    "RA" => :RALT,
    "LG" => :LGUI,
    "RG" => :RGUI
  }

  @doc "Parse ZMK-style keycodes such as `A`, `LS(A)`, `RA(COMMA)`, `LS(LC(X))` → `{usage, mods}`."
  def parse_keycode(keycode) when is_binary(keycode), do: do_parse(String.trim(keycode), [])

  defp do_parse(s, mods) do
    case Regex.run(~r/^([LR][SCAG])\((.*)\)$/, s) do
      [_, w, inner] -> do_parse(inner, [Map.fetch!(@wrappers, w) | mods])
      nil -> {String.upcase(s), Enum.reverse(mods)}
    end
  end

  def shift?(mods), do: Enum.any?(mods, &(&1 in [:LSHIFT, :RSHIFT]))

  @doc """
  Translate a keycode under a modifier set. Returns `{:symbol, text}`, `{:dead, diacritic}` or `nil`.
  """
  def translate(locale, keycode, extra_mods \\ []) do
    {usage, mods} = parse_keycode(keycode)
    mods = Enum.uniq(mods ++ extra_mods)
    mods = if usage in @implicit_shift, do: [:LSHIFT | mods], else: mods
    usage = Map.get(@aliases, usage, usage)
    shifted = shift?(mods)
    ralt = :RALT in mods
    special(locale, usage, shifted, ralt) || base(usage, shifted)
  end

  defp special(:abnt2, "Q", shifted, true), do: {:symbol, if(shifted, do: "?", else: "/")}
  defp special(:abnt2, "W", _shifted, true), do: {:symbol, "?"}

  defp special(:abnt2, usage, shifted, _) do
    case Map.get(@abnt2_dead, usage) do
      {u, s} ->
        case if(shifted, do: s, else: u) do
          nil -> override(usage, shifted)
          d -> {:dead, d}
        end

      nil ->
        override(usage, shifted)
    end
  end

  defp special(:us_intl, "COMMA", shifted, true), do: {:symbol, if(shifted, do: "Ç", else: "ç")}

  defp special(:us_intl, usage, shifted, _) do
    case Map.get(@us_intl_dead, usage) do
      {u, s} ->
        case if(shifted, do: s, else: u) do
          nil -> nil
          d -> {:dead, d}
        end

      nil ->
        nil
    end
  end

  defp special(_, _, _, _), do: nil

  defp override(usage, shifted) do
    case Map.get(@abnt2_overrides, usage) do
      {u, s} -> {:symbol, if(shifted, do: s, else: u)}
      nil -> nil
    end
  end

  defp base(usage, shifted) do
    case Map.get(@us_base, usage) do
      {u, s} -> {:symbol, if(shifted, do: s, else: u)}
      nil -> nil
    end
  end

  @doc "Compose a pending dead key with the next symbol; returns the text to emit."
  def compose(dead, next) do
    table = Map.get(@compose, dead, %{})

    cond do
      Map.has_key?(table, next) -> Map.fetch!(table, next)
      next == " " -> Map.get(@dead_standalone, dead, dead)
      true -> Map.get(@dead_standalone, dead, dead) <> next
    end
  end

  @doc "Uppercase a symbol for shift application in `:symbols` mode (explicit shifted form wins)."
  def shift_symbol(symbol, nil), do: String.upcase(symbol)
  def shift_symbol(_symbol, explicit), do: explicit
end
