import { formatIDR } from "./utils";
import type { Locale } from "@/lib/translations";
import type { InventoryUnit, Product, UnitCondition } from "@/types";

/*
 * Isi pengajuan tukar tambah yang dikirim ke chat WhatsApp toko.
 *
 * Karakter barang yang dikirim pelanggan di sini, sedangkan handset yang
 * menjadi tujuan ada di kartu etalase. Dua hal itu tidak boleh tercampur:
 * "tukar tambah iPhone 12 128GB" saja tidak bisa dicari counter, karena satu
 * toko punya puluhan unit second dan taksirannya semua mirip.
 *
 * Modul ini sengaja dipisah dari komponen supaya aturan yang mengikat bisa
 * diuji tanpa merender React, sama seperti src/lib/public-seed.ts untuk
 * keputusan seed etalase. Impor nilainya cuma formatIDR; sisanya tipe saja,
 * jadi modul ini tidak menarik apa pun yang berat ke client bundle.
 */

/** Handset etalase yang sedang dilihat pelanggan ketika menekan "Tukar tambah". */
export type TradeInTarget = {
  unitId: number;
  brand: string;
  modelName: string;
  condition: UnitCondition;
  price: number;
  /* Empat digit terakhir IMEI unit itu. Snapshot publik sudah menyensor
     IMEI menjadi "****1234" (lihat bacaSnapshot di actions/public.ts), jadi
     empat digit ini bukan informasi baru, dan itulah yang dipakai counter
     untuk menemukan unit fisiknya. */
  imeiTail: string;
};

/**
 * Label kondisi unit etalase. Kata yang dipakai sama persis dengan chip
 * filter di src/components/public/stock-filter.tsx, supaya "Baru" di sini
 * dan "Baru" di etalase berarti hal yang sama.
 */
export function conditionLabel(condition: UnitCondition, locale: Locale): string {
  if (condition === "new") return locale === "en" ? "New" : "Baru";
  return "Second";
}

/**
 * Unit etalase yang dimaksud param `unit` pada URL halaman trade-in.
 *
 * Kembalikan null kalau paramnya bukan bilangan bulat positif, atau unitnya
 * tidak ada, atau unitnya tidak punya baris katalog. Null berarti "tidak ada
 * target yang bisa dipercaya", dan pemanggil harus memakai taksir umum.
 * Lebih baik pengajuan tanpa target daripada pengajuan yang menyebut produk
 * yang tidak pernah dilihat pelanggan.
 */
export function resolveTradeInTarget(
  raw: string | null | undefined,
  units: InventoryUnit[],
  products: Product[]
): TradeInTarget | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  // Sama persis dengan kunci produk: /^\d+$/ menolak "-3", "3.5", "3abc",
  // dan "1e3" yang akan lolos Number() lalu menunjuk unit yang lain.
  if (!/^\d+$/.test(trimmed)) return null;
  const unitId = Number(trimmed);
  if (!Number.isSafeInteger(unitId)) return null;
  const unit = units.find((u) => u.id === unitId);
  if (!unit || unit.product_id === null) return null;
  const product = products.find((p) => p.id === unit.product_id);
  // Tanpa baris products tidak ada merek dan model yang bisa disebut. Unit
  // begini tidak pernah sampai ke jalur publik (v_public_inventory memakai
  // JOIN), tapi pemeriksaan ini tetap ditulis supaya resolveTradeInTarget
  // tidak pernah mengarang nama kalau nanti jalurnya berubah.
  if (!product) return null;
  return {
    unitId: unit.id,
    brand: product.brand,
    modelName: product.model_name,
    condition: unit.condition,
    price: unit.selling_price,
    imeiTail: unit.imei.slice(-4),
  };
}

/**
 * Satu pesan chat yang siap dikirim ke nomor WhatsApp toko.
 *
 * Tanpa target, pesan tetap menanyakan stok penggantinya seperti biasa,
 * karena halaman trade-in juga dibuka dari navbar, footer, dan kartu alasan
 * di beranda, yang memang tidak punya satu pun unit etalase di belakangnya.
 * Dengan target, nama handset yang sedang dilihat ikut dibawa, jadi counter
 * tahu persis produk mana yang ditanyakan.
 */
export function buildTradeInMessage(opts: {
  locale: Locale;
  oldPhone: string;
  estimate: number;
  grade: string;
  imei: string;
  photoCount: number;
  target?: TradeInTarget | null;
}): string {
  const { locale, oldPhone, estimate, grade, imei, photoCount, target } = opts;
  const en = locale === "en";
  const money = formatIDR(estimate);

  let text: string;
  if (target) {
    const wanted = `${target.brand} ${target.modelName} ${conditionLabel(
      target.condition,
      locale
    )} ${formatIDR(target.price)}`;
    text = en
      ? `Hello At Cell, I want to trade in my ${oldPhone} (estimate ${money}, ${grade}) for ${wanted}, IMEI ending ${target.imeiTail}.`
      : `Halo At Cell, saya mau tukar tambah ${oldPhone} (taksiran ${money}, ${grade}) jadi ${wanted}, IMEI berakhir ${target.imeiTail}.`;
  } else {
    text = en
      ? `Hello At Cell, I want to trade in my ${oldPhone} (estimate ${money}, ${grade}). Which replacement stock is available?`
      : `Halo At Cell, saya mau tukar tambah ${oldPhone} (taksiran ${money}, ${grade}). Stok penggantinya apa saja?`;
  }

  // Link WA tidak bisa membawa file, jadi foto dikirim manual di chat.
  const withImei = imei !== "" ? `${text}\nIMEI: ${imei}` : text;
  return photoCount > 0
    ? en
      ? `${withImei}\nCondition photos: I will send ${photoCount} photo(s) in this chat.`
      : `${withImei}\nFoto kondisi: ${photoCount} foto saya kirim di chat ini.`
    : withImei;
}
