import type { PublicSnapshot } from "./actions/public";

/*
 * Keputusan soal seed etalase publik, dipisah dari komponen supaya bisa diuji
 * tanpa merender React.
 *
 * Latar: etalase dulu hanya terisi setelah useEffect di browser memanggil
 * getPublicSnapshot, jadi HTML pertama yang sampai ke crawler kosong
 * ("0 unit ada di toko", jam buka dan telepon kosong). Layout area publik
 * sekarang membaca snapshot di server dan meneruskannya ke store sebagai
 * state awal. Modul ini adalah tempat kedua tempat yang memakai keputusan itu
 * benar-benar memanggil, supaya tabel keputusannya bisa diuji.
 *
 * Sengaja tanpa import nilai apa pun: modul ini ikut terseret ke client
 * bundle lewat src/lib/store.ts, dan tidak boleh menarik apa pun yang hanya
 * aman di server.
 */

/**
 * Hasil apa yang dipakai store untuk satu bidang, berdasarkan tiga kondisi:
 * ada seed (live + seed terbaca), live tanpa seed, atau mode demo.
 *
 * `liveBackend` sengaja jadi parameter, bukan dibaca dari environment di sini.
 * Kalau tidak, tabel keputusannya hanya bisa diuji pada satu mode saja.
 */
export function resolveSeed<T>(
  publicSeed: PublicSnapshot | null | undefined,
  liveBackend: boolean,
  fromSeed: (seed: PublicSnapshot) => T,
  liveWithoutSeed: T,
  demoFallback: T
): T {
  // Mode demo memakai data contoh lokal apa pun yang lewat seed, supaya
  // pratinjau lokal tidak pernah ikut berubah karena ada data live.
  if (!liveBackend) return demoFallback;
  if (publicSeed) return fromSeed(publicSeed);
  return liveWithoutSeed;
}

/**
 * Ubah hasil getPublicSnapshot menjadi seed, atau null kalau pembacaan
 * gagal. Ini yang membuat halaman publik tetap hidup saat Postgres berkedip:
 * null berarti "tidak ada seed", bukan "lempar error", dan loadLiveData()
 * akan mencoba lagi di browser.
 */
export function toPublicSeed(
  result: { ok: boolean; data?: PublicSnapshot; error?: string } | null | undefined
): PublicSnapshot | null {
  return result?.ok && result.data ? result.data : null;
}
