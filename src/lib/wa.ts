/*
 * Nomor WhatsApp toko.
 *
 * Modul ini sengaja tanpa import apa pun. Fungsinya murni dan dipakai di
 * server maupun client, jadi tidak boleh menarik utils yang mengimpor
 * clsx dan tailwind-merge. Tanpa import juga membuat fungsi ini bisa diuji
 * langsung dengan node --test, yang tidak bisa me-resolve "./utils" tanpa
 * ekstensi.
 */

/* Nomor cadangan toko. Ini satu-satunya angka cadangan di seluruh situs, jadi
   semua pemanggilan harus lewat cleanWaNumber, bukan menulis ulang angka
   sendiri di tiap komponen. */
export const FALLBACK_WA_NUMBER = "6285775398389";

/*
 * wa.me hanya menerima nomor internasional tanpa tanda baca: 62xx, bukan
 * 08xx. Kalau staf mengisi nomor lokal di portal settings, link yang dihasilkan
 * akan mati tanpa error yang terlihat, sehingga pelanggan menekan tombol dan
 * tidak sampai ke mana pun. Jadi formatnya dinormalkan di sini, satu-satunya
 * tempat sebelum nomor itu masuk URL.
 */
export function cleanWaNumber(raw?: string | null): string {
  let digits = (raw || "").replace(/\D/g, "");
  // Prefix operator internasional: 00 dan 011 (exit code AS) keduanya berarti
  // "panggil lewat luar negeri", jadi angka setelahnya yang sebenarnya.
  // Tanpa langkah ini 0062812... menjadi 62062812..., yang diawali 62 dan
  // lolos semua pemeriksaan format tapi menunjuk ke nomor yang tidak pernah ada.
  digits = digits.replace(/^(?:00|011)/, "");
  if (!digits) return FALLBACK_WA_NUMBER;
  if (digits.startsWith("62")) return digits;
  // 0812..., 021..., 031... -> 62812..., 6221..., 6231...
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  // 857..., 815... tanpa prefix -> 62857..., 62815...
  return `62${digits}`;
}
