import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Advisor Supabase melaporkan function_search_path_mutable (lint 0011) pada
 * private.current_actor_id(), helper aktor audit dari migrasi 0007. Pin-nya
 * dipasang lewat migrasi terpisah, bukan dengan menyunting 0007: berkas itu
 * sudah diterapkan di production, dan menyunting riwayat tidak mengubah
 * database mana pun.
 *
 * Dua hal yang dijaga di sini:
 *
 * 1. Migrasinya benar-benar memin search_path ke nilai kosong. Isi fungsi
 *    hanya memakai current_setting(), nullif(), dan cast ::uuid dari
 *    pg_catalog, jadi search_path kosong tidak mengubah perilakunya.
 *
 * 2. Migrasinya memakai ALTER FUNCTION, bukan CREATE OR REPLACE: badan
 *    fungsi, sifat STABLE, dan ACL dari 0007 dibiarkan apa adanya. Kalau
 *    suatu saat badan fungsi memang perlu ditulis ulang, baca alasan di
 *    komentar migrasi itu dulu, lalu perbarui test ini dengan sengaja.
 */

const migrasi = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20261016081500_current_actor_id_search_path.sql",
      import.meta.url
    )
  ),
  "utf8"
);

test("migrasi memin search_path private.current_actor_id()", () => {
  assert.match(
    migrasi,
    /alter function private\.current_actor_id\(\)[\s\S]*set search_path = '';/
  );
});

test("migrasi memakai ALTER FUNCTION, bukan menulis ulang badan fungsi", () => {
  // Baris SQL saja yang diperiksa, bukan komentar: komentar migrasi justru
  // menjelaskan kenapa CREATE OR REPLACE tidak dipakai di sini.
  const definisiUlang = migrasi
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("--") && /^create\s+or\s+replace\s+function/i.test(l));
  assert.deepEqual(
    definisiUlang,
    [],
    "badan private.current_actor_id() dari 0007 tidak boleh ditulis ulang di sini; " +
      "pakai ALTER FUNCTION ... SET search_path"
  );
});
