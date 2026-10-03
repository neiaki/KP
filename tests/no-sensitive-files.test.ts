import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/*
 * Berkas yang tidak boleh masuk repo, dijaga di sisi nama.
 *
 * tests/no-secret-in-repo.test.ts membaca isi file yang sudah ter-track dan
 * mencari IP, token, dan URL berkredensial. Test itu menutup nilai yang salah
 * tempel, tapi tidak menutup kelas lain: file yang isinya tidak pernah ikut
 * dibaca karena filter ekstensi, atau file yang tidak akan pernah lolos filter
 * apa pun karena isinya memang data.
 *
 * Dua kelas yang paling berbahaya dan tidak tertangkap test isi:
 *
 * 1. Dump database. Isinya seluruh tabel termasuk hash kata sandi, dan filter
 *    SKIP di test isi cuma mengecualikan berkas biner.gz dan .zip, bukan
 *    .dump. pg_dump memuat data apa adanya, jadi isinya pastilah tidak kebaca
 *    aman.
 *
 * 2. Kunci dan sertifikat. .jks, .keystore, .p12, dan .pfx semuanya biner.
 *    releasing key Android tidak berguna di-commit lalu dihapus karena objek
 *    git-nya tetap bisa diambil dari riwayat.
 *
 * Test ini menutup keduanya dari sisi nama, jadi tidak bergantung pada isi
 * file sama sekali. Sebuah file bisa lolos filter apa pun kalau namanya
 * tidak pernah di-track.
 */

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * Pola nama berkas yang tidak boleh pernah ter-track.
 *
 * Ditulis satu pola per baris supaya addition dan penghapusan terlihat jelas
 * saat review, dan supaya tidak ada pola yang tersembunyi di dalam pola lain.
 *
 * Setiap pola diuji dua arah: apakah BENAR-BENAR menolak contoh file sensitif,
 * dan apakah TIDAK menolak nama file biasa yang hanya mirip. Test kedua itu
 * yang menjaga pola ini tidak melebar tanpa disadari sampai impair file yang
 * memang harus masuk repo.
 */
const POLA_TERLARANG: { pola: RegExp; contoh: string[]; harusBoleh: string[] }[] = [
  {
    pola: /^backup(s)?\//i,
    contoh: ["backup/atcell-20261001.dump", "backups/atcell.dump", "backup/note.txt"],
    harusBoleh: ["src/lib/backup.ts", "docs/BACKUP-RESTORE.md", "scripts/backup-postgres.sh"],
  },
  {
    pola: /\.dump$/i,
    contoh: ["atcell-20261001T051851Z.dump", "db/dump.dump"],
    harusBoleh: ["docs/contoh.dump.md", "scripts/dump.sh"],
  },
  {
    pola: /\.(dump|sql)\.gz$/i,
    contoh: ["atcell.dump.gz", "schema.sql.gz"],
    harusBoleh: ["docs/contoh.dump.gz.md"],
  },
  {
    pola: /\.jks$/i,
    contoh: ["atcell-release.jks", "android/keystore.jks", "release.JKS"],
    harusBoleh: ["docs/ANDROID-APP.md", "android/build.gradle"],
  },
  {
    pola: /\.(keystore|p12|pfx|p8|asc|gpg)$/i,
    contoh: [
      "release.keystore",
      "cert.p12",
      "upload.p12",
      "upload.pfx",
      "key.p8",
      "armored.asc",
      "backup.gpg",
    ],
    // Bentuk huruf besar wajib ikut, karena pencocokan .gitignore hanya
    // case-sensitive saat `git add` pertama kali di filesystem yang begitu.
    // release.JKS lolos dari pola *.jks kalau polanya tidak ditulis per huruf.
    harusBoleh: ["docs/CSP.md", "scripts/verify-pinning.sh"],
  },
  {
    pola: /\.key$/i,
    contoh: ["release.key", "tls.key"],
    harusBoleh: ["docs/key-rotation.md", "src/lib/keyboard.ts", "docs/archive.gpg.md"],
  },
  {
    pola: /^[^/]+\.[lL][oO][gG]$/,
    contoh: ["release.log", "npm-debug.log"],
    harusBoleh: ["docs/release.log.md", "src/lib/logger.ts"],
  },
  {
    // .env.example sengaja dikecualikan: itu templat untuk operator, isinya
    // nama variabel dan baris kosong, bukan nilai. Polanya menyisihkannya
    // supaya penyimpangan di masa depan tidak ikut memaksakan file ini ikut
    // ter-ignore.
    pola: /(^|\/)\.env\.(?!example$)/i,
    contoh: [".env.production", "config/.env.staging", "deploy/.env.local"],
    harusBoleh: [".env.example", "docs/ENV.md"],
  },
  {
    pola: /(^|\/)\.secrets([\/.]|$)/i,
    contoh: [".secrets", ".secrets/prod.env", "deploy/.secrets.json"],
    harusBoleh: ["docs/SECRET-ROTATION.md", "src/lib/secrets-helper.ts"],
  },
  {
    pola: /\.pem$/i,
    contoh: ["cert.pem", "tls/server.pem"],
    harusBoleh: ["docs/TLS.md", "src/lib/pem-reader.ts"],
  },
  {
    pola: /(^|\/)logs?\//i,
    contoh: ["logs/app.log", "log/2026-10.txt"],
    harusBoleh: ["src/lib/logger.ts", "docs/LOGGING.md", "src/components/price-log.tsx"],
  },
  {
    pola: /\.bak$/i,
    contoh: ["products.json.bak", "db/schema.bak"],
    harusBoleh: ["docs/MIGRASI.md"],
  },
];

