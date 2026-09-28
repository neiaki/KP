import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import postgres from "postgres";

/*
 * Ledger migrasi harus menyebut versi yang sama dengan nama file di repo.
 *
 * Yang terjadi di production sebelum test ini ada: file migrasi tetap memakai
 * konvensi 0001-0007, tapi empat di antaranya pernah dijalankan lewat jalur lain
 * yang mencatat versi timestamp ke dalam supabase_migrations.schema_migrations.
 * Efeknya tetap ada di database, jadi tidak ada data yang hilang dan tidak ada
 * lubang keamanan. Yang rusak hanya catatannya: `supabase db push` menolak
 * berjalan karena ada versi remote yang tidak punya file, dan check Supabase
 * Preview gagal dengan "Remote migration versions not found in local
 * migrations directory" tanpa menjelaskan apa mismatch-nya.
 *
 * Test lokal mengunci aturan penamaan dan keunikan versi. Test database
 * mengunci kesesuaian ledger dengan repo, dan sifatnya read-only: tidak pernah
 * menulis ke database mana pun.
 *
 * Test database opt-in lewat DATABASE_URL supaya `npm test` di CI tanpa
 * database tetap jalan.
 */

const MIGRASI_DIR = new URL("../supabase/migrations/", import.meta.url);

interface Migrasi {
  file: string;
  version: string;
  name: string;
}

/**
 * Nama file harus `<versi>_<nama>.sql`. Versi adalah bagian sebelum underscore
 * pertama, persis yang dibaca Supabase CLI, jadi perhitungannya sama dengan
 * yang terjadi saat pushing.
 */
async function bacaSemuaMigrasi(): Promise<Migrasi[]> {
  const berkas = await readdir(MIGRASI_DIR);
  const hasil: Migrasi[] = [];
  for (const file of berkas.filter((f) => f.endsWith(".sql")).sort()) {
    const dasar = file.slice(0, -".sql".length);
    const garis = dasar.indexOf("_");
    if (garis <= 0) {
      hasil.push({ file, version: "", name: dasar });
      continue;
    }
    hasil.push({ file, version: dasar.slice(0, garis), name: dasar.slice(garis + 1) });
  }
  return hasil;
}

const migrasi = await bacaSemuaMigrasi();

test("setiap file migrasi mengikuti konvensi <versi>_<nama>.sql", () => {
  const salah = migrasi.filter(
    (m) => m.version === "" || m.name === "" || !/^[A-Za-z0-9_]+$/.test(m.name)
  );
  assert.deepEqual(
    salah.map((m) => m.file),
    [],
    `nama file migrasi tidak sesuai konvensi: ${[... salah].map((m) => m.file).join(", ")}`
  );
});

test("versi migrasi tidak pernah duplikat di repo", () => {
  const hitung = new Map<string, string[]>();
  for (const m of migrasi) {
    const daftar = hitung.get(m.version) ?? [];
    daftar.push(m.file);
    hitung.set(m.version, daftar);
  }
  const bentrok = [...hitung.entries()].filter(([, daftar]) => daftar.length > 1);
  assert.deepEqual(
    bentrok,
    [],
    "versi yang dipakai lebih dari satu file akan ditolak CLI: " +
      bentrok.map(([v, daftar]) => `${v} -> ${daftar.join(", ")}`).join("; ")
  );
});

test("migrasi 0001 sampai 0007 ada dan namanya tidak berubah", () => {
  // Empat versi ini pernah tercatat di ledger dengan versi timestamp. Kalau
  // ada yang mengubah namanya lagi, ledger dan repo akan melenceng diam-diam
  // persis seperti yang terjadi sebelum test ini ada.
  const diharapkan: Record<string, string> = {
    "0001": "atcell_schema",
    "0002": "harden_atcell_schema",
    "0003": "lock_legacy_helpers",
    "0004": "align_schema_contract",
    "0005": "username_login",
    "0006": "store_social_urls",
    "0007": "audit_trail",
  };
  const peta = new Map(migrasi.map((m) => [m.version, m.name]));
  const salah = Object.entries(diharapkan).filter(
    ([versi, nama]) => peta.get(versi) !== nama
  );
  assert.deepEqual(
    salah,
    [],
    "nama migrasi tidak sesuai: " +
      salah
        .map(
          ([v, n]) =>
            `${v} diharapkan ${n} tapi ada ${peta.get(v) ?? "(hilang)"}`
        )
        .join("; ")
  );
});

