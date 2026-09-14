"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import type { UserRole } from "@/types";
import {
  backendOffline,
  fail,
  getCurrentProfile,
  ok,
  requireRole,
  type ActionResult,
} from "./_helpers";

/** Login portal staf/pelanggan (menggantikan switchRole demo di portal/login). */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<ActionResult<{ role: UserRole; redirectTo: string }>> {
  if (!isSupabaseConfigured()) return backendOffline();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
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
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim(), phone_number: input.phoneNumber.trim() },
    },
  });
  if (error || !data.user) return fail(error?.message ?? "Pendaftaran gagal.");
  // Sinkronkan nama/telepon ke profiles (trigger handle_new_user sudah buatkan barisnya).
  await supabase
    .from("profiles")
    .update({ full_name: input.fullName.trim(), phone_number: input.phoneNumber.trim() })
    .eq("id", data.user.id);
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
  role: Extract<UserRole, "sales" | "technician" | "customer">;
}): Promise<ActionResult<{ userId: string }>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  if (!isSupabaseAdminConfigured()) {
    return fail("SUPABASE_SERVICE_ROLE_KEY belum diisi, tidak bisa mengundang user.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), phone_number: input.phoneNumber.trim() },
  });
  if (error || !data.user) return fail(error?.message ?? "Gagal membuat user.");
  const { error: roleError } = await admin
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone_number: input.phoneNumber.trim(),
      role: input.role,
    })
    .eq("id", data.user.id);
  if (roleError) return fail("User dibuat, tapi gagal set peran: " + roleError.message);
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
  if (!isSupabaseConfigured()) return backendOffline();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return fail("Gagal mengubah peran: " + error.message);
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
  if (error) return fail("Gagal menonaktifkan: " + error.message);
  revalidatePath("/portal/staff");
  return ok({ userId });
}

/** Daftar staf untuk halaman portal/staff (admin saja). */
export async function listStaff() {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return fail("Gagal memuat staf: " + error.message);
  return ok(
    data.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      role: p.role,
      phone_number: p.phone_number,
      created_at: p.created_at,
    }))
  );
}
