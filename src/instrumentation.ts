/*
 * Inisialisasi Sentry untuk sisi server (Node.js runtime).
 *
 * Berkas ini adalah hook register() milik Next.js. Next memanggilnya sekali
 * per environment server saat proses start, sebelum request pertama dilayani,
 * jadi SDK Sentry terpasang sebelum ada error yang bisa lolos.
 *
 * DSN dibaca dari SENTRY_DSN. Kalau env itu kosong, register() keluar tanpa
 * melakukan apa pun. Ini yang membuat demo lokal dan build tanpa kredensial
 * tetap jalan: tidak ada SDK yang diinisialisasi, tidak ada request keluar ke
 * jaringan, dan tidak ada overhead di production kalau ternyata lupa diisi.
 */

// Ekstensi .ts ditulis eksplisit supaya modul ini bisa diimpor juga
// oleh test node tanpa Next.js, sama seperti src/db/client.ts. Runner test
// tidak bisa resolve alias "@/" dari tsconfig, jadi alias hanya akan
// menggagalkan tests/sentry-privacy.test.ts.
import { sentryRelease } from "./lib/sentry-release.ts";

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Import dinamis supaya bundle Sentry tidak ikut termuat pada proses yang
  // tidak memakainya. Cabang yang tidak pernah diambil bisa di-tree-shake.
  const Sentry = await import("@sentry/nextjs");

  Sentry.init({
    dsn,

    // Environment production vs preview, supaya event tidak tercampur di
    // dashboard. NODE_ENV sudah dijaga Next.js, tidak perlu logika sendiri.
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",

    release: sentryRelease() ?? undefined,

    /*
     * tracesSampleRate 0 berarti tracing untuk performance dimatikan. Sentry
     * hosted plan hanya menyimpan sebagian kecil performance event per bulan,
     * sementara website toko HP ini tidak butuh pelacakan sedetailed itu: satu
     * transaksi POS memakai beberapa query, dan menambahkannya membuat
     * dashboard penuh transaksi biasa sebelum error produksi yang sebenarnya
     * terlihat. Error dan session replay tidak terpengaruh nilai ini.
     *
     * Naikkan ke 0.1 kalau nanti ada masalah performa yang benar-benar perlu
     * ditelusuri.
     */
    tracesSampleRate: 0,

    /*
     * Batas data yang boleh dikumpulkan SDK, bukan sekadar penyaringan di
     * beforeSend. Di SDK v11 opsi ini yang mengganti sendDefaultPii, dan
     * requestDataIntegration membacanya untuk memutuskan apa yang boleh
     * ditempel ke event.
     *
     * userInfo: false stopping event.user.ip_address. Defaultnya true, jadi
     * tanpa baris ini SDK menempelkan IP pengunjung ke setiap event dari
     * header x-forwarded-for / cf-connecting-ip, dan IP adalah data pribadi
     * menurut GDPR. Header-berkasnya ikut dibuang oleh opsi yang sama. Yang
     * hilang cuma geo/ASM dari IP, dan app ini tidak pernah memakai itu.
     *
     * urlQueryParams: false membuang query string sebelum event formed: dari
     * request.url, request.query_string, atribut span, dan url.query pada
     * breadcrumb request keluar (fetch ke PostgREST memakai ?username=eq.<nilai>
     * di src/lib/actions/auth.ts). Tanpa ini kode tiket pada /id/tracking
     * bocor lewat tiga jalur sekaligus, dan menapis breadcrumb satu per satu
     * di beforeSend hanya menutup salah satunya.
     *
     * Yang dibuang hanya query string. Path, method, status, header non-kredensial,
     * dan stack trace tetap terkirim, jadi galat masih bisa ditelusuri.
     */
    dataCollection: {
      userInfo: false,
      urlQueryParams: false,
    },

    /*
     * Samarkan nilai yang bisa berisi data pelanggan. Server Action di repo
     * ini mengirim nama, nomor telepon, IMEI, dan nominal ke server, dan
     * payload error bisa ikut membawa sebagiannya. Sentry punya scrubbing
     * sendiri, tapi satu lapis yang menyaring sebelum keluar lebih murah
     * daripada mengoreksi data yang sudah terkirim.
     */
    beforeSend: scrubEvent,

    /*
     * Breadcrumb sisi server perlu penyaringan sendiri, terpisah dari
     * beforeSend.
     *
     * @sentry/node mengaktifkan consoleIntegration sebagai default: setiap
     * console.error, console.warn, dan console.info di server diubah jadi
     * breadcrumb. Repo ini mencetak error Postgres lewat jalur itu, dan
     * pesan dari driver postgres sering memuat nilai parameter query. Nama,
     * nomor telepon, dan IMEI yangistosert lewat Server Action bisa ikut
     * muncul di sana tanpa pernah menyentuh request atau response, jadi
     * beforeSend di atas tidak akan menyentuhnya.
     *
     * Dua lapis pertahanan sudah dipakai di sini: dataCollection mematikan
     * pengumpulan data sejak awal, dan beforeBreadcrumb ini menyaring yang
     * tetap lolos. Dua-duanya perlu, karena yang pertama tidak bisa melihat
     * isi pesan log.
     */
    beforeBreadcrumb: scrubServerBreadcrumb,
  });
}

/**
 * Ganti nilai kode tiket dengan placeholder, sisanya dibiarkan.
 *
 * Dipakai dua kali karena kode tiket muncul di dua tempat yang terpisah:
 * request.query_string dan request.url. Menapis hanya satu berarti kode yang
 * sama bocor lewat yang lain.
 */
