import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Pemilihan alat rewrite di scripts/purge-ip-dari-riwayat.sh.
 *
 * Bentuk lamanya memakai `A || B && C` untuk memilih antara git-filter-repo
 * dan git filter-branch. Rantai shell dibaca dari kiri ke kanan sebagai
 * `(A || B) && C`, jadi begitu git-filter-repo ditemukan, conditions C ikut
 * jalan dan menimpa alat yang baru saja terdeteksi. Akibatnya filter-repo
 * tidak pernah benar-benar terpilih, dan rewrite ikut jalur sempit yang hanya
 * menyalin satu berkas, padahal operator melihat "alat rewrite: git
 * filter-repo" di layar.
 *
 * Bug itu tidak terlihat dari membaca diff dan tidak punya test, jadiIa
 * bertahan sampai skrip dipakai. Test di sini memanggil logikanya di shell
 * sungguhan dengan git-filter-repo tiruan di PATH, jadi yang diuji adalah
 * perilakunya, bukan hanya teksnya.
 */

// fileURLToPath, bukan URL.pathname: kalau path checkout mengandung spasi,
// pathname berisi %20 dan readFileSync akan membuka path ter-encode itu.
// Tesnya gagal semua bukan karena logikanya salah, dan gejalanya Persis di
// tempat yang paling membingungkan: alarm palsu soal pemilihan alat.
const skrip = fileURLToPath(new URL("../scripts/purge-ip-dari-riwayat.sh", import.meta.url));

/**
 * PATH absolut bash, dicari sebelum PATH dibatasi.
 *
 * PATH di dalam test hanya berisi stub, jadi `bash` tidak akan ditemukan
 * lagi kalau dipanggil tanpa path dan spawn gagal dengan ENOENT. Yang
 * dibatasi hanya pencarian `git` dan `git-filter-repo`, yaitu hal yang
 * memang membuat test ini rapuh.
 */
const BASH = (() => {
  const cari = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" });
  const found = cari.stdout.trim();
  assert.ok(found.length > 0, "bash tidak ditemukan di PATH sistem");
  return found;
})();

/**
 * Jalankan logika pemilihan alat dengan PATH yang sepenuhnya dikendalikan.
 *
 * PATH asli tidak dipakai sebagai sumber apa pun. Kalau filter-repo terpasang
 * di mesin lain, kasus "tidak ada filter-repo" ikut menemukannya dan test
 * gagal padahal skripnya benar. Stub di sini hanya menyediakan yang
 * dibutuhkan: `git` yang menjawab `filter-branch --help`, dan
 * `git-filter-repo` hanya pada kasus yang memang harus menemukannya.
 */
function pilihAlat(punyaFilterRepo: boolean): string {
  const akar = mkdtempSync(join(tmpdir(), "purge-alat-"));
  const bin = join(akar, "bin");
  mkdirSync(bin, { recursive: true });

  writeFileSync(
    join(bin, "git"),
    ["#!/bin/bash", 'if [ "${1:-}" = "filter-branch" ]; then exit 0; fi', "exit 1", ""].join(
      "\n"
    ),
    { mode: 0o755 }
  );

  if (punyaFilterRepo) {
    writeFileSync(join(bin, "git-filter-repo"), "#!/bin/bash\nexit 0\n", { mode: 0o755 });
  }

  const isi = readFileSync(skrip, "utf8");
  const mulai = isi.indexOf('alat=""');
  const penanda = 'gagal "tidak ada git filter-repo';
  const awalGagal = isi.indexOf(penanda, mulai);
  assert.notEqual(mulai, -1, "blok pemilihan alat tidak ditemukan di skrip");
  assert.notEqual(awalGagal, -1, "pengawal alat kosong tidak ditemukan di skrip");

// Potong sampai ujung baris pengawal supaya tidak menyisakan `||` menggantung,
  // lalu ganti panggilan gagal dengan echo supaya blok bisa diuji tanpa exiting.
  const akhirBaris = isi.indexOf("\n", awalGagal);
  const blok = isi
    .slice(mulai, akhirBaris === -1 ? isi.length : akhirBaris)
    .replace(/gagal\s+"[^"]*"/g, "echo GAGAL")
    // Komentar dibuang dulu. Baris komentar di blok ini memuat backtick, dan
    // teks yang diteruskan ke `bash -c` akan memperlakukannya sebagai command
    // substitution: isi komentar ikut dijalankan. Itu bukan sekadarbau,
    // hasilnya bergantung pada apa yang ada di PATH.
    .split("\n")
    .filter((baris) => !baris.trim().startsWith("#"))
    .join("\n");

  const hasil = spawnSync(BASH, ["-c", blok + '\nprintf "%s" "${alat:-}"'], {
    encoding: "utf8",
    env: { ...process.env, PATH: bin },
  });

  return hasil.stdout.trim();
}

test("git-filter-repo menang kalau tersedia", () => {
  assert.equal(
    pilihAlat(true),
    "filter-repo",
    "filter-repo harus terpilih kalau ada di PATH"
  );
});

test("git filter-branch dipakai hanya saat filter-repo tidak ada", () => {
  assert.equal(
    pilihAlat(false),
    "filter-branch",
    "tanpa filter-repo, yang dipakai harus filter-branch"
  );
});

test("pemilihan alat tidak memakai rantai A || B && C", () => {
  // Guard tambahan supaya bentuk yang salah itu tidak bisa masuk lagi diam-diam
  // lewat refactor: `&&` setelah `||` pada baris yang sama selalu berarti
  // parentheses yang tidak ditulis, dan itulah sumber bug ini.
  const isi = readFileSync(skrip, "utf8");
  const salah = isi
    .split("\n")
    .map((baris) => baris.trim())
    .filter((baris) => /\|\|.*&&/.test(baris) && !baris.startsWith("#"));
  assert.deepEqual(
    salah,
    [],
    `baris ini menggabungkan || dan && tanpa kurung: ${ salah.join(" | ")}`
  );
});