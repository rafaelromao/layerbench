defmodule LayoutMaster.StorageTest do
  use ExUnit.Case, async: false

  alias LayoutMaster.Layout
  alias LayoutMaster.Layouts.Romak
  alias LayoutMaster.Storage
  alias LayoutMaster.Storage.Local

  setup do
    root =
      Path.join(System.tmp_dir!(), "layoutmaster-storage-#{System.unique_integer([:positive])}")

    File.mkdir_p!(root)
    prev = Application.get_env(:layoutmaster, :storage_local_root)
    Application.put_env(:layoutmaster, :storage_local_root, root)
    on_exit(fn -> Application.put_env(:layoutmaster, :storage_local_root, prev) end)
    %{root: root}
  end

  test "local adapter stores, lists, reloads and deletes layouts with optimistic concurrency" do
    doc = Layout.to_map(Romak.romak24())
    id = Storage.slug(doc["name"])
    assert id == "romak-24"
    {:ok, %{sha: sha}} = Local.put(:layouts, id, doc, [])
    {:ok, [entry]} = Local.list(:layouts)
    assert entry["id"] == id
    assert entry["layers"] == 4
    {:ok, back, %{sha: sha2}} = Local.get(:layouts, id)
    assert sha == sha2
    {:ok, layout} = Layout.from_map(back)
    assert layout.name == "Romak 24"

    assert {:error, :conflict} =
             Local.put(:layouts, id, Map.put(doc, "name", "x"), expected_sha: "stale")

    assert {:ok, _} =
             Local.put(:layouts, id, Map.put(doc, "name", "Romak 24 v2"), expected_sha: sha)

    assert :ok = Local.delete(:layouts, id, [])
    assert {:error, :not_found} = Local.get(:layouts, id)
    assert {:ok, []} = Local.list(:layouts)
  end

  test "slug normalizes names" do
    assert Storage.slug("Magic Romak!") == "magic-romak"
    assert Storage.slug("Português ção") == "portugues-cao"
    assert String.starts_with?(Storage.slug("!!!"), "item-")
  end
end
