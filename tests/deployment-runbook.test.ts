import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

/*
 * Runbook deployment dijaga di sini karena dua membusikannya baru ketahuan
 * setelah audit, dan keduanya membuat production berjalan dengan keamanan
 * yang lebih lemah dari yang sudah ditulis di dokumen ini.
 *
 * 1. Daftar migrasi di runbook tertinggal sepuluh berkas, dan menyebut
 *    20260925142137_align_schema_contract.sql yang tidak pernah ada sebagai
 *    nama berkas. Berkas aslinya 0004_align_schema_contract.sql. Operator
 *    yang mengikuti runbook akan berhenti di baris itu, atau menganggap
 *    migrasi sudah berjalan padahal belum. Yang hilang termasuk dua migrasi
 *    keamanan: pencabutan hak tulis anon dan privatisasi bucket foto pelanggan.
 *
 * 2. Runbook tidak menyebut SUPABASE_SERVICE_ROLE_KEY, padahal
 *    src/lib/supabase/config.ts membacanya sebagai cadangan,
 *    requireRole() dan /api/health/ready menolaknya kalau kosong, dan
 *    .env.example memuatnya. Production yang hanya mengikuti runbook akan
 *    gagal saat login staf.
 *
 * Test daftar migrasi sengaja hanya satu arah. Berkas migrasi baru yang
 * belum di-commit boleh membuat test ini gagal di mesin lokal, tapi di fresh
 * clone runbook boleh menyebut satu berkas lebih banyak tanpa membuat test
 * ini merah.
 */

const repoFile = (rel: string) => new URL(rel, import.meta.url);

const runbook = await readFile(repoFile("../docs/DEPLOYMENT-REDUNDANCY.md"), "utf8");
const migrations = (await readdir(repoFile("../supabase/migrations")))
  .filter((f) => f.endsWith(".sql"))
  .sort();

/**
 * Hanya migrasi yang sudah di-track yang wajib disebut runbook. Migrasi
 * untracked masih milik pemanggil dan belum bagian fresh clone, jadi
 * menjadikannya syarat akan membuat test merah di mesin orang lain.
 */
