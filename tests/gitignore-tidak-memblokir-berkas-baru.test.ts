import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Penjaga .gitignore.
 *
 * Dua kelas kesalahan, dan keduanya muncul tanpa suara apa pun.
 *
 * 1. Terlalu longgar. Pola `/*` pernah ada di blok kunci dan sertifikat.
 *    Pola itu berarti abaikan semua entri di root, termasuk direktori,
 *    jadi setiap berkas baru di src/, tests/, docs/, dan scripts/ ikut
 *    ter-ignore. `git add .` lalu melewatkannya tanpa pesan apa pun.
 *    Test dan skrip baru tidak pernah masuk repo, dan karena tidak ada
 *    di checkout, CI juga tidak pernah menjalankan test itu.
 *
 * 2. Terlalu sempit. Memperbaiki kelas pertama dengan menghapus pola
 *    kunci dan sertifikat akan membuka jalan yang lebih buruk, yaitu
 *    release key dan sertifikat off-site ikut ter-commit.
 *
 * Jadi dua arah diuji di sini. Berkas baru di direktori top-level harus
 * bisa di-add, dan nama kunci harus tetap ter-ignore di root maupun di
 * tingkat mana pun.
 */

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * True kalau nama itu ter-ignore.
 *
 * `git check-ignore` keluar dengan 1 untuk berkas yang tidak ter-ignore,
 * jadi pemanggilannya dibungkus agar tidak melempar exception.
 * Nama yang diperiksa tidak harus ada di disk, karena yang diuji polanya.
 */
function terIgnore(rel: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", rel], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

// Tempat yang paling sering mendapat berkas baru di repo ini.
const DIREKTORI_BARU = [
  "src",
  "tests",
  "docs",
  "scripts",
  "supabase",
  "public",
  ".github/workflows",
];

test("berkas baru di direktori top-level tidak ter-ignore", () => {
  const bermasalah = DIREKTORI_BARU.filter((dir) =>
    terIgnore(`${dir}/berkas-baru-secara-aman.txt`)
  );
  assert.deepEqual(
    bermasalah,
    [],
    `direktori ini memblokir berkas baru: ${bermasalah.join(", ")}. ` +
      `Kalau polanya tidak sengaja, hapus saja lalu pakai git add -f.`
  );
});

test("berkas baru di root repository juga tidak ter-ignore", () => {
  for (const nama of ["berkas-baru.md", "berkas-baru.sh", "berkas-baru.json"]) {
    assert.equal(
      terIgnore(nama),
      false,
      `berkas root ini tidak boleh ter-ignore: ${nama}`
    );
  }
});

test("kunci dan sertifikat tetap ter-ignore di semua tingkat", () => {
  const nama = [
    "release.JKS",
    "release.jks",
    "app.keystore",
    "sertifikat.p12",
    "sertifikat.pfx",
    "sertifikat.p8",
    "sertifikat.asc",
    "kunci.gpg",
    "server.key",
    "android/app.keystore",
    "android/keystore/upload.jks",
    "nested/deep/private.key",
  ];
  const bocor = nama.filter((n) => !terIgnore(n));
  assert.deepEqual(
    bocor,
    [],
    `nama berikut harus tetap ter-ignore: ${bocor.join(", ")}`
  );
});

test("tidak ada pola yang mengabaikan seluruh root", () => {
  // Guard ke file yang benar-benar dipakai git, bukan ke versi yang
  // sudah ter-commit. Membaca `HEAD:.gitignore` akan mengalami hal yang
  // paling sering terjadi: test hijau padahal file yang dipakai orang
  // masih salah.
  const isi = readFileSync(`${root}.gitignore`, "utf8");
  const salah = isi
    .split("\n")
    .map((baris) => baris.trim())
    .filter((baris) => baris === "/*");
  assert.deepEqual(
    salah,
    [],
    `pola ini mengabaikan seluruh root: ${salah.join(", ")}`
  );
});

test("tidak ada berkas kunci yang ikut ter-track", () => {
  const terlacak = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((p) => /\.(jks|keystore|p12|pfx|p8|asc|gpg|key)$/i.test(p));
  assert.deepEqual(
    terlacak,
    [],
    `berkas kunci ini ikut ter-track: ${terlacak.join(", ")}`
  );
});