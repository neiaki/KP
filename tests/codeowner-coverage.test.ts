import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Cakupan CODEOWNERS.
 *
 * Audit: file itu menutup .github/, scripts/, /src/db/ dan access.ts, tapi
 * meninggalkan jalur paling bernilai justru tidak terlindungi. Setiap Server
 * Action adalah endpoint HTTP dan requireRole()-nya adalah batas keamanan,
 * route guard tidak menyentuhnya, migrasi bisa menghapus kolom atau melonggarkan
 * RLS tanpa error build, dan next.config.ts menentukan apa yang ikut ke bundle.
 *
 * Owner yang disebut harus benar-benar ada di repo. Aturan yang menunjuk path
 * yang tidak ada diam-diam tidak berlaku, jadi daftar ini ikut dijaga isinya.
 */

const codeowners = readFileSync(
  new URL("../.github/CODEOWNERS", import.meta.url),
  "utf8"
);

/** Path yang boleh diasumsikan ada, di luar cakupan daftar ini. */
const DIJAMIN_ADA = ["Dockerfile", "next.config.ts", "package.json"];

function aturan(): string[] {
  return codeowners
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

test("jalur bernilai paling tinggi ikut terlindungi", () => {
  // Setiap pola di sini ditagih karena dampaknya, bukan karena kelengkapan.
  const wajib = [
    "/src/lib/actions/",       // setiap Server Action adalah endpoint HTTP
    "/src/lib/validations.ts", // aturan tulis yang jadi pintu masuk data
    "/src/lib/access.ts",      // matriks route portal
    "/src/db/",                // penjaga koneksi
    "/supabase/migrations/",   // skema dan RLS
    "/supabase/RUN-ALL-PENDING.sql",
    "/src/app/api/",           // route JSON dan health check
    "/next.config.ts",
    "/Dockerfile",
    "/package-lock.json",
    "scripts/",                // pg_restore --clean
    ".github/workflows/",
  ];
  const ada = new Set(aturan().map((l) => l.split(/\s+/)[0]));
  const hilang = wajib.filter((p) => !ada.has(p));
  assert.deepEqual(hilang, [], `pola CODEOWNERS ini belum ada: ${hilang.join(", ")}`);
});

test("proxy.ts yang melindungi subdomain login ikut terlindungi", () => {
  // Berkasnya src/proxy.ts, bukan middleware.ts. Kalau daftar memakai nama yang
  // tidak ada, aturannya diam-diam tidak berlaku.
  assert.match(codeowners, /^\/src\/proxy\.ts\s+@\S+$/m);
});

test("setiap aturan menunjuk owner yang valid", () => {
  for (const baris of aturan()) {
    const [, pola, owner] = /^(\S+)\s+(.+)$/.exec(baris) ?? [];
    assert.ok(pola, `baris CODEOWNERS tidak bisa dibaca: ${baris}`);
    assert.match(
      owner.trim(),
      /^@\S+$/,
      `owner pada aturan ini tidak valid, GitHub akan mengabaikannya: ${baris}`
    );
  }
});

test("folder dan berkas yang disebut benar-benar ada", () => {
  // Aturan yang menunjuk path yang sudah dihapus tidak memberi perlindungan apa
  // pun dan tidak akan pernah ketahuan.
  for (const baris of aturan()) {
    const pola = baris.split(/\s+/)[0];
    if (pola.endsWith("/")) {
      assert.ok(
        directoryExistsSync(pola),
        `pola folder ini menunjuk folder yang tidak ada: ${pola}`
      );
      continue;
    }
    assert.ok(
      fileExistsSync(pola),
      `pola berkas ini menunjuk berkas yang tidak ada: ${pola}`
    );
  }
});

test("catatan tetap jujur soal cakupan dan soal branch protection", () => {
  assert.match(codeowners, /branch protection/i);
  assert.match(codeowners, /Require a pull request before merging/i);
  assert.match(codeowners, /Require approvals/i);
  assert.match(codeowners, /hanya permintaan|Cuma permintaan/i);
  // Dan cakupan yang TIDAK dilindungi harus disebut, supaya file ini tidak
  // dibaca jako daftar lengkap.
  assert.match(
    codeowners,
    /TIDAK ada di daftar ini/,
    "catatan harus menyebut jalur yang sengaja tidak dilindungi"
  );
});

/* ------------------------------------------------------------------ */

import { existsSync, statSync } from "node:fs";

function fileExistsSync(rel: string): boolean {
  return (
    existsSync(new URL(`../${rel}`, import.meta.url)) ||
    DIJAMIN_ADA.includes(rel)
  );
}

function directoryExistsSync(rel: string): boolean {
  try {
    return statSync(new URL(`../${rel}`, import.meta.url)).isDirectory();
  } catch {
    return false;
  }
}
