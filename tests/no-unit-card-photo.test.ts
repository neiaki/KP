import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as shop from "../src/lib/shop.ts";
import * as catalogueNotify from "../src/lib/catalogue-notify.ts";
import * as utils from "../src/lib/utils.ts";
import * as wa from "../src/lib/wa.ts";
import * as validations from "../src/lib/validations.ts";
import type { InventoryUnit, Product, StoreSettings } from "../src/types/index.ts";

/*
 * Foto kartu produk yang tidak punya unit.
 *
 * Kartu unit-driven sudah dijaga isRealPhoto di toCardItem, tapi kartu "Belum
 * ada unit" di katalog dan beranda, serta kartu "Baru saja habis", pernah
 * menulis nilai mentah dari database ke atribut src. productImage cuma
 * z.string().trim(), jadi satu admin bisa menyimpan "javascript:alert(1)" atau
 * "undefined/storage/v1/..." di image_url dan kedua string itu ikut terkirim
 * ke setiap pengunjung.
 *
 * Test ini merender markup asli dari kedua komponen, bukan membaca teksnya.
 * Komponennya client component dengan hook dan dependensi Next.js, jadi
 * berkas .tsx-nya ditranspile ke CommonJS lalu dijalankan dengan modul asli
 * untuk src/lib (logikanya diuji di situ) dan stub untuk sisanya. Stub untuk
 * next/image tetap menulis src ke markup, karena atribut itu yang sedang
 * diawasi.
 */

const requireAsli = createRequire(import.meta.url);

/*
 * Modul yang isinya benar-benar dipakai halaman. Semuanya src/lib, jadi
 * aturan fotonya sama persis dengan yang dijalankan produksi. Modul lain
 * (next/*, lucide-react, komponen UI) tidak menentukan foto mana yang
 * dipilih, jadi aman di-stub.
 */
const MODUL_ASLI: Record<string, unknown> = {
  react: requireAsli("react"),
  "react/jsx-runtime": requireAsli("react/jsx-runtime"),
  "@/lib/shop": shop,
  "@/lib/catalogue-notify": catalogueNotify,
  "@/lib/utils": utils,
  "@/lib/wa": wa,
  "@/lib/validations": validations,
};

/** Properti next/image yang bukan atribut HTML, jadi tidak ditulis ke markup. */
const ATRIBUT_GAMBAR: Record<string, true> = {
  fill: true,
  sizes: true,
  priority: true,
  unoptimized: true,
  quality: true,
  loader: true,
  placeholder: true,
  blurDataURL: true,
  onLoadingComplete: true,
};

const Gambar: React.FC<Record<string, unknown>> = (props) => {
  const atribut: Record<string, unknown> = {};
  for (const [kunci, nilai] of Object.entries(props)) {
    if (!(kunci in ATRIBUT_GAMBAR)) atribut[kunci] = nilai;
  }
  return React.createElement("img", atribut);
};

/** Kartu unit-driven ikut dirender supaya jalur lain ikut terkuatkan. */
const KartuProduk: React.FC<{ item: { images: string[]; modelName: string } }> = ({
  item,
}) =>
  React.createElement(
    "article",
    { "data-unit-card": item.modelName },
    item.images.map((src, i) =>
      React.createElement("img", { key: i, src, alt: item.modelName })
    )
  );

/** Modul tiruan: semua nama yang tidak dikenal menjadi komponen kosong. */
function modulStub(isi: Record<string, unknown> = {}): Record<string, unknown> {
  const Dummy = () => null;
  const dasar: Record<string | symbol, unknown> = {
    __esModule: true,
    default: Dummy,
    ...isi,
  };
  return new Proxy(dasar, {
    get(modul, kunci) {
      if (kunci === "__esModule") return true;
      return kunci in modul ? modul[kunci] : Dummy;
    },
  });
}

export type Toko = {
  products: Product[];
  inventoryUnits: InventoryUnit[];
  storeSettings: StoreSettings;
};

/** Dua halaman yang harus memakai aturan foto yang sama. */
const HALAMAN = {
  katalog: {
    berkas: "../src/app/(public)/[locale]/catalog/catalog-content.tsx",
    ekspor: "CatalogContent",
    props: { locale: "id" },
  },
  beranda: {
    berkas: "../src/app/(public)/[locale]/landing-content.tsx",
    ekspor: "LandingContent",
    props: { locale: "id", imageUrls: {} },
  },
} as const;

