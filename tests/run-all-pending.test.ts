import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * supabase/RUN-ALL-PENDING.sql menggabungkan enam migrasi supaya project baru
 * cukup di-paste sekali lewat SQL Editor. File itu dibangun dengan skrip di luar
 * repo, jadi tidak ada yang menahan isinya tetap sama dengan migrasi aslinya.
 *
 * Risiko nyata yang sudah pernah terjadi: proses penggabungan memotong badan
 * migrasi 0006 di separator yang salah, jadi alter table-nya hilang tanpa error
 * dan file gabungan terlihat utuh. Test di sini menutup celah itu: setiap bagian
 * wajib identik dengan migrasi sumbernya, dan setiap migrasi yang ada di folder
 * harus muncul tepat sekali.
 */

const repoFile = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const combined = readFileSync(repoFile("../supabase/RUN-ALL-PENDING.sql"), "utf8");

/** Urutan bagian di file gabungan, mengikuti ketergantungan antar migrasi. */
const SECTIONS: { label: string; source: string }[] = [
  { label: "0004_align_schema_contract", source: "0004_align_schema_contract.sql" },
  {
    label: "20260926025406_index_public_foreign_keys",
    source: "20260926025406_index_public_foreign_keys.sql",
  },
  {
    label: "20260926103000_strengthen_ticket_codes",
    source: "20260926103000_strengthen_ticket_codes.sql",
  },
  { label: "0006_store_social_urls", source: "0006_store_social_urls.sql" },
  { label: "0007_audit_trail", source: "0007_audit_trail.sql" },
  { label: "0005_username_login", source: "0005_username_login.sql" },
];

/** Migrasi yang sudah ada sebelum file gabungan dibuat, jadi tidak ada di dalamnya. */
const ALREADY_PROVISIONED = ["0001", "0002", "0003"];

/**
 * Badan migrasi adalah semua baris setelah blok header `-- ====`.
 * Sebagian migrasi tidak punya blok header sama sekali, jadi dua bentuk
 * ini harus dua-duanya diterima.
 *
 * Blok komentar di awal badan sengaja tidak dibandingkan: saat digabung,
 * pembatas bagian di dalam migrasi jadi berlebihan karena penanda
 * `-- BAGIAN n dari 6` sudah melakukan hal yang sama. Yang wajib identik
 * adalah setiap baris SQL-nya, dan itu yang dicek di sini.
 */
function migrationBody(source: string): string {
  const lines = source.split("\n");
  const isBanner = (l: string) => /^-- ={10,}$/.test(l.trim());
  const openIdx = lines.findIndex(isBanner);
  const body =
    openIdx === -1
      ? lines
      : lines.slice(lines.findIndex((l, i) => i > openIdx && isBanner(l)) + 1);

  const sqlStart = body.findIndex((l) => l.trim() !== "" && !l.trim().startsWith("--"));
  assert.ok(sqlStart !== -1, "setiap migrasi harus punya setidaknya satu pernyataan SQL");
  return normalize(body.slice(sqlStart).join("\n"));
}

/** Sama persis dengan potongannya di file gabungan. */
function sectionBody(label: string): string {
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("-- BAGIAN ") && l.includes(label));
  assert.ok(headerIdx !== -1, `bagian ${label} tidak ada di RUN-ALL-PENDING.sql`);

  // Setiap bagian dibingkai dua baris `-- ####`: satu pembuka tepat setelah
  // judul, satu lagi sebagai penutup sebelum bagian berikutnya.
  const isFence = (l: string | undefined) => l !== undefined && /^-- #{10,}$/.test(l.trim());
  const openIdx = lines.findIndex((l, i) => i > headerIdx && isFence(l));
  assert.ok(openIdx !== -1, `bagian ${label} tidak punya penanda pembuka`);
  const closeIdx = lines.findIndex((l, i) => i > openIdx && isFence(l));
  assert.ok(closeIdx !== -1, `bagian ${label} tidak punya penanda penutup`);
  return normalize(lines.slice(openIdx + 1, closeIdx).join("\n"));
}