async function migrasiTerTrack(): Promise<string[]> {
  try {
    const { execFileSync } = await import("node:child_process");
    const keluar = execFileSync("git", ["ls-files", "supabase/migrations"], {
      cwd: new URL("../", repoFile("x")),
      encoding: "utf8",
    });
    const tracked = keluar
      .split("\n")
      .filter(Boolean)
      .map((p) => p.replace(/^supabase\/migrations\//, ""));
    return tracked.filter((f) => f.endsWith(".sql")).sort();
  } catch {
    // Tanpa git (arsip release, CI tanpa checkout), pakai isi direktori.
    return migrations;
  }
}

const tracked = await migrasiTerTrack();

/** Env yang disetel sendiri oleh platform, jadi tidak perlu ada di runbook. */
const DISETEL_PLATFORM = new Set(["NODE_ENV", "VERCEL"]);

async function envDipakaiKode(): Promise<Set<string>> {
  // Path di dalam src relatif terhadap direktori src, jadi harus
  // diselesaikan terhadap URL src, bukan terhadap berkas test ini.
  const urlSrc = new URL("../src/", repoFile("x"));
  const isiSrc = await readdir(urlSrc, { recursive: true });
  const berkas = isiSrc
    .filter((p): p is string => typeof p === "string" && /\.(ts|tsx|mjs|js)$/.test(p))
    .map((p) => new URL(p, urlSrc));
  berkas.push(repoFile("../next.config.ts"), repoFile("../drizzle.config.ts"));

  const nama = new Set<string>();
  for (const url of berkas) {
    const isi = await readFile(url, "utf8");
    for (const m of isi.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      nama.add(m[1]);
    }
  }
  return nama;
}

test("runbook menyebut setiap berkas migrasi yang ada di repo", () => {
  const hilang = tracked.filter((f) => !runbook.includes(`\`${f}\``));
  assert.deepEqual(
    hilang,
    [],
    `berkas migrasi ini belum disebut di docs/DEPLOYMENT-REDUNDANCY.md: ${hilang.join(", ")}`
  );
});

test("runbook tidak menyebut nama berkas migrasi yang tidak ada", () => {
  // Inilah yang dulu terjadi: 20260925142137_align_schema_contract.sql tidak
  // pernah ada sebagai nama berkas, sehingga operator yang mengikuti runbook
  // gagal di tengah urutan migrasi.
  //
  // Yang disebut boleh lebih banyak daripada isi direktori, karena migrasi
  // untracked boleh sudah didokumentasikan runbook lebih dulu. Yang dilarang
  // adalah nama yang benar-benar tidak ada di disk, karena itu hanya mungkin
  // salah ketik atau nama lama berkas.
  const disebut = [...runbook.matchAll(/`(\d[\w-]*)\.sql`/g)].map((m) => m[1]);
  const tidakAda = disebut.filter(
    (f) => !migrations.includes(`${f}.sql`) && !tracked.includes(`${f}.sql`)
  );
  assert.deepEqual(
    tidakAda,
    [],
    `runbook menyebut migrasi yang tidak ada di supabase/migrations/: ${tidakAda.join(", ")}`
  );
});

test("runbook menjelaskan akibatnya, bukan hanya nama migrasi keamanan", () => {
  // Daftar nama saja mudah dipindai tanpa dibaca. Runbook harus menyebut
  // konsekuensinya supaya operator tahu mana yang tidak boleh dilewati.
  for (const f of [
    "20260927150000_revoke_anon_write_on_product_images.sql",
    "20260927160000_harden_storage_access.sql",
  ]) {
    const posisi = runbook.indexOf(`\`${f}\``);
    assert.ok(posisi > -1, `${f} tidak disebut di runbook`);
    const paragraf = runbook.slice(posisi, posisi + 900);
    assert.match(
      paragraf,
      /anon|product_images/,
      `setelah ${f} harus dijelaskan akibatnya terhadap hak akses anon`
    );
  }
});

test("runbook memperingatkan agar tidak memakai supabase db push", () => {
  // Angka versi di ledger untuk 0001 sampai 0007 berbeda dari nama berkasnya,
  // karena dulu diterapkan dengan stempel waktu Supabase. CLI akan melihat
  // ketidakcocokan itu lalu menawarkan menjalankan ulang berkas yang sudah
  // berjalan, dan operator bisa menyetujuinya tanpa sadar.
  assert.match(
    runbook,
    /Jangan memakai `supabase db push`/,
    "runbook harus memperingatkan bahwa db push tidak cocok dengan ledger repo ini"
  );
  assert.match(
    runbook,
    /schema_migrations/,
    "runbook harus menjelaskan cara mencatat migrasi yang sudah diterapkan"
  );
});

test("runbook mencantumkan semua env yang dibaca kode", async () => {
  const wajib = [...(await envDipakaiKode())]
    .filter((n) => !DISETEL_PLATFORM.has(n))
    .sort();

  const blokEnv = runbook.match(/```env\n([\s\S]*?)```/);
  assert.ok(blokEnv, "blok ```env di runbook tidak ditemukan");

  const disebut = new Set(
    blokEnv[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => l.split("=")[0])
  );

  const hilang = wajib.filter((n) => !disebut.has(n));
  assert.deepEqual(
    hilang,
    [],
    `env ini dibaca kode tapi tidak ada di blok env runbook: ${hilang.join(", ")}`
  );
});

test("env wajib punya penjelasan hubungan antar variabelnya", () => {
  // Menyebut SUPABASE_SERVICE_ROLE_KEY tanpa menjelaskan bahwa itu cadangan
  // dari SUPABASE_SECRET_KEY membuat operator mengira salah satu sudah cukup,
  // padahal requireRole() dan health check membaca keduanya.
  const posisi = runbook.indexOf("SUPABASE_SERVICE_ROLE_KEY");
  assert.ok(posisi > -1, "runbook harus menyebut SUPABASE_SERVICE_ROLE_KEY");

  const sekitar = runbook.slice(Math.max(0, posisi - 300), posisi + 800);
  assert.match(
    sekitar,
    /cadangan|nama lama/,
    "penjelasan SUPABASE_SERVICE_ROLE_KEY harus menyebut bahwa itu nama lama yang jadi cadangan"
  );
  assert.match(
    sekitar,
    /SUPABASE_SECRET_KEY/,
    "penjelasan harus menyatakan hubungannya dengan SUPABASE_SECRET_KEY"
  );
});

test("env yang opsional tapi dibaca kode tetap disebut di runbook", () => {
  // Kalau env tidak wajib dan tidak disebut, operator production tidak tahu
  // fitur apa yang diam-diam mati.
  const opsionalKode = [
    "GOOGLE_PLACES_API_KEY",
    "GOOGLE_PLACE_ID",
    "NEXT_PUBLIC_SITE_URL",
    "SITE_URL",
    "SERVER_ACTIONS_ALLOWED_ORIGINS",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const hilang = opsionalKode.filter((n) => !runbook.includes(n));
  assert.deepEqual(
    hilang,
    [],
    `env ini dibaca kode tapi tidak disebut di runbook, fitur terkait akan mati tanpa pemberitahuan: ${hilang.join(", ")}`
  );
});
