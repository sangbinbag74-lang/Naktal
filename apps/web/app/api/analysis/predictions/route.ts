import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/analysis/predictions?annIds=id1,id2,...
 * 배치 조회: 공고 ID 목록에 대한 BidPricePrediction 캐시 반환
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("annIds") ?? "";
  const annIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (annIds.length === 0) return NextResponse.json({});

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("BidPricePrediction")
    .select("annId,optimalBidPrice,winProbability,expiresAt")
    .in("annId", annIds)
    .gt("expiresAt", new Date().toISOString());

  if (error) {
    console.error("[predictions] 조회 실패:", error.message);
    return NextResponse.json({});
  }

  const map: Record<string, { optimalBidPrice: string; winProbability: number }> = {};
  for (const row of data ?? []) {
    map[row.annId] = {
      optimalBidPrice: row.optimalBidPrice,
      winProbability:  row.winProbability,
    };
  }
  return NextResponse.json(map);
}
