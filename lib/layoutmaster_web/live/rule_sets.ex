defmodule LayoutMasterWeb.Live.RuleSets do
  @moduledoc "Resolve rule sets from URL refs: preset ids or `saved:<id>` (storage)."

  alias LayoutMaster.Rules.Presets
  alias LayoutMaster.Rules.Serialize
  alias LayoutMaster.Storage

  def resolve("saved:" <> id) do
    case Storage.get(:rulesets, id) do
      {:ok, doc, _meta} -> Serialize.from_map(doc)
      _ -> Presets.layouts_doc()
    end
  end

  def resolve(id) when is_binary(id), do: Presets.get(id)
  def resolve(_), do: Presets.layouts_doc()

  def valid_ref?("saved:" <> _), do: true
  def valid_ref?(id), do: id in Presets.ids()

  def saved do
    case Storage.list(:rulesets) do
      {:ok, list} -> list
      _ -> []
    end
  end

  @doc "Apply URL-level globals (universe) to a rule set."
  def with_universe(rule_set, universe),
    do: %{rule_set | globals: Map.put(rule_set.globals, :universe, universe)}
end
