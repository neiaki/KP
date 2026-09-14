// Koneksi Drizzle ke Postgres Supabase.
// Konsep: getDb() = "pintu" ke database. Kembalikan null bila DATABASE_URL
// belum diisi, sehingga action bisa menjawab "backend belum dikonfigurasi"
// (UI tetap jalan mode demo). Disimpan singleton agar tidak buka koneksi baru
// setiap request.
//
// PENTING: koneksi langsung ini MELEWATI RLS Supabase. Itu sebabnya setiap
// Server Action WAJIB memanggil requireRole() dulu (lihat actions/_helpers.ts).
// Auth (login/session) dan Storage tetap lewat supabase-js seperti semula.
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

export function isDrizzleConfigured(): boolean {
  return (process.env.DATABASE_URL ?? "").length > 0;
}

export function getDb(): Db | null {
  if (!isDrizzleConfigured()) return null;
  if (!db) {
    client = postgres(process.env.DATABASE_URL as string, {
      // Wajib false untuk Supabase connection pooler (transaction mode).
      prepare: false,
      // Batasi koneksi agar tidak membanjiri pooler Supabase (gratisan kecil).
      max: 5,
    });
    db = drizzle(client, { schema });
  }
  return db;
}
