import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness hanya memastikan proses Next.js masih bisa merespons request. */
export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "atcell-web",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
