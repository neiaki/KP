import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * supabase/RUN-ALL-PENDING.sql menggabungkan 25 migrasi supaya
 * project baru cukup di-paste sekali lewat SQL Editor. File itu dibangun
 * dengan skrip di luar repo, jadi tidak ada yang menahan isinya tetap sama
 * dengan migrasi aslinya.
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
  { label: "0001_atcell_schema", source: "0001_atcell_schema.sql" },
  { label: "0002_harden_atcell_schema", source: "0002_harden_atcell_schema.sql" },
  { label: "0003_lock_legacy_helpers", source: "0003_lock_legacy_helpers.sql" },
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
  {
    label: "20260927130000_product_image_registry",
    source: "20260927130000_product_image_registry.sql",
  },
  {
    label: "20260927120000_auto_enable_rls_on_new_tables",
    source: "20260927120000_auto_enable_rls_on_new_tables.sql",
  },
  {
    label: "20260927140000_store_owner_and_real_contact",
    source: "20260927140000_store_owner_and_real_contact.sql",
  },
  {
    label: "20260927150000_revoke_anon_write_on_product_images",
    source: "20260927150000_revoke_anon_write_on_product_images.sql",
  },
  {
    label: "20260927160000_harden_storage_access",
    source: "20260927160000_harden_storage_access.sql",
  },
  {
    label: "20260927170000_demo_ticket_for_tracking_example",
    source: "20260927170000_demo_ticket_for_tracking_example.sql",
  },
  {
    label: "20260927180000_nullable_inventory_unit_product",
    source: "20260927180000_nullable_inventory_unit_product.sql",
  },
  {
    label: "20260927190000_close_browser_role_write_grants",
    source: "20260927190000_close_browser_role_write_grants.sql",
  },
  {
    label: "20260927200000_remove_ocean_photo_from_reno11_gallery",
    source: "20260927200000_remove_ocean_photo_from_reno11_gallery.sql",
  },
  {
    label: "20260927201000_clear_unparseable_product_image_url",
    source: "20260927201000_clear_unparseable_product_image_url.sql",
  },
  {
    label: "20260927202000_trim_crop_duplicate_a55_photos",
    source: "20260927202000_trim_crop_duplicate_a55_photos.sql",
  },
  {
    label: "20260930100000_catalogue_apple_iphone_15_pro",
    source: "20260930100000_catalogue_apple_iphone_15_pro.sql",
  },
  {
    label: "20260930101000_catalogue_samsung_galaxy_s24_ultra",
    source: "20260930101000_catalogue_samsung_galaxy_s24_ultra.sql",
  },
  {
    label: "20260930102000_catalogue_xiaomi_14",
    source: "20260930102000_catalogue_xiaomi_14.sql",
  },
  {
    label: "20260930103000_catalogue_vivo_v30",
    source: "20260930103000_catalogue_vivo_v30.sql",
  },
  {
    label: "20260930104000_catalogue_iphone_14_plus_for_tradein_unit_9",
    source: "20260930104000_catalogue_iphone_14_plus_for_tradein_unit_9.sql",
  },
];

/** Setiap berkas di supabase/migrations/ wajib muncul, tanpa kecuali. */
const MIGRASI = readdirSync(repoFile("../supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

/**
 * Badan migrasi adalah semua baris setelah blok header `-- ====`.
 * Sebagian migrasi tidak punya blok header sama sekali, jadi dua bentuk
 * ini harus dua-duanya diterima.
 *
 * Blok komentar di awal badan sengaja tidak dibandingkan: saat digabung,
 * pembatas bagian di dalam migrasi jadi berlebihan karena penanda
 * `-- BAGIAN n dari 25` sudah melakukan hal yang sama. Yang wajib identik
 * adalah setiap baris SQL-nya, dan itu yang dicek di sini.
 */
/**
 * Buang baris kosong dan baris komentar di awal. Dipakai kedua sisi
 * perbandingan supaya blok penjelasan di kepala tiap bagian tidak ikut
 * dibandingkan. Isi dari baris SQL pertama ke bawah yang wajib identik.
 */
function dropLeadingComments(body: string[]): string[] {
  const start = body.findIndex((l) => l.trim() !== "" && !l.trim().startsWith("--"));
  assert.ok(start !== -1, "setiap migrasi harus punya setidaknya satu pernyataan SQL");
  return body.slice(start);
}

function migrationBody(source: string): string {
  const lines = source.split("\n");
  const isBanner = (l: string) => /^-- ={10,}$/.test(l.trim());
  const openIdx = lines.findIndex(isBanner);
  const body =
    openIdx === -1
      ? lines
      : lines.slice(lines.findIndex((l, i) => i > openIdx && isBanner(l)) + 1);

  return normalize(dropLeadingComments(body).join("\n"));
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
  return normalize(dropLeadingComments(lines.slice(openIdx + 1, closeIdx)).join("\n"));
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
  // Daftar SECTIONS di atas adalah daftar putih: ia harus memuat SETIAP berkas
  // di supabase/migrations/. Tidak ada lagi migrasi yang dikecualikan "karena
  // sudah ada di project lama", karena file gabungan harus bisa dipakai untuk
  // project yang benar-benar kosong.
  const inCombined = SECTIONS.map((s) => s.source);
  const missing = MIGRASI.filter((f) => !inCombined.includes(f));
  assert.deepEqual(
    missing,
    [],
    `migrasi ini tidak ada di RUN-ALL-PENDING.sql: ${missing.join(", ")}. ` +
      "File gabungan harus dibangun ulang."
  );

  const unknown = inCombined.filter((f) => !MIGRASI.includes(f));
  assert.deepEqual(
    unknown,
    [],
    `RUN-ALL-PENDING.sql merujuk berkas migrasi yang tidak ada: ${unknown.join(", ")}`
  );

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
  // Setiap baris SQL di file gabungan harus milik salah satu dari semua bagian.
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