function samarkanKodeTiket(query: string): string {
  return query
    .split("&")
    .map((pair) => (pair.split("=")[0] === "ticket" ? "ticket=[disensor]" : pair))
    .join("&");
}

/**
 * Buang kunci yang bisa memuat data pelanggan atau kredensial.
 *
 * Daftar ini disengaja sempit dan ditulis mati, bukan wildcard, karena
 * beforeSend hanya berjalan di server. Sisi client tidak punya kode ini:
 * browser sudah memegang DSN dan mengirim event-nya sendiri, jadi yang bisa
 * disaring hanya yang originates dari server. Breadcrumb browser disaring
 * di src/instrumentation-client.ts lewat beforeBreadcrumb, bukan di sini.
 */
function scrubEvent<T extends { request?: unknown }>(event: T): T {
  if (!event.request || typeof event.request !== "object") return event;
  const request = event.request as Record<string, unknown>;

  // Query string bisa memuat kode tiket servis di URL lacak (?ticket=SRV-...).
  // Kode itu yang membuat halaman lacak bisa dibuka tanpa login, jadi tidak
  // boleh bocor ke sistem pihak ketiga.
  const query = request.query_string;
  if (typeof query === "string") {
    request.query_string = samarkanKodeTiket(query);
  } else if (Array.isArray(query)) {
    request.query_string = query.map((pair) => {
      const key = (pair as [string, string])[0];
      return key === "ticket" ? [key, "[disensor]"] : pair;
    });
  } else if (query && typeof query === "object") {
    const filtered: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      filtered[key] = key === "ticket" ? "[disensor]" : (value as string | string[]);
    }
    request.query_string = filtered;
  }

  // request.url membawa query string mentah, terpisah dari query_string.
  // httpRequestToRequestData di @sentry/core memanggil getAbsoluteUrl dengan
  // request.url Node apa adanya, jadi /id/tracking?ticket=SRV-... tetap utuh
  // di sini walau query_string sudah disaring. Dipotong dengan operasi string
  // supaya path relatif dan URL tanpa host tidak bikin new URL() melempar.
  const url = request.url;
  if (typeof url === "string") {
    const mulaiQuery = url.indexOf("?");
    if (mulaiQuery !== -1) {
      const mulaiFragment = url.indexOf("#", mulaiQuery);
      const akhir = mulaiFragment === -1 ? url.length : mulaiFragment;
      request.url = `${url.slice(0, mulaiQuery)}?${samarkanKodeTiket(
        url.slice(mulaiQuery + 1, akhir)
      )}${url.slice(akhir)}`;
    }
  }

  // Body request dihapus supaya tidak ada nama, nomor telepon, IMEI, atau
  // kata sandi yang ikut tercatat.
  if (request.data !== undefined) delete request.data;
  if (request.cookies !== undefined) delete request.cookies;

  // Header: Authorization dan Cookie adalah kunci yang paling tidak boleh
  // keluar. Sisanya dibiarkan karena berguna untuk diagnosa (user-agent).
  const headers = request.headers;
  if (headers && typeof headers === "object") {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower === "authorization" ||
        lower === "cookie" ||
        lower === "set-cookie" ||
        lower === "x-api-key"
      ) {
        continue;
      }
      kept[key] = value;
    }
    request.headers = kept;
  }
  return event;
}

/**
 * Saring breadcrumb server sebelum ikut pada event.
 *
 * Yang dicoret:
 *  - breadcrumb kategori console yang pesannya memuat pola data pelanggan
 *    (nomor telepon, IMEI 15 digit, kode tiket). Bunuh saja, bukan disensor:
 *    pesan error yang sudah memuat nilai Asli tidak berguna kalau hanya
 *    sebagian yang dihapus, dan breadcrumb hanyaPelengkap, bukan bukti
 *    utama.
 *  - breadcrumb kategori query: string SQL yang menyertakan nilai literal
 *    adalah tempat paling mungkin parameter bermunculan.
 *
 * Yang dibiarkan: breadcrumb HTTP dan navigasi tanpa query string, karena
 * berguna untuk melihat urutan kejadian sebelum galat.
 */
function scrubServerBreadcrumb<T extends { category?: string; data?: unknown }>(
  breadcrumb: T
): T | null {
  if (breadcrumb.category === "query") return null;
  if (breadcrumb.category !== "console") return breadcrumb;

  const data = breadcrumb.data;
  const message =
    data && typeof data === "object" && "message" in data
      ? String((data as { message: unknown }).message ?? "")
      : "";
  const args =
    data && typeof data === "object" && "args" in data
      ? JSON.stringify((data as { args: unknown }).args ?? "")
      : "";

  const teks = `${message} ${args}`;
  // Nomor telepon Indonesia (08xx / +62xx dengan spasi atau tanda hubung),
  // IMEI 15 digit berturut-turut, dan kode tiket SRV-YYYYMMDD-XXXXXXXX.
  if (/(\+?62|0)[\s-]?8\d{1,2}[\s-]?\d{3,4}[\s-]?\d{3,4}/.test(teks)) return null;
  if (/\b\d{15}\b/.test(teks)) return null;
  if (/\bSRV-\d{8}-[0-9A-Za-z]{4,8}\b/.test(teks)) return null;

  return breadcrumb;
}
