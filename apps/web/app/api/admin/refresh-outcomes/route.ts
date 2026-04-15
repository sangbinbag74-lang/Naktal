import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  // fill-bid-results cron을 내부 호출
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";
  const res = await fetch(`${baseUrl}/api/cron/fill-bid-results`, {
    method: "POST",
    headers: { "authorization": `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });

  const result = await res.json();
  return NextResponse.json(result, { status: res.status });
}
