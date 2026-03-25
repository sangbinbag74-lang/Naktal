import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Feature, checkUsageLimit } from "@/lib/plan-guard";
import { recommendNumbers } from "@/lib/core1/frequency-engine";
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
        hint: "공고 목록 또는 서류함에서 공고를 선택해주세요.",
      },
      { status: 400 },
    );
  }

  // 공고 조회
  const { data: ann } = await admin
    .from("Announcement")
    .select("id,konepsId,title,orgName,budget,deadline,category,region,rawJson")
    .eq("id", body.annId)
    .single();

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

  // 공고 데이터에서 분석 파라미터 자동 추출
  const budgetNum = Number(ann.budget);
  const budgetRange = getBudgetRange(budgetNum);

  const result = await recommendNumbers({
    category: ann.category,
    budgetRange,
    region: ann.region,
    estimatedBidders: body.estimatedBidders,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });

  // 추천 이력 저장
  const { error: insertError } = await admin.from("NumberRecommendation").insert({
    id: crypto.randomUUID(),
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
    announcementTitle: ann.title,
    announcementBudget: ann.budget,
    announcementOrg: ann.orgName,
  });
}
