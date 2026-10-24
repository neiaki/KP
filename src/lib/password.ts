/*
 * Pembuat kata sandi sekali pakai untuk akun pelanggan baru.
 *
 * Math.random() tidak cukup untuk kredensial: nilainya bisa diprediksi dari
 * beberapa hasil sebelumnya, dan kata sandi ini adalah satu-satunya cara
 * pelanggan masuk sebelum sempat menggantinya. crypto.getRandomValues()
 * tersedia di browser dan di Node, jadi modul ini tetap murni tanpa impor.
 *
 * Modulo bias dihindari dengan rejection sampling: hanya byte di bawah
 * kelipatan terbesar dari panjang alfabet yang dipakai. Tanpa itu karakter
 * awal alfabet muncul lebih sering daripada karakter akhir.
 */

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export function generatePassword(length = 16): string {
  if (!Number.isInteger(length) || length < 8 || length > 128) {
    throw new Error("Panjang kata sandi harus 8 sampai 128 karakter.");
  }

  const batas = Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  const hasil: string[] = [];
  const buffer = new Uint8Array(length * 2);

  while (hasil.length < length) {
    globalThis.crypto.getRandomValues(buffer);
    for (const nilai of buffer) {
      if (nilai >= batas) continue;
      hasil.push(PASSWORD_ALPHABET[nilai % PASSWORD_ALPHABET.length]!);
      if (hasil.length === length) break;
    }
  }

  return hasil.join("");
}
