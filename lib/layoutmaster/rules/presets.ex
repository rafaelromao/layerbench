defmodule LayoutMaster.Rules.Presets do
  @moduledoc """
  Rule-set presets (SPEC §7.4): Layouts Doc (default), cyanophage-like, Keysolve-like, Romak author.
  """

  alias LayoutMaster.Rules.Catalog

  @type rule_set :: %{
          id: String.t(),
          name: String.t(),
          description: String.t(),
          globals: map(),
          rules: [map()],
          score_enabled: boolean()
        }

  def ids, do: ~w(layouts_doc cyanophage keysolve romak_author)

  def get("layouts_doc"), do: layouts_doc()
  def get("cyanophage"), do: cyanophage()
  def get("keysolve"), do: keysolve()
  def get("romak_author"), do: romak_author()
  def get(_), do: layouts_doc()

  def all, do: Enum.map(ids(), &get/1)

  def layouts_doc do
    %{
      id: "layouts_doc",
      name: "Layouts Doc",
      description:
        "Definitions and bands from the Keyboard Layouts Doc (3rd ed.). Thumbs included, space excluded, no composite score.",
      globals: %{},
      rules: Catalog.all(),
      score_enabled: false
    }
  end

  def cyanophage do
    rules =
      Catalog.all()
      |> Enum.map(fn
        %{id: "lsb"} = r ->
          %{
            r
            | label: "Lat stretch bigrams (column pairs)",
              description: "cyanophage: inner-column key with a middle-finger key (any rows).",
              where: %{
                all: [
                  %{same_hand: true},
                  %{any_thumb: false},
                  %{any_inner: true},
                  %{includes_finger_name: %{in: [:middle]}},
                  %{same_finger: false}
                ]
              }
          }

        %{id: "fsb"} = r ->
          %{
            r
            | label: "Scissors (adjacent columns, 2 rows)",
              description: "cyanophage: adjacent fingers, two rows apart, same hand.",
              where: %{
                all: [
                  %{same_hand: true},
                  %{same_finger: false},
                  %{any_thumb: false},
                  %{adjacent_fingers: true},
                  %{row_delta: %{abs_min: 2}}
                ]
              },
              weight: nil
          }

        %{id: "redirect"} = r ->
          %{
            r
            | where: %{all: [Catalog.redirect_where(), %{same_finger: false, at: [0, 2]}]},
              description: "cyanophage: direction change with three different fingers."
          }

        r ->
          r
      end)
      |> Enum.map(fn r ->
        if r[:aggregate] == :percent_of_ngrams and r.source == :ngram and
             get_in(r, [:ngram, :n]) == 2, do: %{r | aggregate: :percent_of_keystrokes}, else: r
      end)

    %{
      id: "cyanophage",
      name: "cyanophage-like",
      description:
        "Column-pair LSBs, adjacency scissors, bigram percentages over keystrokes (+ one space per word), repeats excluded.",
      globals: %{
        normalization: :percent_of_keystrokes,
        space_per_word_in_keystrokes: true,
        cross_word: :reset
      },
      rules: rules,
      score_enabled: false
    }
  end

  def keysolve do
    rules =
      Enum.map(Catalog.all(), fn
        %{id: "fsb"} = r ->
          %{
            r
            | description: "Keysolve: Doc full scissors plus every ring–middle two-row jump.",
              where: %{
                any: [
                  Catalog.scissor_where(2),
                  %{
                    all: [
                      %{same_hand: true},
                      %{finger_name_pair: [:ring, :middle]},
                      %{row_delta: %{abs: 2}}
                    ]
                  }
                ]
              }
          }

        %{id: "hsb"} = r ->
          %{
            r
            | where: %{
                any: [
                  Catalog.scissor_where(1),
                  %{
                    all: [
                      %{same_hand: true},
                      %{finger_name_pair: [:ring, :middle]},
                      %{row_delta: %{abs: 1}}
                    ]
                  }
                ]
              }
          }

        r ->
          r
      end)

    %{
      id: "keysolve",
      name: "Keysolve-like",
      description: "Ring–middle row jumps always count as scissors; bigram normalization.",
      globals: %{},
      rules: rules,
      score_enabled: false
    }
  end

  def romak_author do
    weights = %{
      "sfb" => 3.0,
      "sfs" => 1.0,
      "fsb" => 1.0,
      "lsb" => 1.0,
      "redirect" => 1.0,
      "alternation" => 0.5,
      "rolls" => 0.5,
      "pinky_off" => 1.0,
      "layer_taps_per_100" => 1.0,
      "wasted_one_shots" => 1.0,
      "extra_keystrokes" => 1.0,
      "hand_balance" => 0.5
    }

    rules =
      Enum.map(Catalog.all(), fn r -> %{r | score: %{weight: Map.get(weights, r.id, 0.0)}} end)

    %{
      id: "romak_author",
      name: "Romak author",
      description:
        "Layouts Doc rules with the layer family weighted; composite score enabled; PT-BR + EN focus.",
      globals: %{},
      rules: rules,
      score_enabled: true
    }
  end
end
