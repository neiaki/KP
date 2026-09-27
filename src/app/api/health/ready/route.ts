import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/config";
import { isReady } from "@/lib/health";
import { probeSchema } from "../db-probe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = "no-store, max-age=0";

/**
 * Readiness hanya mengembalikan detail boolean. Jangan pernah kirim nilai
 * environment, connection string, atau pesan driver ke health endpoint publik.
 */
export async function GET() {
  const supabaseConfigured = Boolean(getSupabaseUrl() && getSupabaseAnonKey());
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  let databaseReachable = false;
  let databaseSchemaReady = false;

  if (databaseConfigured) {
    // getDb() dan probe sengaja dibungkus try/catch: endpoint health tidak
    // boleh pernah melempar 500, karena Coolify membaca statusnya sebagai
    // sinyal kontainer. Probe sudah fail-closed dan sudah membuang klien yang
    // tidak menjawab sendiri, jadi try/catch di sini hanya menutup jalur
    // terakhir, yaitu DATABASE_URL yang tidak diparse.
    try {
      const probe = await probeSchema(getDb());
      databaseReachable = probe.reachable;
      databaseSchemaReady = probe.schemaReady;
    } catch {
      databaseReachable = false;
      databaseSchemaReady = false;
    }
  }

  const serviceRoleConfigured = Boolean(getSupabaseServiceRoleKey());
  const ready = isReady({
    supabaseConfigured,
    databaseConfigured,
    databaseReachable,
    databaseSchemaReady,
    serviceRoleConfigured,
  });

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: {
        supabase: supabaseConfigured,
        databaseConfigured,
        databaseReachable,
        databaseSchemaReady,
        serviceRoleConfigured,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": NO_STORE,
      },
    }
  );
}
