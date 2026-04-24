import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Feature, canAccess } from "@/lib/plan-guard";
import { recommendNumbers } from "@/lib/core1/frequency-engine";
import { predictOpeningNumbers, blendWithFrequency } from "@/lib/core2/opening-engine";
import { rateLimit } from "@/lib/rate-limit";
import { isMultiplePriceBid, getBudgetRange } from "@/lib/bid-utils";
import type { Plan } from "@naktal/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: dbUser } = await admin
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

  const body = (await req.json()) as {
    annId: string;
    estimatedBidders?: number;
  };

  // annId 필수 검증
  if (!body.annId || typeof body.annId !== "string") {
    return NextResponse.json(
      {
        error: "ANNOUNCEMENT_REQUIRED",
        message: "번호 분석은 실제 공고를 선택한 후에만 가능합니다.",
        hint: "공고 목록 또는 찜 목록에서 공고를 선택해주세요.",
      },
      { status: 400 },
    );
  }

  // 공고 조회 (UUID 또는 konepsId 모두 허용)
  const { data: ann } = await admin
    .from("Announcement")
    .select("id,konepsId,title,orgName,budget,deadline,category,region,rawJson,bsisAmt,sucsfbidLwltRate,subCategories,aValueTotal")
    .or(`id.eq.${body.annId},konepsId.eq.${body.annId}`)
    .maybeSingle();

  if (!ann) {
    return NextResponse.json({ error: "ANNOUNCEMENT_NOT_FOUND", message: "공고를 찾을 수 없습니다." }, { status: 404 });
  }

  // 복수예가 검증
  const rawData = ann.rawJson as Record<string, string>;
  if (!isMultiplePriceBid(rawData)) {
    const bidMethod = rawData?.bidMthdNm ?? rawData?.cntrctMthdNm ?? "알 수 없음";
    return NextResponse.json(
      {
        error: "NOT_MULTIPLE_PRICE",
        message: "이 공고는 복수예가 방식이 아닙니다.",
        bidMethod,
        hint: "번호 분석은 복수예가 방식 공고에서만 가능합니다.",
      },
      { status: 422 },
    );
  }

  // 마감 검증
  if (new Date(ann.deadline) < new Date()) {
    return NextResponse.json(
      { error: "ANNOUNCEMENT_CLOSED", message: "이미 마감된 공고입니다.", deadline: ann.deadline },
      { status: 422 },
    );
  }

  const plan = dbUser.plan as Plan;
  if (!canAccess(plan, Feature.CORE1_NUMBER_RECOMMEND)) {
    return NextResponse.json(
      { error: "PRO_REQUIRED", message: "AI 분석은 프로 플랜부터 이용할 수 있습니다.", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  // 공고 데이터에서 분석 파라미터 자동 추출
  const budgetNum = Number(ann.budget);
  const budgetRange = getBudgetRange(budgetNum);

  // 통계 기반 (frequency-engine) 추천 — 기존 유지
  const result = await recommendNumbers({
    annId: ann.id,
    category: ann.category,
    budgetRange,
    region: ann.region,
    estimatedBidders: body.estimatedBidders,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });

  // ML 기반 (Model 2 opening-engine) 추천 — 병렬, 실패 시 null
  let mlPrediction: Awaited<ReturnType<typeof predictOpeningNumbers>> = null;
  let mlCombo: number[] = [];
  let blendedFreqMap: Record<number, number> = {};
  try {
    mlPrediction = await predictOpeningNumbers({
      category: ann.category,
      orgName: ann.orgName,
      region: ann.region,
      budget: Number(ann.budget),
      bsisAmt: Number(ann.bsisAmt ?? 0),
      lwltRate: Number(ann.sucsfbidLwltRate ?? 87.745),
      deadline: new Date(ann.deadline),
      subCategories: (ann.subCategories as string[]) ?? [],
      numBidders: body.estimatedBidders ?? 0,
      aValueTotal: Number(ann.aValueTotal ?? 0),
    });
    if (mlPrediction) {
      mlCombo = mlPrediction.top4;
      // freqMap(통계, 번호1~15) + ML 확률 blend → 번호별 최종 선택 확률
      const blended = blendWithFrequency(mlPrediction.probs, result.combo1.freqMap, 0.6);
      for (let i = 0; i < 15; i++) blendedFreqMap[i + 1] = Math.round((blended[i] ?? 0) * 10000) / 10000;
    }
  } catch (e) {
    console.error("[recommend] ML opening 실패 (통계로 폴백):", e);
  }

  // 추천 이력 저장
  const { error: insertError } = await admin.from("NumberRecommendation").insert({
    id: randomUUID(),
    userId: dbUser.id,
    annId: ann.id,
    category: ann.category,
    budgetRange,
    region: ann.region,
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
  if (insertError) console.error("[recommend] NumberRecommendation insert error:", insertError.message);

  return NextResponse.json({
    // 통계 기반 combo (기존 호환)
    combo1: result.combo1.numbers,
    combo2: result.combo2.numbers,
    combo3: result.combo3.numbers,
    combo4: result.combo4.numbers,
    hitRate1: result.combo1.hitRate,
    hitRate2: result.combo2.hitRate,
    hitRate3: result.combo3.hitRate,
    hitRate4: result.combo4.hitRate,
    freqMap: result.combo1.freqMap,
    sampleSize: result.sampleSize,
    modelVersion: result.modelVersion,
    isEstimated: result.isEstimated,
    // ML 기반 (Model 2) — 실패 시 빈 배열/null
    mlCombo,
    mlProbs: mlPrediction?.probs ?? [],
    mlVersion: mlPrediction?.model_version ?? null,
    blendedFreqMap,
    announcementTitle: ann.title,
    announcementBudget: ann.budget,
    announcementOrg: ann.orgName,
  });
}
