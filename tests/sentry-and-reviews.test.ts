import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { getGoogleReviews } from "../src/lib/reviews.ts";
import { getSnapshotUlasan } from "../src/lib/ulasan-manual.ts";

/*
 * Penjaga untuk dua hal yang bisa kembali rusak tanpa deploy gagal.
 *
 * Yang pertama adalah reviews.ts. Semula berkas itu memuat blok data manual
 * berisi 5 ulasan yang dikurasi dari Google Maps pada 2021, tiga di antaranya
 *aged 3 sampai 7 tahun lalu dan empat tidak punya teks. Blok itu dilayani
 * sebagai kalau data asli, jadi etalase menampilkan rating dan kartu kosong,
 * dan buildAggregateRating() di src/app/sitemap.ts ikut memancarkan angka itu
 * sebagai aggregateRating LocalBusiness ke Google. Ulasan basi yang tampil
 * sebagai legitimasi lebih berbahaya daripada tidak ada ulasan sama sekali,
 * jadi kembalinya blok manual harus menggagalkan test.
 *
 * Yang kedua adalah Sentry. Error tracking yang tidak terpakai sama saja
 * dengan tidak ada, dan konfigurasi yang salah membuat deploy terlihat hijau
 * sementara tidak ada yang melapor. Test di bawah menjaga Sentry tetap
 * opt-in lewat DSN dan tetap menyaring data yang tidak boleh keluar.
 */

// --- reviews: tidak ada lagi data manual ------------------------------------

test("reviews.ts tidak memuat blok data manual yang bisa dilayani sebagai data asli", async () => {
  const sumber = await readFile(new URL("../src/lib/reviews.ts", import.meta.url), "utf8");

  // Penanda yang unmistakable: nama penulis sungguhan dari blok lama. Kalau
  // ini muncul lagi, berarti data basi yang sama masuk kembali.
  for (const nama of ["St Puryanta", "fernando putra", "BABY JOASH", "Victor Nicolas"]) {
    assert.equal(
      sumber.includes(nama),
      false,
      `reviews.ts memuat nama penulis manual "${nama}". Ulasan lama tidak boleh `
        + "kembali dilayani sebagai data asli. Ambil dari Google Places API, atau "
        + "biarkan null agar halaman menampilkan ajakan menulis ulasan."
    );
  }

  // Angka rating lama juga tidak boleh ditulis mati, karena angka itulah yang
  // pernah ikut memancarkan aggregateRating ke structured data.
  assert.equal(
    /rating:\s*4\.4/.test(sumber),
    false,
    "reviews.ts menulis rating 4,4 secara manual. aggregateRating harus hanya "
      + "berasal dari Google Places API."
  );
});

