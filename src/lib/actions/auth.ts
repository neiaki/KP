"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { count, desc, eq } from "drizzle-orm";
import { getDb, dbBatch } from "@/db/client";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  customerSignUpSchema,
  phoneSchema,
  staffInviteSchema,
  staffRoleSchema,
  usernameSchema,
  wouldLeaveNoAdmin,
} from "@/lib/validations";
import { pickClientIp } from "@/lib/client-ip";
import { consumeCredentialAttempt } from "@/lib/rate-limit";
import type { UserRole } from "@/types";
import {
  backendOffline,
  fail,
  getCurrentProfile,
  ok,
  requireRole,
  type ActionResult,
} from "./_helpers";

// Username yang sama seperti yang dihitung trigger handle_new_user(): huruf
// kecil dari bagian email sebelum @, dibersihkan dari karakter yang tidak
// diizinkan, lalu dipotong 32 karakter.
function usernameFromEmail(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
}

/**
 * Pembaca IP untuk menjadi kunci throttle kredensial. Logikanya ada di
 * src/lib/client-ip.ts supaya auth dan lacak resi tidak punya dua versi
 * pembacaan IP yang bisa berbeda. Kalau headernya hilang, semua permintaan
 * memakai satu kunci, yang membuat batas lebih ketat dan tidak bisa dipakai
 * untuk melewati limit.
 */
async function getCredentialClientId(): Promise<string> {
  return pickClientIp(await headers());
}

/**
 * Potong kuota percobaan kredensial. Pesannya sengaja TIDAK memakai
 * username, dan pemanggilannya selalu sebelum mencari profil, supaya
 * "terlalu banyak percobaan" tidak berubah jadi cara menebak username mana
 * yang terdaftar. Lihat consumeCredentialAttempt di src/lib/rate-limit.ts.
 */
async function throttleCredential(identifier: string): Promise<string | null> {
  const verdict = consumeCredentialAttempt(await getCredentialClientId(), identifier);
  if (verdict.allowed) return null;
  return `Terlalu banyak percobaan. Coba lagi dalam ${verdict.retryAfterSeconds} detik.`;
}

/**
 * Login portal staf/pelanggan memakai username, bukan email.
 *
 * Supabase Auth hanya menerima email di signInWithPassword, jadi username
 * dipetakan ke email lewat service_role (bypass RLS, karena policies hanya
 * mengizinkan user membaca baris profil sendiri). Pesan gagal sengaja sama
 * untuk "username tidak ada" dan "password salah" supaya username tidak
 * bisa dienumerasi. Throttle dipotong lebih dulu lagi, di sebelum pencarian
 * profil, supaya pesan "terlalu banyak percobaan" juga tidak jadi oracle.
 */
export async function signInWithUsername(
  username: string,
  password: string
): Promise<ActionResult<{ role: UserRole; redirectTo: string }>> {
  if (!isSupabaseConfigured()) return backendOffline();
  if (!isSupabaseAdminConfigured()) {
    return fail(
      "SUPABASE_SERVICE_ROLE_KEY belum diisi, login pakai username tidak bisa dicocokkan."
    );
  }
  // Throttle dipotong sebelum validasi format dan sebelum query profil, jadi
  // setiap permintaan yang sampai ke sini memotong satu kuota, apa pun hasilnya.
  // Kuncinya IP + username, jadi penyerang hanya mengunci dirinya sendiri.
  const throttled = await throttleCredential(username);
  if (throttled) return fail(throttled);

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return fail("Username atau kata sandi tidak valid.");
  if (password.length < 8) return fail("Username atau kata sandi tidak valid.");

  const admin = createAdminClient();
  const { data: row, error: lookupError } = await admin
    .from("profiles")
    .select("email")
    .eq("username", parsed.data)
    .maybeSingle();
  if (lookupError) return fail("Masuk sedang tidak dapat diproses. Coba lagi sebentar.");
  if (!row?.email) return fail("Username atau kata sandi salah.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: row.email,
    password,
  });
  if (error) return fail("Username atau kata sandi salah.");
  const profile = await getCurrentProfile();
  if (!profile) return fail("Profil user tidak ditemukan di tabel profiles.");
  const redirectTo =
    profile.role === "admin"
      ? "/portal/dashboard"
      : profile.role === "sales"
        ? "/portal/pos"
        : profile.role === "technician"
          ? "/portal/service"
          : "/portal/account";
  revalidatePath("/portal", "layout");
  return ok({ role: profile.role, redirectTo });
}

