// Koneksi Drizzle ke Postgres Supabase.
// Konsep: getDb() = "pintu" ke database. Kembalikan null bila DATABASE_URL
// belum diisi, sehingga action bisa menjawab "backend belum dikonfigurasi"
// (UI tetap jalan mode demo). Disimpan singleton agar tidak buka koneksi baru
// setiap request.
//
// PENTING: koneksi langsung ini MELEWASI RLS Supabase. Itu sebabnya setiap
// Server Action WAJIB memanggil requireRole() dulu (lihat actions/_helpers.ts).
// Auth (login/session) dan Storage tetap lewat supabase-js seperti semula.
//
// INSIDEN 2026-09-27: situs mati dua kali tanpa restart, dan ini akar
// masalahnya, bukan memori dan bukan jaringan. Supabase di belakang pooler
// menutup socket dari sisi server dengan jadwal sendiri, dan setelah itu
// ada dua kemungkinan yang keduanya fatal buat proses ini: query berikutnya
// melempar "The destination stream closed early", atau koneksinya diam
// total tanpa error sama sekali. Di kedua kasus tidak ada apa pun yang
// membuang cache, jadi klien yang tidak berguna itu dipakai lagi oleh setiap
// request berikutnya, termasuk probe readiness, yang karena itu menjawab 503
// terus sampai container di-restart manual. Tiga penjaga yang sebelumnya
// tidak ada di sini: batas umur koneksi, idle timeout, dan pembatalan cache
// saat koneksi gagal atau tidak menjawab.
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
// Ekstensi .ts ditulis eksplisit, sama seperti src/app/robots.ts, supaya modul
// ini bisa diimpor juga oleh test node tanpa Next.js.
import * as schema from "./schema.ts";

export type Db = PostgresJsDatabase<typeof schema>;

let client: Sql | null = null;
let db: Db | null = null;

/**
 * Batas umur satu koneksi, dalam detik.
 *
 * Bawaan driver postgres 3.4.9 adalah 60 * (30 + acak * 30), yaitu 30 sampai
 * 60 menit, dan idle_timeout bawaannya null sehingga koneksi idle tidak
 * pernah ditutup oleh klien. Keduanya terlalu lax untuk dipakai di belakang
 * pooler. 300 detik dipilih karena jauh di bawah jendela reap pooler dan jauh
 * di bawah bawaan 30 sampai 60 menit: tidak ada socket yang bergeser lebih
 * dari lima menit tanpa diganti, jadi tidak ada kebocoran yang menumpuk, dan
 * biayanya hanya satu handshake per lima menit per koneksi.
 */
const MAX_LIFETIME_SECONDS = 300;

/**
 * Tutup koneksi yang menganggur lebih dari 20 detik.
 *
 * Ini yang menutup celah paling berbahaya. Pooler boleh mengambil alih socket
 * idle kapan saja, dan socket yang diambil alih lalu dibuang sisi server
 * adalah tepat penyebab "The destination stream closed early". Dengan 20
 * detik, nilai yang juga dipakai contoh driver sendiri, socket idle selalu
 * sudah ditutup oleh klien jauh sebelum pooler sempat mengambil alihnya.
 * Biayanya satu reconnect murah saat situs sedang sepi, dan ketika ada
 * traffic, probe readiness sendiri membuat soket tidak pernah menganggur
 * cukup lama untuk batas ini tersentuh.
 */
const IDLE_TIMEOUT_SECONDS = 20;

/** Bawaan batas statement, dalam milidetik. */
const STATEMENT_TIMEOUT_BAWAAN = 8000;
/** Di bawah ini query etalase yang sehat ikut terpotong. */
const STATEMENT_TIMEOUT_MINIMUM = 1000;
/** Di atas ini satu query menahan pool terlalu lama. */
const STATEMENT_TIMEOUT_MAKSIMUM = 30_000;

