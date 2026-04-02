/**
 * GET /api/admin/model-accuracy
 * 사정율 예측 모델 백테스트 — 만료된 BidPricePrediction vs 실제 BidResult
 * 신뢰도 구간별(HIGH/MEDIUM/LOW) + 발주처별 MAE 계산
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function getConfidenceLevel(sampleSize: number, stddev: number): "HIGH" | "MEDIUM" | "LOW" {
  if (sampleSize >= 30 && stddev <= 0.5) return "HIGH";
  if (sampleSize >= 10 && stddev <= 1.0) return "MEDIUM";
  return "LOW";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const adminKey = request.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 만료된 예측(= 개찰 완료) 최대 1000건
  const { data: predictions } = await admin
    .from("BidPricePrediction")
    .select("annId,predictedSajungRate,sampleSize")
    .lt("expiresAt", new Date().toISOString())
    .limit(1000);

  if (!predictions || predictions.length === 0) {
    return NextResponse.json({ overall: null, byOrg: [], summary: { highCount: 0, mediumCount: 0, lowCount: 0 } });
  }

  const annIds = predictions.map((p) => p.annId);

  // 실제 낙찰결과 조회
  const { data: bidResults } = await admin
    .from("BidResult")
    .select("annId,finalPrice,bidRate,Announcement!annId(orgName,budget)")
    .in("annId", annIds);

  // SajungRateStat에서 stddev 조회 (confidence level 계산용)
  const { data: statRows } = await admin
    .from("SajungRateStat")
    .select("orgName,category,budgetRange,region,sampleSize,stddev");

  // orgName → stddev 맵 (첫 번째 매칭 사용, 근사치)
  const stddevMap = new Map<string, number>();
  for (const s of statRows ?? []) {
    if (!stddevMap.has(s.orgName)) stddevMap.set(s.orgName, s.stddev);
  }

  const predMap = new Map(predictions.map((p) => [p.annId, p]));

  interface OrgError { absErrors: number[]; level: "HIGH" | "MEDIUM" | "LOW" }
  const orgMap = new Map<string, OrgError>();
  const allErrors: number[] = [];

  for (const r of bidResults ?? []) {
    const ann = (r as any).Announcement;
    if (!ann?.budget) continue;
    const budget = Number(ann.budget);
    const finalPrice = Number(r.finalPrice);
    const bidRate = Number(r.bidRate);
    if (!budget || !finalPrice || !bidRate) continue;
    const estPrice = finalPrice / (bidRate / 100);
    const actualSajung = (estPrice / budget) * 100;
    if (actualSajung < 97 || actualSajung > 103) continue;

    const pred = predMap.get(r.annId);
    if (!pred) continue;
    const absErr = Math.abs(actualSajung - pred.predictedSajungRate);
    allErrors.push(absErr);

    const orgName: string = ann.orgName ?? "unknown";
    const stddev = stddevMap.get(orgName) ?? 1.5;
    const level = getConfidenceLevel(pred.sampleSize, stddev);
    if (!orgMap.has(orgName)) orgMap.set(orgName, { absErrors: [], level });
    orgMap.get(orgName)!.absErrors.push(absErr);
  }

  const mae = allErrors.length > 0
    ? Math.round((allErrors.reduce((s, v) => s + v, 0) / allErrors.length) * 1000) / 1000
    : null;
  const rmse = allErrors.length > 0
    ? Math.round(Math.sqrt(allErrors.reduce((s, v) => s + v * v, 0) / allErrors.length) * 1000) / 1000
    : null;
  const p90 = allErrors.length > 0
    ? (() => { const s = [...allErrors].sort((a, b) => a - b); return Math.round((s[Math.floor(s.length * 0.9)] ?? 0) * 1000) / 1000; })()
    : null;

  const byOrg = Array.from(orgMap.entries())
    .map(([orgName, { absErrors, level }]) => ({
      orgName,
      mae: Math.round((absErrors.reduce((s, v) => s + v, 0) / absErrors.length) * 1000) / 1000,
      sampleSize: absErrors.length,
      level,
    }))
    .sort((a, b) => b.mae - a.mae)
    .slice(0, 30);

  const counts = { highCount: 0, mediumCount: 0, lowCount: 0 };
  for (const { level } of orgMap.values()) {
    if (level === "HIGH") counts.highCount++;
    else if (level === "MEDIUM") counts.mediumCount++;
    else counts.lowCount++;
  }

  return NextResponse.json({
    overall: mae !== null ? { mae, rmse, p90, testSize: allErrors.length } : null,
    byOrg,
    summary: counts,
  });
}
