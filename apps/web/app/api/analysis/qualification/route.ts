/**
 * CORE 3 — 적격심사 통과 계산기
 *
 * 한국 공공조달 적격심사 기준 (국가계약법 시행령):
 *   시설공사 3억~30억: 동종 최근 5년 내 계약금액의 30% 이상 실적
 *   시설공사 30억 이상: 실적(50%) + 기술능력 + 신용평가
 *   물품/용역: 적격심사 대상 외
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Feature, checkUsageLimit } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

interface ConstructionRecord {
  name: string;
  amount: number;
  year: number;
  client?: string;
  category?: string;
}

interface License {
  licenseType: string;
  validYn: string;
}

function formatAmount(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억원";
  if (n >= 10_000) return Math.round(n / 10_000) + "만원";
  return n.toLocaleString() + "원";
}

function sumRecentRecords(records: ConstructionRecord[]): number {
  const cutoffYear = new Date().getFullYear() - 5;
  return records.filter((r) => r.year >= cutoffYear).reduce((s, r) => s + (r.amount || 0), 0);
}

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

  const plan = dbUser.plan as Plan;
  const body = (await req.json()) as { annId?: string };

  const { data: profile } = await admin
    .from("CompanyProfile")
    .select("id,mainCategory,subCategories,constructionRecords,creditScore,licenses")
    .eq("userId", dbUser.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({
      result: "UNCERTAIN",
      reason: "업체 정보가 등록되지 않았습니다. 내 업체 정보를 등록하면 정확한 판정이 가능합니다.",
    });
  }

  if (!body.annId) {
    return NextResponse.json({
      result: "UNCERTAIN",
      reason: "공고번호를 입력하면 해당 공고의 적격 여부를 판정해 드립니다.",
    });
  }

  const { data: ann } = await admin
    .from("Announcement")
    .select("budget,category,rawJson")
    .eq("konepsId", body.annId)
    .maybeSingle();

  if (!ann) {
    return NextResponse.json({
      result: "UNCERTAIN",
      reason: "공고 정보를 찾을 수 없습니다. 공고번호를 확인해주세요.",
    });
  }

  const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
  const ntceKindNm = rawJson["ntceKindNm"] || "";
  const budget = Number(ann.budget ?? 0);
  const isConstruction = ntceKindNm.includes("공사");
  const THREE_BILLION = 300_000_000;
  const THIRTY_BILLION = 3_000_000_000;

  if (!isConstruction || budget < THREE_BILLION) {
    return NextResponse.json({
      result: "PASS",
      score: 100,
      reason: "이 공고는 적격심사 대상이 아닙니다 (" + formatAmount(budget) + ", " + (ntceKindNm || "물품/용역") + ").",
      details: { budgetOk: true },
    });
  }

  const { allowed: fullAllowed } = await checkUsageLimit(
    dbUser.id,
    Feature.CORE3_QUALIFICATION_FULL,
    plan,
  );
  if (!fullAllowed) {
    return NextResponse.json({
      result: "UNCERTAIN",
      reason: "전체 적격심사 판정은 스탠다드 이상 요금제에서 이용 가능합니다.",
      upgradeUrl: "/pricing",
    });
  }

  const ratio = budget >= THIRTY_BILLION ? 0.5 : 0.3;
  const requiredRecord = Math.round(budget * ratio);
  const records = (profile.constructionRecords ?? []) as ConstructionRecord[];
  const myRecord = sumRecentRecords(records);
  const recordOk = myRecord >= requiredRecord;

  const annCategory = ann.category || "";
  const licenses = (profile.licenses ?? []) as License[];
  const validLicenseTypes = licenses.filter(l => l.validYn !== "N").map(l => l.licenseType);
  const profileCats = [
    profile.mainCategory,
    ...(profile.subCategories ?? []),
    ...validLicenseTypes,
  ].filter(Boolean);
  const categoryMatch =
    profileCats.length === 0 ||
    profileCats.some(
      (c) => annCategory.includes(c as string) || (c as string).includes(annCategory.slice(0, 3)),
    );

  const creditOk = !profile.creditScore || profile.creditScore !== "D";
  const score = (categoryMatch ? 30 : 0) + (recordOk ? 50 : 0) + (creditOk ? 20 : 0);

  let result: "PASS" | "UNCERTAIN" | "FAIL";
  let reason: string;

  if (score >= 80 && recordOk && categoryMatch) {
    result = "PASS";
    reason =
      "적격심사 통과 가능성이 높습니다. 최근 5년 실적 " +
      formatAmount(myRecord) +
      "이 요구 실적 " +
      formatAmount(requiredRecord) +
      "을 충족합니다.";
  } else if (score >= 50 || recordOk) {
    result = "UNCERTAIN";
    reason = recordOk
      ? "실적 기준은 충족하나 업종 일치 여부를 확인해주세요."
      : "실적이 부족할 수 있습니다. 요구: " + formatAmount(requiredRecord) + ", 현재: " + formatAmount(myRecord) + ".";
  } else {
    result = "FAIL";
    reason =
      "적격심사 통과가 어려울 수 있습니다. 요구: " +
      formatAmount(requiredRecord) +
      ", 현재: " +
      formatAmount(myRecord) +
      ".";
  }

  return NextResponse.json({
    result,
    score,
    reason,
    details: {
      budgetOk: true,
      categoryMatch,
      recordOk,
      requiredRecord: formatAmount(requiredRecord),
      myRecord: formatAmount(myRecord),
      creditOk,
    },
  });
}
