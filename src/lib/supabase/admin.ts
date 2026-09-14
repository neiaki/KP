import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./config";

/**
 * Client service_role: MELEWATI RLS. Hanya untuk Server Action terisolasi
 * yang tidak bisa memakai JWT user:
 * - tracking tiket publik tanpa login (kolom aman saja, lihat actions/service.ts)
 * - invite/nonaktifkan user via Auth Admin API
 * Jangan pernah impor file ini dari Client Component.
 */
export function createAdminClient() {
  const key = getSupabaseServiceRoleKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
  return createServiceClient<Database>(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
