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

/**
 * Ukuran pool yang benar-benar dipakai.
 *
 * Nilainya pernah dipatok jadi satu koneksi di Vercel, dengan alasan jumlah
 * instance serverless tidak bisa dibatasi sehingga total koneksi ke Supabase
 * harus dijaga. Angka itu terlihat hemat, tapi membuat pool postgres.js tidak
 * bisa dipakai lagi, dan itu terbaca di produksi sebagai 504
 * FUNCTION_INVOCATION_TIMEOUT di kp-rust-five.vercel.app: setiap halaman di
 * bawah /[locale] timeout, sementara /api/health/ready tetap 200 dalam 0,3
 * detik karena hanya memakai satu koneksi pada satu waktu.
 *
 * Penyebabnya ada di driver, di node_modules/postgres 3.4.9:
 *
 *   - src/index.js:65 membuat tepat options.max objek Connection, sekali saja
 *     selama proses hidup. Tidak ada Connection kedua yang bisa dibuat belakangan.
 *   - src/index.js:329-342 handler() mencari koneksi di antrean open, closed,
 *     lalu busy. Kalau ketiganya kosong, query masuk ke antrean queries.
 *   - src/index.js:344-348 go() memakai hasil Connection.execute(), yang false
 *     kalau socket kena backpressure (src/connection.js:246-259) atau ketika
 *     sent.length sudah mencapai max_pipeline. Kalau false, koneksinya
 *     dipindahkan ke antrean full.
 *   - Antrean full tidak pernah dikuras di mana pun di driver. Pencarian "full"
 *     di src/*.js hanya menemukan deklarasinya dan tiga tempat move(c, full);
 *     tidak ada full.shift() maupun move() yang keluar dari sana.
 *   - Antrean queries hanya dikuras di onopen (src/index.js:401-419) dan onclose
 *     (src/index.js:421-427), yaitu saat socket connect atau socket ditutup.
 *
 * Jadi dengan max 1, begitu query kedua mengantre, tidak ada socket kedua yang
 * bisa connect, dan query itu menggantung tanpa galat: tidak kena
 * statement_timeout, tidak kena lock_timeout, dan tidak ada yang membangunkannya.
 * Instance serverless tidak pernah dimatikan, jadi begitu satu request begitu,
 * semua request berikutnya di instance itu ikut menggantung.
 *
 * Ukuran yang dipakai sekarang adalah POOL_MAX untuk semua platform. Dengan max
 * lebih dari satu, satu koneksi bisa busy sementara yang lain open, sehingga
 * query tidak perlu masuk antrean queries sama sekali.
 *
 * dbBatch di bawah bukan yang membuat ini aman. Dia pengaman kalau pool pernah
 * dipatok satu koneksi lagi: jalannya berurutan, jadi tidak ada antrean.
 */
export const POOL_EFEKTIF = POOL_MAX;

/**
 * Jalankan beberapa query sebagai satu batch.
 *
 * Parallel kalau pool cukup besar. Kalau pool cuma satu koneksi, berurutan dan
 * di bawah satu gembok, karena dua tahap render bisa berjalan bersamaan: page
 * dan layout di-render paralel, dan masing-masing bisa menyentuh database.
 * Mengurutkan di dalam satu batch saja tidak cukup, karena dua batch dari dua
 * tempat berbeda masih bisa bertumpuk di koneksi yang sama.
 *
 * Bentuk pemanggilnya sama di kedua kasus, jadi tidak ada percabangan di setiap
 * tempat yang memanggil: cukup satu helper yang tahu batasnya.
 *
 * Setiap langkah ditulis sebagai fungsi, bukan promise yang sudah dibuat,
 * supaya di jalur berurutan query kedua belum dibuat sebelum query pertama
 * selesai. Kalau yang dilepas adalah promise yang sudah berjalan, mengurutkan
 * hanya mengurutkan penungguannya; antrean sudah terjadi di driver.
 *
 * Gemboknya sengaja di modul ini, bukan di tiap pemanggil: aturan ini
 * berlaku untuk semua jalur yang membaca lewat pool yang sama.
 */
let antreanPool: Promise<unknown> = Promise.resolve();
let diDalamBatch = false;