/** Komponen .tsx asli, dimuat dengan modul logika asli dan sisanya stub. */
function muat(berkas: string, toko: Toko): Record<string, unknown> {
  const sumber = readFileSync(new URL(berkas, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(sumber, {
    fileName: berkas,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      isolatedModules: true,
    },
  });

  const requireStub = (id: string): unknown => {
    if (id in MODUL_ASLI) return MODUL_ASLI[id];
    // Modul logika tidak boleh di-stub diam-diam: test akan hijau karena
    // jalur yang diuji tidak pernah jalan.
    if (id.startsWith("@/lib/")) throw new Error(`modul logika di-stub: ${id}`);
    switch (id) {
      case "@/context/store-context":
        return modulStub({ useStore: () => toko });
      case "next/navigation":
        return modulStub({
          useSearchParams: () => ({ get: () => null }),
          useRouter: () => ({ push: () => {}, replace: () => {} }),
          usePathname: () => "/id",
        });
      case "next/image":
        return modulStub({ default: Gambar, Image: Gambar });
      case "@/components/public/product-card":
        return modulStub({ ProductCard: KartuProduk });
      default:
        return modulStub();
    }
  };

  const modul = { exports: {} as Record<string, unknown> };
  const jalankan = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    outputText
  );
  jalankan(modul.exports, requireStub, modul, "/komponen.jsx", "/");
  return modul.exports;
}

function renderHalaman(halaman: keyof typeof HALAMAN, toko: Toko): string {
  const { berkas, ekspor, props } = HALAMAN[halaman];
  const Komponen = muat(berkas, toko)[ekspor] as
    | React.ComponentType<Record<string, unknown>>
    | undefined;
  assert.equal(typeof Komponen, "function", `${berkas} tidak mengekspor ${ekspor}`);
  return renderToStaticMarkup(
    React.createElement(
      Komponen as React.ComponentType<Record<string, unknown>>,
      props
    )
  );
}

/* -------------------------------------------------------------------------- */
/* Data uji                                                                   */
/* -------------------------------------------------------------------------- */

const STORAGE_BAGUS =
  "https://contoh.supabase.co/storage/v1/object/public/product-images/products/iphone-13-1.jpg";
const LOKAL_BAGUS = "/products/iphone-13-1.jpg";

/** Nilai yang dulu bisa lolos ke src dan tidak boleh lolos lagi. */
const NILAI_JAHAT = [
  "javascript:alert(1)",
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "//evil.example/x.jpg",
  "",
  "   ",
  "undefined/storage/v1/object/public/product-images/products/placeholder.svg",
];

const settings = {
  store_name: "At Cell",
  description_id: "Toko HP bekas",
  description_en: "Used phones",
  whatsapp_number: "6281234567890",
  phone_number: "6281234567890",
  address: "Jl. Contoh No. 1",
  maps_url: "",
  opening_hours: {
    monday_friday: "09:00 - 21:00",
    saturday_sunday: "10:00 - 20:00",
  },
} as unknown as StoreSettings;