/**
 * Batas waktu satu query, dibaca dari STATEMENT_TIMEOUT_MS.
 *
 * Nilai tidak bisa dipakai apa adanya. Driver postgres.js menyaring opsi
 * `connection` dengan filter yang membuang nilai falsy, jadi 0 dan NaN
 * bukan "batas waktu nol" melainkan tidak adanya statement_timeout sama
 * sekali, tanpa satu galat pun yang bisa dilihat operator. Yang paling
 * mungkin terjadi di produksi justru operator mengosongkan fieldnya di
 * dashboard Coolify, jadi kosong harus diperlakukan sebagai bawaan dan
 * bukan diteruskan.
 *
 * Batas bawah dan atas bukan hiasan. statement_timeout adalah parameter
 * integer, jadi negatif atau pecahan ditolak server saat koneksi dibentuk
 * dan seluruh aplikasi tidak bisa terhubung karena satu salah ketik. Di
 * sisi lain, statement yang menahan sepuluh menit menahan seluruh instance
 * dan membuat request berikutnya antre di belakang socket yang sama.
 */
const STATEMENT_TIMEOUT_MS = (() => {
  const mentah = Number(process.env.STATEMENT_TIMEOUT_MS);
  if (!Number.isInteger(mentah)) return STATEMENT_TIMEOUT_BAWAAN;
  if (mentah < STATEMENT_TIMEOUT_MINIMUM) return STATEMENT_TIMEOUT_BAWAAN;
  if (mentah > STATEMENT_TIMEOUT_MAKSIMUM) return STATEMENT_TIMEOUT_MAKSIMUM;
  return mentah;
})();

/**
 * Jumlah koneksi per instance.
 *
 * DB_POOL_MAX dibaca dari env karena batas sebenarnya ada di sisi Supabase
 * (max_connections) dan di trafik, sedangkan repo tidak bisa mengetahuinya
 * tanpaDUCTION getter. Nilai tidak bisa dipakai apa adanya juga jatuh ke
 * bawaan, dengan alasan yang sama seperti STATEMENT_TIMEOUT_MS di atas.
 */
const POOL_MAX_BAWAAN = 12;

const POOL_MAX = (() => {
  const mentah = Number(process.env.DB_POOL_MAX);
  if (!Number.isInteger(mentah) || mentah < 1) return POOL_MAX_BAWAAN;
  if (mentah > 50) return POOL_MAX_BAWAAN;
  return mentah;
})();

/** Kode galat yang berarti jalurnya rusak, bukan query-nya. */
const KODE_KONEKSI: Record<string, true> = {
  CONNECTION_CLOSED: true,
  CONNECTION_DESTROYED: true,
  CONNECTION_ENDED: true,
  CONNECT_TIMEOUT: true,
  ECONNRESET: true,
  ECONNREFUSED: true,
  EPIPE: true,
  ETIMEDOUT: true,
  ENOTFOUND: true,
  EAI_AGAIN: true,
  EHOSTUNREACH: true,
  ENETUNREACH: true,
  ENETDOWN: true,
  /*
   * SQLSTATE kelas 08 = Connection Exception. 08006 adalah connection_failure
   * dan paling sering muncul bukan dari Postgres langsung, melainkan dari
   * pooler yang menutup koneksi di tengah transaksi. Bentuk itu yang dipakai
   * executeSale: seluruh badan transaksi berhasil, tidak ada satu pun query
   * di dalam callback yang gagal, dan yang putus adalah statement commit.
   * Karena query di dalam transaksi berjalan di klien milik driver, satu-
   * satunya yang terlihat dari lapisan kita adalah promise balik dari
   * .begin, jadi tanpa kode ini di daftar galat commit itu tidak pernah
   * membangun ulang cache.
   */
  "08006": true,
};

/**
 * True kalau galat ini berarti koneksi, bukan query, yang bermasalah.
 *
 * Yang penting tidak ada galat lain di daftar ini. "canceling statement due
 * to statement timeout" (kode 57014) misalnya hal yang normal pada load spike,
 * dan membuang cache karena itu akan membangun klien baru pada setiap query
 * yang lambat.
 */