/**
 * Batas waktu satu langkah batch.
 *
 * STATEMENT_TIMEOUT_MS dan lock_timeout tidak menutup kelas kegagalan ini,
 * karena keduanya hanya berlaku kalau statement-nya benar-benar sudah sampai
 * ke server. Kalau yang macet adalah query yang mengantre di sisi pool atau
 * socket yang sudah tidak ada lagi, tidak ada statement yang sedang berjalan
 * untuk dipotong, dan tanpa batas di sini satu langkah yang tidak resolve
 * membuat seluruh render menggantung sampai Vercel memutuskan function-nya
 * terlalu lama.
 *
 * Yang SENGAJA tidak dilakukan di sini: invalidateDb() ketika lewat deadline.
 * Langkah ini menolak dirinya sendiri, itu sudah cukup. Membuang seluruh pool
 * akan menutup koneksi yang sedang dipakai batch lain, dan karena
 * invalidateDb() memanggil end() tanpa menunggu, query milik orang lain yang
 * sedang/antre ikut menggantung tanpa galat. Satu langkah lambat jadi satu
 * lapisan galat untuk semua pengunjung yang sedang bersamaan. Klien yang
 * benar-benar rusak sudah dibuang sendiri oleh withConnectionGuard di bawah.
 *
 * Nilainya 10 detik, bukan 8, supaya tidak memotong query yang memang sah
 * saja lambat tapi selesai.
 */
export const DB_BATCH_STEP_TIMEOUT_MS = 10_000;

/**
 * Ekspor untuk test-nya sendiri, seperti withConnectionGuard di bawah.
 */
