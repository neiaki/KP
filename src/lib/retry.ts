/*
 * Percobaan ulang untuk pembacaan data yang gagal.
 *
 * Modul ini murni: tidak mengimpor next/* maupun drizzle, sehingga bisa diuji
 * langsung dengan runner test bawaan Node tanpa database dan tanpa dev server.
 */

/*
 * Hasil percobaan, dibedakan dari nilai yang dikembalikan pembaca. Nilai Error
 * yang dikembalikan pemanggil apa adanya bisa jadi galat database, bisa jadi
 * penanda yang sengaja dibuat action lain, jadi bentuknya dibedakan di sini
 * supaya pemanggil tidak perlu menebak lewat try-catch.
 */
export type AttemptResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

const tunggu = (ms: number) => new Promise<void>((selesai) => setTimeout(selesai, ms));

/**
 * Jalankan baca satu kali, dan ulangi sekali lagi kalau gagal.
 *
 * Tungguannya penting, bukan hiasan. Kegagalan yang diam-diam turun jadi
 * "0 unit ada di toko" di halaman depan berasal dari balapan antara dua
 * pembacaan pertama yang berjalan bersamaan: keduanya membangun cache tipe
 * kolom array Drizzle di saat yang sama, jadi yang kalah membaca kolom yang
 * belum terisi. Cache itu terisi sinkron di dalam pembacaan yang menang, jadi
 * percobaan kedua harus dijalankan setelah event loop bergerak, yaitu lewat
 * macrotask. Mengulang langsung di tick yang sama akan gagal dengan cara yang
 * persis sama.
 *
 * Batasannya satu kali ulang. Kegagalan yang benar-benar akibat database mati
 * atau kredensial salah tidak akan membaik dengan menunggu 120 milidetik, dan
 * halaman publik tidak boleh menunggu tanpa batas.
 */
export async function attemptWithRetry<T>(
  baca: () => Promise<T>,
  { attempts = 2, waitMs = 120 }: { attempts?: number; waitMs?: number } = {}
): Promise<AttemptResult<T>> {
  const total = Math.max(1, Math.floor(attempts));
  let terakhir: unknown;
  for (let ke = 0; ke < total; ke++) {
    // Tunggu di awal percobaan kedua dan seterusnya, bukan di akhir percobaan
    // pertama, supaya jalur yang berhasil dari awal tidak kena penundaan.
    if (ke > 0) await tunggu(waitMs);
    try {
      return { ok: true, value: await baca() };
    } catch (galat) {
      terakhir = galat;
    }
  }
  return { ok: false, error: terakhir };
}

/**
 * Pesan yang layak dibaca staf dari galat percobaan terakhir.
 *
 * Action yang sudah menulis pesan ramah dalam bentuk string, jadi pesan itu
 * harus diteruskan, bukan diganti kalimat umum. Galat yang tidak membawa pesan
 * (TypeError dari balapan cache kolom, misalnya) memakai cadangan.
 */
export function pesanError(error: unknown, cadangan: string): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return cadangan;
}
