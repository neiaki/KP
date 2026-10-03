import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const restoreScript = await readFile(new URL("../scripts/restore-postgres.sh", import.meta.url), "utf8");

/*
 * Test di sini hanya menyisakan hal yang urutan dan destruktivitasnya sudah
 * pernah rusak sungguhan. Pemeriksaan isi dump, kode keluar, dan isi target
 * diuji secara perilaku di tests/auth-backup-restore.test.ts, di mana
 * pg_restore dan psql dijalankan sebagai tiruan.
 */

test("stub auth.users dibuat sebelum pg_restore, bukan sesudahnya", () => {
  // Pada jalur dump lama, public.profiles punya FK ke auth.users(id) sedangkan
  // dump tidak memuat tabel itu. Restore ke target yang auth.users-nya kosong
  // selalu berhenti di profiles_id_fkey, dan --single-transaction membuat
  // seluruh pekerjaan dibatalkan. Stub harus ada lebih dulu, kalau tidak
  // fungsinya tidak ada gunanya sama sekali.
  //
  // Yang dicari adalah posisinya saat dipanggil, bukan posisinya saat
  // didefinisikan. Nama seed_auth_stubs muncul dua kali di skrip: sekali
  // di baris definisi fungsi, sekali lagi sebagai pemanggilan. indexOf
  // polos selalu kena yang definisi, sehingga urutan yang diuji jadi
  // tidak bermakna dan test lulus walau pemanggilannya dipindahkan ke
  // belakang pg_restore. Itu sudah dicoba dan memang terjadi.
  const pemanggilan = restoreScript.search(/^\s*seed_auth_stubs\s*$/m);
  const definisi = restoreScript.search(/^seed_auth_stubs\(\)\s*\{/m);
  const restore = restoreScript.search(/^pg_restore \\\s*$/m);

  assert.ok(definisi > -1, "fungsi seed_auth_stubs harus ada di restore script");
  assert.ok(pemanggilan > -1, "seed_auth_stubs harus dipanggil, bukan hanya didefinisikan");
  assert.ok(restore > -1, "pemanggilan pg_restore harus ada");
  assert.notEqual(
    pemanggilan,
    definisi,
    "yang dibandingkan harus posisi pemanggilan, bukan posisi definisi"
  );
  assert.ok(
    pemanggilan < restore,
    "seed_auth_stubs harus dijalankan sebelum pg_restore --clean"
  );
});

test("stub auth.users tidak menimpa akun yang sudah ada", () => {
  // Target restore kadang sudah punya Auth asli, misalnya setelah operator
  // mengimpor backup Auth Supabase ke sana. Menimpa akun sungguhan dengan
  // stub akan membuat target tidak bisa dipakai lagi.
  assert.match(restoreScript, /on conflict \(id\) do nothing/);
  // Stub harus jelas ditandai supaya bisa dibedakan dari akun asli, dan
  // pemeriksaan setelah restore memakai penanda itu.
  assert.match(restoreScript, /atcell_restore_stub/);
  assert.match(
    restoreScript,
    /coalesce\(raw_user_meta_data->>'atcell_restore_stub',''\) <> 'true'/
  );
});

test("restore menolak jalan kalau auth.users tidak ada di target", () => {
  // Kegagalan diam-diam di sini akan berupa restore yang separuh jalan.
  assert.match(restoreScript, /to_regclass\('auth\.users'\)/);
  assert.match(restoreScript, /restore-target-bootstrap\.sql/);
});
