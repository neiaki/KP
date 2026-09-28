import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getGoogleReviews } from "../src/lib/reviews.ts";

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

test("tanpa GOOGLE_PLACES_API_KEY, getGoogleReviews mengembalikan null", async () => {
  // Simpan dan kembalikan nilai aslinya supaya test ini tidak merusak
  // environment Developing yang kebetulan punya key.
  const sebelumnya = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  try {
    // null, bukan object dengan rating 0: null membuat ReviewsSection memakai
    // fallback "Pernah belanja di sini?" dan buildAggregateRating membuang
    // properti rating dari structured data. Object kosong akan memancarkan
    // LocalBusiness tanpa rating tapi tetap dengan reviews: [].
    assert.equal(await getGoogleReviews(), null);
  } finally {
    if (sebelumnya === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = sebelumnya;
  }
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
