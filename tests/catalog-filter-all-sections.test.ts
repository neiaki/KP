import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import {
  filterItems,
  filterProducts,
  toCardItem,
  listProductsWithoutUnits,
  listSoldOutProducts,
} from "../src/lib/shop.ts";
import type { InventoryUnit, Product } from "../src/types/index.ts";

/*
 * Temuan audit 1 Oktober 2026, diuji di browser pada atcell.my.id/id/catalog.
 *
 * `items` (unit Ready Stock) sudah disaring lewat `filterItems`, tapi
 * `soldOutProducts` dan `newProducts` dikembalikan polos tanpa filter. Gejalanya
 * terlihat tanpa perlu membaca kode: mengetik `zzzztidakadaproduk` membuat grid
 * utama menulis "Tidak ada yang cocok" sambil lima kartu produk tetap tampil dari
 * "Baru saja habis" dan "Baru masuk katalog". Memilih chip "Apple" juga
 * menyisakan Samsung, Xiaomi, dan Oppo di kedua seksi itu.
 *
 * Test ini memanggil `filterProducts` sungguhan, dengan data yang meniru bentuk
 * produksi, lalu memeriksa dua hal yang harus berlaku:
 *
 *   1. Filter yang sama berlaku untuk Ready Stock, stock habis, dan tanpa unit
 *   2. Kata kunci yang tidak cocok apa pun membuat SEMUA seksi kosong, jadi
 *      halaman tidak pernah sekaligus Says "Tidak ada yang cocok" dan menampilkan
 *      produk
 *
 * Alias "@/..." milik tsconfig tidak dipahami resolver ESM Node, jadi import
 * relatif ke src/lib diikutkan lewat registerHooks. Pola ini sama dengan
 * tests/audit-actor-actor.test.ts dan tests/unit-label-nota.test.ts.
 */

const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    load: (url: string, context: unknown, next: (u: string, c?: unknown) => Promise<unknown>) => Promise<unknown>;
  }) => void;
};

registerHooks({
  load(url, context, next) {
    if (url.startsWith("file:")) {
      const specifier = url.slice("file:".length);
      if (specifier.endsWith(".ts")) {
        const rewritten = specifier.endsWith("/index.ts")
          ? specifier
          : specifier.replace(/\.ts$/, ".ts");
        if (rewritten.includes(`${srcRoot}/`)) {
          return next(pathToFileURL(rewritten).href, context);
        }
      }
    }
    return next(url, context);
  },
});

/** Produk uji. `pernah_punya_unit` mengikuti arti fieldnya di src/types. */
function produk(
  id: number,
  brand: string,
  model_name: string,
  pernah_punya_unit: boolean
): Product {
  return {
    id,
    brand,
    model_name,
    specs: `${brand} ${model_name}`,
    default_price: 1_000_000,
    image_url: "",
    created_at: "2026-01-01T00:00:00.000Z",
    pernah_punya_unit,
  };
}

/*
 * Unit uji. `selling_price` sengaja diisi supaya `toCardItem` punya harga yang
 * dipakai filter, bukan jatuh ke nol. Bentuk lengkap unitFollows definition
 * di src/types/index.ts; `as unknown as` dipakai karena test ini hanya
 * butuh field yang dibaca filter dan toCardItem.
 */
function unit(
  id: number,
  product_id: number,
  status: InventoryUnit["status"]
): InventoryUnit {
  return {
    id,
    product_id,
    imei: `356938035643809${id}`,
    status,
    condition: "new",
    selling_price: 1_000_000,
  } as unknown as InventoryUnit;
}

/*
 * Data yang meniru produksi: unit siap untuk Apple dan Samsung, satu model yang
 * unitnya sudah habis (Apple), dan dua model yang belum pernah punya unit
 * (Samsung dan Xiaomi).
 */
const products: Product[] = [
  produk(1, "Apple", "iPhone 14 Plus", true),
  produk(2, "Samsung", "Galaxy A55 5G", true),
  produk(3, "Apple", "iPhone 13 128GB", true),
  produk(4, "Samsung", "Galaxy S24 Ultra", false),
  produk(5, "Xiaomi", "14 12/512GB", false),
];

const units: InventoryUnit[] = [
  unit(1, 1, "available"),
  unit(2, 2, "available"),
  unit(3, 3, "sold"),
];

const semuaOpsi = { brand: "all", condition: "all", query: "" };

