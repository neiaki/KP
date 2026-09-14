import { defineConfig } from "drizzle-kit";

// Konfigurasi drizzle-kit (CLI migrasi). Cara pakai:
//   npx drizzle-kit generate          # buat file SQL dari schema.ts (offline, tanpa DB)
//   export DATABASE_URL="..."         # isi dulu dari dashboard Supabase (Database Settings)
//   npx drizzle-kit migrate           # terapkan SQL ke DB (butuh koneksi)
//   npx drizzle-kit studio            # GUI database di browser (butuh koneksi)
// File SQL hasil generate tersimpan di supabase/drizzle/.
export default defineConfig({
  out: "./supabase/drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
