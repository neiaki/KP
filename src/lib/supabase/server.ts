import { cookies } from "next/headers";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseAnonKey, getSupabaseCookieDomain, getSupabaseUrl } from "./config";

/**
 * Client untuk Server Component / Server Action / Route Handler.
 * Memakai cookie user (RLS per peran PRD Bab 7 tetap ditegakkan database).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const cookieDomain = getSupabaseCookieDomain();
  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieStore.toString());
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(
              name,
              value,
              cookieDomain ? { ...options, domain: cookieDomain } : options
            )
          );
        } catch {
          // Dipanggil dari Server Component (read-only): refresh sesi
          // sudah ditangani proxy.ts, jadi abaikan saja.
        }
      },
    },
  });
}
