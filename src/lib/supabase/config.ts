// Konfigurasi env terpusat. Backend nonaktif (mode demo mock) bila env belum diisi,
// sehingga UI lama tetap jalan sebelum project Supabase At Cell dibuat.

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/** True bila kredensial publik tersedia (browser + server boleh pakai). */
export function isSupabaseConfigured(): boolean {
  return getSupabaseUrl().length > 0 && getSupabaseAnonKey().length > 0;
}

/** True bila service role tersedia (khusus Server Action terisolasi). */
export function isSupabaseAdminConfigured(): boolean {
  return isSupabaseConfigured() && getSupabaseServiceRoleKey().length > 0;
}
