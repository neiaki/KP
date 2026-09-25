// Konfigurasi env terpusat. Backend nonaktif (mode demo mock) bila env belum diisi,
// sehingga UI lama tetap jalan sebelum project Supabase At Cell dibuat.

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

export function getSupabaseServiceRoleKey(): string {
  // Key secret modern diprioritaskan; nama service_role hanya fallback kompatibilitas.
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/**
 * Domain cookie opsional untuk sesi lintas subdomain produksi.
 * Kosongkan di local development agar cookie tetap host-only.
 */
export function getSupabaseCookieDomain(): string | undefined {
  const value = process.env.SUPABASE_COOKIE_DOMAIN?.trim();
  return value || undefined;
}

/** True bila kredensial publik tersedia (browser + server boleh pakai). */
export function isSupabaseConfigured(): boolean {
  return getSupabaseUrl().length > 0 && getSupabaseAnonKey().length > 0;
}

/** True bila service role tersedia (khusus Server Action terisolasi). */
export function isSupabaseAdminConfigured(): boolean {
  return isSupabaseConfigured() && getSupabaseServiceRoleKey().length > 0;
}