function produk(over: Partial<Product> = {}): Product {
  return {
    id: 1,
    brand: "Apple",
    model_name: "iPhone 13 128GB",
    specs: "Chip A15",
    default_price: 5_000_000,
    image_url: "",
    official_images: [],
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function unit(over: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    id: 1,
    product_id: 1,
    imei: "3569380356438091",
    condition: "second",
    selling_price: 4_500_000,
    status: "available",
    created_at: "2026-02-01T00:00:00Z",
    ...over,
  } as InventoryUnit;
}

/** Halaman katalog/beranda untuk satu produk tanpa unit sama sekali. */
function tokoTanpaUnit(p: Product): Toko {
  return { products: [p], inventoryUnits: [], storeSettings: settings };
}

/** Semua nilai src yang benar-benar keluar ke markup. */
function srcGambar(markup: string): string[] {
  return [...markup.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
}

/*
 * Bukti kartu benar-benar dirender. Tanpa ini test "nilai jahat tidak
 * muncul" bisa hijau karena halamannya kosong, bukan karena filter bekerja.
 */
function assertKartuAda(markup: string, model: string): void {
  assert.ok(markup.includes(model), `kartu ${model} tidak ada di markup`);
  assert.ok(
    markup.includes("Belum ada unit"),
    `badge "Belum ada unit" tidak ada di markup, jadi kartu tidak dirender`
  );
}

/** Kartu harus jujur: tanpa foto, dan nilai yang dipakai tidak ikut keluar. */
function assertKartuJujur(markup: string, p: Product, nilaiJahat: string): void {
  assertKartuAda(markup, p.model_name);
  assert.ok(markup.includes("Foto menyusul"), "kartu kosong harus menulis Foto menyusul");
  // String kosong selalu "berada di dalam" markup, jadi yang diperiksa di sini
  // hanya nilai yang punya isi. src kosong sudah ditangkap srcGambar.
  if (nilaiJahat !== "") {
    assert.ok(!markup.includes(nilaiJahat), `nilai "${nilaiJahat}" sampai ke markup`);
  }
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

test("harness benar-benar merender kartu produk dari kedua halaman", () => {
  for (const halaman of ["katalog", "beranda"] as const) {
    const markup = renderHalaman(halaman, tokoTanpaUnit(produk({ official_images: [STORAGE_BAGUS] })));
    assertKartuAda(markup, "iPhone 13 128GB");
    assert.ok(
      srcGambar(markup).includes(STORAGE_BAGUS),
      `${halaman} tidak merender foto yang valid`
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Foto yang sah                                                              */
/* -------------------------------------------------------------------------- */

test("kartu tanpa unit menampilkan foto resmi yang lolos validasi", () => {
  const markup = renderHalaman("katalog", tokoTanpaUnit(produk({ official_images: [STORAGE_BAGUS] })));
  assertKartuAda(markup, "iPhone 13 128GB");
  assert.deepEqual(srcGambar(markup), [STORAGE_BAGUS]);
  assert.ok(!markup.includes("Foto menyusul"), "kartu yang punya foto tidak boleh kosong");
});

test("path lokal mode lokal tetap boleh jadi foto kartu", () => {
  const markup = renderHalaman("katalog", tokoTanpaUnit(produk({ official_images: [LOKAL_BAGUS] })));
  assertKartuAda(markup, "iPhone 13 128GB");
  assert.deepEqual(srcGambar(markup), [LOKAL_BAGUS]);
});

test("official_images kosong jatuh ke image_url yang lolos validasi", () => {
  const markup = renderHalaman(
    "katalog",
    tokoTanpaUnit(produk({ official_images: [], image_url: STORAGE_BAGUS }))
  );
  assertKartuAda(markup, "iPhone 13 128GB");
  assert.deepEqual(srcGambar(markup), [STORAGE_BAGUS]);
});

/* -------------------------------------------------------------------------- */
/* Nilai yang tidak boleh sampai ke src                                        */
/* -------------------------------------------------------------------------- */

test("official_images yang tidak bisa dirender tidak pernah masuk ke src", () => {
  for (const nilai of NILAI_JAHAT) {
    const p = produk({ official_images: [nilai] });
    const markup = renderHalaman("katalog", tokoTanpaUnit(p));
    assertKartuJujur(markup, p, nilai);
    assert.deepEqual(srcGambar(markup), [], `src masih berisi nilai "${nilai}"`);
  }
});

test("image_url yang tidak bisa dirender tidak pernah jadi fallback kartu", () => {
  for (const nilai of NILAI_JAHAT) {
    const p = produk({ official_images: [], image_url: nilai });
    const markup = renderHalaman("katalog", tokoTanpaUnit(p));
    assertKartuJujur(markup, p, nilai);
    assert.deepEqual(srcGambar(markup), [], `src masih berisi nilai "${nilai}"`);
  }
});

test("foto generik tidak pernah diklaim sebagai foto produk", () => {
  const generik = "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=600";
  const p = produk({ official_images: [generik], image_url: generik });
  const markup = renderHalaman("katalog", tokoTanpaUnit(p));
  assertKartuJujur(markup, p, generik);
  assert.deepEqual(srcGambar(markup), []);
});

/* -------------------------------------------------------------------------- */
/* Beranda                                                                    */
/* -------------------------------------------------------------------------- */

test("kartu tanpa unit di beranda mengikuti aturan foto yang sama", () => {
  const markup = renderHalaman("beranda", tokoTanpaUnit(produk({ official_images: [STORAGE_BAGUS] })));
  assertKartuAda(markup, "iPhone 13 128GB");
  assert.ok(
    srcGambar(markup).includes(STORAGE_BAGUS),
    "foto resmi yang valid tidak dirender di beranda"
  );
});

test("kartu tanpa unit di beranda tidak pernah menampilkan nilai yang tidak bisa dirender", () => {
  for (const nilai of NILAI_JAHAT) {
    const p = produk({ official_images: [nilai], image_url: nilai });
    const markup = renderHalaman("beranda", tokoTanpaUnit(p));
    assertKartuAda(markup, p.model_name);
    assert.ok(
      !srcGambar(markup).includes(nilai),
      `nilai "${nilai}" sampai ke src di beranda`
    );
    assert.ok(markup.includes("Foto menyusul"), "kartu beranda harus menulis Foto menyusul");
  }
});

/* -------------------------------------------------------------------------- */
/* Kartu stok habis                                                          */
/* -------------------------------------------------------------------------- */

test("kartu stok habis memakai aturan foto yang sama", () => {
  const p = produk({
    id: 7,
    official_images: ["javascript:alert(1)"],
    image_url: "//evil.example/x.jpg",
  });
  const markup = renderHalaman("katalog", {
    products: [p],
    inventoryUnits: [unit({ id: 3, product_id: 7, status: "sold" })],
    storeSettings: settings,
  });
  assert.ok(markup.includes("Baru saja habis"), "seksi stok habis tidak dirender");
  assert.ok(markup.includes("Foto menyusul"), "kartu stok habis harus menulis Foto menyusul");
  for (const nilai of ["javascript:alert(1)", "//evil.example/x.jpg"]) {
    assert.ok(!markup.includes(nilai), `nilai "${nilai}" sampai ke markup kartu stok habis`);
  }
  assert.ok(
    !markup.includes("Belum ada unit"),
    "produk yang unitnya sudah terjual bukan model tanpa unit"
  );
});