export function isConnectionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const kode = String((err as { code?: unknown }).code ?? "");
  if (KODE_KONEKSI[kode]) return true;
  const pesan = err.message.toLowerCase();
  return (
    pesan.includes("destination stream closed early") ||
    pesan.includes("socket hang up") ||
    pesan.includes("premature close") ||
    pesan.includes("not connected") ||
    pesan.includes("write after end") ||
    // Dua kalimat berikut milik driver pg sekeluarga, yang berdiri di
    // depan socket kita kalau deployment pernah memakai PgBouncer atau
    // Postgres.app alih-alih postgres.js. Repo ini sendiri hanya memakai
    // postgres.js, jadi keduanya Predictive eksploratif. Kalimat pertama berasal
    // dari libpq saat koneksi hilang tanpa orderly close, dan yang kedua
    // dari pg-pool saat kl unusable setelah reconnect gagal.
    pesan.includes("connection terminated unexpectedly") ||
    pesan.includes("connection error and is not queryable")
  );
}

/**
 * Bungkus sql client supaya galat koneksi ikut membuang cache.
 *
 * Kenapa dibaca dari sisi query dan bukan dari hook driver: postgres 3.4.9
 * tidak punya opsi onerror dan sql.on("error") juga tidak ada di versi ini.
 * Hook lifecycle satu-satunya, options.onclose, ikut terpakai untuk recycle
 * koneksi yang kita minta sendiri lewat idle_timeout dan max_lifetime, jadi
 * tidak bisa dipakai sebagai sinyal kegagalan tanpa membuat cache di-aged
 * setiap beberapa detik.
 *
 * Objek yang dikembalikan tetap callable dan tetap punya .unsafe, .begin,
 * .close, dan .options seperti semula, jadi drizzle tidak melihat perbedaan
 * apa pun. Penangan dipasang di samping, bukan dengan mengembalikan promise
 * baru, karena drizzle memakai .values() pada hasil unsafe dan objek itu harus
 * tetap berupa Query.
 */
function withConnectionGuard(sql: Sql, onConnectionFailure: () => void): Sql {
  const pantau = (hasil: unknown): unknown => {
    const thenable = hasil as {
      then?: unknown;
      catch?: (fn: (err: unknown) => void) => unknown;
    };
    if (typeof thenable?.then === "function" && typeof thenable.catch === "function") {
      void thenable.catch((err) => {
        if (isConnectionFailure(err)) onConnectionFailure();
      });
    }
    return hasil;
  };
  return new Proxy(sql, {
    apply(target, _thisArg, args) {
      return pantau(Reflect.apply(target, target, args));
    },
    get(target, prop) {
      const nilai = Reflect.get(target, prop);
      if (typeof nilai !== "function") return nilai;

      // .begin wajib diawasi, bukan hanya .unsafe dan tagged template.
      //
      // db.transaction() tidak memakai keduanya. Driver memanggil .begin,
      // dan di dalam postgres 3.4.9 begin membangun klien sendiri lewat
      // Sql(handler) untuk query di dalam callback transaksi. Klien kedua
      // itu tidak pernah melewati proxy, jadi satu-satunya yang masih
      // terlihat dari sini adalah promise balik dari .begin.
      //
      // Tanpa penjaga di sini, satu kegagalan koneksi di dalam transaksi
      // tidak membuang cache, dan request berikutnya memakai klien yang
      // tidak berguna itu lagi sampai kebetulan ada query biasa yang
      // menyadarinya. executeSale, updateUnitStatus, dan updateTicket
      // semuanya memakai db.transaction(), jadi jalurnya produksi.
      if (prop === "unsafe" || prop === "begin") {
        return (...args: unknown[]) => pantau(nilai.apply(target, args));
      }
      return nilai.bind(target);
    },
  }) as Sql;
}

/**
 * Bangun klien dan db baru. Hanya dipanggil dari getDb().
 *
 * Sengaja tidak menerima callback dan tidak pernah dipanggil dari handler
 * galat, supaya tidak ada jalan kedua yang bisa membuat klien kedua untuk
 * singleton yang sama.
 */
