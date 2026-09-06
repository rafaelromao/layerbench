defmodule LayoutMaster.Rules.Bands do
  @moduledoc """
  Band classification (Layouts Doc ch. 13.4): a list of ascending upper bounds splits the range
  into named categories. `direction` says whether lower values are better.
  """

  @labels ~w(min very_low low mid_low mid mid_high high very_high max)a

  def labels, do: @labels

  @doc """
  Classify a value. Returns `%{index, label, quality}` where quality ∈ :good | :ok | :bad | :neutral.
  For 9 categories, indices 0–2 are the best third.
  """
  def classify(_value, nil), do: %{index: nil, label: nil, quality: :neutral}
  def classify(nil, _bands), do: %{index: nil, label: nil, quality: :neutral}

  def classify(value, %{bounds: bounds} = bands) when is_list(bounds) and bounds != [] do
    direction = Map.get(bands, :direction, :lower_is_better)
    idx = Enum.find_index(bounds, fn b -> value <= b end) || length(bounds)
    n = length(bounds) + 1
    labels = Map.get(bands, :labels) || Enum.take(@labels, n) |> pad(n)
    label = Enum.at(labels, idx) || :beyond
    # position 0..1 along the categories; good end depends on direction
    position = idx / max(1, n - 1)
    goodness = if direction == :lower_is_better, do: 1.0 - position, else: position

    quality =
      cond do
        goodness >= 0.66 -> :good
        goodness >= 0.33 -> :ok
        true -> :bad
      end

    %{index: idx, label: label, quality: quality, goodness: goodness}
  end

  def classify(_value, _), do: %{index: nil, label: nil, quality: :neutral}

  defp pad(list, n) when length(list) >= n, do: list
  defp pad(list, n), do: list ++ List.duplicate(:max, n - length(list))

  @doc "Human label for a band atom."
  def human(nil), do: ""
  def human(label) when is_atom(label), do: label |> Atom.to_string() |> String.replace("_", " ")
end
