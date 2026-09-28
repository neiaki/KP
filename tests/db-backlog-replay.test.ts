import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * 0001_atcell_schema.sql wajib aman di-replay.
 *
 * Insiden yang jadi pemicu test ini: memutar ulang 0001 di dalam
 * `begin; ... rollback;` mengubah ACL public.get_my_role() dan
 * public.is_staff() dari {postgres, service_role} menjadi
 * {postgres, service_role, anon, authenticated}. Penyebabnya grant
 * `to anon, authenticated, service_role` yang dulu ada di 0001, yang lalu
 * dicabut oleh 0002 dan dikunci 0003. Efeknya bukan kosmetik: kedua helper
 * itu SECURITY DEFINER, jadi browser role yang boleh memanggilnya bisa
 * membuat policy RLS dievaluasi dengan hak pemilik fungsi.
 *
 * Test ini STATIS, bukan replay langsung ke database, dan itu pilihan sadar.
 * Alasannya tiga:
 *   1. Uji replay hidup butuh DATABASE_URL ke production, jadi tidak bisa
 *      menjadi penjaga di `npm test` tanpa database, dan tidak boleh
 *      menyalakan perubahan ACL di production hanya demi test.
 *   2. Yang diuji adalah sifat berkas SQL, bukan keadaan database. Kalau
 *      grant itu kembali ke 0001, defect-nya sudah ada sebelum anybody
 *      menjalankan replay apa pun; mendeteksinya lebih awal persis sama
 *      nilainya.
 *   3. Bukti executor-nya sudah ada: `begin; ... rollback;` di dalam
 *      `docs/DEPLOYMENT-REDUNDANCY.md` di langkah idempotensi. Test ini
 *      menjaga supaya langkah itu tidak diam-diam berubah makna.
 *
 * Jadi ini bukan test yang lebih lemah dari uji live: ia mengunci sumbernya,
 * sedangkan uji live mengunci hasil. Keduanya wajib ada karena filing yang
 * salah bisa lolos dari sisi yang lain.
 */

const repoFile = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const schema0001 = readFileSync(repoFile("../supabase/migrations/0001_atcell_schema.sql"), "utf8");
const lock0003 = readFileSync(repoFile("../supabase/migrations/0003_lock_legacy_helpers.sql"), "utf8");

/** Dua helper SECURITY DEFINER yang tidak boleh diekspos ke browser role. */
const LEGACY_HELPERS = ["get_my_role", "is_staff"] as const;

test("0001 tidak memberi EXECUTE helper legacy ke anon atau authenticated", () => {
  for (const fn of LEGACY_HELPERS) {
    // Pola sengaja longgar terhadap nama role dan urutan baris, supaya
    // variations seperti `to authenticated, anon` atau `to PUBLIC` juga
    // tertangkap. Yang di_ASSERT adalah role browser-nya, bukan formatnya.
    const grant = new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*to\\s+([^;]+);`,
      "gi"
    );
    for (const [, roles] of schema0001.matchAll(grant)) {
      const recipients = roles
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
      for (const role of recipients) {
        assert.ok(
          !["anon", "authenticated", "public"].includes(role),
          `0001_atcell_schema.sql memberi EXECUTE public.${fn}() ke role browser ` +
            `"${role}". Itu membuka privilege escalation lewat Data API. ` +
            `Status akhir yang benar dibuat 0002 lalu dikunci 0003.`
        );
      }
    }
  }
});

test("0001 tetap mencabut default EXECUTE PUBLIC dari helper legacy", () => {
  // Revoke harus tetap ada. Menghapus grant tanpa revoke berarti helper
  // kembali ke default EXECUTE PUBLIC milik PostgreSQL, yaitu lebih lebar
  // dari sebelum grant dihapus.
  for (const fn of LEGACY_HELPERS) {
    assert.match(
      schema0001,
      new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\(\\)\\s*from\\s+public\\s*;`, "i"),
      `0001 harus tetap revoke EXECUTE public.${fn}() dari public`
    );
  }
});

test("0003 yang mengunci helper legacy, dan tetap mengunci setelah perubahan 0001", () => {
  // Penutup dari 0001. Kalau file ini hilang, grant di 0001 tidak lagi
  // punya pasangan yang mencabutnya.
  for (const fn of LEGACY_HELPERS) {
    assert.match(
      lock0003,
      new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\(\\)\\s*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`, "i"),
      `0003_lock_legacy_helpers.sql harus mencabut EXECUTE public.${fn}() dari public, anon, dan authenticated`
    );
    assert.match(
      lock0003,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\(\\)\\s*to\\s+service_role\\s*;`, "i"),
      `0003_lock_legacy_helpers.sql harus mengembalikan EXECUTE public.${fn}() ke service_role`
    );
  }
});