function buildDb(url: string): Db {
  const sql = withConnectionGuard(
    postgres(url, {
      // Wajib false untuk Supabase connection pooler (transaction mode).
      prepare: false,
      // Vercel dapat membuat banyak instance serverless. Batasi setiap
      // instance ke satu koneksi; Coolify yang long-lived boleh memakai
      // pool kecil. Supabase pooler tetap menjadi pembatas utama.
      //
      // Nilai 5 terlalu kecil untuk halaman publik. Satu render halaman
      // berat memakai lima sampai tujuh query: snapshot etalase tiga
      // query, StoreJsonLd dua, dan satu lagi untuk kode resi. Dengan max
      // 5, dua pengunjung yang membuka beranda bersamaan sudah menghabiskan
      // pool, dan request ketiga menunggu tanpa batas sampai statement
      // timeout.
      //
      // Gejalanya tercatat di produksi pada 29 September 2026 dan bukan
      // sekadar halaman lambat: /robots.txt dan /api/health/live tetap 0,1
      // detik, sementara /id, /en, /id/about, dan /id/warranty semuanya
      // timeout bersamaan begitu ada lebih dari satu request. Setelah tiga
      // kegagalan health check berturut-turut, container ditandai unhealthy
      // dan Traefik membalas 503 "no available server" selama sekitar 90
      // detik, lalu pulih sendiri.
      //
      // 12 dipilih karena cukup untuk menyerap burst kecil tanpa naik ke
      // angka yang bisa membuat pooler Supabase menolak koneksi. Batas
      // sesungguhnya tetap max_connections di sisi Supabase, yaitu 60 pada
      // paket yang sedang dipakai. Koneksi yang menganggur hampir tidak
      //menggunakan memori, karena yang benar-benar aktif hanya
      // koneksi yang sedang menjalankan query.
      max: process.env.VERCEL ? 1 : POOL_MAX,
      // Socket harus ditutup sendiri sebelum pooler atau server punya alasan
      // untuk membuangnya, lihat catatan insiden di atas file ini.
      max_lifetime: MAX_LIFETIME_SECONDS,
      idle_timeout: IDLE_TIMEOUT_SECONDS,
      connect_timeout: 3,
      connection: {
        // Health probe tidak boleh menumpuk query lambat di pool kecil.
        statement_timeout: STATEMENT_TIMEOUT_MS,
        lock_timeout: 2000,
      },
    }),
    () => {
      invalidateDb();
    }
  );
  client = sql;
  return drizzle(sql, { schema });
}

export function isDrizzleConfigured(): boolean {
  return (process.env.DATABASE_URL ?? "").length > 0;
}

export function getDb(): Db | null {
  if (!isDrizzleConfigured()) return null;
  if (!db) {
    // Bangun-nya sinkron dan tidak pernah menunggu apa pun, jadi dua
    // pemanggil yang datang bersamaan tidak bisa saling menimpa: yang masuk
    // duluan sudah mengisi db sebelum pemanggil lain membaca baris di atas.
    db = buildDb(process.env.DATABASE_URL as string);
  }
  return db;
}

/**
 * Buang klien yang sedang di-cache supaya getDb() berikutnya membangun yang
 * baru.
 *
 * Yang penting: fungsi ini tidak pernah membangun klien pengganti. Justru
 * build itu dibiarkan terjadi di getDb() yang sinkron, sehingga banyak
 * kegagalan bersamaan tidak mungkin membuat lebih dari satu klien dan
 * membocorkan sisanya. Klien lama ditutup dengan end() supaya socketnya tidak
 * menggantung, tetapi tidak di-await: pemanggil yang gagal tidak boleh
 * menunggu, dan kegagalan end() juga tidak boleh mengubah hasil aksinya.
 *
 * Biayanya: request yang sedang memegang db lama bisa gagal sekali lagi.
 * Itu trade-off yang disengaja, karena tanpa invalidateDb satu koneksi rusak
 * akan mematikan seluruh proses.
 */
export function invalidateDb(): void {
  const lama = client;
  client = null;
  db = null;
  if (!lama) return;
  try {
    void Promise.resolve(lama.end()).catch(() => {});
  } catch {
    // end() yang langsung melempar tidak boleh membuat invalidateDb gagal.
  }
}
