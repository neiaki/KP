/**
 * Hitungan uang yang dipakai bersama jalur live, jalur demo, dan nota POS di
 * browser.
 *
 * Dipisah ke modul murni supaya satu aturan tidak hidup sebagai salinan di
 * tiga tempat: aksi POS (src/lib/actions/pos.ts), mesin demo
 * (src/lib/store-demo.ts), dan halaman kasir
 * (src/app/(portal)/portal/pos/page.tsx). Sebelumnya markup unit second dan
 * rumus sisa bayar ditulis ulang di ketiganya, jadi perubahan kebijakan harga
 * berarti berburu salinan yang bisa berbeda diam-diam: nota demo akan
 * menagih angka yang tidak sama dengan nota live.
 *
 * Bukan pengganti src/lib/unit-pricing.ts. Modul itu mengatur saran harga
 * di form inventaris (harga second dari harga baru produk), sedangkan modul
 * ini mengatur angka nota dan unit trade-in.
 */

/**
 * Markup harga jual unit second hasil trade-in, dihitung dari nilai tukar
 * tambah yang dibayarkan ke pelanggan.
 */
export const SECOND_HAND_MARKUP = 1.25;

/**
 * Harga jual unit second hasil trade-in. Dibulatkan ke rupiah utuh karena
 * kolom harga jual disimpan sebagai bilangan bulat.
 */
export function secondHandSellingPrice(purchaseCost: number): number {
  return Math.round(purchaseCost * SECOND_HAND_MARKUP);
}

/**
 * Sisa yang harus dibayar pelanggan: harga unit dikurangi nilai tukar
 * tambah. Tidak pernah negatif, walau nilai tukar tambah melebihi harga
 * unit (toko tidak menerbitkan nota bernilai minus).
 */
export function finalPaymentAmount(unitPrice: number, tradeInValue: number): number {
  return Math.max(0, unitPrice - tradeInValue);
}
