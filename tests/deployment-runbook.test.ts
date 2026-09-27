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

/*
 * Bagian verifikasi etalase dijaga karena etalase kosong di HTML tidak pernah
 * muncul sebagai halaman error. Statusnya 200, bentuknya tetap halaman toko,
 * dan yang hilang hanya isi etalase, jadi tanpa pemeriksaan HTML yang
 * disengaja tidak ada yang tahu Google dan pratinjau tautan WhatsApp membaca
 * "0 unit".
 */
function bagian(judul: string): string {
  const mulai = runbook.indexOf(judul);
  assert.ok(mulai > 0, `runbook tidak punya bagian "${judul}"`);
  const akhir = runbook.indexOf("\n## ", mulai + judul.length);
  return runbook.slice(mulai, akhir === -1 ? undefined : akhir);
}

test("runbook punya bagian memeriksa etalase di HTML", () => {
  const isi = bagian("### Verifikasi etalase di HTML");

  // Etalase kosong harus bisa dikenali lewat bukti yang bisa diulang, bukan
  // hanya deemed benar karena health check hijau.
  for (const wajib of [
    "v_public_inventory",
    "loadLiveData",
    "Data publik sedang tidak dapat dimuat",
    "databaseSchemaReady",
    "unit, harga",
  ]) {
    assert.ok(
      isi.includes(wajib),
      `bagian verifikasi etalase harus menyebut ${wajib}`
    );
  }

  // Bagian ini harus menempel pada langkah rilis, bukan berdiri sendiri di
  // bagian yang tidak dibaca sebelum deploy.
  const posisiRilis = runbook.indexOf("## Rilis yang aman");
  const posisiBagian = runbook.indexOf("### Verifikasi etalase di HTML");
  const posisiDns = runbook.indexOf("## DNS dan session");
  assert.ok(posisiRilis >= 0 && posisiDns > posisiBagian, "urutan bagian salah");
  assert.ok(posisiBagian > posisiRilis, "verifikasi etalase harus ada setelah langkah rilis");
});

test("langkah deploy menyebut header CSP sebagai penanda image baru", () => {
  // Dua kali deploy hijau tanpa perubahan apa pun terjadi karena image lama
  // yang jalan, dan health check tidak bisa membedakannya. Header CSP adalah
  // satu-satunya tanda yang langsung berubah bersama image, jadi langkah
  // deploy wajib menyebutkannya sebagai penanda, bukan hanya "/api/health/ready".
  const mulai = runbook.indexOf("## Rilis yang aman");
  assert.ok(mulai > 0, "runbook tidak punya bagian rilis yang aman");
  const langkah = runbook.slice(mulai, mulai + 1200);
  assert.match(
    langkah,
    /content-security-policy/,
    "langkah deploy harus menyebut header content-security-policy sebagai penanda image baru"
  );
  assert.match(
    langkah,
    /CSP\.md/,
    "langkah deploy harus menunjuk ke docs/CSP.md untuk cara lengkapnya"
  );
});

test("perhitungan unit di runbook benar-benar mengembalikan angka", async () => {
  // Angka dan kata "unit" dipisah simpul komentar React, sehingga HTML mentah
  // tidak pernah cocok dengan pola "unit, harga". Perintah yang pertama ditulis
  // di runbook begitu: selalu kosong, dan kosong itu terbaca seperti kegagalan
  // deploy padahal etalase sedang terisi. Jadi perintahnya dijalankan sungguhan
  // di sini, bukan hanya diperiksa bentuknya.
  const isi = bagian("### Verifikasi etalase di HTML");
  const blok = isi.match(/```bash\n([\s\S]*?)```/);
  assert.ok(blok, "bagian verifikasi etalase harus punya blok bash");

  const perintah = blok[1]
    .split("\n")
    .map((baris) => baris.trim())
    .find((baris) => baris.includes("unit, harga"));
  assert.ok(perintah, "blok bash harus menghitung unit dengan pola 'unit, harga'");

  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");

  const folder = await mkdtemp(join(tmpdir(), "runbook-etalase-"));
  const contoh = join(folder, "katalog.html");
  await writeFile(
    contoh,
    '<p class="text-muted">7<!-- --> <!-- -->unit, harga termasuk garansi toko</p>\n',
    "utf8"
  );
  try {
    // Alamat production diganti berkas contoh supaya test tidak menyentuh jaringan.
    const dijalankan = perintah.replace(/curl -s \S+/, `cat ${contoh}`);
    const hasil = execFileSync("bash", ["-c", dijalankan], { encoding: "utf8" });
    assert.equal(
      hasil.trim(),
      "7 unit, harga",
      "perintah runbook harus mengembalikan jumlah unit dari HTML yang sama bentuknya dengan production"
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("runbook punya aturan satu proses Next.js untuk database yang sama", () => {
  // Gejalanya menyesatkan: halaman publik menggantung sementara health check
  // tetap hijau, sehingga orang menyimpulkan ada bug render, bukan rebutan
  // koneksi.
  const isi = bagian("### Verifikasi lokal memakai database yang sama");
  for (const wajib of ["satu proses Next.js", "statement_timeout", "max"]) {
    assert.ok(isi.includes(wajib), `bagian verifikasi lokal harus menyebut ${wajib}`);
  }
});

test("runbook menjelaskan cara membaca commit sumber dari image yang jalan", () => {
  // Image yang salah tetap menghasilkan deploy hijau, jadi operator perlu
  // perintah yang langsung menjawab "image ini dari commit mana". Label
  // org.opencontainers.image.revision dipasang GitHub Actions dan sudah
  // terbukti ada di image At Cell, jadi ini bukan asumsi.
  const isi = bagian("## Tag image di Dockerfile.coolify");
  for (const wajib of [
    "org.opencontainers.image.revision",
    "docker inspect",
    "sha-<commit>",
  ]) {
    assert.ok(isi.includes(wajib), `bagian tag image harus menyebut ${wajib}`);
  }
});
