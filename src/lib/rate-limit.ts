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

  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds,
  };
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
  return { allowed: true };
}

/** Hanya untuk test, membersihkan seluruh state rate limit. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweepAt = 0;
}
