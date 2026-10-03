import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { updateUnitDetailsSchema } from "../src/lib/validations.ts";

/*
 * Cacat: unit yang ter-tag salah atau salah harga tidak bisa diperbaiki.
 *
 * src/lib/actions/inventory.ts cuma punya satu .update(inventoryUnits) di
 * updateUnitStatus, dan yang ditulis hanya kolom `status`. Tidak ada action
 * mana pun yang menyentuh `condition` atau `selling_price` pada unit yang
 * sudah ada, jadi unit yang salah tag akan salah tag selamanya: satu-satunya
 * perubahan yang bisa dilakukan staf cuma memindahkan statusnya.
 *
 * Yang diuji di sini adalah schema yang mengunci input, lalu struktur action
 * yang mengunci peran, cakupan penulisan, dan aturan validasi. Action-nya
 * sendiri butuh database Supabase yang sudah login, jadi tidak bisa
 * dieksekusi di runner Node tanpa DATABASE_URL. Schema di bawah adalah satu
 * bagian yang benar-benar dieksekusi.
 */

const actions = readFileSync(
  new URL("../src/lib/actions/inventory.ts", import.meta.url),
  "utf8"
);
const page = readFileSync(
  new URL("../src/app/(portal)/portal/inventory/page.tsx", import.meta.url),
  "utf8"
);

/** Badan fungsi updateUnitDetails, dari deklarasi sampai penutup filed-nya. */
function actionBody(): string {
  const start = actions.indexOf("export async function updateUnitDetails");
  assert.notEqual(start, -1, "updateUnitDetails tidak ada di actions/inventory.ts");
  const end = actions.indexOf("\n}", start);
  assert.notEqual(end, -1, "penutup updateUnitDetails tidak ditemukan");
  return actions.slice(start, end);
}

test("schema koreksi menolak kondisi yang bukan unit_condition", () => {
  // unit_condition hanya punya dua nilai, jadi kondisi di luar itu tidak boleh
  // sampai ke database.
  assert.equal(
    updateUnitDetailsSchema.safeParse({ unitId: 1, condition: "new", sellingPrice: 1 }).success,
    true
  );
  assert.equal(
    updateUnitDetailsSchema.safeParse({ unitId: 1, condition: "second", sellingPrice: 1 }).success,
    true
  );
  for (const bad of ["secondhand", "NEW", "", null, 2]) {
    const parsed = updateUnitDetailsSchema.safeParse({
      unitId: 1,
      condition: bad,
      sellingPrice: 1_000_000,
    });
    assert.equal(
      parsed.success,
      false,
      `condition ${JSON.stringify(bad)} harus ditolak`
    );
  }
});

test("schema koreksi menolak harga jual nol, negatif, dan tidak angka", () => {
  for (const bad of [0, -1, -12_000_000]) {
    assert.equal(
      updateUnitDetailsSchema.safeParse({ unitId: 1, condition: "second", sellingPrice: bad })
        .success,
      false,
      `harga ${bad} harus ditolak, unit berharga 0 tidak pernah masuk etalase`
    );
  }
  assert.equal(
    updateUnitDetailsSchema.safeParse({ unitId: 1, condition: "new", sellingPrice: "abc" }).success,
    false
  );
  assert.equal(
    updateUnitDetailsSchema.safeParse({ unitId: 0, condition: "new", sellingPrice: 1 }).success,
    false,
    "unitId harus positif"
  );
  // Harga dari form sampai sebagai angka, dan string angka tetap diterima.
  assert.equal(
    updateUnitDetailsSchema.safeParse({ unitId: 1, condition: "new", sellingPrice: "1500000" })
      .success,
    true
  );
});

test("koreksi hanya boleh dilakukan sales dan admin", () => {
  const body = actionBody();
  // Peran mengikuti registerUnits, yang menulis kolom yang sama persis
  // (condition dan selling_price) saat pendaftaran.
  assert.match(body, /requireRole\(\["admin", "sales"\]\)/);
  assert.match(body, /if \("error" in guard\) return fail\(guard\.error\);/);
  // Guard harus jalan sebelum schema dan sebelum database, supaya orang yang
  // tidak berhak tidak bisa membocorkan apakah unit itu ada.
  const guardAt = body.indexOf("requireRole(");
  const parseAt = body.indexOf("updateUnitDetailsSchema.safeParse");
  const dbAt = body.indexOf("getDb()");
  assert.ok(guardAt > -1 && parseAt > guardAt, "requireRole sebelum validasi");
  assert.ok(dbAt > parseAt, "validasi sebelum menyentuh database");
});

