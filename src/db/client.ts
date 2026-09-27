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
    pesan.includes("write after end")
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
      if (prop === "unsafe" && typeof nilai === "function") {
        return (...args: unknown[]) => pantau(nilai.apply(target, args));
      }
      return typeof nilai === "function" ? nilai.bind(target) : nilai;
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
      max: process.env.VERCEL ? 1 : 5,
      // Socket harus ditutup sendiri sebelum pooler atau server punya alasan
      // untuk membuangnya, lihat catatan insiden di atas file ini.
      max_lifetime: MAX_LIFETIME_SECONDS,
      idle_timeout: IDLE_TIMEOUT_SECONDS,
      connect_timeout: 3,
      connection: {
        // Health probe tidak boleh menumpuk query lambat di pool kecil.
        statement_timeout: 2500,
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
