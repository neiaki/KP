import { NextResponse } from "next/server";
import { getGoogleReviews } from "@/lib/reviews";

export const revalidate = 86400;

export async function GET() {
  const data = await getGoogleReviews();
  return NextResponse.json({ ok: data !== null, data });
}