test("tanpa GOOGLE_PLACES_API_KEY, getGoogleReviews tidak pernah mengarang ulasan", async () => {
  // Simpan dan kembalikan nilai aslinya supaya test ini tidak merusak
  // environment Developing yang kebetulan punya key.
  const sebelumnya = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  try {
    const hasil = await getGoogleReviews();
    const snapshot = getSnapshotUlasan();

    if (snapshot.status === "siap") {
      // Snapshot yang masih layak juga bukan sumber yang boleh diubah seenaknya:
      // yang dilayani harus persis isi src/lib/ulasan-manual.ts, supaya angka di
      // halaman selalu bisa dibandingkan dengan salinan di file itu. url boleh
      // berbeda karena snapshot tidak wajib mengisinya.
      assert.deepEqual({ ...hasil, url: null }, { ...snapshot.data, url: null });
      assert.ok(
        String(hasil?.url).startsWith("https://"),
        "tautan ke Google Maps harus terisi, tombol ReviewsSection memakainya sebagai href"
      );
      return;
    }

    // null, bukan object dengan rating 0: null membuat ReviewsSection memakai
    // fallback "Pernah belanja di sini?" dan buildAggregateRating membuang
    // properti rating dari structured data. Object kosong akan memancarkan
    // LocalBusiness tanpa rating tapi tetap dengan reviews: [].
    assert.equal(hasil, null);
  } finally {
    if (sebelumnya === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = sebelumnya;
  }
});

test("tautan Google Maps menunjuk titik toko yang benar, bukan 285m meleset", async () => {
  // Regresi Oktober 2026: MAPS_URL memakai @-6.2366815,106.6772451 sementara
  // titik toko (plus code QM7H+8WG, diverifikasi dari tautan share owner) ada
  // di 106.67982. Pengunjung yang mengetuk kartu Google Reviews mendarat 285m
  // di sebelah barat toko. Titik dan ID place dikunci di sini supaya salah
  // ketik koordinat menggagalkan CI, bukan menunggu laporan pengunjung.
  const sebelumnya = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  try {
    const hasil = await getGoogleReviews();
    const snapshot = getSnapshotUlasan();
    // Di luar masa snapshot tidak ada URL yang perlu diuji.
    if (snapshot.status !== "siap") return;
    assert.ok(hasil?.url, "tautan Google Maps harus terisi saat snapshot siap");
    const url = String(hasil?.url);
    assert.ok(
      url.includes("@-6.2366815,106.67982"),
      `tautan harus menunjuk titik toko yang benar, dapat: ${url}`
    );
    assert.ok(
      url.includes("0x2e69fa339a58131f:0xfc71c2a2509f322e"),
      `tautan harus membawa ID place At Cell, dapat: ${url}`
    );
  } finally {
    if (sebelumnya === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = sebelumnya;
  }
});

test("kegagalan ulasan selalu menyebut alasannya di log server", async () => {
  // Gejalanya di produksi: bagian ulasan di beranda berubah jadi kartu "Tulis
  // Review" tanpa penjelasan, dan tidak ada yang tahu itu karena key-nya
  // kosong di Coolify. Fallback yang jujur itu memang benar, tapi ia harus
  // bersamaan dengan catatan yang menyebut variabel mana yang salah.
  //
  // Key dummy dipakai supaya jalur yang diuji adalah jalur API yang gagal
  // (REQUEST_DENIED atau jaringan), bukan jalur snapshot. Jalur snapshot
  // memang tidak boleh mencatat apa pun saat snapshot-nya masih layak, jadi
  // cara mengujinya lewat key kosong akan salah begitu snapshot diisi.
  //
  // Proses terpisah dipakai karena getGoogleReviews() sengaja melapor sekali
  // per proses: kalau test ini memakai modul yang sudah dipakai test di atas,
  // laporkan() sudah pernah dipanggil dan barisnya memang tidak keluar lagi.
  const reviewsUrl = new URL("../src/lib/reviews.ts", import.meta.url).href;
  const env = { ...process.env, GOOGLE_PLACES_API_KEY: "kunci-untuk-uji" };

  const hasil = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `const { getGoogleReviews } = await import(${JSON.stringify(reviewsUrl)});
       await getGoogleReviews();`,
    ],
    { env, encoding: "utf8" }
  );

  const gabung = `${hasil.stderr ?? ""}${hasil.stdout ?? ""}`;
  assert.match(
    gabung,
    /\[reviews]/,
    "setiap kegagalan mengambil ulasan harus menulis alasannya ke log server"
  );
});