test("penulisan koreksi dibatasi ke satu unit", () => {
  const body = actionBody();
  assert.match(
    body,
    /\.update\(inventoryUnits\)[\s\S]*?\.set\(\{ condition, sellingPrice: String\(sellingPrice\) \}\)[\s\S]*?\.where\(eq\(inventoryUnits\.id, unitId\)\)/,
    "update harus filter eq(id) supaya tidak menimpa baris lain"
  );
  // Yang ditulis harus persis kondisi dan harga, tidak boleh ada kolom lain.
  const setMatch = body.match(/\.set\(\{([^}]*)\}\)/);
  assert.ok(setMatch, "blok .set() tidak ditemukan");
  const written = setMatch[1];
  assert.match(written, /condition/);
  assert.match(written, /sellingPrice/);
  assert.doesNotMatch(written, /status/, "status punya jalurnya sendiri, tidak boleh ikut ditulis");
  assert.doesNotMatch(written, /imei/, "IMEI tidak boleh ditulis ulang lewat koreksi");
});

test("harga jual baru wajib di atas harga beli, tapi harga lama boleh apa adanya", () => {
  const body = actionBody();
  // purchase_cost dan selling_price lama tidak ada di payload, jadi keduanya
  // harus dibaca dari baris yang sama.
  assert.match(body, /purchaseCost: inventoryUnits\.purchaseCost/);
  assert.match(body, /sellingPrice: inventoryUnits\.sellingPrice/);
  assert.match(
    body,
    /if \(sellingPrice !== previousPrice && sellingPrice <= cost\) \{[\s\S]*?error: `Harga jual harus lebih besar dari harga beli/,
    "harga yang DIGERAKKAN dan jatuh di bawah atau sama dengan modal harus ditolak"
  );
  // Penjaga hanya berlaku saat harga berubah. Unit yang sudah impas sejak
  // registrasi batch (yang memakai "kurang dari", jadi harga sama modal lolos)
  // harus tetap bisa dikoreksi kondisinya saja. Kalau penjaga ini tidak
  // punya pengecualian, baris impas terkunci selamanya, dan itu persis cacat
  // yang action ini dibuat untuk menutup.
  assert.match(
    body,
    /const previousPrice = toNumber\(current\.sellingPrice\);/,
    "harga lama harus dibaca supaya koreksi yang tidak mengubah harga tetap lolos"
  );
  // Baris target dikunci selama transaction supaya harga modal tidak berubah
  // di tengah jalan.
  assert.match(body, /\.for\("update"\)/);
});

test("halaman koreksi memakai penjaga yang sama dengan server", () => {
  // Kalau precheck klien lebih ketat dari server, unit impas terkunci di UI
  // padahal servernya akan menerima.
  assert.match(
    page,
    /if \(editPrice !== editingUnit\.selling_price && editPrice <= editingUnit\.purchase_cost\) \{/
  );
});

test("dropdown status menawarkan jalan keluar dari in_service", () => {
  // UNIT_STATUS_OLEH_TEKNISI mengizinkan teknisi menulis in_service dan
  // returned, jadi returned harus tersedia di dalam dropdown. Kalau tidak, unit
  // hasil perbaikan tersangkut di in_service sampai ada orang sales datang,
  // karena available dan reserved sudah ditutup untuk teknisi.
  //
  // Kedua dropdown diperiksa sebagai posisi terpisah. Memakai indexOf
  // di dalam loop akan selalu mengembalikan kemunculan PERTAMA, jadi opsi
  // yang hilang dari dropdown kedua tidak akan pernah ketahuan.
  const inService = [...page.matchAll(/<option value="in_service">in_service<\/option>/g)];
  assert.equal(
    inService.length,
    2,
    "ada dua dropdown status, kartu HP dan tabel lebar"
  );
  for (const [i, match] of inService.entries()) {
    const after = page.slice(match.index, match.index + 600);
    assert.match(
      after,
      /<option value="returned">returned<\/option>/,
      `dropdown status ke-${i + 1} harus punya opsi returned supaya teknisi bisa keluar dari in_service`
    );
  }
  // Kunci bahwa daftar teknisi di validations.ts memang mengizinkan returned,
  // supaya dropdown ini tidak menawarkan status yang ditolak action.
  const validations = readFileSync(
    new URL("../src/lib/validations.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    validations,
    /UNIT_STATUS_OLEH_TEKNISI = \["in_service", "returned"\]/,
    "returned harus tetap diizinkan untuk teknisi"
  );
});
test("IMEI 15 digit tetap dijaga di jalur koreksi", () => {
  const body = actionBody();
  assert.match(
    body,
    /if \(!\/\^\\d\{15\}\$\/\.test\(current\.imei\)\) \{[\s\S]*?IMEI unit ini tidak lengkap 15 digit/,
    "unit dengan IMEI rusak harus ditolak, bukan ikut dikoreksi"
  );
});

/*
 * Unit yang sudah sold tidak boleh dikoreksi.
 *
 * Alasannya bukan sekadar ": sudah laku". POS menyimpan unitPrice-nya sendiri
 * di baris transaksi, jadi nota pelanggan tidak ikut berubah kalau unitnya
 * dikoreksi. Yang ikut berubah adalah dokumen garansi yang sudah terbit,
 * karena halaman garansi membaca kondisi unit yang SEKARANG. Jadi kondisi
 * dan harga jual unit sold adalah bagian dari catatan penjualan.
 */
test("koreksi ditolak untuk unit sold dan tetap boleh untuk unit lain", () => {
  const body = actionBody();

  // Penjaga sold tidak mungkin jalan kalau status tidak ikut dibaca dari baris
  // yang dikunci.
  assert.match(
    body,
    /const \[current\] = await tx[\s\S]*?\.select\(\{[\s\S]*?status: inventoryUnits\.status,[\s\S]*?\}\)/,
    "updateUnitDetails harus menyelect status untuk bisa menolak unit sold"
  );

  const syarat = body.match(/if \((current\.status === "sold")\)/);
  assert.ok(syarat, "penjaga sold di updateUnitDetails tidak ada");

  // Syaratnya dijalankan apa adanya terhadap status yang nyata, bukan hanya
  // dicocokkan sebagai teks. Ini yang menangkap pembalikan operator.
  const menolak = new Function(
    "current",
    `return ${syarat[1]};`
  ) as (c: { status: string }) => boolean;
  assert.equal(menolak({ status: "sold" }), true, "unit sold harus ditolak");
  for (const status of ["available", "reserved", "in_service", "returned"]) {
    assert.equal(
      menolak({ status }),
      false,
      `unit ${status} bukan sold, jadi koreksi harus tetap boleh jalan`
    );
  }

  // Dan penjaganya harus menyala sebelum .update() menulis kolom apa pun.
  const posisiSold = body.indexOf('current.status === "sold"');
  const posisiTulis = body.indexOf(".update(inventoryUnits)");
  assert.ok(posisiTulis > -1, "blok .update(inventoryUnits) tidak ditemukan");
  assert.ok(
    posisiSold < posisiTulis,
    "penjaga sold harus diperiksa sebelum penulisan condition dan selling_price"
  );
});

test("pesan tolak sold menjelaskan kenapa unit itu tidak bisa diubah", () => {
  const body = actionBody();
  assert.match(body, /Unit sudah sold dan tidak dapat dikoreksi/);
  assert.match(
    body,
    /nota penjualan/,
    "pesan harus menyebut alasannya, bukan hanya menolak"
  );
});

test("trigger sold tidak menutup jalur koreksi, jadi penjaga aplikasi wajib ada", () => {
  // Trigger sold dipasang sebagai "before update of status", jadi ia hanya
  // menyala kalau kolom status ikut ditulis. Jalur koreksi menulis condition
  // dan selling_price saja, jadi trigger itu tidak pernah melihatnya. Kalau
  // suatu saat trigger diperluas ke kedua kolom itu, penjaga aplikasi di atas
  // masih benar dan test ini yang perlu ditinjau, bukan dihapus diam-diam.
  const migrasi = readFileSync(
    new URL("../supabase/migrations/0002_harden_atcell_schema.sql", import.meta.url),
    "utf8"
  );
  assert.match(migrasi, /before update of status on public\.inventory_units/);

  const setBlock = actionBody().match(/\.set\(\{([^}]*)\}\)/);
  assert.ok(setBlock, "blok .set() tidak ditemukan");
  assert.doesNotMatch(
    setBlock[1],
    /status/,
    "koreksi tidak menulis status, jadi trigger sold memang tidak menyala di sini"
  );
});

test("koreksi mendaftarkan ulang path yang sama dengan mutasi inventaris lain", () => {
  const body = actionBody();
  assert.match(body, /revalidatePath\("\/portal\/inventory"\)/);
  // Semua mutasi inventaris harus masih memakai path yang sama, supaya daftar
  // portal tidak basi setelah koreksi.
  const revalidations = actions.match(/revalidatePath\("[^"]+"\)/g) ?? [];
  assert.ok(revalidations.length >= 3, "ketiga mutasi inventaris harus revalidate");
  for (const call of revalidations) {
    assert.equal(call, 'revalidatePath("/portal/inventory")');
  }
  // Audit trail: aktor ditulis di dalam transaction, sama seperti updateUnitStatus.
  assert.match(body, /await setAuditActor\(tx, guard\.profile\.id\);/);
  assert.match(body, /db\.transaction\(async \(tx\) => \{/);
});

test("koreksi bisa dijangkau staf dari halaman inventaris", () => {
  // Action tanpa tombol tidak memperbaiki apa pun, jadi UI wajib punya jalan.
  assert.match(page, /import \{ updateUnitDetails \} from "@\/lib\/actions\/inventory"/);
  assert.match(page, /const openCorrection = \(unitId: number\) => \{/);
  assert.match(page, /onClick=\{\(\) => openCorrection\(unit\.id\)\}/);
  assert.match(page, /Koreksi kondisi dan harga/);
  assert.match(
    page,
    /const result = await updateUnitDetails\(\{[\s\S]*?sellingPrice: editPrice,/,
    "dialog harus mengirim unitId, kondisi, dan harga"
  );
  // Error dari server harus tampil di dialog, bukan hilang diam-diam.
  assert.match(page, /if \(!result\.ok\) \{\s*setEditError\(result\.error\);/);
  // Setelah koreksi, state client juga harus disegarkan supaya daftar langsung
  // benar tanpa reload manual.
  assert.match(page, /await refresh\(\);/);
});
