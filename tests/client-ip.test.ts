import test from "node:test";
import assert from "node:assert/strict";
import { pickClientIp, UNKNOWN_CLIENT_ID, type HeaderReader } from "../src/lib/client-ip.ts";

/*
 * Pemilih IP klien dijaga karena versi sebelumnya mengambil entri PERTAMA
 * X-Forwarded-For, dan entri pertama justru yang paling mudah dikendalikan
 * penyerang.
 *
 * Traefik tidak menimpa X-Forwarded-For, tapi menambahkan IP aslinya di
 * belakang nilai yang sudah ada (pkg/proxy/httputil/proxy.go). Jadi permintaan
 * dari penyerang yang mengirim "X-Forwarded-For: 1.2.3.4" sampai ke aplikasi
 * sebagai "1.2.3.4, ip-asli". Dengan mengambil entri pertama, setiap
 * percobaan login memakai kunci baru dan seluruh throttle luput, padahal ada
 * bucket per pasangan IP dan username maupun bucket per IP.
 *
 * Modul ini murni tanpa import next/headers supaya bisa diuji di sini.
 */

/** Pembangun HeaderReader dari objek biasa. */
function h(pasangan: Record<string, string>): HeaderReader {
  return {
    get(name: string) {
      const kunci = Object.keys(pasangan).find(
        (k) => k.toLowerCase() === name.toLowerCase()
      );
      return kunci ? pasangan[kunci] : null;
    },
  };
}

test("X-Forwarded-For yang dipalsukan tidak bisa-ddipakai-meloloskan-batas", () => {
  const a = pickClientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }));
  const b = pickClientIp(h({ "x-forwarded-for": "8.8.8.8, 203.0.113.8" }));
  assert.equal(a, "203.0.113.7", "harus mengambil IP asli, bukan yang dipalsukan");
  assert.equal(b, "203.0.113.8");
  assert.notEqual(a, b, "dua IP asli berbeda harus tetap berbeda");
});

test("entri pertama tidak pernah dipilih saat ada entri lain", () => {
  // Rantai proxy yang wajar: klien, lalu hop di dalamnya.
  assert.equal(
    pickClientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    "10.0.0.1"
  );
});

test("header tunggal tanpa koma dipakai utuh", () => {
  // Konfigurasi Traefik bawaan membersihkan header lalu mengisi satu IP saja.
  assert.equal(pickClientIp(h({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
});

test("segmen kosong diabaikan", () => {
  assert.equal(pickClientIp(h({ "x-forwarded-for": "203.0.113.7, " })), "203.0.113.7");
  assert.equal(pickClientIp(h({ "x-forwarded-for": " , 203.0.113.7" })), "203.0.113.7");
  assert.equal(pickClientIp(h({ "x-forwarded-for": ",," })), UNKNOWN_CLIENT_ID);
});

test("X-Real-Ip dipakai hanya saat X-Forwarded-For tidak berguna", () => {
  assert.equal(
    pickClientIp(h({ "x-forwarded-for": "bukan-ip, 203.0.113.7" })),
    "203.0.113.7",
    "entri terakhir yang bukan IP harus jatuh ke header berikutnya"
  );
  assert.equal(
    pickClientIp(h({ "x-real-ip": "203.0.113.9" })),
    "203.0.113.9",
    "tanpa X-Forwarded-For, X-Real-Ip dipakai"
  );
  assert.equal(
    pickClientIp(h({ "x-forwarded-for": "sampah", "x-real-ip": "203.0.113.9" })),
    "203.0.113.9"
  );
});

test("nilai yang bukan IP ditolak dan tidak jadi kunci baru", () => {
  // Kalau string bebas diterima, penyerang bisa memakai header unik tiap
  // permintaan dan mendapat kuota tanpa batas. Jadi nilai ganjil harus
  // berakhir di kunci tunggal yang dipakai bersama.
  for (const buruk of [
    "abc",
    "1.2.3.4.5.6",
    "../../etc/passwd",
    "1.2.3.4,MorArbitrary",
    "; rm -rf /",
  ]) {
    assert.equal(
      pickClientIp(h({ "x-forwarded-for": buruk })),
      UNKNOWN_CLIENT_ID,
      `nilai ini harus ditolak: ${buruk}`
    );
  }
});

test("tanpa header sama sekali jatuh ke kunci tunggal", () => {
  assert.equal(pickClientIp(h({})), UNKNOWN_CLIENT_ID);
  assert.equal(pickClientIp(h({ "x-forwarded-for": "" })), UNKNOWN_CLIENT_ID);
  assert.equal(pickClientIp(h({ "x-real-ip": "" })), UNKNOWN_CLIENT_ID);
});

test("IPv6 diterima", () => {
  assert.equal(pickClientIp(h({ "x-forwarded-for": "2001:db8::1" })), "2001:db8::1");
  assert.equal(
    pickClientIp(h({ "x-forwarded-for": "spoof, 2001:db8::1" })),
    "2001:db8::1"
  );
  assert.equal(
    pickClientIp(h({ "x-forwarded-for": "::ffff:203.0.113.7" })),
    "::ffff:203.0.113.7"
  );
});

test("semua permintaan tanpa IP berbagi satu kunci yang sama", () => {
  // Dua request tanpa header proxy harus berdua pada bucket yang sama, supaya
  // kuota bersama tetap berlaku untuk kasus itu.
  assert.equal(
    pickClientIp(h({})),
    pickClientIp(h({ "x-real-ip": "   " })),
    "kunci tunggal adalah yang menjaga batas tetap ketat"
  );
});
