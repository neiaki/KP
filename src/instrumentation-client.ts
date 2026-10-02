/*
 * Inisialisasi Sentry untuk sisi browser.
 *
 * Next.js memuat berkas ini otomatis sebelum hydration, jadi SDK terpasang
 * lebih dulu dari komponen mana pun. Ini yang membuat error yang terjadi
 * selama render pertama ikut tercatat, bukan hanya yang muncul setelah user
 * sudah berinteraksi.
 *
 * Berbeda dengan src/instrumentation.ts, berkas ini memakai prefix
 * NEXT_PUBLIC_. Itu wajib: DSN memang berakhir di dalam HTML yang dikirim ke
 * browser, dan nilainya bukan rahasia. Yang berbahaya adalah DSN paired
 * dengan Sentry Auth Token, dan token itu hanya dipakai di server lewat
 * sentry-cli saat sourcemap diunggah, tidak pernah di NEXT_PUBLIC_.
 *
 * Kalau DSN kosong, Sentry.init dilewati dan tidak ada request yang keluar.
 * Demo lokal tetap jalan tanpa overhead.
 */

import * as Sentry from "@sentry/nextjs";
// Ekstensi .ts eksplisit, sama seperti src/lib/login-redirect.ts dan
// src/db/client.ts: runner test node tidak bisa resolve alias "@/".
import { sentryRelease } from "./lib/sentry-release.ts";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    release: sentryRelease() ?? undefined,

    /*
     * Replay DIMATIKAN TOTAL, termasuk rekaman yang dipicu galat.
     *
     * Perekam replay Sentry berjalan di browser: rrweb merekam DOM di
     * komputer pelanggan, jadi rekamannya tidak pernah melewati beforeSend
     * server di src/instrumentation.ts, dan beforeSend client di bawah ini
     * sengaja tidak menyaring nilai apa pun. Tidak ada tempat di berkas ini
     * yang bisa menutupi isi rekaman setelah terekam.
     *
     * Isi halaman portal memang data pelanggan pihak ketiga. Nama, nomor
     * telepon, IMEI, kode tiket, dan nomor nota tampil apa adanya di
     * /portal/pos, /portal/service, dan /portal/account. Layar kasir dan layar
     * servis adalah tempat paling buruk di seluruh aplikasi ini untuk
     * menyalakan perekam DOM. masking bawaan Sentry hanya menutupi nilai
     * input form, bukan teks yang sudah ter-render di halaman, jadi tidak ada
     * setelan masking yang akan menyelamatkan ini.
     *
     * Sinyal galatnya tetap utuh: captureException di src/app/error.tsx dan
     * src/app/global-error.tsx tidak bergantung pada replay, dan stack trace
     * tetap terkirim seperti sebelumnya. Yang hilang hanya rekaman layar,
     * yang nilainya tidak sebanding risikonya. Kalau replay nanti benar-benar
     * dibutuhkan, syaratnya halaman tanpa data pelanggan yang bisa direkam
     * secara terpisah, bukan merekam portal.
     */
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,

    // Tracing performance dimatikan, sama seperti di sisi server. Website
    // toko tidak butuh distributed tracing, dan mengisinya membuat kuota
    // event habis sebelum error yang sebenarnya terlihat.
    tracesSampleRate: 0,

    /*
     * Buang query string dari breadcrumb sebelum terkirim.
     *
     * Breadcrumb dari browser menyimpan URL apa adanya, dan pada SDK v11
     * tidak ada opsi pengumpulan data yang menyaringnya di sisi browser
     * (penyaringan query string hanya dipasang di server). Halaman lacak
     * publik memanggil /id/tracking?ticket=SRV-..., jadi tanpa ini kode
     * tiket yang bisa membuka lacakan tanpa login ikut terkirim pada setiap
     * navigasi atau fetch yang tercatat, dan kode itu sendiri bobotnya
     * cukup untuk dibaca tebak.
     *
     * Kategori breadcrumb yang benar diverifikasi terhadap SDK yang
     * terpasang, bukan ditebak. @sentry/browser v11 menghasilkan:
     *   - "xhr"         XMLHttpRequest, URL di data.url
     *   - "fetch"       fetch(), URL di data.url
     *   - "navigation"  history.pushState/replaceState, yang juga dipakai
     *                  Next.js router. URL di data.from dan data.to, dan
     *                  keduanya sudah termasuk search string.
     * Nilai "http" itu TYPE, bukan category. Memakai "http" di sini membuat
     * filter ini tidak pernah menyentuh satu pun breadcrumb, yaitu kebocoran
     * yang tidak terlihat karena tidak memunculkan error apa pun.
     *
     * Navigasi ikut dicoret karena halaman lacak dipanggil lewat
     * router.push, dan dari situ kode tiket masuk ke data.to. Tanpa ini,
     * setiap pengunjung yang membuka halaman lacak langsung mencatat kodenya.
     *
     * Hook-nya beforeBreadcrumb, bukan beforeSend: beforeSend menerima satu
     * event lengkap beserta semua breadcrumb-nya, dan menyaring di sana
     * berarti menyalin logika ini ke dua tempat.
     */
    beforeBreadcrumb(breadcrumb) {
      // Dipotong di "?" atau "#": bagian setelahnya tidak pernah berguna
      // untuk diagnosa dan bisa memuat kode tiket.
      const potong = (v: unknown) =>
        typeof v === "string" ? v.split(/[?#]/, 1)[0] : v;

      if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
        const data = breadcrumb.data;
        if (!data || typeof data.url !== "string") return breadcrumb;
        return { ...breadcrumb, data: { ...data, url: potong(data.url) } };
      }

      if (breadcrumb.category === "navigation") {
        const data = breadcrumb.data;
        if (!data) return breadcrumb;
        return { ...breadcrumb, data: { ...data, from: potong(data.from), to: potong(data.to) } };
      }

      return breadcrumb;
    },

    /*
     * Buang sumber daya yang bukan milik aplikasi. Tanpa ini, satu request
     * ke domain pihak ketiga yang gagal akan muncul sebagai galat di
     * dashboard padahal tidak ada yang bisa diperbaiki dari sisi At Cell.
     */
    ignoreErrors: [
      // Ekstensi browser menyuntik error, di luar kendali aplikasi.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Gagal memuat aset pihak ketiga, bukan galat aplikasi.
      "Load failed",
      "Failed to load resource",
      "Loading failed for the <img>",
      // Fetch yang dibatalkan saat pindah halaman, normal.
      "AbortError",
      "The operation was aborted",
    ],

    /*
     * beforeSend sisi client hanya membuang event, bukan menyaring nilainya.
     * Penghapusan data sensitif ada di src/instrumentation.ts untuk event
     * server, karena bentuk event browser berbeda. Yang di-filter di sini
     * hanya breadcrumb lewat beforeBreadcrumb di atas; event-nya sendiri
     * diteruskan apa adanya.
     */
    beforeSend(event) {
      // Demo lokal tidak pernah melapor ke Sentry production. Tanpa ini,
      // satu kesalahan saat menguji development akan tercampur ke dashboard
      // production dan membuat nomor error tidak dipercaya.
      if (process.env.NODE_ENV !== "production") return null;
      return event;
    },
  });
}
