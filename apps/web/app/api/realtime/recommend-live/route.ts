/**
 * CORE 2 — 실시간 번호 갱신 추천
 * POST /api/realtime/recommend-live
 * Pro 전용. 현재 참여자 수 기반으로 번호 추천을 즉시 갱신.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Feature, checkUsageLimit } from "@/lib/plan-guard";
import { recommendNumbers } from "@/lib/core1/frequency-engine";
import type { Plan } from "@naktal/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase
    .from("User")
    .select("id,plan")
    .eq("supabaseId", user.id)
    .single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { allowed } = await checkUsageLimit(
    dbUser.id,
    Feature.CORE2_REALTIME_MONITOR,
    dbUser.plan as Plan,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Pro 전용 기능입니다.", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    annId: string;
    category: string;
    budgetRange: string;
    region: string;
    currentBidders: number; // 현재 참여자 수 (실시간)
  };

  const result = await recommendNumbers({
    category: body.category,
    budgetRange: body.budgetRange,
    region: body.region,
    estimatedBidders: body.currentBidders,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });

  return NextResponse.json({
    combo1: result.combo1.numbers,
    combo2: result.combo2.numbers,
    combo3: result.combo3.numbers,
    hitRate1: result.combo1.hitRate,
    hitRate2: result.combo2.hitRate,
    hitRate3: result.combo3.hitRate,
    freqMap: result.combo1.freqMap,
    sampleSize: result.sampleSize,
    modelVersion: result.modelVersion,
    currentBidders: body.currentBidders,
    updatedAt: new Date().toISOString(),
  });
}