test("migrasi index foreign key memakai satu versi yang pasti", () => {
  // Di ledger pernah ada 20260926025432 sementara file repo 20260926025406.
  // Selisih 26 detik, migrasi yang sama. Test ini menahan supaya tidak terulang.
  const cocok = migrasi.filter((m) => m.name === "index_public_foreign_keys");
  assert.equal(cocok.length, 1, "harus ada tepat satu migrasi index_public_foreign_keys");
  assert.equal(cocok[0].version, "20260926025406");
});

// --------------------------------------------------------------------------
// Sisi database: read-only, opt-in lewat DATABASE_URL
// --------------------------------------------------------------------------

const url = process.env.DATABASE_URL;

// Opsi yang sama dengan src/db/client.ts. `prepare: false` wajib karena
// DATABASE_URL production menunjuk Supabase connection pooler mode transaksi
// (port 6543), yang tidak menangani prepared statement. Tanpa baris ini test
// gagal dengan CONNECTION_ENDED padahal database-nya sehat. max_lifetime dan
// idle_timeout mencegah pooler membuang socket yang menganggur, kelas bug yang
// sudah pernah menjatuhkan situs ini.
/* eslint-disable @typescript-eslint/no-explicit-any */
const OPSI_POOL: any = {
  prepare: false,
  max: 1,
  max_lifetime: 300,
  idle_timeout: 20,
  connect_timeout: 5,
  onnotice: () => {},
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// Keberadaan DATABASE_URL tidak menjamin database-nya bisa dihubungi. Sisa
// DATABASE_URL milik project lain di shell akan membuat pipeline merah tanpa ada
// yang rusak, jadi satu-satunya koneksi dicoba lebih dulu dan test dilewati kalau
// gagal. Client hanya dibuat satu supaya tidak ada dua koneksi yang saling
// berebut saat probe ditutup.
const sql = url
  ? postgres(url, OPSI_POOL)
  : null;

const reachable = sql
  ? await sql`select 1`.then(
      () => true,
      () => false
    )
  : false;

const skip = !url
  ? "butuh DATABASE_URL"
  : reachable
    ? false
    : "DATABASE_URL tidak bisa dihubungi";

test("ledger database tidak punya versi yang file repo tidak punya", { skip }, async () => {
  const rows = await sql!`
    select version, name
      from supabase_migrations.schema_migrations
  `;
  const repo = new Set(migrasi.map((m) => m.version));
  const asing = rows
    .map((r) => String(r.version))
    .filter((v) => !repo.has(v))
    .sort();
  assert.deepEqual(
    asing,
    [],
    "versi ini tercatat di database tapi tidak ada filenya di supabase/migrations: " +
      asing.join(", ")
  );
});

test("setiap file migrasi di repo tercatat di ledger database", { skip }, async () => {
  const rows = await sql!`
    select version, name
      from supabase_migrations.schema_migrations
  `;
  const ledger = new Map(rows.map((r) => [String(r.version), String(r.name ?? "")]));
  const belum = migrasi.filter((m) => !ledger.has(m.version)).map((m) => m.file);
  assert.deepEqual(
    belum,
    [],
    "file ini tidak tercatat sebagai sudah diterapkan, jadi db push akan " +
      `menjalankannya lagi: ${belum.join(", ")}`
  );
});

test("nama di ledger sama persis dengan nama di file repo", { skip }, async () => {
  const rows = await sql!`
    select version, name
      from supabase_migrations.schema_migrations
  `;
  const ledger = new Map(rows.map((r) => [String(r.version), String(r.name ?? "")]));
  const beda = migrasi
    .filter((m) => ledger.has(m.version) && ledger.get(m.version) !== m.name)
    .map((m) => `${m.version} file=${m.name} ledger=${ledger.get(m.version)}`);
  assert.deepEqual(beda, [], `nama di ledger tidak sama dengan nama file: ${beda.join("; ")}`);
});

// Penutupan harus lewat test.after, bukan di top level modul. Baris di top
// level dieksekusi sebelum callback test dijalankan, jadi sql.end() di sana
// menutup koneksi lebih dulu dan ketiga test di atas gagal dengan
// CONNECTION_ENDED meski database-nya sehat.
test.after(async () => {
  await sql?.end({ timeout: 5 }).catch(() => {});
});
