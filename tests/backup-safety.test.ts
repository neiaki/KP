import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backupScript = await readFile(new URL("../scripts/backup-postgres.sh", import.meta.url), "utf8");
const restoreScript = await readFile(new URL("../scripts/restore-postgres.sh", import.meta.url), "utf8");

test("backup script tidak mencetak credential dan membuat checksum", () => {
  assert.match(backupScript, /pg_dump/);
  assert.match(backupScript, /--schema=public/);
  assert.match(backupScript, /--schema=private/);
  assert.match(backupScript, /sha256sum/);
  assert.doesNotMatch(backupScript, /echo.*SOURCE_DATABASE_URL|printf.*SOURCE_DATABASE_URL/);
});

test("restore script memiliki guard eksplisit dan single-job", () => {
  assert.match(restoreScript, /ALLOW_RESTORE/);
  assert.match(restoreScript, /ALLOW_RESTORE.*YES/);
  assert.match(restoreScript, /--jobs=1/);
  assert.match(restoreScript, /--single-transaction/);
});

test("stub auth.users dibuat sebelum pg_restore, bukan sesudahnya", () => {
  // public.profiles punya FK ke auth.users(id), sedangkan dump hanya memuat
  // schema public dan private. Restore ke target yang auth.users-nya kosong
  // selalu berhenti di profiles_id_fkey, dan --single-transaction membuat
  // seluruh pekerjaan dibatalkan. Stub harus ada lebih dulu, kalau tidak
  // fungsinya tidak ada gunanya sama sekali.
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
  // Target restore kadang sudah punya Auth asli, misalnya saat restore
  // dijalankan dua kali atau target-nya dipakai untuk drill. Menimpa akun
  // sungguhan dengan stub akan membikin target tidak bisa dipakai lagi.
  assert.match(restoreScript, /on conflict \(id\) do nothing/);
  // Stub harus jelas ditandai supaya bisa dibedakan dari akun asli.
  assert.match(restoreScript, /atcell_restore_stub/);
  // Dan hasilnya harus diberi tahu, supaya tidak ada yang memakai target
  // sebelum backup Auth Supabase benar-benar diterapkan.
  assert.match(restoreScript, /hanya placeholder/i);
});

test("restore menolak jalan kalau auth.users tidak ada di target", () => {
  // Kegagalan diam-diam di sini akan berupa restore yang separuh jalan.
  assert.match(restoreScript, /to_regclass\('auth\.users'\)/);
  assert.match(restoreScript, /restore-target-bootstrap\.sql/);
});

test("backup script memutar dump lama dan menolak KEEP_DAYS tidak valid", () => {
  // Tanpa rotasi direktori backup tumbuh sampai disk penuh, dan script ini
  // biasanya satu-satunya cadangan dari data produksi.
  assert.match(backupScript, /KEEP_DAYS/);
  assert.match(backupScript, /mtime/);
  // Hanya pola milik script sendiri yang boleh dihapus.
  assert.match(backupScript, /-name 'atcell-\*\.dump'/);
  // Nilai salah harus berhenti sebelum pg_dump, bukan diam-diam lanjut.
  assert.match(backupScript, /KEEP_DAYS harus bilangan bulat non-negatif/);
});