test("ketiga daftar katalog disaring dengan aturan yang sama", () => {
  const opts = { brand: "Apple", condition: "all", query: "" };

  const habis = listSoldOutProducts(products, units).filter((p) =>
    filterProducts([p], opts).length > 0
  );
  const tanpaUnit = listProductsWithoutUnits(products, units).filter((p) =>
    filterProducts([p], opts).length > 0
  );

  assert.deepEqual(
    habis.map((p) => p.brand),
    ["Apple"],
    "seksi 'Baru saja habis' harus ikut filter merek"
  );
  assert.deepEqual(
    tanpaUnit.map((p) => p.brand),
    [],
    "seksi 'Baru masuk katalog' harus ikut filter merek"
  );
});

test("kata kunci yang tidak cocok mengosongkan semua seksi, bukan hanya grid utama", () => {
  const opts = { ...semuaOpsi, query: "zzzztidakadaproduk" };

  // Kartu disusun lewat `toCardItem` asli, bukan objek yang dirakit tangan di
  // sini. Alasannya bentuk ProductCardItem punya field turunan (`images`,
  // `monthly`, `imeiTail`) yang dihitung dari unit dan produk, jadi tiruan
  // tangan akan menyimpang dari produksi setiap kali bentuknya berubah.
  const grid = filterItems(
    units
      .filter((u) => u.status === "available")
      .map((u) => toCardItem(u, products, units)),
    opts
  );
  const habis = filterProducts(listSoldOutProducts(products, units), opts);
  const tanpaUnit = filterProducts(listProductsWithoutUnits(products, units), opts);

  assert.equal(grid.length, 0, "grid utama harus kosong");
  assert.equal(habis.length, 0, "'Baru saja habis' harus kosong juga");
  assert.equal(tanpaUnit.length, 0, "'Baru masuk katalog' harus kosong juga");
});

test("pencarian menyaring produk di seksi tanpa unit, bukan sekadar mengosongkan grid utama", () => {
  const opts = { brand: "all", condition: "all", query: "xiaomi" };

  const tanpaUnit = filterProducts(listProductsWithoutUnits(products, units), opts);

  assert.deepEqual(
    tanpaUnit.map((p) => p.model_name),
    ["14 12/512GB"],
    "pencarian harus menemukan produk di seksi tanpa unit"
  );
});

test("filterProducts mengabaikan kondisi, karena produk tanpa unit tidak punya status", () => {
  /*
   * `products` tidak punya field kondisi. Status ada di unit, dan dua daftar ini
   * justru berisi produk yang tidak punya unit yang bisa dijual. Menerapkan
   * kondisi di sini akan menyembunyikan produk yang sebenarnya cocok, jadi
   * kondisi sengaja tidak berlaku dan hanya merek serta kata kunci yang
   * menyaring. Test ini mengunci keputusan itu supaya tidak berubah diam-diam.
   */
  const second = filterProducts(
    listProductsWithoutUnits(products, units),
    { brand: "all", condition: "second", query: "" }
  );
  const semua = filterProducts(
    listProductsWithoutUnits(products, units),
    { brand: "all", condition: "all", query: "" }
  );

  assert.equal(
    second.length,
    semua.length,
    "kondisi tidak boleh menyembunyikan produk dari daftar tanpa unit"
  );
});
/*
 * Test kelima: filter harus sinkron dua arah antara URL dan tampilan.
 *
 * Temuan CodeRabbit di PR #59, sudah dibuktikan sendiri di browser pada build
 * lokal. Arah state ke URL sudah ada sejak PR #56, tapi arah URL ke state tidak
 * pernah ada: `useState(searchParams.get(...))` hanya berjalan di render
 * pertama, dan efek yang ada hanya menulis state ke URL.
 *
 * Gejalanya bukan cuma tombol Back yang tidak berfungsi. Navigasi klien yang
 * mengganti query string, misalnya tautan katalog di navbar yang menuju
 * `/id/catalog` tanpa filter, membuat address bar dan tampilan berbeda:
 * address bar menulis `/id/catalog` tanpa filter sementara etalase masih
 * menampilkan hanya Apple. Alamat yang di-bookmark atau dibagikan membuka
 * tampilan yang tidak sama dengan yang dilihat pengguna.
 *
 * Komponen ini tidak bisa diimpor ke runner test karena butuh konteks Next.js,
 * jadi test ini mengunci bentuk kodenya: harus ada ref yang mencatat query
 * string yang ditulis efek sendiri, dan harus ada efek kedua yang membaca
 * `searchParams` balik ke state. Tanpa penjaga ref, kedua efek akan saling
 * memanggil tanpa berhenti.
 */
