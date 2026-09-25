import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/config";
import { isReady } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = "no-store, max-age=0";

type SchemaProbe = {
  profiles: boolean;
  store_settings: boolean;
  products: boolean;
  inventory_units: boolean;
  transactions: boolean;
  transaction_items: boolean;
  trade_in_records: boolean;
  service_tickets: boolean;
  v_public_inventory: boolean;
};

type DatabaseProbe = {
  reachable: boolean;
  schemaReady: boolean;
};

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
    try {
      const db = getDb();
      if (db) {
        const probe = await Promise.race<DatabaseProbe>([
          db
            .execute<SchemaProbe>(sql`
              select
                to_regclass('public.profiles') is not null as profiles,
                to_regclass('public.store_settings') is not null as store_settings,
                to_regclass('public.products') is not null as products,
                to_regclass('public.inventory_units') is not null as inventory_units,
                to_regclass('public.transactions') is not null as transactions,
                to_regclass('public.transaction_items') is not null as transaction_items,
                to_regclass('public.trade_in_records') is not null as trade_in_records,
                to_regclass('public.service_tickets') is not null as service_tickets,
                to_regclass('public.v_public_inventory') is not null as v_public_inventory
            `)
            .then((rows) => {
              const row = rows[0];
              return {
                reachable: true,
                schemaReady: Boolean(
                  row &&
                    row.profiles &&
                    row.store_settings &&
                    row.products &&
                    row.inventory_units &&
                    row.transactions &&
                    row.transaction_items &&
                    row.trade_in_records &&
                    row.service_tickets &&
                    row.v_public_inventory
                ),
              };
            })
            .catch(() => ({ reachable: false, schemaReady: false })),
          new Promise<DatabaseProbe>((resolve) =>
            setTimeout(() => resolve({ reachable: false, schemaReady: false }), 3000)
          ),
        ]);
        databaseReachable = probe.reachable;
        databaseSchemaReady = probe.schemaReady;
      }
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
