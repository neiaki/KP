/**
 * Akhir masa garansi perbaikan servis (FR-B-04).
 *
 * Garansi servis dihitung dari saat unit benar-benar diserahkan ke pelanggan,
 * bukan dari tanggal tiket dibuat atau selesai dikerjakan. Tiket yang belum
 * diambil tidak punya `picked_up_at`, jadi tidak ada akhir masa garansi yang
 * bisa dihitung dan pemanggil harus menampilkan sesuatu yang lain.
 *
 * Fungsi ini murni supaya halaman lacak publik dan test memakai perhitungan
 * yang sama; jangan menyalin rumusnya ke komponen lain.
 */
export function serviceWarrantyEnd(
  pickedUpAt: string | null | undefined,
  warrantyDays: number | null | undefined
): Date | null {
  if (!pickedUpAt) return null;
  const mulai = new Date(pickedUpAt);
  if (Number.isNaN(mulai.getTime())) return null;
  // Nilai kolom dijaga 0-365 oleh schema, tapi data lama atau mode demo bisa
  // memberi angka lain; clamp menjaga hasilnya tetap masuk akal.
  const hari = Number.isFinite(warrantyDays) ? Math.max(0, Math.trunc(warrantyDays ?? 0)) : 0;
  return new Date(mulai.getTime() + hari * 24 * 60 * 60 * 1000);
}
