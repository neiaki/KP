/**
 * Penentu IP klien untuk menjadi kunci rate limit.
 *
 * Fungsi ini murni dan tidak mengimpor next/headers, supaya bisa diuji tanpa
 * menjalankan Next.js sama sekali.
 *
 * SOALAN SERING TERLEWAT: entri X-Forwarded-For yang mana yang benar?
 *
 * Traefik di Coolify tidak menimpa X-Forwarded-For, melainkan MENAMBAHKAN IP
 * aslinya di belakang nilai yang sudah ada. Dari pkg/proxy/httputil/proxy.go:
 *
 *     if len(prior) > 0 {
 *         clientIP = strings.Join(prior, ", ") + ", " + clientIP
 *     }
 *     pr.Out.Header.Set("X-Forwarded-For", clientIP)
 *
 * Jadi kalau penyerang mengirim "X-Forwarded-For: 1.2.3.4", aplikasi menerima
 * "1.2.3.4, ip-asli". Mengambil entri PERTAMA berarti mengambil tepat nilai
 * yang paling mudah dikendalikan penyerang, sehingga seluruh throttle bisa
 * dilewati hanya dengan mengacak-acak satu header. Mengambil entri TERAKHIR
 * mengambil nilai yang tidak bisa dikendalikan klien, karena itu yang
 * ditambahkan proxy kita sendiri.
 *
 * Dengan konfigurasi Traefik bawaan (forwardedHeaders.insecure = false, yang
 * menjadi default sejak v2.10) X-Forwarded-For dibersihkan dulu dari
 * permintaan tak tepercaya lalu diisi ulang dengan satu IP saja, jadi entri
 * pertama dan terakhir sama-sama benar dan tidak ada perubahan perilaku.
 * Bedanya baru muncul ketika Traefik dijalankan dengan insecure = true atau
 * ada proxy tambahan di depannya, dan justru di situlah pilihan ini rescues.
 *
 * X-Real-Ip hanya dipakai sebagai cadangan, bukan pilihan utama. Traefik
 * middleware forwardedheaders hanya menulisnya kalau masih kosong, yaitu
 * "if ...Get(xRealIP) == ...". Pada konfigurasi longgar nilai dari klien
 * justru dipertahankan, jadi X-Real-Ip lebih mudah dipalsukan daripada
 * X-Forwarded-For.
 */

export type HeaderReader = {
  get(name: string): string | null;
};

/**
 * Nilai tunggal yang dipakai saat IP tidak bisa ditentukan. Sengaja konstan:
 * semua permintaan yang tidak punya IP sah saling berbagi satu kuota, yang
 * membuat batas lebih ketat, bukan lebih longgar.
 */
export const UNKNOWN_CLIENT_ID = "unknown";

/**
 * Pemeriksaan bentuk, bukan parser IP lengkap. Tujuannya hanya menahan
 * string bebas yang bukan IP, karena nilai seperti itu bisa dibuat berbeda
 * tiap permintaan lalu memberi penyerang kuota tanpa batas.
 */
function berbentukIp(nilai: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(nilai)) return true;
  // IPv6 longgar: hanya heksadesimal, titik dua, dan titik.
  if (nilai.includes(":")) return /^[0-9a-fA-F:.]+$/.test(nilai);
  return false;
}

/**
 * Ambil IP klien dari header request.
 *
 * Urutan: entri TERAKHIR X-Forwarded-For, lalu X-Real-Ip, lalu
 * UNKNOWN_CLIENT_ID. Nilai yang tidak berbentuk IP ditolak dan memakai
 * X-Real-Ip sebagai gantinya, lalu ke nilai tunggal.
 */
export function pickClientIp(h: HeaderReader): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    // Buang segmen kosong supaya "1.2.3.4, " tidak membuat entri terakhirnya
    // string kosong yang lolos pemeriksaan.
    const segmen = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const terakhir = segmen.at(-1);
    if (terakhir && berbentukIp(terakhir)) return terakhir;
  }

  const real = h.get("x-real-ip")?.trim();
  if (real && berbentukIp(real)) return real;

  return UNKNOWN_CLIENT_ID;
}