export async function dbBatchStep<T>(
  langkah: () => Promise<T>,
  label: number,
  batasMs: number = DB_BATCH_STEP_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      langkah(),
      new Promise<never>((_, tolak) => {
        timer = setTimeout(
          () =>
            tolak(
              new Error(`dbBatch langkah ${label} lewat ${batasMs} ms tanpa jawaban`)
            ),
          batasMs
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dbBatch<T extends readonly unknown[]>(
  langkah: { readonly [K in keyof T]: () => Promise<T[K]> }
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  // Pemanggilan bersarang akan menunggu antrean yang ujungnya adalah dirinya
  // sendiri, jadi tidak akan pernah keluar. Sekarang ia ditolak di depan
  // dengan pesan yang jelas, bukan menggantung diam-diam.
  if (diDalamBatch) {
    throw new Error("dbBatch tidak boleh dipanggil di dalam dbBatch");
  }

  const berurutan = async () => {
    diDalamBatch = true;
    try {
      const hasil: unknown[] = [];
      let nomor = 0;
      for (const jalan of langkah) {
        hasil.push(await dbBatchStep(jalan, nomor++));
      }
      return hasil;
    } finally {
      diDalamBatch = false;
    }
  };

  if (POOL_EFEKTIF > 1) {
    return Promise.all(
      langkah.map((jalan, nomor) => dbBatchStep(jalan, nomor))
    ) as Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }>;
  }

  // onRejected menjalankan hal yang sama dengan onFulfilled: antrean harus
  // jalan lagi meski batch sebelumnya gagal, kalau tidak satu galat akan
  // membekukan semua batch berikutnya di instance itu.
  const lanjut = antreanPool.then(berurutan, berurutan) as Promise<{
    -readonly [K in keyof T]: Awaited<T[K]>;
  }>;
  antreanPool = lanjut.then(
    () => undefined,
    () => undefined
  );
  return lanjut;
}

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
   * SQLSTATE kelas 08 = Connection Exception. Seluruh kelas itu berarti
   * socket atau sesi tidak bisa dipakai lagi, bukan query yang salah, jadi
   * semuanya ikut membangun ulang cache.
   *
   * 08006 (connection_failure) paling sering muncul bukan dari Postgres
   * langsung, melainkan dari pooler yang menutup koneksi di tengah transaksi.
   * Bentuk itu yang dipakai executeSale: seluruh badan transaksi berhasil,
   * tidak ada satu pun query di dalam callback yang gagal, dan yang putus
   * adalah statement commit. Karena query di dalam transaksi berjalan di
   * klien milik driver, satu-satunya yang terlihat dari lapisan kita adalah
   * promise balik dari .begin, jadi tanpa kode ini di daftar, galat commit
   * itu tidak pernah membangun ulang cache.
   *
   * 08000 connection_exception dan 08007 transaction_resolution_unknown
   * diletakkan berdampingan karena keduanya sering muncul tanpa keterangan
   * tambahan: yang pertama saat pooler memutus koneksi, yang kedua saat server
   * hilang tepat ketika status transaksinya belum diketahui.
   *
   * 08001, 08002, dan 08004 adalah penolakan koneksi di sisi server: klien
   * tidak bisa membangun koneksi, atau server menolak koneksi baru karena
   * sudah penuh. Koneksi yang dipakai klien memang belum terjadi saat itu,
   * tapi begitu galatnya naik ke lapisan kita, pool yang menunggunya ikut
   * terbawa dan cache lama tidak ada gunanya lagi.
   *
   * 08P01 protocol_violation masuk juga: byte yang tidak masuk akal di socket
   * berarti stream itu tidak bisa dipakai untuk query berikutnya, persis
   * seperti socket yang ditutup di tengah.
   */
  "08000": true,
  "08001": true,
  "08002": true,
  "08003": true,
  "08004": true,
  "08006": true,
  "08007": true,
  "08P01": true,
  /*
   * SQLSTATE kelas 57 = Operator Intervention. Yang dimasukkan hanya yang
   * berarti server-nya benar-benar hilang: 57P01 admin_shutdown (server
   * dimatikan perintah administrator), 57P02 crash_shutdown, dan 57P04
   * database_dropped. Ketiganya kondisi yang tercatat di insiden 2026-09-27,
   * dan ketiganya berakhir dengan socket yang tidak berguna.
   *
   * Yang sengaja TIDAK ikut, dan alasannya:
   *
   * 57014 query_canceled. Itu statement timeout yang normal pada load spike.
   * Membuang cache karena itu membangun klien baru pada setiap query yang
   * lambat, jadi daftar ini akan membalikkan tujuan penjaganya.
   *
   * 57P03 cannot_connect_now. Itu penolakan koneksi yang BELUM terjadi, bukan
   * koneksi yang sudah putus; jalur retry driver yang menanganinya.
   *
   * 53300 too_many_connections (kelas 53 = Insufficient Resources). Galat ini
   * muncul saat koneksi BARU ditolak karena max_connections sudah penuh.
   * Koneksi yang sedang dipakai klien utuh dan query berikutnya berjalan begitu
   * ada slot kosong, jadi membuang cache justru menambah beban ke server yang
   * sedang penuh. Over-invalidation di sini mahal, bukan murah.
   *
   * Seluruh kelas 23 (integrity constraint violation: 23505, 23503, 23514)
   * dan kelas 42 (syntax or access rule: 42P01, 42703) juga tidak ikut, dan
   * tidak boleh ikut: semuanya masalah query atau data, bukan masalah jalur.
   */
  "57P01": true,
  "57P02": true,
  "57P04": true,
};

/**
 * True kalau galat ini berarti koneksi, bukan query, yang bermasalah.
 *
 * Tiga aturan, dan ketiganya wajib karena fungsi ini dipanggil dari dalam
 * promise yang tidak punya catcher.
 *
 * Pertama: bentuk masukannya dibaca tanpa asumsi apa pun, jadi masukan apa pun
 * berakhir dengan true atau false dan tidak pernah melempar TypeError. Yang
 * dulu meledak adalah err.message.toLowerCase() tanpa pemeriksaan bentuk:
 * satu message null sudah cukup untuk mematikan proses. Getter yang melempar
 * (misalnya code yang di Proxy atau accessor buatan lapisan lain) ditutup
 * oleh try/catch di body's akhir, karena itu satu-satunya bentuk yang masih
 * bisa melempar setelah pengecekan bentuk.
 *
 * Kedua: kode yang sudah ada itu yang berkuasa, dan kalimat pesannya hanya
 * dibaca kalau tidak ada kode. Dulu kode dibaca lebih dulu hanya untuk daftar
 * KODE_KONEKSI, lalu kalimat tetap dicari meski kodenya sudah kategori lain.
 * Akibatnya 23505 yang pesannya kebetulan memuat "not connected" ikut membakar
 * cache. Sekarang kode yang ada menentukan jawabannya sepenuhnya.
 *
 * Ketiga: instanceof tidak dipakai sama sekali, dan itu keputusan sadar.
 * Kode galat adalah sinyal terstruktur dari driver, dan lapisan mana pun di
 * antara socket dan kita bisa membungkusnya jadi objek biasa tanpa kehilangan
 * maknanya. Menolak objek biasa berarti kasus 08006 yang justru tercatat di
 * kepala berkas ini sebagai commit yang putus lolos begitu saja. Biaya salah
 * klasifikasi ke arah true hanya satu kali membangun klien baru, yang toh juga
 * terjadi pada request berikutnya; biaya ke arah yang salah adalah insiden
 * 2026-09-27.
 */
export function isConnectionFailure(err: unknown): boolean {
  try {
    if (err === null || typeof err !== "object") return false;

    // Hanya string atau angka finite yang dipercaya sebagai kode. Nilai lain
    // diperlakukan seperti tidak ada kode, supaya jalur kalimat tetap hidup.
    const kode =
      "code" in err &&
      (typeof err.code === "string" ||
        (typeof err.code === "number" && Number.isFinite(err.code)))
        ? String(err.code)
        : "";
    if (kode !== "") return KODE_KONEKSI[kode] === true;

    // Pesan yang bukan string diabaikan, bukan diubah jadi teks: kalimat
    // driver selalu string, dan mengabaikannya lebih jujur daripada
    // memaksanya jadi kalimat yang kebetulan cocok.
    const pesan =
      "message" in err && typeof err.message === "string"
        ? err.message.toLowerCase()
        : "";
    return (
      pesan.includes("destination stream closed early") ||
      pesan.includes("socket hang up") ||
      pesan.includes("premature close") ||
      pesan.includes("not connected") ||
      pesan.includes("write after end") ||
      // Dua kalimat berikut milik driver pg sekeluarga, yang berdiri di
      // depan socket kita kalau deployment pernah memakai PgBouncer atau
      // Postgres.app alih-alih postgres.js. Repo ini sendiri hanya memakai
      // postgres.js, jadi keduanya tetap eksploratif. Kalimat pertama berasal
      // dari libpq saat koneksi hilang tanpa orderly close, dan yang kedua dari
      // pg-pool saat klien unusable setelah reconnect gagal.
      pesan.includes("connection terminated unexpectedly") ||
      pesan.includes("connection error and is not queryable")
    );
  } catch {
    // Getter yang melempar berakhir di sini. Penjaga ini tidak boleh pernah
    // menjadi penyebab kematian proses yang seharusnya dia lindungi.
    return false;
  }
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
 *
 * Ekspor ini hanya untuk test penjaganya sendiri: dengan callback yang
 * sengaja dibuat melempar, test bisa menjalankan jalur yang dulu mematikan
 * proses dan membuktikan prosesnya sekarang selamat.
 */
export function withConnectionGuard(sql: Sql, onConnectionFailure: () => void): Sql {
  const pantau = (hasil: unknown): unknown => {
    const thenable = hasil as {
      then?: unknown;
      catch?: (fn: (err: unknown) => void) => unknown;
    };
    if (typeof thenable?.then === "function" && typeof thenable.catch === "function") {
      let turunan: unknown;
      try {
        turunan = thenable.catch((err) => {
          if (isConnectionFailure(err)) onConnectionFailure();
        });
      } catch {
        // .catch yang melempar sinkron (thenable buatan, atau Proxy) tidak
        // boleh mengubah hasil yang dilihat pemanggil.
        return hasil;
      }
      /*
       * Baris inilah yang mencegah proses mati, dan dulu tidak ada.
       *
       * `.catch(...)` mengembalikan promise BARU. Kalau callback di dalamnya
       * melempar, yang menolak adalah promise baru itu. Versi lama membuangnya
       * dengan `void`, jadi tidak ada satu pun catcher yang menempel pada
       * penolakan itu dan Node melaporkannya sebagai unhandled rejection.
       * Seit Node 15 bawaannya --unhandled-rejections=throw, jadi proses
       * keluar, persis kelas kematian yang penjaga ini ada untuk cegah.
       *
       * Di sini promise turunan itu diberi catcher terminal yang tidak
       * melakukan apa pun. Hasil aslinya tetap dikembalikan ke drizzle apa
       * adanya, jadi penolakan yang dilihat pemanggil tidak berubah, dan
       * .values() pada hasil .unsafe tetap jalan. Promise.resolve dipakai
       * supaya catcher ini juga berlaku kalau .catch mengembalikan thenable
       * yang bukan Promise.
       */
      void Promise.resolve(turunan).catch(() => {});
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
      // menggunakan memori, karena yang benar-benar aktif hanya
      // koneksi yang sedang menjalankan query.
      max: POOL_EFEKTIF,
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
