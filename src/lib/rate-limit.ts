/**
 * Rate limit in-memory untuk endpoint publik tanpa dependensi tambahan.
 *
 * Ini lapisan pertahanan pertama, bukan pengganti WAF. Gunanya adalah
 * memperlambat enumerasi kode resi dan membatasi scraping, sehingga kode resi
 * 40-bit yang kini disimpan di database tetap praktis tidak bisa ditembus.
 *
 * Batasan yang perlu diketahui: state hidup di memori proses, jadi hilang saat
 * restart dan tidak dibagi antar container. Coolify menjalankan satu container,
 * jadi sudah cukup. Kalau nanti diskalakan, pindahkan ke rate limit middleware
 * Traefik atau Redis.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

/** Sweep berkala supaya Map tidak tumbuh tanpa batas dari IP palsu. */
const SWEEP_INTERVAL_MS = 60_000;
const MAX_BUCKETS = 10_000;
let lastSweepAt = 0;

function sweep(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS && buckets.size < MAX_BUCKETS) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Kalau bucket sudah penuhi, buang yang paling cepat expired.
  if (buckets.size >= MAX_BUCKETS) {
    const entries = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of entries.slice(0, Math.ceil(MAX_BUCKETS / 4))) {
      buckets.delete(key);
    }
  }
}

export type RateLimitVerdict = {
  allowed: boolean;
  /** Sisa kuota di jendela ini. */
  remaining: number;
  /** Sisa detik sebelum jendela direset. */
  retryAfterSeconds: number;
};

/**
 * Catat satu percobaan lalu kembalikan apakah boleh lewat.
 * `limit` adalah jumlah permintaan maksimum dalam `windowMs`.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitVerdict {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  // Bucket yang sudah penuh tidak menambah hitungan lagi. Tanpa clamp ini,
  // penyerang yang terus mengirim akan memperdalam penolakan sendiri, dan
  // refundRateLimit tidak akan pernah cukup untuk melepas satu pelanggan
  // yang sah di tengah serangan. Dengan clamp, hitungan mandek persis di
  // limit, jadi satu refund sudah cukup mengembalikan pelanggan itu.
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds,
  };
}

/**
 * Kembalikan satu kuota yang sempat dipotong, tanpa mengubah jendela.
 *
 * Dipakai hanya oleh lapisan yang baru bisa tahu setelah permintaan selesai
 * apakah permintaan itu sah: kuota global lacak servis dipotong sebelum
 * query, lalu dikembalikan begitu ternyata kodenya ketemu. Jadi kuota global
 * itu sebenarnya hanya menghitung kode yang SALAH, sementara permintaan
 * pelanggan yang benar berakhir dengan biaya nol.
 *
 * Aman karena refund hanya mengembalikan satu pemakaian: kalau bucket sudah
 * hilang, sudah kedaluwarsa, atau sudah habis, fungsi ini diam saja. Pemanggil
 * yang refund berlebihan hanya membuat kuotanya sendiri tidak naik, tidak
 * pernah menambah kuota siapa pun.
 */
export function refundRateLimit(key: string): void {
  const bucket = buckets.get(key);
  if (!bucket) return;
  if (bucket.resetAt <= Date.now()) return;
  if (bucket.count <= 0) return;
  bucket.count -= 1;
}

/* -------------------------------------------------------------------------- */
/* Login dan pendaftaran                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Batas percobaan untuk endpoint kredensial (login portal dan pendaftaran
 * pelanggan). Jauh lebih longgar daripada kuota lacak resi karena kredensial
 * asli sering diketik ulang, tapi cukup rapat untuk membuat tebak password
 * satu per satu tidak layak.
 */
export const CREDENTIAL_ATTEMPT_LIMIT = 10;
export const CREDENTIAL_ATTEMPT_WINDOW_MS = 5 * 60_000;
/**
 * Lapisan kedua untuk penyerang yang memakai banyak username. Tanpa ini,
 * memutar username memberi bucket baru tiap giliran dan kuota per
 * username/IP jadi tidak berarti. Angkanya sengaja jauh di atas kuota per
 * pasangan supaya satu orang yang salah ketik berkali-kali tidak ikut
 * mengunci tukang tokonya sendiri.
 */
