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
    parseCertFingerprints(process.env.NEXT_PUBLIC_ANDROID_APP_SHA256)
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
