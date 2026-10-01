import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { UNIT_STATUS_OLEH_TEKNISI, bolehTeknisiSetUnitStatus } from "../src/lib/validations.ts";

/*
 * updateUnitStatus adalah endpoint HTTP, jadi requireRole()-nya adalah batas
 * keamanan, bukan sekadar penyaring tampilan. Route guard di src/lib/access.ts
 * tidak menyentuhnya sama sekali.
 *
 * Dua hal harus berlaku bersamaan dan tidak bisa saling menimpa:
 *
 * 1. Teknisi ditolak untuk status yang menerbitkan unit ke etalase publik.
 *    v_public_inventory memfilter status = available, jadi unit in_service yang
 *    dikembalikan menjadi available langsung tayang di halaman publik sebagai
 *    barang yang siap dibeli.
 * 2. Teknisi tetap boleh menarik unit masuk dan keluar dari in_service. Itu
 *    pekerjaannya, dan tanpa itu alur reparasi kehilangan langkah terakhirnya.
 *
 * Karena keduanya tidak bisa dipenuhi satu daftar peran, pemisahnya dibuat per
 * status, bukan per peran.
 */

type Status = Parameters<typeof bolehTeknisiSetUnitStatus>[0];

async function bacaBerkas(rel: string): Promise<string> {
  return readFile(new URL(rel, import.meta.url), "utf8");
}

/**
 * Badan satu fungsi, diekspansi dari tanda tangannya sampai baris
 * dengan kolom 0 berisi penutup blok, jadi pencocokan posisinya tidak pernah
 * diambil dari fungsi lain di berkas yang sama.
 */
function badanFungsi(sumber: string, nama: string): string {
  const mulai = sumber.indexOf(`async function ${nama}(`);
  assert.ok(mulai > -1, `fungsi ${nama} harus ada`);
  const dari = sumber.indexOf("{", mulai);
  let kedalaman = 0;
  for (let i = dari; i < sumber.length; i += 1) {
    if (sumber[i] === "{") kedalaman += 1;
    else if (sumber[i] === "}") {
      kedalaman -= 1;
      if (kedalaman === 0) return sumber.slice(dari, i + 1);
    }
  }
  assert.fail(`penutup fungsi ${nama} tidak ditemukan`);
}

test("teknisi ditolak untuk status yang menerbitkan atau mencadangkan unit", async () => {
  const ditolak: Array<[Status, string]> = [
    ["available", "menerbitkan unit ke etalase publik lewat v_public_inventory"],
    ["reserved", "mencadangkan unit untuk pelanggan, itu bukan pekerjaan teknisi"],
    ["sold", "harus lewat transaksi POS supaya nota tercatat"],
  ];

  for (const [status, alasan] of ditolak) {
    assert.equal(
      bolehTeknisiSetUnitStatus(status),
      false,
      `teknisi tidak boleh menulis status ${status}: ${alasan}`
    );
  }

  // Batas yang dibaca publik harus benar-benar memfilter available, kalau tidak
  // alasan penolakan di atas hanya keyakinan.
  const migrasi = await bacaBerkas(
    "../supabase/migrations/20260927180000_nullable_inventory_unit_product.sql"
  );
  assert.match(
    migrasi,
    /and u\.status = 'available'/,
    "v_public_inventory hanya menayangkan unit available, jadi available terpublikasi"
  );
});

test("teknisi boleh menarik unit masuk dan keluar dari in_service", () => {
  // Masuk: dari available atau reserved ke in_service, yaitu unit yang diambil
  // untuk diperbaiki. Keluar: dari in_service ke returned, yaitu unit yang
  // selesai diperbaiki dan dikembalikan. Dua arah ini mencakup seluruh
  // transisi yang repairing butuh, dan tidak satupun menyentuh etalase publik.
  assert.deepEqual(
    [...UNIT_STATUS_OLEH_TEKNISI],
    ["in_service", "returned"],
    "daftar status teknisi harus persis dua arah gerak unit repairs"
  );
  for (const status of UNIT_STATUS_OLEH_TEKNISI) {
    assert.equal(
      bolehTeknisiSetUnitStatus(status),
      true,
      `teknisi harus boleh menulis status ${status}`
    );
  }
});

