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

/** Hanya untuk test, membersihkan seluruh state rate limit. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweepAt = 0;
}