/**
 * Pendaftaran mandiri khusus pelanggan (etalase/akun). Staf dibuat via
 * inviteStaff.
 *
 * Endpoint ini terbuka untuk publik, jadi kuotanya dipotong per IP + email
 * yang dikirim, sama seperti login. Kalau tidak, siapa pun bisa membuat
 * account palsu terus-menerus sampai kuota Supabase habis.
 */
export async function signUpCustomer(input: {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
}): Promise<ActionResult<{ userId: string }>> {
  if (!isSupabaseConfigured()) return backendOffline();
  const throttled = await throttleCredential(input.email);
  if (throttled) return fail(throttled);
  const parsed = customerSignUpSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data pendaftaran tidak valid.");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        phone_number: parsed.data.phoneNumber,
        // Email tetap identitas login Supabase, tapi portal memakai username.
        // Ini hanya petunjuk: trigger handle_new_user yang memutuskan kalau
        // username ini bentrok, lalu memakai fallback per-user.
        username: usernameFromEmail(parsed.data.email),
      },
    },
  });
  if (error || !data.user) return fail("Pendaftaran gagal. Periksa data dan coba lagi.");
  // Profil dibuat oleh trigger handle_new_user. Update profil dari client
  // tidak dilakukan di sini karena RLS sengaja tidak memberi hak update
  // profil sendiri; metadata Auth sudah membawa full_name awal.
  return ok({ userId: data.user.id });
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** Admin mengundang staf (sales/technician): buat user Auth + set peran. */
export async function inviteStaff(input: {
  fullName: string;
  email: string;
  username: string;
  password: string;
  phoneNumber: string;
  role: Exclude<UserRole, "customer">;
}): Promise<ActionResult<{ userId: string }>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = staffInviteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data staf tidak valid.");
  if (!isSupabaseAdminConfigured()) {
    return fail("SUPABASE_SERVICE_ROLE_KEY belum diisi, tidak bisa mengundang user.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.fullName,
      phone_number: parsed.data.phoneNumber,
      username: parsed.data.username,
    },
  });
  if (error || !data.user) return fail("Gagal membuat user. Periksa email dan coba lagi.");
  const { error: roleError } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone_number: parsed.data.phoneNumber,
      role: parsed.data.role,
      username: parsed.data.username,
      email: parsed.data.email,
    })
    .eq("id", data.user.id);
  if (roleError) return fail("User dibuat, tetapi peran belum berhasil disimpan. Coba lagi.");
  revalidatePath("/portal/staff");
  return ok({ userId: data.user.id });
}

/**
 * Pengguna yang sedang masuk mengisi nomor teleponnya sendiri.
 *
 * Sebelumnya tidak ada jalur sama sekali untuk mengisi phone_number: form
 * tambah staf menerima kolom itu, tapi tidak ada aksi maupun form untuk
 * mengubahnya setelah akun dibuat. Akibatnya semua profil hasil seed DAN semua
 * staf yang dibuat Admin tanpa nomor tetap kosong selamanya, dan halaman
 * portal/staff menampilkan "-" yang terbaca seperti bug bukan seperti data yang
 * belum ada.
 *
 * Id profil diambil dari sesi, bukan dari argumen, jadi aksi ini tidak punya
 * cara untuk menulis baris orang lain meski dipanggil langsung. Peran apa pun
 * boleh memanggilnya, termasuk pelanggan, karena nomor kontak adalah miliknya
 * sendiri. Kolomnya boleh dikosongkan lagi: staff lama yang sudah tidak ada di
 * toko lebih baik kosong daripada menampilkan nomor yang sudah tidak berlaku.
 */
