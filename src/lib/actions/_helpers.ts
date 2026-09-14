// Helper bersama Server Action (BUKAN modul action: tanpa "use server"
// agar boleh mengekspor fungsi sinkron). Hanya dipanggil dari server.
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Profile, UserRole } from "@/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = <T>(error: string): ActionResult<T> => ({ ok: false, error });

/** Error standar saat kredensial Supabase belum diisi (UI tetap jalan mode demo). */
export function backendOffline<T>(): ActionResult<T> {
  return fail(
    "Backend Supabase belum dikonfigurasi. Terapkan migrasi supabase/migrations lalu isi .env.local."
  );
}

/** Angka dari kolom NUMERIC kadang datang sebagai string; normalisasi ke number. */
export function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Drizzle mengembalikan timestamptz sebagai Date, supabase-js sebagai string.
 * Normalisasi ke ISO string agar tipe frontend konsisten.
 */
export function toISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return "";
}

/** Profil + peran user yang sedang login (null bila belum login / belum konfigurasi). */
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!data) return null;
  return {
    id: data.id,
    full_name: data.full_name,
    role: data.role,
    phone_number: data.phone_number,
    email: user.email ?? undefined,
    created_at: data.created_at,
  };
}

/** Guard peran untuk Server Action. Kembalikan { profile } atau { error }. */
export async function requireRole(
  roles: UserRole[]
): Promise<{ profile: Profile } | { error: string }> {
  if (!isSupabaseConfigured()) {
    return {
      error: "Backend Supabase belum dikonfigurasi. Terapkan migrasi lalu isi .env.local.",
    };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Belum login. Masuk dulu lewat portal." };
  if (!roles.includes(profile.role)) {
    return { error: `Peran ${profile.role} tidak berhak melakukan aksi ini.` };
  }
  return { profile };
}

/** Pesan error Supabase yang ramah untuk kasus umum POS/inventaris. */
export function friendlyDbError(code: string, fallback: string): string {
  if (code === "23505") return "Data duplikat: IMEI / kode sudah terdaftar.";
  if (code === "23503") return "Data induk tidak ditemukan (produk/unit sudah dihapus?).";
  if (code === "23514") return "Format data ditolak database (cek IMEI 15 digit / nominal >= 0).";
  return fallback;
}
