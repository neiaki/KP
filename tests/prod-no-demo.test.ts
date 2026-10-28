import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Mode demo tidak boleh bisa aktif di production (STANDAR At Cell bagian B).
 *
 * Tiga syarat yang dijaga file ini terhadap src/lib/store.ts:
 *   1. liveBackendEnabled bernilai true saat NODE_ENV=production, apa pun
 *      kondisi env lainnya, jadi flag tidak pernah false di build produksi.
 *   2. Mesin demo (store-demo) hanya boleh dimuat lewat import dinamis,
 *      supaya bundler tidak pernah menyertakannya di jalur live.
 *   3. Tidak ada import statis store-demo di store.ts.
 *
 * Bukti mutasi (transkrip, LOOP_LOG): definisi flag diganti konstanta false
 * → tes 1 gagal; import dinamis diganti statis → tes 2 dan 3 gagal.
 */

const store = await readFile(
  new URL("../src/lib/store.ts", import.meta.url),
  "utf8"
);

test("liveBackendEnabled wajib true saat NODE_ENV=production", () => {
  assert.match(
    store,
    /liveBackendEnabled\s*=\s*\n?\s*process\.env\.NODE_ENV === "production" \|\| isSupabaseConfigured\(\)/,
    "flag harus memuat kondisi production; tanpa itu build produksi bisa jatuh ke mode demo"
  );
});

test("mesin demo hanya dimuat lewat import dinamis", () => {
  assert.match(
    store,
    /= import\("\.\/store-demo\.ts"\)/,
    "pemuatan runtime store-demo harus lewat import() supaya tidak ikut bundle jalur live"
  );
});

test("tidak ada import runtime statis store-demo di store.ts", () => {
  // import type aman: dihapus kompilator dan tidak pernah sampai bundel.
  const statis = store
    .split("\n")
    .map((l, i) => [i + 1, l] as const)
    .filter(([, l]) => /^import (?!type\b).*from ["'].*store-demo/.test(l));
  assert.deepEqual(
    statis.map(([n]) => n),
    [],
    "import statis runtime store-demo akan membawa data demo ke produksi"
  );
});

/* Fixture negatif: varian rusak harus TIDAK lolos pemeriksaan yang sama. */
test("varian definisi flag yang rusak tertolak (self-proof)", () => {
  const rusak1 = "const liveBackendEnabled =\n  isSupabaseConfigured();";
  const pola =
    /liveBackendEnabled\s*=\s*\n?\s*process\.env\.NODE_ENV === "production" \|\| isSupabaseConfigured\(\)/;
  assert.equal(pola.test(rusak1), false, "varian tanpa kondisi production harus tertolak");
});