export async function updateMyPhoneNumber(
  raw: string
): Promise<ActionResult<{ phoneNumber: string }>> {
  const guard = await requireRole(["admin", "sales", "technician", "customer"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = phoneSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Nomor telepon tidak valid.");
  }
  const db = getDb();
  if (!db) return backendOffline();
  const [updated] = await db
    .update(profiles)
    .set({ phoneNumber: parsed.data })
    .where(eq(profiles.id, guard.profile.id))
    .returning({ phoneNumber: profiles.phoneNumber });
  if (!updated) return fail("Profil tidak ditemukan.");
  // Halaman staf membaca phone_number milik orang lain, jadi ikut disegarkan
  // supaya nomor baru langsung terlihat di sana.
  revalidatePath("/portal/staff");
  revalidatePath("/portal/account");
  return ok({ phoneNumber: updated.phoneNumber });
}

/**
 * Jumlah baris profiles dengan role = 'admin' plus peran target yang
 * dimaksud, dibaca sekali sebelum menulis apa pun.
 *
 * Null berarti backend belum dikonfigurasi ATAU targetnya tidak ada, dan
 * pemanggil wajib berhenti di situ sebelum query update atau delete.
 */
async function cekSisaAdmin(
  userId: string
): Promise<{ adminCount: number; targetIsAdmin: boolean } | null> {
  const db = getDb();
  if (!db) return null;
  const [target, total] = await dbBatch([
    () =>
      db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1),
    () => db.select({ total: count() }).from(profiles).where(eq(profiles.role, "admin")),
  ]);
  const row = target[0];
  if (!row) return null;
  return { adminCount: total[0]?.total ?? 0, targetIsAdmin: row.role === "admin" };
}

/** Pesan yang sama untuk kedua jalur supaya keduanya mudah dibaca. */
const PESAN_SISA_ADMIN = "Minimal harus ada satu admin yang tersisa.";

/**
 * Admin mengubah peran / menonaktifkan staf (nonaktif = hapus user Auth).
 *
 * Peran dari client tidak dipercaya: tipe UserRole dihapus saat runtime, jadi
 * nilai role di sini bisa berisi apa saja sampai dicek staffRoleSchema.
 */
export async function updateStaffRole(
  userId: string,
  role: UserRole
): Promise<ActionResult<{ userId: string }>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  if (guard.profile.id === userId) return fail("Tidak bisa mengubah peran akun sendiri.");
  const parsed = staffRoleSchema.safeParse(role);
  if (!parsed.success) return fail("Peran tidak dikenal.");
  const db = getDb();
  if (!db) return backendOffline();
  try {
    const sisa = await cekSisaAdmin(userId);
    if (!sisa) return fail("User tidak ditemukan.");
    // Admin terakhir yang kehilangan peran mengunci semua orang dari portal,
    // dan pemulihannya butuh tulis langsung ke database. Jadi ditolak di sini.
    if (wouldLeaveNoAdmin({ ...sisa, nextIsAdmin: parsed.data === "admin" })) {
      return fail(PESAN_SISA_ADMIN);
    }
    const [updated] = await db
      .update(profiles)
      .set({ role: parsed.data })
      .where(eq(profiles.id, userId))
      .returning({ id: profiles.id });
    if (!updated) return fail("User tidak ditemukan.");
  } catch {
    return fail("Gagal mengubah peran. Coba lagi.");
  }
  revalidatePath("/portal/staff");
  return ok({ userId });
}

export async function deactivateStaff(userId: string): Promise<ActionResult<{ userId: string }>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  if (guard.profile.id === userId) return fail("Tidak bisa menonaktifkan akun sendiri.");
  if (!isSupabaseAdminConfigured()) {
    return fail("SUPABASE_SERVICE_ROLE_KEY belum diisi, tidak bisa menonaktifkan user.");
  }
  // Menonaktifkan berarti perannya hilang, jadi jalur ini juga harus menjaga
  // minimal satu admin: mengunci semua orang dari portal hanya dipulihkan
  // lewat tulis langsung ke database.
  try {
    const sisa = await cekSisaAdmin(userId);
    if (!sisa) return fail("User tidak ditemukan.");
    if (wouldLeaveNoAdmin({ ...sisa, nextIsAdmin: false })) {
      return fail(PESAN_SISA_ADMIN);
    }
  } catch {
    return fail("Gagal menonaktifkan user. Coba lagi.");
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return fail("Gagal menonaktifkan user. Coba lagi.");
  revalidatePath("/portal/staff");
  return ok({ userId });
}

/** Daftar staf untuk halaman portal/staff (admin saja). */
export async function listStaff() {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  const rows = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      role: profiles.role,
      phoneNumber: profiles.phoneNumber,
      username: profiles.username,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .orderBy(desc(profiles.createdAt));
  return ok(
    rows.map((p) => ({
      id: p.id,
      full_name: p.fullName,
      role: p.role,
      phone_number: p.phoneNumber,
      username: p.username,
      created_at: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    }))
  );
}
