"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { customerSignUpSchema, staffInviteSchema, usernameSchema } from "@/lib/validations";
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
 * Login portal staf/pelanggan memakai username, bukan email.
 *
 * Supabase Auth hanya menerima email di signInWithPassword, jadi username
 * dipetakan ke email lewat service_role (bypass RLS, karena policies hanya
 * mengizinkan user membaca baris profil sendiri). Pesan gagal sengaja sama
 * untuk "username tidak ada" dan "password salah" supaya username tidak
 * bisa dienumerasi.
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
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return fail("Username atau kata sandi tidak valid.");
  if (password.length < 8) return fail("Username atau kata sandi tidak valid.");

  const admin = createAdminClient();
  const { data: row, error: lookupError } = await admin
    .from("profiles")
    .select("email")
    .eq("username", parsed.data)
    .maybeSingle();
  if (lookupError) return fail("Login sedang tidak dapat diproses. Coba lagi sebentar.");
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

/** Pendaftaran mandiri khusus pelanggan (etalase/akun). Staf dibuat via inviteStaff. */
export async function signUpCustomer(input: {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
}): Promise<ActionResult<{ userId: string }>> {
  if (!isSupabaseConfigured()) return backendOffline();
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

/** Admin mengubah peran / menonaktifkan staf (nonaktif = hapus user Auth). */
export async function updateStaffRole(
  userId: string,
  role: UserRole
): Promise<ActionResult<{ userId: string }>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  if (guard.profile.id === userId) return fail("Tidak bisa mengubah peran akun sendiri.");
  const db = getDb();
  if (!db) return backendOffline();
  const [updated] = await db
    .update(profiles)
    .set({ role })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });
  if (!updated) return fail("User tidak ditemukan.");
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
