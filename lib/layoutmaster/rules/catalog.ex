defmodule LayoutMaster.Rules.Catalog do
  @moduledoc """
  Built-in rules (SPEC §7.2) expressed with the declarative vocabulary of `LayoutMaster.Rules.Predicates`.
  Each rule is plain data, so presets and users can copy, tweak, disable or remove them.
  """

  # Band bounds from the Layouts Doc ch. 13.4 (upper bounds of Min…Max categories).
  @bands %{
    alt: %{
      direction: :higher_is_better,
      bounds: [23.9, 26.8, 29.7, 32.6, 35.4, 38.3, 41.2, 44.1, 47.0]
    },
    roll: %{
      direction: :higher_is_better,
      bounds: [37.8, 39.7, 41.5, 43.3, 45.2, 47.0, 48.8, 50.6, 52.5]
    },
    in_out: %{direction: :higher_is_better, bounds: [0.8, 1.2, 1.7, 2.1, 2.6, 3.0, 3.5, 3.9, 4.4]},
    sfb: %{direction: :lower_is_better, bounds: [0.525, 0.625, 0.735, 0.875, 1.075, 1.375]},
    sfs: %{direction: :lower_is_better, bounds: [5.3, 5.7, 6.1, 6.5, 6.9, 7.3]},
    scissors: %{direction: :lower_is_better, bounds: [0.1, 0.15, 0.25, 0.35, 0.45, 0.55, 0.7]},
    redir: %{direction: :lower_is_better, bounds: [2.8, 3.6, 4.5, 5.4, 6.2, 7.0, 9.0]},
    pinky_off: %{direction: :lower_is_better, bounds: [1.8, 2.7, 3.5, 4.3, 5.2, 5.9, 6.8]},
    lsb: %{direction: :lower_is_better, bounds: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]},
    hand: %{
      direction: :lower_is_better,
      bounds: [2.0, 5.0, 8.0],
      labels: [:even, :leans, :heavy, :very_heavy]
    }
  }

  def bands, do: @bands

  @no_thumbs %{any_thumb: false}
  @no_chords %{is_chord: false}

  defp rule(id, label, family, attrs) do
    Map.merge(
      %{
        id: id,
        label: label,
        family: family,
        enabled: true,
        source: :ngram,
        score: %{weight: 0.0}
      },
      attrs
    )
  end

  # ---------------------------------------------------------------- bigrams

  def sfb_where, do: %{all: [%{same_finger: true}, %{same_key: false}, @no_chords]}

  def lsb_where do
    %{
      all: [
        %{same_hand: true},
        @no_thumbs,
        @no_chords,
        %{
          any: [
            %{all: [%{rank_delta: %{eq: 1}}, %{x_distance: %{min: "$global.lsb_adjacent_u"}}]},
            %{
              all: [%{rank_delta: %{eq: 2}}, %{x_distance: %{min: "$global.lsb_semi_adjacent_u"}}]
            }
          ]
        }
      ]
    }
  end

  def scissor_where(rows),
    do: %{
      all: [
        %{same_hand: true},
        %{same_finger: false},
        @no_thumbs,
        @no_chords,
        %{row_delta: %{abs: rows}},
        %{finger_height_preference: :violated}
      ]
    }

  def bigram_rules do
    [
      rule("sfb", "Same finger bigrams", :bigram, %{
        description: "Two consecutive keys pressed by the same finger (repeats excluded).",
        ngram: %{n: 2, skip: 0},
        where: sfb_where(),
        aggregate: :percent_of_ngrams,
        bands: @bands.sfb,
        score: %{weight: 3.0}
      }),
      rule("sfb_distance", "SFB distance", :bigram, %{
        description:
          "Σ frequency × distance of same finger bigrams (percent-weighted key units).",
        ngram: %{n: 2, skip: 0},
        where: sfb_where(),
        aggregate: :sum_distance
      }),
      rule("sfb_2u", "SFB ≥ 2 rows", :bigram, %{
        description: "Same finger bigrams jumping over the home row.",
        ngram: %{n: 2, skip: 0},
        where: %{all: [sfb_where(), %{row_delta: %{abs_min: 2}}]},
        aggregate: :percent_of_ngrams
      }),
      rule("repeats", "Repeated keys", :bigram, %{
        description: "The same key pressed twice in a row.",
        ngram: %{n: 2, skip: 0},
        where: %{same_key: true},
        aggregate: :percent_of_ngrams
      }),
      rule("lsb", "Lateral stretch bigrams", :bigram, %{
        description:
          "Adjacent fingers ≥ 2U apart horizontally, or semi-adjacent fingers ≥ 3.5U apart.",
        ngram: %{n: 2, skip: 0},
        where: lsb_where(),
        aggregate: :percent_of_ngrams,
        bands: @bands.lsb,
        score: %{weight: 1.0}
      }),
      rule("fsb", "Full scissor bigrams", :bigram, %{
        description:
          "Two rows apart with the finger that prefers being higher below the other (adjacent fingers weigh 1, others 0.5).",
        ngram: %{n: 2, skip: 0},
        params: %{finger_height_preference: %{middle: 3, ring: 2, pinky: 1, index: 0}},
        where: scissor_where(2),
        weight: %{adjacent_fingers: 1.0, non_adjacent_fingers: 0.5},
        aggregate: :percent_of_ngrams,
        bands: @bands.scissors,
        score: %{weight: 1.0}
      }),
      rule("hsb", "Half scissor bigrams", :bigram, %{
        description: "One row apart with the finger that prefers being higher below the other.",
        ngram: %{n: 2, skip: 0},
        params: %{finger_height_preference: %{middle: 3, ring: 2, pinky: 1, index: 0}},
        where: scissor_where(1),
        weight: %{adjacent_fingers: 1.0, non_adjacent_fingers: 0.5},
        aggregate: :percent_of_ngrams
      }),
      rule("thumb_bigrams", "Thumb bigrams", :bigram, %{
        description:
          "Consecutive presses on the same hand where at least one key is a thumb key.",
        ngram: %{n: 2, skip: 0},
        where: %{all: [%{same_hand: true}, %{any_thumb: true}, %{same_key: false}]},
        aggregate: :percent_of_ngrams
      }),
      rule("thumb_double", "Thumb double taps", :bigram, %{
        description: "The same thumb key pressed twice in a row (harder than on other fingers).",
        ngram: %{n: 2, skip: 0},
        where: %{all: [%{same_key: true}, %{is_thumb: true}]},
        aggregate: :percent_of_ngrams
      }),
      rule("layer_tap_sfb", "Layer tap → same finger", :layer, %{
        description:
          "A layer tap followed by another key on the same finger (e.g. two thumb taps).",
        ngram: %{n: 2, skip: 0},
        where: %{all: [%{same_finger: true}, %{key_kind: %{in: [:layer_tap]}, at: [0]}]},
        aggregate: :percent_of_ngrams
      })
    ]
  end

  # -------------------------------------------------------------- skipgrams

  def skipgram_rules do
    [
      rule("sfs", "Same finger skipgrams", :skipgram, %{
        description: "Same finger with one key in between.",
        ngram: %{n: 2, skip: 1},
        where: sfb_where(),
        aggregate: :percent_of_ngrams,
        bands: @bands.sfs,
        score: %{weight: 1.0}
      }),
      rule("sfs_weighted", "SFS (skip 1–3, weighted)", :skipgram, %{
        description: "Same finger skipgrams over 1–3 keys weighted 0.5 / 0.25 / 0.125.",
        ngram: %{n: 2, skip: [1, 2, 3]},
        where: sfb_where(),
        aggregate: :percent_of_ngrams
      }),
      rule("finger_speed", "Finger movement (SFS distance)", :skipgram, %{
        description:
          "Distance-weighted same finger skipgrams (Genkey/Oxeylyzer style finger speed component).",
        ngram: %{n: 2, skip: [1, 2, 3]},
        where: sfb_where(),
        aggregate: :sum_distance
      }),
      rule("lss", "Lateral stretch skipgrams", :skipgram, %{
        ngram: %{n: 2, skip: 1},
        where: lsb_where(),
        aggregate: :percent_of_ngrams
      }),
      rule("fss", "Full scissor skipgrams", :skipgram, %{
        ngram: %{n: 2, skip: 1},
        params: %{finger_height_preference: %{middle: 3, ring: 2, pinky: 1, index: 0}},
        where: scissor_where(2),
        weight: %{adjacent_fingers: 1.0, non_adjacent_fingers: 0.5},
        aggregate: :percent_of_ngrams
      }),
      rule("hss", "Half scissor skipgrams", :skipgram, %{
        ngram: %{n: 2, skip: 1},
        params: %{finger_height_preference: %{middle: 3, ring: 2, pinky: 1, index: 0}},
        where: scissor_where(1),
        weight: %{adjacent_fingers: 1.0, non_adjacent_fingers: 0.5},
        aggregate: :percent_of_ngrams
      })
    ]
  end

  # --------------------------------------------------------------- trigrams

  defp roll(direction) do
    %{
      any: [
        %{
          all: [
            %{hand_pattern: "aab"},
            %{direction: direction, at: [0, 1]},
            %{same_finger: false, at: [0, 1]}
          ]
        },
        %{
          all: [
            %{hand_pattern: "abb"},
            %{direction: direction, at: [1, 2]},
            %{same_finger: false, at: [1, 2]}
          ]
        }
      ]
    }
  end

  def redirect_where, do: %{all: [%{hand_pattern: "aaa"}, %{changes_direction: true}, @no_thumbs]}

  def trigram_rules do
    [
      rule("alternation", "Alternation", :trigram, %{
        description: "Hand changes on every key (L R L / R L R).",
        ngram: %{n: 3},
        where: %{hand_pattern: "aba"},
        aggregate: :percent_of_ngrams,
        bands: @bands.alt,
        score: %{weight: 0.5}
      }),
      rule("alt_sfs", "Alternation with SFS", :trigram, %{
        description: "Alternating trigram whose outer keys share a finger.",
        ngram: %{n: 3},
        where: %{
          all: [
            %{hand_pattern: "aba"},
            %{same_finger: true, at: [0, 2]},
            %{same_key: false, at: [0, 2]}
          ]
        },
        aggregate: :percent_of_ngrams
      }),
      rule("roll_in", "Inward rolls", :trigram, %{
        description:
          "Two keys on one hand moving toward the index, then the other hand (or vice versa).",
        ngram: %{n: 3},
        where: roll(:inward),
        aggregate: :percent_of_ngrams
      }),
      rule("roll_out", "Outward rolls", :trigram, %{
        ngram: %{n: 3},
        where: roll(:outward),
        aggregate: :percent_of_ngrams
      }),
      rule("rolls", "Rolls (in + out)", :trigram, %{
        description: "Two-key rolls on one hand plus a key on the other hand.",
        ngram: %{n: 3},
        where: %{any: [roll(:inward), roll(:outward)]},
        aggregate: :percent_of_ngrams,
        bands: @bands.roll,
        score: %{weight: 0.5}
      }),
      rule("in_out_ratio", "In:out roll ratio", :trigram, %{
        description: "Inward rolls divided by outward rolls.",
        source: :ngram,
        aggregate: :ratio,
        aggregate_opts: %{numerator: "roll_in", denominator: "roll_out"},
        bands: @bands.in_out
      }),
      rule("onehand_in", "One-hand inward (3rolls)", :trigram, %{
        ngram: %{n: 3},
        where: %{all: [%{hand_pattern: "aaa"}, %{direction: :inward}, @no_thumbs]},
        aggregate: :percent_of_ngrams
      }),
      rule("onehand_out", "One-hand outward (3rolls)", :trigram, %{
        ngram: %{n: 3},
        where: %{all: [%{hand_pattern: "aaa"}, %{direction: :outward}, @no_thumbs]},
        aggregate: :percent_of_ngrams
      }),
      rule("redirect", "Redirects", :trigram, %{
        description: "One-handed trigram that changes direction.",
        ngram: %{n: 3},
        where: redirect_where(),
        aggregate: :percent_of_ngrams,
        bands: @bands.redir,
        score: %{weight: 1.0}
      }),
      rule("weak_redirect", "Weak redirects", :trigram, %{
        description: "Redirects that do not involve an index finger.",
        ngram: %{n: 3},
        where: %{
          all: [redirect_where(), %{none: [%{includes_finger_name: %{in: [:index, :thumb]}}]}]
        },
        aggregate: :percent_of_ngrams
      })
    ]
  end

  # ------------------------------------------------------------------ usage

  def usage_rules do
    [
      rule("finger_usage", "Finger usage", :usage, %{
        description: "Share of keystrokes per finger.",
        ngram: %{n: 1},
        aggregate: :per_finger
      }),
      rule("hand_balance", "Hand balance", :usage, %{
        description: "Share of keystrokes per hand (value = |left − right|).",
        ngram: %{n: 1},
        aggregate: :per_hand,
        bands: @bands.hand
      }),
      rule("row_usage", "Row usage", :usage, %{
        ngram: %{n: 1},
        aggregate: :per_row,
        breakdown_by: :row
      }),
      rule("column_usage", "Column usage", :usage, %{
        ngram: %{n: 1},
        aggregate: :per_col,
        breakdown_by: :col
      }),
      rule("pinky_off", "Pinky off home", :usage, %{
        description: "Keystrokes on top/bottom-row pinky keys.",
        ngram: %{n: 1},
        where: %{all: [%{finger_name: %{in: [:pinky]}}, %{row: %{in: [0, 2]}}]},
        aggregate: :percent_of_ngrams,
        bands: @bands.pinky_off,
        score: %{weight: 0.5}
      }),
      rule("home_row", "Home row usage", :usage, %{
        ngram: %{n: 1},
        where: %{all: [%{row: %{in: [1]}}, @no_thumbs]},
        aggregate: :percent_of_ngrams
      }),
      rule("center_column", "Inner column usage", :usage, %{
        ngram: %{n: 1},
        where: %{is_inner: true},
        aggregate: :percent_of_ngrams
      }),
      rule("layer_distribution", "Keystrokes per layer", :layer, %{
        ngram: %{n: 1},
        aggregate: :per_layer,
        breakdown_by: :layer
      }),
      rule("finger_travel", "Finger travel", :usage, %{
        description:
          "Cumulative Euclidean travel from each finger's previous key (U per keystroke).",
        source: :travel,
        travel_mode: :continuous
      })
    ]
  end

  # ----------------------------------------------------------------- effort

  def effort_rules do
    [
      rule("effort", "Effort", :effort, %{
        description:
          "Mean per-key effort per 100 keystrokes (editable effort grid; thumbs 1, inner column 5).",
        ngram: %{n: 1},
        aggregate: :weighted_sum,
        scale: 100.0
      }),
      rule("hard_words", "Hard words", :effort, %{
        description: "Words ranked by effort per character (includes extra layer/shift presses).",
        source: :word,
        min_length: 4,
        min_count: 2
      })
    ]
  end

  # ------------------------------------------------------------------ layer

  def layer_rules do
    [
      rule("layer_taps_per_100", "Layer taps per 100 symbols", :layer, %{
        source: :stat,
        stat: :layer_taps_per_100,
        unit: :per100,
        score: %{weight: 1.0},
        bands: %{direction: :lower_is_better, bounds: [1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 15.0]}
      }),
      rule("one_shots_per_word", "One-shot activations per word", :layer, %{
        source: :stat,
        stat: :one_shots_per_word,
        unit: :ratio
      }),
      rule("wasted_one_shots", "Wasted one-shots", :layer, %{
        description:
          "One-shot layers consumed by a key that resolved elsewhere or by a modifier.",
        source: :stat,
        stat: :wasted_one_shots_pct,
        unit: :percent,
        bands: %{direction: :lower_is_better, bounds: [1.0, 2.0, 5.0, 10.0, 20.0]}
      }),
      rule("macro_usage", "Macro presses", :layer, %{
        source: :stat,
        stat: :macro_pct,
        unit: :percent
      }),
      rule("adaptive_hit_rate", "Adaptive key hit rate", :layer, %{
        description:
          "How often an adaptive (magic) key produced its trigger output rather than the default.",
        source: :stat,
        stat: :adaptive_hit_rate,
        unit: :percent
      }),
      rule("combo_usage", "Combo presses", :layer, %{
        source: :stat,
        stat: :combo_pct,
        unit: :percent
      }),
      rule("extra_keystrokes", "Extra keystrokes per symbol", :layer, %{
        description: "Physical presses per symbol minus one (layer taps, shifts, repeats…).",
        source: :stat,
        stat: :extra_keystrokes,
        unit: :ratio,
        bands: %{direction: :lower_is_better, bounds: [0.02, 0.04, 0.06, 0.08, 0.1, 0.15]},
        score: %{weight: 1.0}
      })
    ]
  end

  # ------------------------------------------------------------------- runs

  def run_rules do
    [
      rule("same_hand_runs", "Same-hand run length", :trigram, %{
        description: "Mean length of same-hand runs; histogram in breakdown.",
        source: :run,
        run: %{by: :hand},
        aggregate: :histogram
      }),
      rule("same_hand_strings", "Same-hand strings", :trigram, %{
        description: "Words/strings typed on one hand for ≥ 4 keys.",
        source: :run,
        run: %{by: :hand, min_len: 4},
        aggregate: :top_strings
      })
    ]
  end

  @doc "All built-in rules."
  def all,
    do:
      bigram_rules() ++
        skipgram_rules() ++
        trigram_rules() ++ usage_rules() ++ effort_rules() ++ layer_rules() ++ run_rules()

  def get(id), do: Enum.find(all(), &(&1.id == id))
end
