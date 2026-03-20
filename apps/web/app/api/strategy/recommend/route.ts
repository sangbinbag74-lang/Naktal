import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Feature, checkUsageLimit } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase.from("User").select("id,plan").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const plan = dbUser.plan as Plan;
  const { allowed, used, limit } = await checkUsageLimit(dbUser.id, Feature.CORE1_NUMBER_RECOMMEND, plan);
  if (!allowed) {
    const msg = limit === Infinity ? "오류" : String(limit) + "회 한도를 초과했습니다. 업그레이드하면 더 많이 사용할 수 있습니다.";
    return NextResponse.json({ message: msg, upgradeUrl: "/pricing", used, limit }, { status: 429 });
  }

  const body = await req.json() as { category: string; budgetRange: string; region: string; estimatedBidders?: number; annId?: string };

  // Mock 응답 (B안 Step 2에서 실제 ML 연동)
  const result = {
    combo1: [3, 11], hitRate1: 14.2,
    combo2: [2, 9],  hitRate2: 11.8,
    combo3: [4, 13], hitRate3: 10.1,
    sampleSize: 1247,
    modelVersion: "mock-v1",
  };

  await supabase.from("NumberRecommendation").insert({
    userId: dbUser.id,
    annId: body.annId ?? null,
    category: body.category,
    budgetRange: body.budgetRange,
    region: body.region,
    estimatedBidders: body.estimatedBidders ?? null,
    combo1: result.combo1, combo2: result.combo2, combo3: result.combo3,
    hitRate1: result.hitRate1, hitRate2: result.hitRate2, hitRate3: result.hitRate3,
    sampleSize: result.sampleSize,
    modelVersion: result.modelVersion,
  });

  return NextResponse.json({ ...result, used: used + 1, limit });
}