test("setiap status enum unit_status punya keputusan yang sadar", async () => {
  // Pola yang sama dipakai UNIT_STATUS_LABEL di halaman inventaris: begitu enum
  // unit_status di src/db/schema.ts nambah nilai baru, test ini gagal sampai
  // status barunya diputuskan, bukan diam-diam ikut atau tidak ikut daftar.
  const schema = await bacaBerkas("../src/db/schema.ts");
  const penandaEnum = 'pgEnum("unit_status", [';
  const mulai = schema.indexOf(penandaEnum);
  assert.ok(mulai > -1, "enum unit_status harus ada di src/db/schema.ts");
  // Potong SETELAH nama enum, kalau tidak nama enum itu ikut terhitung sebagai
  // status dan test selalu gagal dengan pesan yang menyesatkan.
  const isiEnum = schema.slice(
    mulai + penandaEnum.length,
    schema.indexOf("]);", mulai)
  );
  const status = [...isiEnum.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(
    status.length >= 5,
    `enum unit_status harus terbaca, dapat: ${status.join(", ")}`
  );

  for (const satu of status) {
    assert.equal(
      typeof bolehTeknisiSetUnitStatus(satu as Status),
      "boolean",
      `setiap status enum harus punya keputusan: ${satu}`
    );
  }
  // Tidak boleh ada status enum yang luput dari daftar altogether.
  for (const satu of status) {
    if (satu === "in_service" || satu === "returned" || satu === "available" || satu === "reserved" || satu === "sold") {
      continue;
    }
    assert.fail(`status enum baru "${satu}" belum diputuskan untuk peran teknisi`);
  }
});

test("sold tetap terminal di database, bukan hanya di aplikasi", async () => {
  // Penjualan sold ditolak di action, dan trigger yang menutup sisi database.
  // Keduanya harus tetap ada: kalau trigger hilang, sold bisa dihidupkan lagi
  // lewat jalur mana pun yang tidak melewati action ini.
  const action = await bacaBerkas("../src/lib/actions/inventory.ts");
  assert.match(
    action,
    /Status sold hanya boleh lewat transaksi POS/,
    "penolakan sold di sisi aplikasi harus tetap ada"
  );

  const migrasi = await bacaBerkas("../supabase/migrations/0002_harden_atcell_schema.sql");
  assert.match(migrasi, /trg_prevent_sold_reactivation/);
  assert.match(migrasi, /old\.status = 'sold' and new\.status <> 'sold'/);
});

test("action menerapkan gerbang teknisi setelah memeriksa peran dan sold", async () => {
  // action tidak bisa diimpor di runner Node (alias @/ dan next/cache), jadi
  // yang diuji di sini adalah urutan gerbangnya, bukan hasil panggilannya.
  // Urutannya menentukan pesan yang muncul: kalau gerbang teknisi diperiksa
  // sebelum requireRole, guard.profile belum ada; kalau diperiksa sebelum sold,
  // teknisi menerima pesan POS untuk request yang bukan miliknya.
  const action = await bacaBerkas("../src/lib/actions/inventory.ts");
  const badan = badanFungsi(action, "updateUnitStatus");

  const posisiPeran = badan.indexOf('requireRole(["admin", "sales", "technician"])');
  const posisiSold = badan.indexOf('parsed.data.status === "sold"');
  const posisiTeknisi = badan.indexOf("bolehTeknisiSetUnitStatus(parsed.data.status)");

  // Daftar peran WAJIB memuat teknisi. Kalau tidak, gerbang status teknisi di
  // bawahnya tidak akan pernah tersentuh dan seluruh alur reparasi kehilangan
  // langkah masuk dan keluar in_service.
  assert.ok(
    posisiPeran > -1,
    "updateUnitStatus harus tetap menerima teknisi sebagai pemanggil, bukan hanya admin dan sales"
  );
  assert.ok(posisiSold > -1, "penolakan sold harus tetap ada");
  assert.ok(posisiTeknisi > -1, "gerbang status teknisi harus ada di action");
  assert.ok(
    posisiTeknisi > posisiSold,
    "gerbang teknisi harus diperiksa setelah sold, atau pesan yang muncul salah"
  );
  assert.ok(
    posisiTeknisi > posisiPeran,
    "gerbang teknisi harus diperiksa setelah requireRole, atau guard.profile tidak ada"
  );
  assert.match(
    badan,
    /guard\.profile\.role === "technician" &&\s*\n?\s*!bolehTeknisiSetUnitStatus/,
    "gerbang harus hanya berlaku untuk teknisi; admin dan sales tetap bebas"
  );
});

test("setiap dropdown status di inventaris menawarkan status yang gerbang izinkan", async () => {
  // Gerbang yang hanya boleh dipakai lewat POST buatan tangan bukan alur kerja,
  // jadi status yang diizinkan harus benar-benar bisa dipilih di UI. Halaman
  // inventaris adalah satu-satunya tempat status unit diubah, dan ia punya
  // DUA dropdown (kartu lebar dan tabel), jadi keduanya diperiksa, bukan cuma
  // yang pertama.
  const halaman = await bacaBerkas("../src/app/(portal)/portal/inventory/page.tsx");
  const blokSelect = [...halaman.matchAll(/<select[\s\S]*?<\/select>/g)].map((m) => m[0]);
  const dropdownStatus = blokSelect.filter((b) => b.includes('value="in_service"'));
  assert.equal(
    dropdownStatus.length,
    2,
    `halaman inventaris harus punya dua dropdown status, dapat ${dropdownStatus.length}`
  );

  for (const [i, blok] of dropdownStatus.entries()) {
    for (const status of UNIT_STATUS_OLEH_TEKNISI) {
      assert.ok(
        blok.includes(`value="${status}"`),
        `dropdown status ke-${i + 1} harus menawarkan ${status}, karena gerbang teknisi mengizinkan status itu`
      );
    }
  }
});
