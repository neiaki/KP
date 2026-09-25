"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { customerSignUpSchema, staffInviteSchema } from "@/lib/validations";
import type { UserRole } from "@/types";
import {
  backendOffline,
  fail,
  getCurrentProfile,
  ok,
  requireRole,
  type ActionResult,
} from "./_helpers";

/** Login portal staf/pelanggan (menggantikan switchRole demo di halaman login /id/login). */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<ActionResult<{ role: UserRole; redirectTo: string }>> {
  if (!isSupabaseConfigured()) return backendOffline();
  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || password.length < 8) {
    return fail("Email atau kata sandi tidak valid.");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error) return fail("Email atau kata sandi salah.");
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
    },
  });
  if (error || !data.user) return fail("Gagal membuat user. Periksa email dan coba lagi.");
  const { error: roleError } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone_number: parsed.data.phoneNumber,
      role: parsed.data.role,
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
      created_at: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    }))
  );
}
