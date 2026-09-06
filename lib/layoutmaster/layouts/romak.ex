defmodule LayoutMaster.Layouts.Romak do
  @moduledoc """
  Bundled Romak layouts (Rafael Romão): Romak 34, Romak 24 and Magic Romak.
  Source: rafaelromao.github.io/romak and the ZMK keymap in rafaelromao/keyboards.
  """

  alias LayoutMaster.Layout

  @vowels ~w(a e i o u á à ã â é ê í ó õ ô ú)

  defp kp(s), do: %{kind: :kp, symbol: s}
  defp sl(l), do: %{kind: :sl, layer: l}
  defp ref(name), do: %{kind: :ref, ref: name}

  # Accented letter: one physical press (dead key + letter sent to the host), then ALTREP2 is armed.
  defp accent(s), do: %{kind: :macro, symbols: s, then: [sl("altrep2")]}

  defp rows(map), do: Map.new(map, fn {k, v} -> {k, if(is_binary(v), do: kp(v), else: v)} end)

  defp upper_copy(bindings, skip) do
    bindings
    |> Enum.reject(fn {k, _} -> k == "*" or k in skip end)
    |> Enum.flat_map(fn
      {k, %{kind: :kp, symbol: s}} when is_binary(s) ->
        if String.match?(s, ~r/\p{L}/u), do: [{k, kp(String.upcase(s))}], else: []

      {k, %{kind: :macro, symbols: s} = b} when is_binary(s) ->
        if String.match?(s, ~r/\p{L}/u), do: [{k, %{b | symbols: String.upcase(s)}}], else: []

      _ ->
        []
    end)
    |> Map.new()
    |> Map.put("*", %{kind: :trans})
  end

  def behaviors do
    %{
      "magic" => %{
        kind: :adaptive,
        default: kp("h"),
        triggers: [%{after_any: @vowels, binding: kp("v")}]
      },
      "reversedMagic" => %{
        kind: :adaptive,
        default: kp("v"),
        triggers: [%{after_any: @vowels, binding: kp("h")}]
      },
      "altRepeat" => %{
        kind: :adaptive,
        default: %{kind: :key_repeat},
        triggers: [
          %{after_any: ["a"], binding: kp("h")},
          %{after_any: ["y"], binding: kp("d")},
          %{after_any: ["h"], binding: %{kind: :macro, symbols: "ões"}},
          %{after_any: ["v", "x", "j"], binding: sl("alpha2")},
          %{after_any: ["'"], binding: kp("v")},
          %{after_any: ["I"], binding: kp("'")}
        ]
      },
      "a2AltRepeat" => %{
        kind: :adaptive,
        default: %{kind: :adaptive, ref: "altRepeat"},
        triggers: [
          %{after_any: ~w(á à ã â ó õ ô é ê), binding: kp("x")},
          %{after_any: ["í"], binding: kp("e")},
          %{after_any: ["u", "ú"], binding: accent("ê")}
        ]
      },
      "sentenceSpace" => %{
        kind: :adaptive,
        default: kp(" "),
        triggers: [
          %{
            after_any: [".", "?", "!"],
            binding: %{kind: :macro, steps: [kp(" "), sl("sen_case")]}
          }
        ]
      },
      "shiftOrCaps" => %{
        kind: :mod_morph,
        mods: [:LSHIFT, :RSHIFT],
        default: %{kind: :sk, mod: :LSHIFT},
        morphed: %{kind: :auto_layer, layer: "case_a1"},
        keep_mods: []
      },
      "alpha2OrShifted" => %{
        kind: :mod_morph,
        mods: [:LSHIFT, :RSHIFT],
        default: sl("alpha2"),
        morphed: sl("sft_a2"),
        keep_mods: []
      }
    }
  end

  defp ccedil_bindings do
    %{
      "*" => %{kind: :trans},
      "LHI" => %{kind: :macro, symbols: "ão"},
      "LBI" => %{kind: :macro, symbols: "ões"},
      "RHI" => kp("ã"),
      "RBI" => kp("õ"),
      "L1" => sl("alpha2")
    }
  end

  defp altrep2_bindings, do: %{"*" => %{kind: :trans}, "L1" => ref("a2AltRepeat")}

  defp defaults do
    %{
      sl: %{quick_release: true, ignore_modifiers: false, release_after_ms: 1000},
      sk: %{quick_release: true, ignore_modifiers: true, release_after_ms: 1500}
    }
  end

  # ------------------------------------------------------------------ Romak 24

  defp romak24_alpha1 do
    rows(%{
      "LHP" => "d",
      "LTR" => "b",
      "LHR" => "n",
      "LBR" => "f",
      "LTM" => "m",
      "LHM" => "s",
      "LBM" => "c",
      "LTI" => "g",
      "LHI" => "t",
      "LBI" => "p",
      "RTI" => "l",
      "RHI" => "r",
      "RBI" => "h",
      "RTM" => "o",
      "RHM" => "a",
      "RBM" => ",",
      "RTR" => "u",
      "RHR" => "e",
      "RBR" => ".",
      "RHP" => "i"
    })
  end

  defp romak24_alpha2 do
    %{
      "*" => %{kind: :trans},
      "LHP" => kp("y"),
      "LTR" => kp("q"),
      "LHR" => kp("z"),
      "LBR" => kp("j"),
      "LTM" => %{kind: :macro, symbols: "qu", then: [sl("altrep2")]},
      "LHM" => kp("x"),
      "LBM" => %{kind: :macro, symbols: "ç", then: [sl("ccedil")]},
      "LTI" => kp("k"),
      "LHI" => kp("w"),
      "LBI" => kp("v"),
      "RTI" => accent("ô"),
      "RHI" => accent("ã"),
      "RBI" => accent("õ"),
      "RTM" => accent("ó"),
      "RHM" => accent("á"),
      "RBM" => accent("â"),
      "RTR" => accent("ú"),
      "RHR" => accent("é"),
      "RBR" => accent("ê"),
      "RHP" => accent("í"),
      "L1" => kp("'"),
      "R1" => kp("'")
    }
  end

  defp combo(id, keys, binding, layers, role),
    do: %{
      id: id,
      keys: keys,
      binding: binding,
      layers: layers,
      role: role,
      timeout_ms: 30,
      slow_release: false
    }

  defp romak24_combos do
    [
      combo("ns", ["LHR", "LHM"], kp("q"), ["alpha1"], :command),
      combo("mg", ["LTM", "LTI"], kp("k"), ["alpha1"], :command),
      combo("st", ["LHM", "LHI"], kp("w"), ["alpha1"], :command),
      combo("cp", ["LBM", "LBI"], kp("v"), ["alpha1"], :command),
      combo("lo", ["RTI", "RTM"], kp("x"), ["alpha1"], :command),
      combo("ra", ["RHI", "RHM"], kp("z"), ["alpha1"], :command),
      combo("hcomma", ["RBI", "RBM"], kp("j"), ["alpha1"], :command),
      combo("ae", ["RHM", "RHR"], kp("y"), ["alpha1"], :command),
      combo("question", ["RHI", "RHM"], kp("?"), ["alpha2"], :typing),
      combo("exclamation", ["RBI", "RBM"], kp("!"), ["alpha2"], :typing),
      combo("agrave", ["RHM", "RHR"], accent("à"), ["alpha2"], :typing)
    ]
  end

  defp layer(id, name, bindings, twin \\ nil),
    do: %{id: id, name: name, shifted_twin: twin, bindings: bindings}

  def romak24 do
    %Layout{
      id: "romak-24",
      name: "Romak 24",
      author: "Rafael Romão",
      description: "Romak for 24 keys (1333+2): two alpha layers, Ç extension, one-shot shift.",
      languages: ["pt-BR", "en"],
      host_locale: :symbols,
      geometry: %{preset: "1333+2", column_offsets: %{}},
      keys: %{space: "L0", shift: %{key: "R1", kind: :sk}},
      behavior_defaults: defaults(),
      behaviors: behaviors(),
      layers: [
        layer(
          "alpha1",
          "Alpha 1",
          Map.merge(romak24_alpha1(), %{
            "L1" => %{kind: :key_repeat},
            "L0" => kp(" "),
            "R0" => sl("alpha2"),
            "R1" => %{kind: :sk, mod: :LSHIFT}
          })
        ),
        layer("alpha2", "Alpha 2", romak24_alpha2()),
        layer("ccedil", "Ç extension", ccedil_bindings()),
        layer("altrep2", "Alt repeat 2", altrep2_bindings())
      ],
      combos: romak24_combos(),
      repeat_policy: :repeat_key
    }
  end

  def magic_romak do
    thumbs = ["L0", "L1", "R0", "R1"]

    alpha1 =
      Map.merge(romak24_alpha1(), %{
        "RBI" => ref("magic"),
        "L1" => ref("altRepeat"),
        "L0" => ref("sentenceSpace"),
        "R0" => ref("alpha2OrShifted"),
        "R1" => ref("shiftOrCaps")
      })

    alpha2 = Map.put(romak24_alpha2(), "LBI", ref("reversedMagic"))

    %Layout{
      romak24()
      | id: "magic-romak",
        name: "Magic Romak",
        description:
          "Romak 24 with adaptive magic keys (h/v), alt-repeat, sentence case, caps word and shifted twin layers.",
        layers: [
          layer("alpha1", "Alpha 1", alpha1, "sen_case"),
          layer("alpha2", "Alpha 2", alpha2, "sft_a2"),
          layer("ccedil", "Ç extension", ccedil_bindings()),
          layer("altrep2", "Alt repeat 2", altrep2_bindings()),
          layer("sen_case", "Sentence case", upper_copy(alpha1, thumbs)),
          layer("case_a1", "Caps word", upper_copy(alpha1, thumbs)),
          layer("sft_a2", "Shifted Alpha 2", upper_copy(alpha2, thumbs))
        ],
        activators: %{
          "alpha2" => [
            %{from: "alpha1", via: "key:alpha1/R0", requires_mods: []},
            %{from: "ccedil", via: "key:ccedil/L1", requires_mods: []}
          ]
        }
    }
  end

  # ------------------------------------------------------------------ Romak 34

  def romak34 do
    alpha1 =
      rows(%{
        "LTP" => "q",
        "LTR" => "b",
        "LTM" => "m",
        "LTI" => "g",
        "LTC" => "k",
        "LHP" => "d",
        "LHR" => "n",
        "LHM" => "s",
        "LHI" => "t",
        "LHC" => "w",
        "LBP" => "y",
        "LBR" => "f",
        "LBM" => "c",
        "LBI" => "p",
        "LBC" => "v",
        "RTC" => "x",
        "RTI" => "l",
        "RTM" => "o",
        "RTR" => "u",
        "RTP" => ";",
        "RHC" => "z",
        "RHI" => "r",
        "RHM" => "a",
        "RHR" => "e",
        "RHP" => "i",
        "RBC" => "j",
        "RBI" => "h",
        "RBM" => ",",
        "RBR" => ".",
        "RBP" => "/",
        "L1" => %{kind: :key_repeat},
        "L0" => " ",
        "R0" => sl("alpha2"),
        "R1" => %{kind: :sk, mod: :LSHIFT}
      })

    alpha2 = %{
      "*" => %{kind: :trans},
      "LTM" => %{kind: :macro, symbols: "qu", then: [sl("altrep2")]},
      "LBM" => %{kind: :macro, symbols: "ç", then: [sl("ccedil")]},
      "RTI" => accent("ô"),
      "RTM" => accent("ó"),
      "RTR" => accent("ú"),
      "RHI" => accent("ã"),
      "RHM" => accent("á"),
      "RHR" => accent("é"),
      "RHP" => accent("í"),
      "RBI" => accent("õ"),
      "RBM" => accent("â"),
      "RBR" => accent("ê"),
      "L1" => kp("'"),
      "R1" => kp("'")
    }

    %Layout{
      id: "romak-34",
      name: "Romak 34",
      author: "Rafael Romão",
      description: "Romak for 34 keys (3x5+2): accented vowels on a one-shot second alpha layer.",
      languages: ["pt-BR", "en"],
      host_locale: :symbols,
      geometry: %{preset: "3x5+2", column_offsets: %{}},
      keys: %{space: "L0", shift: %{key: "R1", kind: :sk}},
      behavior_defaults: defaults(),
      behaviors: behaviors(),
      layers: [
        layer("alpha1", "Alpha 1", alpha1),
        layer("alpha2", "Alpha 2", alpha2),
        layer("ccedil", "Ç extension", ccedil_bindings()),
        layer("altrep2", "Alt repeat 2", altrep2_bindings())
      ],
      combos: [
        combo("question", ["RHI", "RHM"], kp("?"), ["alpha2"], :typing),
        combo("exclamation", ["RBI", "RBM"], kp("!"), ["alpha2"], :typing)
      ],
      repeat_policy: :repeat_key
    }
  end
end
