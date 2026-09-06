defmodule LayoutMaster.Geometry do
  @moduledoc """
  Physical key geometry (SPEC §6).

  A geometry is a list of keys with center coordinates in key units (U): x grows
  left→right across the whole board, y grows top→bottom. Rows: 0 top, 1 home,
  2 bottom, 3 thumb. Canonical columns: 0 outer-pinky, 1 pinky, 2 ring, 3 middle,
  4 index, 5 inner; thumb keys use the thumb index (0 = innermost) as column.
  """

  @type hand :: :L | :R
  @type finger :: :LP | :LR | :LM | :LI | :LT | :RT | :RI | :RM | :RR | :RP
  @type row :: 0 | 1 | 2 | 3

  @fingers [:LP, :LR, :LM, :LI, :LT, :RT, :RI, :RM, :RR, :RP]
  @rank %{LP: 0, LR: 1, LM: 2, LI: 3, LT: 4, RT: 4, RI: 3, RM: 2, RR: 1, RP: 0}
  @name %{
    LP: :pinky,
    LR: :ring,
    LM: :middle,
    LI: :index,
    LT: :thumb,
    RT: :thumb,
    RI: :index,
    RM: :middle,
    RR: :ring,
    RP: :pinky
  }

  defmodule Key do
    @moduledoc "One physical key."
    @enforce_keys [:id, :hand, :finger, :row, :col, :x, :y]
    defstruct id: nil,
              hand: :L,
              finger: :LP,
              row: 1,
              col: 1,
              x: 0.0,
              y: 0.0,
              w: 1.0,
              h: 1.0,
              rotation: 0.0,
              home: false,
              thumb: false,
              inner: false

    @type t :: %__MODULE__{
            id: String.t(),
            hand: LayoutMaster.Geometry.hand(),
            finger: LayoutMaster.Geometry.finger(),
            row: LayoutMaster.Geometry.row(),
            col: non_neg_integer(),
            x: float(),
            y: float(),
            w: float(),
            h: float(),
            rotation: float(),
            home: boolean(),
            thumb: boolean(),
            inner: boolean()
          }
  end

  @enforce_keys [:id, :name, :family, :keys]
  defstruct id: nil,
            name: nil,
            family: :columnar,
            keys: [],
            supports_angle_mod: false,
            text_rows: [[], [], []],
            text_thumbs: []

  @type t :: %__MODULE__{
          id: String.t(),
          name: String.t(),
          family: :columnar | :rowstagger,
          keys: [Key.t()],
          supports_angle_mod: boolean(),
          text_rows: [[String.t()]],
          text_thumbs: [String.t()]
        }

  @doc "All fingers, left pinky to right pinky."
  def fingers, do: @fingers

  def finger_hand(f) when f in [:LP, :LR, :LM, :LI, :LT], do: :L
  def finger_hand(_), do: :R

  def finger_rank(f), do: Map.fetch!(@rank, f)
  def finger_name(f), do: Map.fetch!(@name, f)

  @doc "Adjacent fingers: same hand and rank differs by one (thumb is adjacent to index)."
  def adjacent_fingers?(a, b),
    do: finger_hand(a) == finger_hand(b) and abs(finger_rank(a) - finger_rank(b)) == 1

  # ------------------------------------------------------------------ presets

  @col_letters ~w(O P R M I C)
  @row_letters ~w(T H B)
  @default_column_offsets %{0 => 0.25, 1 => 0.25, 2 => 0.0, 3 => -0.25, 4 => 0.0, 5 => 0.25}
  @columnar_gap 1.0
  @rowstagger_offsets %{0 => -0.25, 1 => 0.0, 2 => 0.5}

  @doc "Default column stagger (U, positive = lower) for columnar presets."
  def default_column_offsets, do: @default_column_offsets

  @doc "Default finger for a canonical column."
  def column_finger(hand, col) do
    name =
      cond do
        col <= 1 -> "P"
        col == 2 -> "R"
        col == 3 -> "M"
        true -> "I"
      end

    String.to_atom("#{hand}#{name}")
  end

  @doc "Key id for a hand/row/column, e.g. `LTP`, `RHI`, `L0`."
  def key_id(hand, 3, col), do: "#{hand}#{col}"

  def key_id(hand, row, col),
    do: "#{hand}#{Enum.at(@row_letters, row)}#{Enum.at(@col_letters, col)}"

  @preset_ids ~w(3x5+2 3x5+3 3x6+3 1333+2 ansi iso)
  def preset_ids, do: @preset_ids

  @doc "Build a preset geometry, optionally overriding columnar offsets (`%{col => y_offset}`)."
  @spec preset(String.t(), map()) :: t()
  def preset(id, column_offsets \\ %{})

  def preset("3x5+2", offsets),
    do:
      columnar(
        %{
          id: "3x5+2",
          name: "Split columnar 3×5 + 2 thumbs (34)",
          cols: [1, 2, 3, 4, 5],
          thumbs: 2
        },
        offsets
      )

  def preset("3x5+3", offsets),
    do:
      columnar(
        %{
          id: "3x5+3",
          name: "Split columnar 3×5 + 3 thumbs (36)",
          cols: [1, 2, 3, 4, 5],
          thumbs: 3
        },
        offsets
      )

  def preset("3x6+3", offsets),
    do:
      columnar(
        %{
          id: "3x6+3",
          name: "Split columnar 3×6 + 3 thumbs (42, Corne)",
          cols: [0, 1, 2, 3, 4, 5],
          thumbs: 3
        },
        offsets
      )

  def preset("1333+2", offsets),
    do:
      columnar(
        %{
          id: "1333+2",
          name: "Split columnar 1333 + 2 thumbs (24)",
          cols: [1, 2, 3, 4],
          home_only: [1],
          thumbs: 2
        },
        offsets
      )

  def preset("ansi", _), do: rowstagger("ansi", "Row stagger ANSI", false)
  def preset("iso", _), do: rowstagger("iso", "Row stagger ISO", true)
  def preset(other, _), do: raise(ArgumentError, "unknown geometry preset #{inspect(other)}")

  defp columnar(spec, overrides) do
    offsets = Map.merge(@default_column_offsets, overrides)
    home_only = Map.get(spec, :home_only, [])

    {keys, rows} =
      for hand <- [:L, :R],
          row <- [0, 1, 2],
          col <- ordered_cols(hand, spec.cols),
          reduce: {[], %{0 => [], 1 => [], 2 => []}} do
        {keys, rows} ->
          if row != 1 and col in home_only do
            {keys, rows}
          else
            id = key_id(hand, row, col)

            key = %Key{
              id: id,
              hand: hand,
              finger: column_finger(hand, col),
              row: row,
              col: col,
              x: columnar_x(hand, col),
              y: row + Map.fetch!(offsets, col),
              home: row == 1,
              inner: col == 5
            }

            {[key | keys], Map.update!(rows, row, &[id | &1])}
          end
      end

    left_thumbs =
      for i <- (spec.thumbs - 1)..0//-1 do
        %Key{
          id: key_id(:L, 3, i),
          hand: :L,
          finger: :LT,
          row: 3,
          col: i,
          x: thumb_x(:L, i),
          y: 3.25,
          rotation: 10.0 + 8 * i,
          thumb: true
        }
      end

    right_thumbs =
      for i <- 0..(spec.thumbs - 1) do
        %Key{
          id: key_id(:R, 3, i),
          hand: :R,
          finger: :RT,
          row: 3,
          col: i,
          x: thumb_x(:R, i),
          y: 3.25,
          rotation: -(10.0 + 8 * i),
          thumb: true
        }
      end

    thumbs = left_thumbs ++ right_thumbs

    %__MODULE__{
      id: spec.id,
      name: spec.name,
      family: :columnar,
      keys: Enum.reverse(keys) ++ thumbs,
      supports_angle_mod: false,
      text_rows: [Enum.reverse(rows[0]), Enum.reverse(rows[1]), Enum.reverse(rows[2])],
      text_thumbs: Enum.map(thumbs, & &1.id)
    }
  end

  defp ordered_cols(:L, cols), do: Enum.sort(cols)
  defp ordered_cols(:R, cols), do: Enum.sort(cols, :desc)

  defp columnar_x(:L, col), do: col * 1.0
  defp columnar_x(:R, col), do: 11 - col + @columnar_gap

  # Innermost thumb sits half a key inside the index column; further thumbs step outward.
  defp thumb_x(:L, i), do: 4.5 - i
  defp thumb_x(:R, i), do: 11 - 4 + @columnar_gap - 0.5 + i

  defp rowstagger(id, name, iso?) do
    {keys, rows} =
      for hand <- [:L, :R],
          row <- [0, 1, 2],
          col <- ordered_cols(hand, [0, 1, 2, 3, 4, 5]),
          reduce: {[], %{0 => [], 1 => [], 2 => []}} do
        {keys, rows} ->
          skip? =
            (hand == :L and col == 0 and not (iso? and row == 2)) or
              (hand == :R and col == 0 and row == 2)

          if skip? do
            {keys, rows}
          else
            id = key_id(hand, row, col)

            key = %Key{
              id: id,
              hand: hand,
              finger: column_finger(hand, col),
              row: row,
              col: col,
              x: rowstagger_x(hand, row, col),
              y: row * 1.0,
              home: row == 1,
              inner: col == 5
            }

            {[key | keys], Map.update!(rows, row, &[id | &1])}
          end
      end

    space = [
      %Key{id: "L0", hand: :L, finger: :LT, row: 3, col: 0, x: 6.75, y: 3.0, w: 6.0, thumb: true},
      %Key{id: "R0", hand: :R, finger: :RT, row: 3, col: 0, x: 6.75, y: 3.0, w: 6.0, thumb: true}
    ]

    %__MODULE__{
      id: id,
      name: name,
      family: :rowstagger,
      keys: Enum.reverse(keys) ++ space,
      supports_angle_mod: true,
      text_rows: [Enum.reverse(rows[0]), Enum.reverse(rows[1]), Enum.reverse(rows[2])],
      text_thumbs: ["L0", "R0"]
    }
  end

  defp rowstagger_x(hand, row, col) do
    home_x = if hand == :L, do: col + 0.75, else: 11 - col + 0.75
    home_x + Map.fetch!(@rowstagger_offsets, row)
  end

  @doc """
  Apply a fingering mode. Angle mod (Layouts Doc ch. 2) refingers the left bottom row on
  row-stagger boards: ANSI Z→ring, X→middle, C/V/B→index; ISO extra key→pinky.
  A map of `%{key_id => finger}` overrides individual keys.
  """
  def apply_fingering(%__MODULE__{} = g, :standard), do: g

  def apply_fingering(%__MODULE__{supports_angle_mod: true} = g, :angle_mod) do
    keys =
      Enum.map(g.keys, fn k ->
        if k.hand == :L and k.row == 2 do
          finger =
            case k.col do
              0 -> :LP
              1 -> :LR
              2 -> :LM
              _ -> :LI
            end

          %{k | finger: finger}
        else
          k
        end
      end)

    %{g | keys: keys}
  end

  def apply_fingering(%__MODULE__{} = g, :angle_mod), do: g

  def apply_fingering(%__MODULE__{} = g, overrides) when is_map(overrides) do
    %{g | keys: Enum.map(g.keys, fn k -> %{k | finger: Map.get(overrides, k.id, k.finger)} end)}
  end

  # ----------------------------------------------------------------- distance

  @doc "Distance between two keys in U (nil across hands)."
  def distance(a, b, model \\ :euclid)
  def distance(%Key{hand: h1}, %Key{hand: h2}, _) when h1 != h2, do: nil

  def distance(%Key{} = a, %Key{} = b, model) do
    dx = a.x - b.x
    dy = a.y - b.y

    case model do
      :euclid -> :math.sqrt(dx * dx + dy * dy)
      :squared -> dx * dx + dy * dy
      :manhattan -> abs(dx) + abs(dy)
    end
  end

  def x_distance(%Key{hand: h1}, %Key{hand: h2}) when h1 != h2, do: nil
  def x_distance(a, b), do: abs(a.x - b.x)

  def y_distance(%Key{hand: h1}, %Key{hand: h2}) when h1 != h2, do: nil
  def y_distance(a, b), do: abs(a.y - b.y)
end
