/**
 * POST /api/admin/run-predictions
 * 현재 진행중 공고 중 BidPricePrediction 없는 건을 일괄 분석 (최대 50건/호출)
 * 클라이언트에서 반복 호출하여 전체 처리 가능
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import {
  predictOptimalBid,
  analyzeCompetition,
  classifyBudget,
} from "@/lib/core1/sajung-engine";
import { calcBaseBudget } from "@/lib/analysis/sajung-utils";
import { classifyCategory, DEFAULT_LWLT_BY_KIND } from "@/lib/analysis/category-config";

const BATCH_LIMIT = 50;
const DEFAULT_LOWER_LIMIT_RATE = 87.745;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  // body 에서 카테고리 필터 파싱 (기본: 공사만)
  const body = await request.json().catch(() => ({})) as { catFilter?: "all" | "construction" | "non-construction" };
  const catFilter = body.catFilter ?? "construction";

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 기존 잘못된 fallback 캐시(sampleSize=0) 정리 — 재분석 가능하도록
  // 이번 fix 이전에 저장된 의미 없는 103.8%/0.35 winProb row 일괄 삭제
  await admin.from("BidPricePrediction").delete().eq("sampleSize", 0);

  // 진행중 공고 조회 — catFilter 에 따라 분기
  let query = admin
    .from("Announcement")
    .select("id, orgName, category, budget, region, deadline, rawJson, bsisAmt, aValueAmt, subCategories, aValueTotal")
    .gt("deadline", now);

  if (catFilter === "construction") {
    query = query.ilike("category", "%공사%");
  } else if (catFilter === "non-construction") {
    query = query.not("category", "ilike", "%공사%");
  }
  // "all" 이면 필터 없음 (전체 카테고리 분석)

  const { data: announcements, error } = await query
    .order("deadline", { ascending: true })
    .limit(BATCH_LIMIT * 3);

  if (error || !announcements) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }

  // 이미 유효한 예측이 있는 공고 제외
  const annIds = announcements.map((a) => a.id as string);
  const { data: existing } = await admin
    .from("BidPricePrediction")
    .select("annId")
    .in("annId", annIds)
    .gt("expiresAt", now);

  const existingSet = new Set((existing ?? []).map((r) => r.annId as string));
  const targets = announcements
    .filter((a) => !existingSet.has(a.id as string))
    .slice(0, BATCH_LIMIT);

  // remaining: 아직 처리 안 된 건 수 (이번 배치 제외)
  const remaining = announcements.filter((a) => !existingSet.has(a.id as string)).length - targets.length;

  let filled = 0;
  let skipped = 0;

  for (const ann of targets) {
    const rawBudget = Number(ann.budget ?? 0);
    if (rawBudget <= 0) { skipped++; continue; }
    // engine 의 estimated = budget × sajung 공식 정합성을 위해 기초금액(부가세 포함) 사용
    const budget = calcBaseBudget(ann as { budget: number; aValueAmt: number; bsisAmt: bigint | number });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
    // 카테고리별 낙찰하한율 default
    const lwltDefault = DEFAULT_LWLT_BY_KIND[classifyCategory(ann.category as string)] ?? DEFAULT_LOWER_LIMIT_RATE;
    const lowerLimitRate = rawJson.sucsfbidLwltRate
      ? Number(rawJson.sucsfbidLwltRate)
      : lwltDefault;

    const deadlineMonth = new Date(ann.deadline as string).getMonth() + 1;
    // classifyBudget은 sajung-engine에서 사용하지만 여기서도 필요할 경우 대비
    void classifyBudget;

    try {
      const [sajung, competition] = await Promise.all([
        predictOptimalBid({
          orgName: ann.orgName as string,
          category: ann.category as string,
          budget,
          region: ann.region as string,
          lowerLimitRate,
          deadlineMonth,
          aValueTotal: Number(ann.aValueTotal ?? 0),
          deadlineDate: ann.deadline as string,
          bsisAmt: Number(ann.bsisAmt ?? 0),
          subCategories: (ann.subCategories as string[]) ?? [],
        }),
        analyzeCompetition({
          orgName: ann.orgName as string,
          category: ann.category as string,
          budget,
          region: ann.region as string,
          deadlineMonth,
        }),
      ]);

      // 데이터 부족 (sampleSize=0 + isFallback=true) 시 저장 차단
      // 의미 없는 fallback 값(공사 100% / 용역 87% 등)을 BidPricePrediction 에 적재하지 않음
      if (sajung.optimalBidPrice === 0 || sajung.sampleSize === 0 || sajung.isFallback) {
        skipped++; continue;
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: upsertErr } = await admin
        .from("BidPricePrediction")
        .upsert(
          {
            id: randomUUID(),
            annId: ann.id,
            predictedSajungRate: sajung.predictedSajungRate,
            sajungRateRange: sajung.sajungRateRange,
            sampleSize: sajung.sampleSize,
            optimalBidPrice: String(Math.round(sajung.optimalBidPrice)),
            bidPriceRangeLow: String(Math.round(sajung.bidPriceRangeLow)),
            bidPriceRangeHigh: String(Math.round(sajung.bidPriceRangeHigh)),
            lowerLimitPrice: String(Math.round(sajung.lowerLimitPrice)),
            winProbability: sajung.winProbability,
            competitionScore: competition.competitionScore,
            expectedBidders: competition.expectedBidders,
            dominantCompany: competition.dominantCompany ?? null,
            dominantWinRate: competition.dominantWinRate ?? null,
            modelVersion: "core1-v1",
            expiresAt,
          },
          { onConflict: "annId" }
        );

      if (upsertErr) { skipped++; } else { filled++; }
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, filled, skipped, total: targets.length, remaining });
}
