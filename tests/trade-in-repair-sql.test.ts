import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * H-3: repair UPDATE yang didokumentasikan di migrasi 20260927180000 tidak
 * punya predicate yang distinguishes unit trade-in yang katalognya salah
 * dari unit yang katalognya sudah benar. Tanpa predicate itu, operator yang
 * menjalankan persis seperti tertulis memutus tautan katalog stok second yang
 * masih layak jual.
 *
 * SQL ini tidak pernah dieksekusi aplikasi, jadi verifikasinya statis tapi
 * bukan sekadar grep: pernyataan diambil keluar dari blok komentarnya, lalu
 * setiap referensi tabel.kolom di dalamnya dicocokkan dengan kolom yang
 * benar-benar dibuat di 0001_atcell_schema.sql. Jadi test ini menangkap
 * empat kelas kesalahan: SQL yang tidak parse, nama tabel yang tidak ada,
 * nama kolom yang salah eja, dan predicate yang hilang.
 */

const MIGRATION = "20260927180000_nullable_inventory_unit_product";
const migration = readFileSync(
  new URL(`../supabase/migrations/${MIGRATION}.sql`, import.meta.url),
  "utf8"
);
const combined = readFileSync(new URL("../supabase/RUN-ALL-PENDING.sql", import.meta.url), "utf8");
const ddl = readFileSync(new URL("../supabase/migrations/0001_atcell_schema.sql", import.meta.url), "utf8");

/**
 * Ambil isi satu blok komentar `--   ...` yang berisi pernyataan SQL.
 * Setiap baris di dalam blok diawali "--   ", jadi blok skema SQL yang
 * terdokumentasi bisa diambil tanpa tersapu blok penjelasan lain.
 */
function documentedStatements(sql: string): string[] {
  const out: string[] = [];
  let current: string[] | null = null;
  for (const line of sql.split("\n")) {
    const m = /^--\s{3,}(\S.*)$/.exec(line);
    if (m) {
      (current ??= []).push(m[1]);
      continue;
    }
    if (current) {
      if (line.trim() === "--" || line.trim() === "") continue;
      out.push(current.join("\n"));
      current = null;
    }
  }
  if (current) out.push(current.join("\n"));
  return out.filter((s) => /;\s*$/.test(s.trim()));
}

const statements = documentedStatements(migration);
const repair = statements.find((s) => /^update\s/i.test(s.trim()));

