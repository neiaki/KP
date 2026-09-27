import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  consumeRateLimit,
  refundRateLimit,
  resetRateLimits,
} from "../src/lib/rate-limit.ts";

const serviceAction = await readFile(
  new URL("../src/lib/actions/service.ts", import.meta.url),
  "utf8"
);
const publicTracking = serviceAction.slice(serviceAction.indexOf("export async function trackTicketPublic"));

test("tracking publik tidak mengembalikan PII, biaya, atau foto", () => {
  assert.doesNotMatch(publicTracking, /customerName: serviceTickets\.customerName/);
  assert.doesNotMatch(publicTracking, /issueNotes: serviceTickets\.issueNotes/);
  assert.doesNotMatch(publicTracking, /photoUrls: serviceTickets\.photoUrls/);
  assert.doesNotMatch(publicTracking, /sparepartFee: serviceTickets\.sparepartFee/);
  assert.doesNotMatch(publicTracking, /totalFee: serviceTickets\.totalFee/);
  assert.match(publicTracking, /imei_or_sn/);
  assert.match(publicTracking, /repair_status/);
});

test("tracking publik membatasi kuota per IP, per kode resi, dan global tebakan", () => {
  // Guard harus jalan sebelum query database, kalau tidak penjebolan tetap
  // menyentuh database. Bucket global versi lama (200/menit, kunci literal
  // "track-global") sudah diganti: dia bisa dipakai untuk mematikan halaman
  // lacak pelanggan hanya dengan menguras 200 request.
  assert.match(publicTracking, /consumeRateLimit/);
  assert.match(publicTracking, /track-ip:/);
  assert.match(publicTracking, /`track-code:\$\{parsed\.data\}`/);
  assert.match(publicTracking, /TRACKING_PER_IP_LIMIT/);
  assert.match(publicTracking, /TRACKING_PER_CODE_LIMIT/);
  assert.match(publicTracking, /TRACKING_GLOBAL_GUESS_LIMIT/);
  assert.doesNotMatch(publicTracking, /"track-global"/);
  assert.doesNotMatch(publicTracking, /TRACKING_GLOBAL_LIMIT/);

  const rateLimitIndex = publicTracking.indexOf("consumeRateLimit");
  const queryIndex = publicTracking.indexOf(".from(serviceTickets)");
  assert.ok(rateLimitIndex > -1, "harus memanggil consumeRateLimit");
  assert.ok(queryIndex > -1, "harus tetap melakukan query");
  assert.ok(rateLimitIndex < queryIndex, "rate limit harus dicek sebelum query database");
});

test("kode resi yang diketemu dikembalikan kuotanya, jadi pelanggan tidak terkunci", () => {
  // Lapisan global dipotong sebelum query lalu dikembalikan saat hasil
  // ketemu. Kalau refund hilang, bucket global menghitung permintaan sah
  // juga dan halaman lacak mati hanya karena orang banyak memanggil kodenya.
  const missAt = publicTracking.indexOf('if (!t) return fail("Tiket tidak ditemukan');
  const refundAt = publicTracking.indexOf("refundRateLimit(TRACKING_GLOBAL_GUESS_KEY)");
  assert.ok(missAt > -1, "cabang kode tidak ditemukan harus ada");
  assert.ok(refundAt > -1, "harus mengembalikan kuota global");
  assert.ok(
    refundAt > missAt,
    "refund harus setelah cabang miss, kalau tidak kuota tebakan bocor"
  );
});

// Batas yang dipakai src/lib/actions/service.ts. Nilainya ditulis di sini
// supaya test ini menguji perilaku, bukan menyalin implementasi.
const PER_CODE = 10;
const GLOBAL_GUESS = 60;
const GUESS_KEY = "track-global-guess";
const kode = (suffix: string) => `SRV-20260912-${suffix}`;

test("satu kode resi tidak bisa dielabui dari banyak alamat", () => {
  // Lapisan per IP sudah mengikat address, jadi penyerang dengan banyak IP
  // selalu dapat bucket baru di situ. Lapisan per kode tidak memakai alamat.
  resetRateLimits();
  let allowed = 0;
  for (let i = 0; i < PER_CODE * 5; i++) {
    if (!consumeRateLimit(`track-code:${kode("7K4M2QX9")}`, PER_CODE, 60_000).allowed) break;
    allowed++;
  }
  assert.equal(allowed, PER_CODE, "lapisan per kode harus tetap mengikat meski IP berganti");
});

test("menyapu banyak kode berbeda tetap tertahan plafon global", () => {
  // Per kode saja tidak cukup: penyerang menyapu kode berbeda tiap giliran
  // dan selalu dapat bucket baru. Plafon global inilah yang menutupnya.
  resetRateLimits();
  let allowed = 0;
  for (let i = 0; i < GLOBAL_GUESS * 3; i++) {
    if (!consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000).allowed) break;
    allowed++;
  }
  assert.equal(allowed, GLOBAL_GUESS, "plafon tebakan global harus mengikat lintas kode berbeda");
});

test("pelanggan dengan kode valid tidak pernah ikut kehabisan kuota", () => {
  // Skenario yang jadi alasan refund ada: penyerang menguras plafon global
  // dengan kode-kode salah, sementara pelanggan mengetik kodenya sendiri.
  // Kode yang ketemu selalu dikembalikan, jadi biaya bersihnya nol.
  resetRateLimits();
  for (let i = 0; i < GLOBAL_GUESS; i++) {
    consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000); // tebakan salah penyerang
  }
  assert.equal(
    consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000).allowed,
    false,
    "plafon harus habis setelah tebakan salah sebanyak batasnya"
  );

  // Sekarang pelanggan datang dengan kode yang benar.
  const konsumen = consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000);
  assert.equal(konsumen.allowed, false, "permintaan pertama memang sudah lewat batas");
  // Pemanggil berikutnya mengembalikan kuota begitu hasil query ketemu.
  refundRateLimit(GUESS_KEY);
  assert.ok(
    consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000).allowed,
    "setelah refund, pelanggan berikutnya harus bisa lolos"
  );
});

test("ribuan permintaan kode valid tidak pernah membebani kuota global", () => {
  // Pelan: setiap permintaan yang berhasil langsung dikembalikan, jadi bucket
  // global tidak pernah naik meski dipakai terus-menerus.
  resetRateLimits();
  for (let i = 0; i < 5_000; i++) {
    const v = consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000);
    assert.equal(v.allowed, true, `permintaan sah ke-${i + 1} diblokir`);
    refundRateLimit(GUESS_KEY);
  }
  assert.equal(
    consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000).remaining,
    GLOBAL_GUESS - 1,
    "bucket global harus nyaris utuh setelah 5.000 permintaan sah"
  );
});

test("refund tidak bisa membuat kuota naik atau menjadi negatif", () => {
  resetRateLimits();
  refundRateLimit("kunci-yang-tidak-ada");
  assert.equal(consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000).remaining, GLOBAL_GUESS - 1);
  // Refund berulang tanpa pemakaian sebelumnya tidak menambah apa pun.
  refundRateLimit(GUESS_KEY);
  refundRateLimit(GUESS_KEY);
  refundRateLimit(GUESS_KEY);
  assert.equal(
    consumeRateLimit(GUESS_KEY, GLOBAL_GUESS, 60_000).remaining,
    GLOBAL_GUESS - 1,
    "refund berlebihan tidak boleh menambah kuota"
  );
});