export const CREDENTIAL_IP_LIMIT = 40;
export const CREDENTIAL_IP_WINDOW_MS = 5 * 60_000;
/**
 * Lapisan ketiga, dan yang paling penting: kunci bucket TIDAK memuat IP.
 *
 * Dua lapisan sebelumnya sama-sama memuat alamat klien, jadi keduanya hanya
 * membatasi satu alamat. Penyerang yang memakai banyak alamat mendapat
 * bucket baru di setiap lapisan, dan bisa menebak satu akun sebanyak
 * CREDENTIAL_ATTEMPT_LIMIT kali jumlah alamat. Untuk satu toko sekecil At
 * Cell itu cukup: 50 alamat berarti sekitar 144 ribu tebakan sehari ke satu
 * username. Bucket per akun menutupnya, karena tidak peduli dari mana
 * permintaan datang.
 *
 * Angka 60 per 15 menit dipilih supaya dua hal yang bertentangan tetap sama-sama
 * terpenuhi:
 *
 * - Tukang toko yang benar tidak terkunci. Satu orang dikunci paling keras
 *   oleh lapisan per pasangan, yaitu 10 percobaan per 5 menit = 30 per 15
 *   menit. 60 memberi dia dua kali lipat ruang, dan orang berikutnya di
 *   toko punya username sendiri sehingga tidak ikut tersentuh.
 * - Serangan ke satu akun tetap terbatas. 60 per 15 menit = 5.760 sehari,
 *   bukan 144 ribu, berapa pun jumlah alamat yang dipakai penyerang.
 *
 * Trade-off yang jujur: penyerang sekarang bisa membuat akun targetnya
 * terkunci selama 15 menit dengan menguras kuotanya. Untuk toko dengan satu
 * admin yang bisa membuka akses, ini jauh lebih murah daripada password
 * administrator yang berhasil ditebak, dan jendela 15 menit jauh lebih
 * pendek daripada jendela 5 menit pada lapisan lain.
 */
export const CREDENTIAL_ACCOUNT_LIMIT = 60;
export const CREDENTIAL_ACCOUNT_WINDOW_MS = 15 * 60_000;

export type CredentialThrottle = { allowed: true } | {
  allowed: false;
  retryAfterSeconds: number;
};

/**
 * Catat satu percobaan kredensial lalu kembalikan apakah boleh lewat.
 *
 * `identifier` adalah username atau email yang dikirim, bukan hasil
 * pencarian. Kunci bucket dibentuk dari IP + identifier, jadi satu penyerang
 * tidak bisa mengunci seluruh toko: dia hanya mengunci kombinasi
 * IP + username miliknya sendiri.
 *
 * Fungsi ini tidak menerima apa pun tentang apakah username itu ada, dan
 * pemanggilnya harus memanggilnya SEBELUM mencari profil. Kalau kuota baru
 * dipotong setelah username ketemu, pesan "terlalu banyak percobaan"
 * berubah jadi jawaban ya/tidak untuk "apakah username ini ada", dan
 * pesan galat yang selama ini dijaga sama untuk semua kegagalan jadi tidak
 * berguna.
 */
export function consumeCredentialAttempt(
  clientId: string,
  identifier: string
): CredentialThrottle {
  // Header IP yang hilang membuat semua permintaan memakai satu kunci. Itu
  // membuat batas lebih ketat, bukan lebih longgar, dan tidak bisa dipakai
  // untuk melewati limit.
  const ip = clientId.trim() || "unknown";
  const who = identifier.trim().toLowerCase();
  const pair = consumeRateLimit(
    `cred-ip-user:${ip}:${who}`,
    CREDENTIAL_ATTEMPT_LIMIT,
    CREDENTIAL_ATTEMPT_WINDOW_MS
  );
  if (!pair.allowed) return { allowed: false, retryAfterSeconds: pair.retryAfterSeconds };
  const perIp = consumeRateLimit(
    `cred-ip:${ip}`,
    CREDENTIAL_IP_LIMIT,
    CREDENTIAL_IP_WINDOW_MS
  );
  if (!perIp.allowed) return { allowed: false, retryAfterSeconds: perIp.retryAfterSeconds };
  const perAccount = consumeRateLimit(
    `cred-user:${who}`,
    CREDENTIAL_ACCOUNT_LIMIT,
    CREDENTIAL_ACCOUNT_WINDOW_MS
  );
  if (!perAccount.allowed) {
    return { allowed: false, retryAfterSeconds: perAccount.retryAfterSeconds };
  }
  return { allowed: true };
}

/** Hanya untuk test, membersihkan seluruh state rate limit. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweepAt = 0;
}