test("reviews.ts hanya mengirim ulasan yang punya teks", async () => {
  const sumber = await readFile(new URL("../src/lib/reviews.ts", import.meta.url), "utf8");

  // ReviewsSection merender {r.text || " "}, jadi ulasan tanpa teks menjadi
  // kartu kosong tanpa informasi apa pun. Memfilter di sumber lebih murah
  // daripada menampilkan lima kartu dengan tiga di antaranya kosong.
  assert.match(
    sumber,
    /\.filter\(\(r\)\s*=>\s*typeof r\.text\s*===\s*"string"/,
    "reviews.ts harus memfilter ulasan tanpa teks sebelum dikirim ke komponen"
  );
});

// --- reviews: snapshot manual sebagai ganti sementara API key ---------------

test("snapshot manual tidak boleh memuat ulasan kosong atau tanggal basi", async () => {
  const { SNAPSHOT, DIAMBIL_PADA, getSnapshotUlasan } = await import(
    "../src/lib/ulasan-manual.ts"
  );

  for (const [i, ulasan] of SNAPSHOT.reviews.entries()) {
    assert.ok(
      ulasan.text.trim().length > 0,
      `ulasan ke-${i + 1} (${ulasan.author}) tidak punya teks. ReviewsSection `
        + "merender {r.text || \" \"} jadi yang kosong jadi kartu hampa."
    );
    assert.ok(
      ulasan.rating >= 1 && ulasan.rating <= 5,
      `rating ulasan ${ulasan.author} di luar 1..5`
    );
    assert.ok(ulasan.author.trim().length > 0, `ulasan ke-${i + 1} tidak punya nama`);
  }

  // Snapshot yang masih kosong itu sah (beranda tinggal menampilkan fallback),
  // tapi begitu ada isinya, tanggal-ms obligatory: tanpa tanggal, snapshot
  // tidak punya umur dan akan bertahan selamanya sebagai angka yang sudah
  // tidak benar.
  if (SNAPSHOT.reviews.length > 0) {
    assert.match(
      DIAMBIL_PADA,
      /^\d{4}-\d{2}-\d{2}$/,
      "DIAMBIL_PADA harus tanggal YYYY-MM-DD saat snapshot sudah berisi ulasan"
    );
    assert.equal(getSnapshotUlasan(new Date(`${DIAMBIL_PADA}T00:00:00Z`)).status, "siap");
  }
});

test("snapshot yang lewat batas umur tidak boleh dipakai sebagai rating resmi", async () => {
  const { SNAPSHOT, DIAMBIL_PADA, SNAPSHOT_MAKS_UMUR_HARI } =
    await import("../src/lib/ulasan-manual.ts");

  if (SNAPSHOT.reviews.length === 0) {
    // Belum diisi, jadi tidak ada yang perlu diuji basinya.
    return;
  }

  const diambil = new Date(`${DIAMBIL_PADA}T00:00:00Z`);
  const lama = new Date(diambil.getTime() + (SNAPSHOT_MAKS_UMUR_HARI + 1) * 86_400_000);
  const hasil = getSnapshotUlasan(lama);
  assert.equal(
    hasil.status,
    "gagal",
    "snapshot yang sudah melewati batas umur harus ditolak supaya aggregateRating "
      + "tidak memancarkan angka lama ke Google"
  );
});



// --- Sentry: opt-in lewat DSN -------------------------------------------------

test("Sentry tidak diinisialisasi tanpa DSN", async () => {
  const server = await readFile(new URL("../src/instrumentation.ts", import.meta.url), "utf8");
  const client = await readFile(
    new URL("../src/instrumentation-client.ts", import.meta.url),
    "utf8"
  );

  // Guard paling penting: kalau DSN kosong, Sentry.init() tidak boleh
  // dipanggil. Tanpa guard, aplikasi tetap jalan tapi mengirim event ke
  // project orang lain setiap kali ada galat di development.
  assert.match(
    server,
    /const dsn = process\.env\.SENTRY_DSN;\s*\n\s*if \(!dsn\) return;/,
    "src/instrumentation.ts harus keluar lebih awal kalau SENTRY_DSN kosong"
  );
  assert.match(
    client,
    /const dsn = process\.env\.NEXT_PUBLIC_SENTRY_DSN;\s*\n\s*\n?\s*if \(dsn\)/,
    "src/instrumentation-client.ts hanya boleh memanggil Sentry.init() di dalam blok if (dsn)"
  );
});

test("Sentry tidak ikut menentukan status readiness", async () => {
  const health = await readFile(new URL("../src/lib/health.ts", import.meta.url), "utf8");
  const route = await readFile(
    new URL("../src/app/api/health/ready/route.ts", import.meta.url),
    "utf8"
  );

  // /ready adalah target health check Coolify. Kalau Sentry ikut di dalamnya,
  // satu konfrasi Sentry yang salah akan membuat container ditandai
  // unhealthy dan deploy dianggap gagal padahal aplikasinya jalan.
  assert.equal(/sentry/i.test(health), false, "src/lib/health.ts tidak boleh memeriksa Sentry");
  assert.equal(
    /sentry/i.test(route),
    false,
    "route /api/health/ready tidak boleh melaporkan status Sentry"
  );
});

// --- Sentry: data pelanggan tidak boleh keluar --------------------------------

test("beforeSend server menyaring kode tiket, body, dan kredensial", async () => {
  const server = await readFile(new URL("../src/instrumentation.ts", import.meta.url), "utf8");

  // Kode tiket di query string adalah yang membuat halaman lacak bisa dibuka
  // tanpa login. Kalau bocor ke Sentry, siapa pun yang punya akses dashboard
  // bisa menebak kode customer's.
  assert.match(server, /"ticket"/, "filter kode tiket di query string");

  // Body request memuat nama, telepon, IMEI, dan kata sandi lewat Server
  // Action. Nilainya tidak pernah boleh ikut terekam.
  assert.match(
    server,
    /delete request\.data/,
    "body request harus dihapus dari event Sentry"
  );
  assert.match(
    server,
    /delete request\.cookies/,
    "cookie harus dihapus dari event Sentry"
  );

  for (const header of ["authorization", "cookie", "set-cookie", "x-api-key"]) {
    assert.match(
      server,
      new RegExp(header),
      `header ${header} tidak boleh dikirim ke Sentry`
    );
  }
});

test("Sentry tidak merekam sesi di luar kondisi galat", async () => {
  const client = await readFile(
    new URL("../src/instrumentation-client.ts", import.meta.url),
    "utf8"
  );

  // At Cell melayani pengunjung etalase yang luas. Merekam semua sesi akan
  // menyimpan navigasi orang yang tidak punya kaitan dengan operasional
  // toko, tanpa alasan bisnis untuk itu.
  assert.match(
    client,
    /replaysSessionSampleRate:\s*0/,
    "replaysSessionSampleRate harus 0: rekam hanya saat ada galat"
  );
  assert.match(
    client,
    /tracesSampleRate:\s*0/,
    "tracesSampleRate harus 0: distributed tracing tidak dibutuhkan website toko"
  );
});

test("event development tidak dikirim ke Sentry production", async () => {
  const client = await readFile(
    new URL("../src/instrumentation-client.ts", import.meta.url),
    "utf8"
  );

  // Tanpa guard ini, satu kesalahan saat menguji perubahan tampilan akan
  // tercampur ke dashboard production dan membuat nomor error tidak
  // dipercaya.
  assert.match(
    client,
    /if \(process\.env\.NODE_ENV\s*!==\s*"production"\)\s*return null;/,
    "beforeSend client harus membuang event saat NODE_ENV bukan production"
  );
});

// --- Sentry: dokumentasi dan env ---------------------------------------------

test(".env.example menyebut semua variabel Sentry yang dibaca kode", async () => {
  const contoh = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  for (const kunci of [
    "NEXT_PUBLIC_SENTRY_DSN",
    "SENTRY_DSN",
    "NEXT_PUBLIC_COMMIT_SHA",
    "SENTRY_AUTH_TOKEN",
  ]) {
    assert.ok(
      contoh.includes(kunci),
      `.env.example tidak menyebut ${kunci}.-docs/README.md menjelaskan opsinya, tapi `
        + "variabel yang tidak ada di .env.example tidak akan pernah diisi."
    );
  }
});

test("tidak ada nilai Sentry yang ikut ter-commit", async () => {
  // DSN sendiri bukan rahasia dan boleh ada di .env.example, tapi nilai yang
  // diberikan user untuk project ini hanya boleh hidup di file gitignored.
  const contoh = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.equal(
    /sntryu_[a-f0-9]{16,}/.test(contoh),
    false,
    ".env.example memuat DSN Sentry nyata. Hanya nama variabel yang boleh ada di sana."
  );
});

test("snapshot ditolak kalau angkanya tidak masuk akal", async () => {
  // Cabang validasi di getSnapshotUlasan harus benar-benar bisa gagal. Kalau
  // tidak, satu ketik nol di reviews-section akan tampil ke semua pengunjung
  // tanpa galat, dan structured data ikut memancarkan angka yang salah.
  const sumber = await readFile(
    new URL("../src/lib/ulasan-manual.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    sumber,
    /SNAPSHOT\.rating < 1 \|\| SNAPSHOT\.rating > 5/,
    "rating snapshot harus diperiksa 1..5 sebelum dilayani"
  );
  assert.match(
    sumber,
    /Number\.isInteger\(SNAPSHOT\.count\)/,
    "count snapshot harus bilangan bulat sebelum dilayani"
  );
  assert.match(
    sumber,
    /SNAPSHOT\.count < 1/,
    "count nol tidak boleh dilayani: ReviewsSection menulis 'Berdasarkan 0 Ulasan'"
  );
  assert.match(
    sumber,
    /if \(umurHari < 0\)/,
    "tanggal penyalian di masa depan harus ditolak, bukan lolos karena umur negatif"
  );
});

test("batas umur snapshot dijaga di rentang yang masuk akal", async () => {
  // Batas 180 hari adalah satu-satunya penjaga antara angka lama dan angka
  // yang dipancarkan ke Google. Satu edit yang menaikkannya jadi 3650
  // mematikan seluruh mekanisme tanpa apa pun yang gagal, jadi rentangnya
  // diuji di sini.
  const { SNAPSHOT_MAKS_UMUR_HARI } = await import("../src/lib/ulasan-manual.ts");

  assert.ok(
    SNAPSHOT_MAKS_UMUR_HARI >= 30 && SNAPSHOT_MAKS_UMUR_HARI <= 365,
    `SNAPSHOT_MAKS_UMUR_HARI=${SNAPSHOT_MAKS_UMUR_HARI} di luar 30..365. Batas ini `
      + "yang mencegah angka basi tetap dipancarkan. Batas yang terlalu besar "
      + "sama saja dengan tidak ada batas."
  );
});

test("snapshot yang sedang dipakai tidak boleh basi pada hari ini", async () => {
  // Test yang di atas memakai tanggal sintetis, jadi tidak pernah gagal ketika
  // waktu nyata melewati batas. Yang ini memakai waktu sekarang: begitu
  // snapshot lewat 180 hari, test ini yang akan memberi tahu, bukan halaman.
  const { DIAMBIL_PADA, SNAPSHOT_MAKS_UMUR_HARI } = await import("../src/lib/ulasan-manual.ts");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(DIAMBIL_PADA)) {
    // Snapshot belum diisi, jadi tidak ada yang bisa basi.
    return;
  }

  const umurHari = Math.floor(
    (Date.now() - new Date(`${DIAMBIL_PADA}T00:00:00Z`).getTime()) / 86_400_000
  );
  assert.ok(
    umurHari <= SNAPSHOT_MAKS_UMUR_HARI,
    `Salinan ulasan sudah ${umurHari} hari, melewati batas ${SNAPSHOT_MAKS_UMUR_HARI} hari. `
      + `Salin ulang dari Google Maps dan naikkan DIAMBIL_PADA di src/lib/ulasan-manual.ts.`
  );
});
