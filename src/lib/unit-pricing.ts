import { formatIDR } from "./utils.ts";

/*
 * Aturan harga unit untuk form inventaris portal.
 *
 * MASALAH YANG DISELESAIKAN
 *
 * Harga jual unit second punya satu sumber, yaitu harga baru produknya.
 * Dulu form registrasi batch mengisi `sellingPrice` dari `default_price`
 * produk, jadi begitu produk berganti harga ikut terisi. Setelah itu staf
 * mengubah kondisi jadi seken, harganya tidak pernah ikut diturunkan, dan
 * unit pun tayang dengan harga yang sama persis dengan harga baru.
 *
 * Di etalase (src/lib/shop.ts) angka "Barunya" pada unit second diambil
 * dari `product.default_price`. Kalau `selling_price` ikut sama, pelanggan
 * membaca dua angka identik: harga coret dan harga yang harus dibayar.
 * Itu terbaca sebagai diskon rusak, dan toko bisa menjual unit second
 * dengan margin nol tanpa disadari.
 *
 * ATURANNYA
 *
 * Turunkan harga hanya kalau field itu masih berisi angka yang diisi form
 * secara otomatis, yaitu belum pernah disentuh staf. Kalau staf sudah
 * mengetik sendiri, angka itu adalah niat dan tidak boleh ditimpa diam-diam.
 * Di situ harga cukup ditampilkan sebagai saran, lengkap dengan tombol untuk
 * memakainya.
 *
 * Semua fungsi di sini murni dan tidak menyentuh React, jadi aturan ini bisa
 * diuji tanpa browser.
 */

export type UnitConditionValue = "new" | "second";

/**
 * Porsi harga baru yang dipakai sebagai saran harga seken.
 *
 * Ini saran default, bukan kebijakan toko. Staf bebas mengetik angka lain dan
 * angka itulah yang tersimpan. Yang dijamin hanya satu: sarannya selalu di
 * bawah harga baru, jadi saran ini tidak pernah memunculkan harga coret yang
 * sama dengan harga jualnya.
 */
export const SECOND_PRICE_RATIO = 0.8;

/** Harga ritel dibulatkan ke kelipatan ini supaya nomornya terlihat disengaja. */
export const PRICE_STEP = 100_000;

/**
 * Saran harga jual untuk sebuah kondisi.
 *
 * Untuk `new` sama saja dengan harga baru produk. Untuk `second` diambil dari
 * `SECOND_PRICE_RATIO`, dibulatkan ke `PRICE_STEP`, lalu dikunci agar tetap
 * di bawah harga baru produk apa pun. Hasil 0 berarti tidak ada saran yang
 * bisa dipercaya, dan pemanggil harus membiarkan staf mengetik sendiri.
 */
export function suggestedSellingPrice(
  condition: UnitConditionValue,
  newPrice: number
): number {
  if (!Number.isFinite(newPrice) || newPrice <= 0) return 0;
  if (condition === "new") return newPrice;
  const stepped =
    Math.round((newPrice * SECOND_PRICE_RATIO) / PRICE_STEP) * PRICE_STEP;
  // newPrice - PRICE_STEP adalah kelipatan tertinggi yang masih di bawah
  // harga baru, jadi min() di sini menjamin syarat ketat "selalu lebih murah
  // dari unit baru" tanpa cabang tambahan.
  return Math.max(0, Math.min(stepped, newPrice - PRICE_STEP));
}

/** Angka yang terakhir diisi otomatis oleh form, atau null kalau belum pernah. */
export type SeededPrice = number | null;

/**
 * Apakah isi field harga masih sama persis dengan angka yang diisi otomatis.
 *
 * Ini pembeda inti antara "harga yang belum disentuh staf" dan "harga yang
 * sengaja diketik staf". Tanpa pembeda ini, menimpa harga selalu berarti
 * menimpa pilihan staf.
 */
export function isPriceAutoSeeded(
  currentPrice: number,
  seededPrice: SeededPrice
): boolean {
  // Seeded null artinya form belum pernah menurunkan harga, jadi angka di
  // field pasti datang dari staf.
  if (seededPrice === null) return false;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return true;
  return currentPrice === seededPrice;
}

export type PriceResolution = {
  /** Angka yang harus tampil di field setelah kondisi berubah. */
  nextPrice: number;
  /** Saran harga untuk kondisi tujuan, 0 kalau tidak ada yang bisa dipercaya. */
  suggestion: number;
  /** True kalau nextPrice hasil hitungan otomatis dan boleh dipakai diam-diam. */
  applied: boolean;
  /** True kalau angka staf dipertahankan dan saran hanya ditampilkan. */
  keptStaffPrice: boolean;
};

/**
 * Keputusan harga saat kondisi unit diubah di form.
 *
 * Angka yang diketik staf tidak pernah ditimpa. Saran hanya dipasang
 * otomatis selama field masih bersih, sehingga menukar kondisi bolak-balik
 * tidak pernah merusak harga yang sudah staf atur sendiri.
 */
export function resolvePriceOnConditionChange(input: {
  condition: UnitConditionValue;
  currentPrice: number;
  seededPrice: SeededPrice;
  newPrice: number;
}): PriceResolution {
  const { condition, currentPrice, seededPrice, newPrice } = input;
  const suggestion = suggestedSellingPrice(condition, newPrice);
  const untouched = isPriceAutoSeeded(currentPrice, seededPrice);

  if (untouched && suggestion > 0) {
    return {
      nextPrice: suggestion,
      suggestion,
      applied: true,
      keptStaffPrice: false,
    };
  }
  return {
    nextPrice: currentPrice,
    suggestion,
    applied: false,
    keptStaffPrice: suggestion > 0 && currentPrice !== suggestion,
  };
}

/**
 * Peringatan harga seken yang menyesatkan.
 *
 * Mengembalikan kalimat bahasa Indonesia kalau unit second akan dijual pada
 * harga yang sama atau lebih mahal dari harga baru produknya, karena di
 * etalase harga baru itulah angka yang dicoret di sebelah harga jual.
 * Null kalau tidak ada yang perlu diperingatkan.
 */
export function misleadingSecondPriceWarning(input: {
  condition: UnitConditionValue;
  sellingPrice: number;
  newPrice: number;
}): string | null {
  const { condition, sellingPrice, newPrice } = input;
  if (condition !== "second") return null;
  if (!Number.isFinite(newPrice) || newPrice <= 0) return null;
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return null;
  if (sellingPrice < newPrice) return null;
  // Penjaga ini menyalakan peringatan untuk dua kasus, jadi kalimatnya juga
  // harus dua: harga yang sama persis membuat pelanggan melihat
  // dua angka identik; harga yang lebih mahal membuat pelanggan melihat unit
  // seken lebih mahal dari barang baru. Kalimat "sama dengan" untuk kasus
  // kedua berboh dan membuat staf mengira guard-nya tidak sengaja.
  const samaDengan = sellingPrice === newPrice;
  return (
    `Harga jual ${formatIDR(sellingPrice)} ` +
    `${samaDengan ? "sama dengan" : "lebih mahal dari"} harga baru produknya ` +
    `${formatIDR(newPrice)}. Di etalase harga barunya yang dicoret, jadi pelanggan ` +
    (samaDengan
      ? `akan lihat dua angka sama persis dan `
      : `akan lihat harga seken lebih mahal dari barang baru dan `) +
    `mengira diskonnya rusak. Turunkan sedikit di bawah harga baru ya.`
  );
}