test("filter katalog dibaca dari URL, kolom pencarian memakai draf sinkron", () => {
  const mentah = readFileSync(
    resolvePath(srcRoot, "app/(public)/[locale]/catalog/catalog-content.tsx"),
    "utf8"
  );
  // Komentar sengaja dibuang dulu. Penjelasan kenapa dulu memakai useState ada
  // di dalam berkas, jadi menguji mentah akan salah hitung kata itu sebagai
  // pemakaian nyata.
  const src = mentah
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  // Tiga filter diskret harus dibaca dari query string. Semuanya tombol yang
  // diklik sekali, jadi tidak butuh draf.
  assert.ok(
    /const\s+params\s*=\s*new URLSearchParams\(searchParams\.toString\(\)\)/.test(src),
    "filter harus dibaca dari query string"
  );
  assert.ok(
    /const\s+selectedBrand\s*=\s*products\.some/.test(src),
    "merek harus dibaca dari query string, bukan dari state terpisah"
  );
  assert.ok(
    /const\s+selectedCondition\s*=/.test(src) && !/useState[^;]*selectedCondition/.test(src),
    "kondisi harus dibaca dari query string, bukan dari state terpisah"
  );
  assert.ok(
    /const\s+sortOrder\s*:\s*SortOrder\s*=/.test(src) && !/useState[^;]*sortOrder/.test(src),
    "urutan harus dibaca dari query string, bukan dari state terpisah"
  );

  // Kolom pencarian justru butuh draf lokal. Kalau `value` input diambil dari
  // query string, nilainya baru berubah setelah router.replace selesai sebagai
  // transisi, dan React mengembalikan DOM ke nilai lama di sela itu. Karakter
  // yang diketik cepat hilang. Diuji di browser: mengetik "samsung" tanpa jeda
  // menyisakan hanya "g" di kolom pencarian.
  assert.ok(
    /const\s+qDariUrl\s*=\s*params\.get\("q"\)/.test(src),
    "kata kunci harus tetap dibaca dari query string"
  );
  assert.ok(
    /const\s+\[search,\s*setDraf\]\s*=\s*(?:React\.)?useState\(qDariUrl\)/.test(src),
    "kolom teks butuh draf lokal supaya ketikan tidak hilang saat navigasi async"
  );
  assert.ok(
    /const\s+setSearch\s*=\s*\(nilai:\s*string\)\s*=>\s*\{\s*setDraf\(nilai\)/.test(src),
    "setSearch harus memperbarui draf secara sinkron sebelum menulis ke URL"
  );

  // Draf hanya boleh mengikuti URL kalau URL berubah karena sumber lain.
  assert.ok(
    /if\s*\(qDariUrl\s*!==\s*qTerakhir\)/.test(src),
    "draf harus disinkronkan ketika q di URL berubah karena sumber lain"
  );
  assert.ok(
    /const\s+\[qTerakhir,\s*setQTerakhir\]\s*=\s*(?:React\.)?useState\(qDariUrl\)/.test(src),
    "perlu mengingat nilai q terakhir supaya perubahan dari draf sendiri tidak menimpa ketikan"
  );

  // Tidak boleh ada efek yang menulis state filter, URL sudah sumbernya.
  assert.ok(
    !/useEffect/.test(src),
    "tidak boleh ada efek yang menulis state filter ke URL, karena URL sudah sumber kebenarannya"
  );

  // Satu-satunya jalan mengubah filter adalah menulis URL.
  assert.ok(
    /const\s+setFilter\s*=/.test(src),
    "perubahan filter harus lewat satu fungsi yang menulis ke URL"
  );
  assert.ok(
    /router\.replace\(/.test(src),
    "penulisan filter ke URL harus memakai router.replace supaya riwayat tidak menumpuk"
  );

  // Nilai dari URL tetap harus disaring, jangan dipercaya mentah.
  for (const nilai of [
    'condDariUrl === "new"',
    'sortDariUrl === "lowest"',
    "products.some((p) => p.brand === brandDariUrl)",
  ]) {
    assert.ok(src.includes(nilai), `nilai dari URL harus divalidasi (${nilai})`);
  }
});
