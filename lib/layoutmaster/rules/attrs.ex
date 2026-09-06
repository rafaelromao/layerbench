defmodule LayoutMaster.Rules.Attrs do
  @moduledoc """
  Per-logical-key attributes used by rule predicates: geometry, finger, kind, layer.
  Built once per analysis from the simulation registry and the compiled layout.
  """

  alias LayoutMaster.Geometry
  alias LayoutMaster.Layout.Compile
  alias LayoutMaster.Tables.Registry

  defstruct id: 0,
            pos: 0,
            layer: 0,
            key_kind: :alpha,
            label: "",
            hand: :L,
            fingers: [],
            finger: nil,
            rank: 0,
            x: 0.0,
            y: 0.0,
            row: 1,
            col: 3,
            thumb: false,
            home: false,
            inner: false,
            members: []

  @type t :: %__MODULE__{}

  @doc "Build a map id → attrs."
  def build(%Compile{} = c, %Registry{} = registry) do
    registry
    |> Registry.all()
    |> Map.new(fn lk ->
      pos = Compile.position(c, lk.pos)
      finger = if length(pos.fingers) == 1, do: hd(pos.fingers), else: nil

      {lk.id,
       %__MODULE__{
         id: lk.id,
         pos: lk.pos,
         layer: lk.layer,
         key_kind: lk.key_kind,
         label: lk.label,
         hand: pos.hand,
         fingers: pos.fingers,
         finger: finger,
         rank: if(finger, do: Geometry.finger_rank(finger), else: worst_rank(pos.fingers)),
         x: pos.x,
         y: pos.y,
         row: pos.row,
         col: pos.col,
         thumb: pos.thumb,
         home: pos.home,
         inner: pos.inner,
         members: pos.members
       }}
    end)
  end

  defp worst_rank([]), do: 0
  defp worst_rank(fingers), do: fingers |> Enum.map(&Geometry.finger_rank/1) |> Enum.max()

  @doc "Same finger for a pair: any shared finger (chords use the worst-case member)."
  def same_finger?(%__MODULE__{fingers: a}, %__MODULE__{fingers: b}), do: Enum.any?(a, &(&1 in b))

  def same_hand?(%__MODULE__{hand: a}, %__MODULE__{hand: b}), do: a != :both and a == b

  def adjacent_fingers?(%__MODULE__{finger: fa}, %__MODULE__{finger: fb})
      when fa != nil and fb != nil, do: Geometry.adjacent_fingers?(fa, fb)

  def adjacent_fingers?(_, _), do: false

  def rank_delta(%__MODULE__{rank: a}, %__MODULE__{rank: b}), do: abs(a - b)

  @doc "Direction of a same-hand pair: :inward when moving toward the thumb (rank increases)."
  def direction(%__MODULE__{} = a, %__MODULE__{} = b) do
    cond do
      not same_hand?(a, b) -> :none
      b.rank > a.rank -> :inward
      b.rank < a.rank -> :outward
      true -> :same
    end
  end

  def distance(%__MODULE__{} = a, %__MODULE__{} = b, model \\ :euclid) do
    if same_hand?(a, b) do
      dx = a.x - b.x
      dy = a.y - b.y

      case model do
        :euclid -> :math.sqrt(dx * dx + dy * dy)
        :squared -> dx * dx + dy * dy
        :manhattan -> abs(dx) + abs(dy)
      end
    else
      nil
    end
  end
end
