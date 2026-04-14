/**
 * Vercel Cron — SajungRateStat 사정율 통계 재집계
 * 매일 새벽 4시 KST (19:00 UTC) 실행
 *
 * Supabase collect_sajung_stat() 함수에 위임 (DB 내 전체 처리)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();

  try {
    const { data, error } = await admin.rpc("collect_sajung_stat");
    if (error) {
      console.error("[collect-sajung-stat cron] RPC error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message, details: error }, { status: 500 });
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    return NextResponse.json({ ...(data as object), elapsed: `${elapsed}s` });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("[collect-sajung-stat cron]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
