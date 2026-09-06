defmodule LayoutMaster.Layouts do
  @moduledoc """
  Bundled layouts: the Romak family plus classic single-layer layouts (30-key core on 3x5+2).
  """

  alias LayoutMaster.Layout
  alias LayoutMaster.Layout.Text
  alias LayoutMaster.Layouts.Romak

  @classic [
    %{
      id: "qwerty",
      name: "Qwerty",
      author: nil,
      rows: "q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /"
    },
    %{
      id: "dvorak",
      name: "Dvorak",
      author: "August Dvorak",
      rows: "' , . p y f g c r l\na o e u i d h t n s\n; q j k x b m w v z"
    },
    %{
      id: "colemak",
      name: "Colemak",
      author: "Shai Coleman",
      rows: "q w f p g j l u y ;\na r s t d h n e i o\nz x c v b k m , . /"
    },
    %{
      id: "colemak-dh",
      name: "Colemak-DH",
      author: "Shai Coleman / Steve P",
      rows: "q w f p b j l u y ;\na r s t g m n e i o\nz x c d v k h , . /"
    },
    %{
      id: "graphite",
      name: "Graphite",
      author: "StronglyTyped",
      rows: "b l d w z ' f o u j\nn r t s g y h a e i\nq x m c v k p . - /"
    },
    %{
      id: "gallium",
      name: "Gallium",
      author: "Bryson",
      rows: "b l d c v z y o u ,\nn r t s g p h a e i\nq x m w j k f ' ; ."
    },
    %{
      id: "canary",
      name: "Canary",
      author: "Eve",
      rows: "w l y p b z f o u ;\nc r s t g m n e i a\nq j v d k x h / , ."
    },
    %{
      id: "sturdy",
      name: "Sturdy",
      author: "Oxey",
      rows: "v m l c p x f o u j\ns t r d y . n a e i\nz k q g w b h ' ; ,"
    },
    %{
      id: "aptv3",
      name: "APTv3",
      author: "Apsu",
      rows: "w g d f b q l u o y\nr s t h k j n e a i\nx c m p v z , . ' /"
    },
    %{
      id: "hands-down-neu",
      name: "Hands Down Neu",
      author: "Alan Reiser",
      rows: "w f m p v / . q ; '\nr s n t b , a e i h\nx c l d g - u o y k"
    }
  ]

  def classic_defs, do: @classic

  def classic(%{id: id, name: name, rows: rows} = def) do
    {layout, _overflow, _warnings} = Text.import(rows <> "\nspace", "3x5+2", name)

    %Layout{
      layout
      | id: id,
        author: Map.get(def, :author),
        description:
          Map.get(def, :description) ||
            "#{name} on a 34-key split columnar board (space on the left thumb).",
        languages: ["en"]
    }
  end

  @doc "All bundled layouts, Romak family first."
  def all do
    [Romak.magic_romak(), Romak.romak24(), Romak.romak34()] ++ Enum.map(@classic, &classic/1)
  end

  def get(id), do: Enum.find(all(), &(&1.id == id))
end
