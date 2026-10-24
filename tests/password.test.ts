import test from "node:test";
import assert from "node:assert/strict";
import { generatePassword } from "../src/lib/password.ts";

/*
 * Kata sandi ini hanya ditampilkan sekali saat akun pelanggan dibuat, jadi
 * kualitasnya tidak boleh bergantung pada Math.random(). Test di sini menjaga
 * panjang, alfabet, dan sifat acak dasar; ia tidak bisa membuktikan entropi
 * secara statistik, tetapi menangkap regresi ke generator lama.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

test("kata sandi acak memakai panjang dan alfabet yang dijanjikan", () => {
  const password = generatePassword();
  assert.equal(password.length, 16);
  for (const karakter of password) {
    assert.ok(ALPHABET.includes(karakter), `karakter tak dikenal: ${karakter}`);
  }
  assert.equal(generatePassword(24).length, 24);
});

test("dua panggilan tidak menghasilkan kata sandi yang sama", () => {
  const hasil = new Set(Array.from({ length: 20 }, () => generatePassword()));
  assert.equal(hasil.size, 20);
});

test("panjang di luar batas ditolak, bukan dipotong diam-diam", () => {
  assert.throws(() => generatePassword(7), /8 sampai 128/);
  assert.throws(() => generatePassword(129), /8 sampai 128/);
  assert.throws(() => generatePassword(8.5), /8 sampai 128/);
});
