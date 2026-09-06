defmodule LayoutMaster.GeometryTest do
  use ExUnit.Case, async: true

  alias LayoutMaster.Geometry

  test "presets have the expected key counts and unique ids" do
    expected = %{
      "3x5+2" => 34,
      "3x5+3" => 36,
      "3x6+3" => 42,
      "1333+2" => 24,
      "ansi" => 34,
      "iso" => 35
    }

    for id <- Geometry.preset_ids() do
      g = Geometry.preset(id)
      assert length(g.keys) == expected[id], id
      assert g.keys |> Enum.map(& &1.id) |> Enum.uniq() |> length() == length(g.keys)
    end
  end

  test "1333+2 has only the home-row pinky and thumbs L1 L0 R0 R1" do
    g = Geometry.preset("1333+2")
    ids = Enum.map(g.keys, & &1.id)
    assert "LHP" in ids
    refute "LTP" in ids
    refute "LBP" in ids
    assert g.text_thumbs == ["L1", "L0", "R0", "R1"]
  end

  test "columnar stagger lowers the pinky and raises the middle column" do
    g = Geometry.preset("3x5+2")
    pinky = Enum.find(g.keys, &(&1.id == "LHP"))
    middle = Enum.find(g.keys, &(&1.id == "LHM"))
    assert pinky.y > middle.y
  end

  test "row stagger offsets top row by -0.25U and bottom row by +0.5U" do
    g = Geometry.preset("ansi")
    q = Enum.find(g.keys, &(&1.id == "LTP"))
    a = Enum.find(g.keys, &(&1.id == "LHP"))
    z = Enum.find(g.keys, &(&1.id == "LBP"))
    assert_in_delta q.x - a.x, -0.25, 1.0e-9
    assert_in_delta z.x - a.x, 0.5, 1.0e-9
  end

  test "angle mod refingers the left bottom row (ANSI)" do
    g = Geometry.preset("ansi") |> Geometry.apply_fingering(:angle_mod)
    assert Enum.find(g.keys, &(&1.id == "LBP")).finger == :LR
    assert Enum.find(g.keys, &(&1.id == "LBR")).finger == :LM
    assert Enum.find(g.keys, &(&1.id == "LBM")).finger == :LI
  end

  test "distance is undefined across hands and Euclidean within a hand" do
    g = Geometry.preset("3x5+2")
    a = Enum.find(g.keys, &(&1.id == "LHM"))
    b = Enum.find(g.keys, &(&1.id == "LHI"))
    r = Enum.find(g.keys, &(&1.id == "RHI"))
    assert Geometry.distance(a, r) == nil
    assert_in_delta Geometry.distance(a, b), :math.sqrt(1 + 0.25 * 0.25), 1.0e-9
    assert_in_delta Geometry.distance(a, b, :squared), 1.0625, 1.0e-9
  end
end
