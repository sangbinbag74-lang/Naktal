import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Feature, checkUsageLimit } from "@/lib/plan-guard";
import { recommendNumbers } from "@/lib/core1/frequency-engine";
import { rateLimit } from "@/lib/rate-limit";
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

  // 분당 10회 속도 제한
  const { allowed: rlAllowed, resetAt } = await rateLimit(`${dbUser.id}:recommend`, 10, 60);
  if (!rlAllowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  const plan = dbUser.plan as Plan;
  const { allowed, used, limit } = await checkUsageLimit(
    dbUser.id,
    Feature.CORE1_NUMBER_RECOMMEND,
    plan,
  );

  if (!allowed) {
    const msg =
      limit === Infinity
        ? "오류"
        : String(limit) + "회 한도를 초과했습니다. 업그레이드하면 더 많이 사용할 수 있습니다.";
    return NextResponse.json(
      { message: msg, upgradeUrl: "/pricing", used, limit },
      { status: 429 },
    );
  }

  const body = (await req.json()) as {
    category: string;
    budgetRange: string;
    region: string;
    estimatedBidders?: number;
    annId?: string;
  };

  // CORE 1: 실제 빈도 분석
  const result = await recommendNumbers({
    category: body.category,
    budgetRange: body.budgetRange,
    region: body.region,
    estimatedBidders: body.estimatedBidders,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });

  // 추천 이력 저장
  await supabase.from("NumberRecommendation").insert({
    userId: dbUser.id,
    annId: body.annId ?? null,
    category: body.category,
    budgetRange: body.budgetRange,
    region: body.region,
    estimatedBidders: body.estimatedBidders ?? null,
    combo1: result.combo1.numbers,
    combo2: result.combo2.numbers,
    combo3: result.combo3.numbers,
    hitRate1: result.combo1.hitRate,
    hitRate2: result.combo2.hitRate,
    hitRate3: result.combo3.hitRate,
    sampleSize: result.sampleSize,
    modelVersion: result.modelVersion,
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
    isEstimated: result.isEstimated,
    used: used + 1,
    limit,
  });
}
