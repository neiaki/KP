import { NextResponse } from "next/server";
import { buildAssetLinks, parseCertFingerprints } from "@/lib/assetlinks";

/*
 * Route /.well-known/assetlinks.json.
 *
 * Isinya di src/lib/assetlinks.ts supaya bentuk sidik jari dan isi relation
 * bisa diuji tanpa server. Route ini hanya membungkusnya jadi respons.
 *
 * force-dynamic wajib: kalau route ini ikut di-prerender, sidik jari yang baru
 * diterbitkan tidak akan pernah terbaca oleh Android tanpa build ulang.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const statements = buildAssetLinks(
    /*
     * Env ini SENGAJA tanpa prefix NEXT_PUBLIC_.
     *
     * Next.js hanya meng-inline prefix itu kalau variabelnya sudah ada saat
     * `next build` (lihat getNextPublicEnvironmentVariables di
     * node_modules/next/dist/lib/static-env.js: hanya key yang ada di
     * process.env waktu build yang masuk DefinePlugin). Kalau someday variabel
     * ini ikut terbawa ke tahap build, nilainya membeku di dalam bundle dan
     * env container yang baru tidak akan pernah dibaca lagi. Itu persis
     * kebalikan dari force-dynamic di atas, yang gunanya supaya sidik jari
     * baru berlaku tanpa build ulang.
     *
     * Sidik jari sertifikat bukan rahasia dan route ini hanya dibaca server,
     * jadi tidak ada alasan membuatnya bisa dijangkau browser.
     */
    parseCertFingerprints(process.env.ANDROID_APP_SHA256)
  );

  return NextResponse.json(statements, {
    headers: {
      /*
       * Android men-cache hasil verifikasi Digital Asset Links, jadi
       * no-store memaksa pengecekan ulang setiap kali sidik jari berubah.
       */
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
