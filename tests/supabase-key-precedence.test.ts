import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Urutan membaca kunci service role di src/lib/supabase/config.ts adalah
 * pertahanan, bukan gaya penulisan.
 *
 * Shell menang atas berkas .env, dan itu sudah dibuktikan di mesin ini:
 * loadEnvConfig tidak pernah menimpa variabel yang sudah ada di process.env,
 * baik di mode dev maupun build. Jadi kalau shell laptop mengekspor
 * SUPABASE_SERVICE_ROLE_KEY milik project lain, nilai itulah yang dipakai,
 * bukan apa pun yang tertulis di .env.
 *
 * Yang menyelamatkan At Cell sekarang adalah SUPABASE_SECRET_KEY lebih dulu.
 * Kalau urutannya dibalik, kunci project lain akan dipakai melawan URL At
 * Cell dan permintaan service role ditolak. Rusaknya autentikasi, bukan data,
 * tapi gagal tanpa pesan yang menunjuk keebalannya.
 */

const repoFile = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const configSrc = readFileSync(repoFile("../src/lib/supabase/config.ts"), "utf8");
const envExample = readFileSync(repoFile("../.env.example"), "utf8");

/** Semua berkas TypeScript di bawah src/. */
function berkasSrc(dir: string): string[] {
  const hasil = [];
  for (const item of readdirSync(dir)) {
    const penuh = `${dir}/${item}`;
    if (statSync(penuh).isDirectory()) {
      hasil.push(...berkasSrc(penuh));
    } else if (penuh.endsWith(".ts") || penuh.endsWith(".tsx")) {
      hasil.push(penuh);
    }
  }
  return hasil;
}

test("kunci service role membaca SUPABASE_SECRET_KEY lebih dulu", () => {
  assert.match(
    configSrc,
    /process\.env\.SUPABASE_SECRET_KEY\s*\|\|\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
    "getSupabaseServiceRoleKey harus lebih dulu SUPABASE_SECRET_KEY, baru " +
      "SUPABASE_SERVICE_ROLE_KEY. Shell bisa mengekspor kunci milik project " +
      "lain, dan urutan inilah yang mencegahnya terpakai."
  );
});

test("tidak ada kode src yang membaca SUPABASE_URL polos", () => {
  // Nama polos itu dipakai project lain di shell laptop ini. Membacanya berarti
  // satu setelan env bisa mengarahkan aplikasi ke project yang salah.
  const slic = [];
  for (const berkas of berkasSrc(repoFile("../src"))) {
    if (readFileSync(berkas, "utf8").includes("process.env.SUPABASE_URL")) {
      slic.push(berkas.split("/src/").pop());
    }
  }
  assert.deepEqual(
    slic,
    [],
    "jangan baca process.env.SUPABASE_URL; pakai NEXT_PUBLIC_SUPABASE_URL"
  );
});

test(".env.example tetap memuat SUPABASE_SECRET_KEY", () => {
  assert.ok(
    envExample.includes("SUPABASE_SECRET_KEY="),
    "template harus tetap menyebut kunci modern supaya setup baru tidak " +
      "berakhir hanya dengan SUPABASE_SERVICE_ROLE_KEY yang bisa tertimpa " +
      "nilai shell"
  );
});