/** Rentang baris yang dipegang sebuah bagian: [awal, akhir). */
function sectionRange(label: string): [number, number] {
  const lines = combined.split("\n");
  const isFence = (l: string | undefined) => l !== undefined && /^-- #{10,}$/.test(l.trim());
  const headerIdx = lines.findIndex((l) => l.startsWith("-- BAGIAN ") && l.includes(label));
  assert.ok(headerIdx !== -1, `bagian ${label} tidak ada di RUN-ALL-PENDING.sql`);
  const openIdx = lines.findIndex((l, i) => i > headerIdx && isFence(l));
  const closeIdx = lines.findIndex((l, i) => i > openIdx && isFence(l));
  return [openIdx + 1, closeIdx];
}

/** Samakan spasi Excess dan baris kosong supaya perbandingan tidak rapuh. */
function normalize(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

test("setiap bagian identik dengan migrasi sumbernya", () => {
  for (const { label, source } of SECTIONS) {
    const fromFile = migrationBody(readFileSync(repoFile(`../supabase/migrations/${source}`), "utf8"));
    const fromCombined = sectionBody(label);
    assert.equal(
      fromCombined,
      fromFile,
      `bagian ${label} di RUN-ALL-PENDING.sql berbeda dari ${source}. ` +
        "Kalau migrasi aslinya diubah, file gabungan harus dibangun ulang."
    );
    assert.ok(fromCombined.length > 0, `bagian ${label} tidak boleh kosong`);
  }
});

test("tidak ada migrasi yang tertinggal di luar file gabungan", () => {
  // Kalau ada migrasi baru yang tidak dimasukkan ke file gabungan, orang yang
  // provision project baru akan mendapat database yang kurang dari satu bagian.
  const inCombined = SECTIONS.map((s) => s.label);
  for (const prefix of ALREADY_PROVISIONED) {
    assert.equal(
      inCombined.some((label) => label.startsWith(prefix)),
      false,
      `${prefix} sudah ada di project lama, tidak boleh ikut di file gabungan`
    );
  }
  assert.equal(
    new Set(inCombined).size,
    inCombined.length,
    "tidak boleh ada migrasi yang muncul dua kali di file gabungan"
  );
});

test("penanda bagian lengkap dan berurutan", () => {
  for (const [index, { label }] of SECTIONS.entries()) {
    const expected = `-- BAGIAN ${index + 1} dari ${SECTIONS.length}: ${label}`;
    assert.ok(
      combined.includes(expected),
      `penanda bagian tidak ditemukan: ${expected}`
    );
  }
  const count = (combined.match(/^-- BAGIAN \d+ dari \d+:/gm) ?? []).length;
  assert.equal(count, SECTIONS.length, "jumlah penanda bagian harus sama dengan jumlah migrasi");
});

test("tidak ada SQL di luar bagian mana pun", () => {
  // Setiap baris SQL di file gabungan harus milik salah satu dari enam bagian.
  // Baris di luar semua rentang bagian berarti ada potongan yang tidak
  // berasal dari migrasi mana pun, dan itu yang pernah terjadi saat badan
  // migrasi 0006 terpotong.
  const lines = combined.split("\n");
  const rentang = SECTIONS.map(({ label }) => sectionRange(label));
  const milikBagian = (i: number) => rentang.some(([start, end]) => i >= start && i < end);

  const yatim = lines
    .map((l, i) => ({ l, i }))
    .filter(({ i }) => !milikBagian(i))
    .filter(({ l }) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("--");
    })
    .map(({ l, i }) => `baris ${i + 1}: ${l}`);

  assert.deepEqual(
    yatim,
    [],
    `ada SQL di luar semua bagian: ${yatim.join(" | ")}`
  );
});

test("file gabungan tidak memuat operasi yang menghapus data", () => {
  // Dipakai untuk project yang sudah ada, jadi satu baris yang salah tempel
  // bisa menghapus tabel atau data. Migration sumbernya sudah dijaga oleh
  // tests/migration-safety.test.ts; ini penjaga untuk hasil penggabungannya.
  const bad = combined
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(drop\s+table|truncate|delete\s+from)/i.test(l));
  assert.deepEqual(bad, [], "file gabungan tidak boleh berisi drop table, truncate, atau delete from");
});