/** Kolom yang benar-benar ada di sebuah tabel, dari DDL 0001. */
function columnsOf(table: string): Record<string, true> {
  const create = new RegExp(
    `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    "i"
  ).exec(ddl);
  assert.ok(create, `tabel public.${table} tidak ada di 0001`);
  const cols: Record<string, true> = {};
  for (const raw of create[1].split("\n")) {
    const line = raw.replace(/--.*$/, "").trim();
    const m = /^([a-z_][a-z0-9_]*)\s+[a-z]/.exec(line);
    if (m) cols[m[1].toLowerCase()] = true;
  }
  return cols;
}

test("blok perbaikan di migrasi terdokumentasi dan bisa dibaca keluar", () => {
  assert.ok(statements.length > 0, "tidak ada pernyataan SQL terdokumentasi di migrasi");
  assert.ok(repair, "blok perbaikan data harus ada di dalam komentar migrasi");
  assert.match(repair, /^update\s+public\.inventory_units\s/u);
});

test("pernyataan perbaikan punya bentuk SQL yang utuh", () => {
  const sql = repair!;
  // Tanda kurung seimbang: satu kurung buka untuk setiap kurung tutup.
  const opens = (sql.match(/\(/g) ?? []).length;
  const closes = (sql.match(/\)/g) ?? []).length;
  assert.equal(opens, closes, `kurung tidak seimbang: ${opens} buka vs ${closes} tutup`);
  assert.ok(sql.trimEnd().endsWith(";"), "pernyataan harus diakhiri titik koma");
  // FROM dan WHERE wajib ada, dan WHERE harus menugaskan hanya satu kolom.
  assert.match(sql, /\bfrom\b/i);
  assert.match(sql, /\bwhere\b/i);
  const sets = [...sql.matchAll(/set\s+([a-z_][a-z0-9_]*)\s*=/gi)].map((m) => m[1]);
  assert.deepEqual(sets, ["product_id"], "hanya product_id yang boleh ditulis");
});

test("pernyataan perbaikan hanya merujuk tabel dan kolom yang benar-benar ada", () => {
  const sql = repair!;
  // Setiap alias yang ditulis di FROM harus punya tabel nyata.
  const aliases: Record<string, string> = {};
  const from = /\bfrom\s+([\s\S]*?)\bwhere\b/i.exec(sql);
  assert.ok(from, "pernyataan harus punya FROM");
  for (const m of from[1].matchAll(/public\.([a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z_][a-z0-9_]*)/gi)) {
    aliases[m[2].toLowerCase()] = m[1].toLowerCase();
  }
  // Alias tabel target juga sah dirujuk, jadi daftarkan dari klausa UPDATE.
  const target = /\bupdate\s+public\.([a-z_][a-z0-9_]*)\s+([a-z_][a-z0-9_]*)/i.exec(sql);
  assert.ok(target, "pernyataan harus punya klausa UPDATE dengan alias target");
  aliases[target[2].toLowerCase()] = target[1].toLowerCase();

  assert.deepEqual(
    Object.entries(aliases)
      .map(([a, t]) => `${a}->${t}`)
      .sort(),
    ["p->products", "t->trade_in_records", "u->inventory_units"],
    "harus ada alias untuk tiap tabel yang dirujuk: target, t, dan p"
  );

  // Setiap alias yang dirujuk harus punya tabel di FROM.
  const known: Record<string, Record<string, true>> = {};
  for (const table of Object.values(aliases)) known[table] = columnsOf(table);
  known.inventory_units = columnsOf("inventory_units");

  for (const m of sql.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi)) {
    const alias = m[1].toLowerCase();
    const column = m[2].toLowerCase();
    // "public.inventory_units" adalah qualify skema, bukan alias.kolom.
    if (alias === "public") continue;
    const table = aliases[alias];
    assert.ok(table, `alias "${m[1]}" dipakai di WHERE tapi tidak ada di FROM`);
    assert.ok(
      known[table]![column],
      `kolom "${table}.${column}" tidak ada di DDL 0001`
    );
  }
});

test("perbaikan hanya menyentuh unit yang katalognya memang tidak cocok", () => {
  const sql = repair!.toLowerCase();
  // Pengaman lama tetap ada.
  assert.match(sql, /resulting_unit_id\s*=\s*u\.id/);
  assert.match(sql, /u\.product_id\s+is\s+not\s+null/);
  // Predicate yang jadi inti perbaikan: bandingkan model asli dengan katalog.
  assert.match(sql, /is\s+distinct\s+from/);
  assert.match(sql, /original_brand_model/);
  // Tanpa ini, setiap unit hasil trade-in ikut terputuskan.
  assert.doesNotMatch(
    sql.replace(/[\s\S]*is\s+distinct\s+from[\s\S]*/, ""),
    /and\s+u\.product_id\s+is\s+not\s+null\s*;?\s*$/,
    "predikat perbandingan model harus jadi syarat terakhir"
  );
  // Dua sisi harus dinormalisasi supaya beda kapital tidak salah dinilai.
  const lowerCalls = (repair!.match(/\blower\s*\(/gi) ?? []).length;
  assert.ok(lowerCalls >= 2, `kedua sisi harus dibungkus lower(), baru ada ${lowerCalls}`);
});

test("blok perbaikan yang sama ada utuh di RUN-ALL-PENDING.sql", () => {
  // Di file gabungan setiap baris badan migrasi digeser dua spasi, jadi
  // dibandingkan setelah spasi dirapikan. Yang dibandingkan adalah isi
  // pernyataan, supaya operator project baru menjalankan SQL yang sama.
  const flatten = (text: string) =>
    text
      .split("\n")
      .map((l) => l.replace(/--\s{3,}/, "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
  assert.ok(
    flatten(combined).includes(flatten(repair!)),
    "pernyataan perbaikan di migrasi harus utuh juga di RUN-ALL-PENDING.sql, " +
      "kalau tidak operator project baru mendapat file yang berbeda"
  );
});
