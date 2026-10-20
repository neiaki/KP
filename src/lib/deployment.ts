// Identitas deployment dan hak menulis.
//
// Kenapa berkas ini ada: deployment pratinjau (preview) di Vercel memakai
// environment yang sama dengan production, termasuk DATABASE_URL dan
// service role key. Tanpa penanda, Server Action mutasi di pratinjau
// akan dengan senang hati mengubah data toko yang sebenarnya. Verified
// pada 20 Oktober 2026: pratinjau PR #128 menyajikan katalog yang identik
// dengan atcell.my.id dan melaporkan serviceRoleConfigured: true.
//
// Env yang dipakai di sini diisi oleh platform, bukan oleh repo:
//   - Vercel mengisi VERCEL_ENV: "production", "preview", atau "development".
//   - Coolify mengisi COOLIFY_BRANCH dengan branch yang sedang dideploy.
//
// Berkas ini sengaja tanpa import apa pun. Env dibaca saat fungsi dipanggil,
// bukan saat modul dimuat, supaya test bisa mengubah env di tengah proses.

/** Deployment yang boleh mengubah data, pratinjau, atau tidak dikenali. */
export type DeploymentKind = "production" | "preview" | "unknown";

export type WriteAccess =
  | { allowed: true; kind: DeploymentKind }
  | { allowed: false; kind: DeploymentKind; reason: string };

/**
 * Jenis deployment menurut env platform.
 *
 * "unknown" berarti tidak ada penanda sama sekali: development lokal,
 * atau deployment di platform yang belum dikenali. Nilainya diperlakukan
 * sebagai boleh menulis, karena menolak semua deployment tanpa penanda akan
 * mematikan alur uji staf lokal yang memakai Supabase sungguhan.
 */
export function getDeploymentKind(): DeploymentKind {
  const vercel = (process.env.VERCEL_ENV ?? "").trim();
  if (vercel === "preview") return "preview";
  if (vercel === "production") return "production";

  const branch = (process.env.COOLIFY_BRANCH ?? "").trim();
  if (branch) return branch === "main" ? "production" : "preview";

  return "unknown";
}

/**
 *bolehkah deployment ini mengubah data.
 *
 * Satu-satunya yang ditolak adalah deployment pratinjau, karena itu
 * deployment yang kode dan env-nya bukan milik production. Koreksi manual
 * lewat ATCELL_ALLOW_WRITE=YES tetap dihormati, supaya pratinjau yang
 * sengaja memakai database sendiri bisa menulis.
 */
export function checkWriteAccess(): WriteAccess {
  const kind = getDeploymentKind();
  if (kind === "preview" && (process.env.ATCELL_ALLOW_WRITE ?? "").trim() !== "YES") {
    return {
      allowed: false,
      kind,
      reason:
        "Deployment pratinjau tidak boleh mengubah data. Deployment ini memakai " +
        "environment yang sama dengan production, jadi perubahan di sini akan " +
        "mengganggu data toko yang sebenarnya.",
    };
  }
  return { allowed: true, kind };
}
