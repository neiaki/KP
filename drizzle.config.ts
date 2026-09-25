import { defineConfig } from "drizzle-kit";

// Drizzle hanya dipakai untuk membandingkan schema dan menghasilkan artefak
// referensi. Migration production At Cell yang canonical adalah
// supabase/migrations/0001_atcell_schema.sql, karena file itu juga berisi
// RLS, trigger, view, Storage, dan seed. Jangan menjalankan artefak Drizzle
// ke database production.
//   npx drizzle-kit generate          # buat artefak referensi (offline, tanpa DB)
//   npx drizzle-kit studio            # GUI database (hanya untuk database disposable)
// File hasil generate baru disimpan di supabase/drizzle-generated/.
export default defineConfig({
  out: "./supabase/drizzle-generated",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