const terlacak = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString()
  .split("\0")
  .filter(Boolean);

test("tidak ada berkas sensitif yang ter-track", () => {
  const bocor: string[] = [];
  for (const rel of terlacak) {
    for (const { pola } of POLA_TERLARANG) {
      if (pola.test(rel)) bocor.push(`${rel} (pola ${pola})`);
    }
  }
  assert.deepEqual(
    bocor.sort(),
    [],
    `berkas berikut tidak boleh masuk repo: ${bocor.join(", ")}`
  );
});

test("pola benar-benar menolak contoh file sensitif", () => {
  // Kalau pola tidak berlaku untuk contohnya, test di atas hijau karena tidak ada
  // yang diperiksa sama sekali.
  for (const { pola, contoh } of POLA_TERLARANG) {
    for (const nama of contoh) {
      assert.ok(
        pola.test(nama),
        `pola ${pola} harus menolak contoh ${JSON.stringify(nama)}`
      );
    }
  }
});

test("pola tidak menolak nama file biasa yang hanya mirip", () => {
  // Penjaga arah sebaliknya. Pola yang terlalu longgar tidak merusak
  // keamanan, tapi merusak repo: file yang memang harus masuk jadi tidak bisa
  // di-commit, dan orang akanjavanya pakai --force lalu berhenti memakai test.
  for (const { pola, harusBoleh } of POLA_TERLARANG) {
    for (const nama of harusBoleh) {
      assert.ok(
        !pola.test(nama),
        `pola ${pola} terlalu longgar: ikut menolak ${JSON.stringify(nama)}`
      );
    }
  }
});

test("gitignore menutup nama yang sama dengan polanya", () => {
  // Test di atas menjaga file yang sudah ter-track. File yang belum ter-track
  // belum terlihat di git ls-files, jadi penjaganya harus ada di .gitignore:
  // kalau tidak, file baru muncul di `git status` dan satu `git add .`
  // cukup untuk membawanya masuk.
  //
  // git check-ignore yang dipakai, bukan pembacaan teks .gitignore, karena
  // hanya git yang tahu hasil akhir semua aturannya. Pola .env* di .gitignore
  // sudah menutup /.env.production tanpa baris tambahan, jadi di sini hanya
  // nama yang benar-benar belum tertutup yang diperiksa.
  const tambahan = [
    "backup/atcell.dump",
    // Direktori jamak dan tunggal keduanya harus tertutup, dan contoh di
    // sini sengaja memakai nama yang isinya BUKAN sensitif, supaya yang
    // diuji memang aturan direktorinya dan bukan ekstensi .dump.
    "backup/note.txt",
    "log/2026-10.txt",
    "logs/app.log",
    "atcell-release.jks",
    "release.keystore",
    "cert.p12",
    "cert.pfx",
    "atcell.dump.gz",
    "tls/server.pem",
    "db/schema.bak",
    "release.log",
    "release.key",
    "key.gpg",
    // Bentuk huruf besar. release.JKS lolos dari *.jks kalau .gitignore
    // hanya menulis pola huruf kecil.
    "release.JKS",
    "cert.P12",
    "release.PFX",
    "armored.ASC",
  ];
  const bocor: string[] = [];
  for (const nama of tambahan) {
    // check-ignore keluar dengan kode 0 kalau namanya ter-ignore dan 1 kalau
    // tidak, jadi exit code-nya yang dipakai, bukan stdout.
    //
    // --no-index wajib: tanpa flag itu, git ikut memperhitungkan status
    // tracking, jadi nama yang sudah ter-track dianggap "tidak ter-ignore"
    // begitu saja dan test ini menguji tracking, bukan .gitignore.
    let terIgnore = false;
    try {
      execFileSync("git", ["check-ignore", "-q", "--no-index", nama], { cwd: root, stdio: "ignore" });
      terIgnore = true;
    } catch {
      terIgnore = false;
    }
    if (!terIgnore) bocor.push(nama);
  }
  assert.deepEqual(
    bocor,
    [],
    `nama ini belum ditutup .gitignore: ${bocor.join(", ")}`
  );
});
