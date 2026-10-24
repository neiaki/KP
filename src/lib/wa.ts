/*
 * Nomor WhatsApp toko.
 *
 * Modul ini sengaja tanpa import apa pun. Fungsinya murni dan dipakai di
 * server maupun client, jadi tidak boleh menarik utils yang mengimpor
 * clsx dan tailwind-merge. Tanpa import juga membuat fungsi ini bisa diuji
 * langsung dengan node --test, yang tidak bisa me-resolve "./utils" tanpa
 * ekstensi.
 */

/* Nomor cadangan sintetis. Jelas bukan nomor sungguhan (prefix 800 tidak
   dialokasikan untuk pelanggan), jadi kalau link ini lolos ke production,
   yang rusak hanya tombolnya, bukan privasi siapa pun. Nomor asli toko hanya
   hidup di database production via portal/settings, tidak pernah di repo. */
export const FALLBACK_WA_NUMBER = "6280000000000";

/*
 * wa.me hanya menerima nomor internasional tanpa tanda baca: 62xx, bukan
 * 08xx. Kalau staf mengisi nomor lokal di portal settings, link yang dihasilkan
 * akan mati tanpa error yang terlihat, sehingga pelanggan menekan tombol dan
 * tidak sampai ke mana pun. Jadi formatnya dinormalkan di sini, satu-satunya
 * tempat sebelum nomor itu masuk URL.
 */
/**
 * Digit setelah prefix operator internasional dibuang. Dipakai juga oleh
 * phoneSchema supaya validasi dan normalisasi menghitung angka yang sama.
 */
export function phoneDigits(raw?: string | null): string {
  return (raw || "").replace(/\D/g, "").replace(/^(?:00|011)/, "");
}

/**
 * Bentuk nomor yang bisa dibandingkan tanpa peduli spasi, tanda hubung, atau
 * awalan lokal. String kosong tetap kosong supaya pemanggil bisa membedakan
 * "belum diisi" dari nomor cadangan.
 */
export function normalizePhoneNumber(raw?: string | null): string {
  let digits = phoneDigits(raw);
  if (!digits) return "";
  // "+62 0812..." dan "62 0812..." sama-sama masuk sebagai 620812.... Angka 0
  // setelah kode negara adalah trunk prefix lokal yang tidak boleh ikut
  // dikirim; tanpa langkah ini nomor tersimpan sebagai 620812... dan tidak
  // pernah cocok dengan nomor yang sama yang diketik sebagai 0812....
  if (/^620\d/.test(digits)) digits = `62${digits.slice(3)}`;
  if (digits.startsWith("62")) return digits;
  // 0812..., 021..., 031... -> 62812..., 6221..., 6231...
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  // 857..., 815... tanpa prefix -> 62857..., 62815...
  return `62${digits}`;
}

export function cleanWaNumber(raw?: string | null): string {
  return normalizePhoneNumber(raw) || FALLBACK_WA_NUMBER;
}
