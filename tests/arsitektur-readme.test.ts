import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Diagram arsitektur README root sekarang hanya berupa blok Mermaid inline.
 * Folder docs/diagram-uml/ sudah dihapus, jadi tidak ada lagi sumber .mmd
 * atau render PNG/SVG terpisah yang harus disinkronkan. Test ini menjaga blok
 * Mermaid tetap ada dan tidak ada tautan ke berkas diagram yang sudah hilang.
 */

const repoFile = (rel: string) => new URL(rel, import.meta.url);
const readme = await readFile(repoFile("../README.md"), "utf8");

test("README root memuat blok Mermaid arsitektur", () => {
  const blok = readme.match(/```mermaid\n([\s\S]*?)```/);
  assert.ok(blok, "README root harus memuat blok Mermaid diagram arsitektur");
  assert.match(
    blok[1],
    /flowchart\s+LR/,
    "diagram arsitektur harus memakai flowchart LR"
  );
  for (const simpul of ["Public", "Staff", "Next", "Actions", "Supabase"]) {
    assert.ok(
      blok[1].includes(simpul),
      `diagram arsitektur harus memuat simpul ${simpul}`
    );
  }
});

test("README tidak menautkan diagram yang sudah dihapus", () => {
  assert.doesNotMatch(
    readme,
    /!?\[[^\]]*\]\([^)]*docs\/diagram-uml\//,
    "README tidak boleh menautkan docs/diagram-uml/ yang sudah dihapus"
  );
});
