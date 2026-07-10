/**
 * 개찰 후 성적표 (P1, 2026-07-09) — 최강 재방문·전환 장치
 *
 * 내가 열람했던 공고가 개찰되면: "낙찰가 vs AI 추천가 (오차·박스권 포함 여부)" 이메일.
 *  - 개찰 후 데이터 = 공공 정보라 노출 리스크 0 (박상빈님 데이터 0 노출 원칙 정합)
 *  - 대상: AIPrediction.resultFilledAt 최근 36시간 채워진 공고 × AnnouncementVisit 방문자
 *  - 중복 방지: RateLimit key scorecard:{supabaseId}:{annId} (180일)
 *  - 유저당 일 최대 3건
 *
 * 인증: Bearer CRON_SECRET (매일 10:30 KST) / 관리자 수동 POST(x-admin-secret)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";

interface ScoreRow {
  annId: string;
  title: string;
  orgName: string;
  predictedSajungRate: number;
  actualSajungRate: number | null;
  deviationPct: number | null;
  optimalBidPrice: string;
  actualFinalPrice: string | null;
  bidPriceRangeLow: string | null;
  bidPriceRangeHigh: string | null;
}

const fmtWon = (v: string | number | null) => (v == null ? "-" : Number(v).toLocaleString("ko-KR") + "원");

function buildScorecardHtml(bizName: string, rows: ScoreRow[]): string {
  const cards = rows.map((r) => {
    const dev = r.deviationPct != null ? Math.abs(Number(r.deviationPct)) : null;
    const inBox = r.actualFinalPrice != null && r.bidPriceRangeLow != null && r.bidPriceRangeHigh != null
      && Number(r.actualFinalPrice) >= Number(r.bidPriceRangeLow) && Number(r.actualFinalPrice) <= Number(r.bidPriceRangeHigh);
    const devBadge = dev == null ? ""
      : dev <= 0.5
        ? `<span style="font-size:11px;font-weight:700;color:#065F46;background:#ECFDF5;padding:2px 8px;border-radius:99px">오차 ${dev.toFixed(3)}%p — 근접 적중</span>`
        : `<span style="font-size:11px;font-weight:700;color:#92400E;background:#FEF3C7;padding:2px 8px;border-radius:99px">오차 ${dev.toFixed(3)}%p</span>`;
    return `
    <div style="border:1px solid #E8ECF2;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:2px">${r.title}</div>
      <div style="font-size:11px;color:#94A3B8;margin-bottom:10px">${r.orgName} · 개찰 완료</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#64748B;width:130px">실제 낙찰가</td><td style="font-weight:700;color:#0F172A">${fmtWon(r.actualFinalPrice)}</td></tr>
        <tr><td style="padding:4px 0;color:#64748B">AI 추천가 (열람 시점)</td><td style="font-weight:700;color:#1B3A6B">${fmtWon(r.optimalBidPrice)}</td></tr>
        ${r.actualSajungRate != null ? `<tr><td style="padding:4px 0;color:#64748B">실제 사정율</td><td>${Number(r.actualSajungRate).toFixed(3)}% <span style="color:#94A3B8">(AI 예측 ${Number(r.predictedSajungRate).toFixed(3)}%)</span></td></tr>` : ""}
      </table>
      <div style="margin-top:8px">${devBadge} ${inBox ? `<span style="font-size:11px;font-weight:700;color:#1B3A6B;background:#EFF6FF;padding:2px 8px;border-radius:99px">낙찰가가 AI 박스권 안에 있었어요</span>` : ""}</div>
    </div>`;
  }).join("");

  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e8ecf2">
    <h1 style="color:#1B3A6B;font-size:20px;margin:0 0 4px">낙비</h1>
    <p style="color:#64748B;font-size:13px;margin:0 0 18px">${bizName}님이 보셨던 공고의 개찰 결과가 나왔습니다.</p>
    ${cards}
    <a href="${SITE_URL}/announcements" style="display:block;text-align:center;padding:13px;background:#1B3A6B;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;margin-top:6px">다음 공고 AI 분석 받기</a>
    <p style="color:#9CA3AF;font-size:11px;margin-top:18px;text-align:center">
      개찰 후 공개된 나라장터 데이터 기준입니다. AI 분석은 참고 자료이며 낙찰을 보장하지 않습니다.<br/>
      알림 설정: ${SITE_URL}/alerts
    </p>
  </div>
</div>`;
}

async function runScorecard(): Promise<NextResponse> {
  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // 1. 최근 36시간 내 실제 결과가 채워진 예측 (성적 데이터)
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data: preds } = await admin
    .from("AIPrediction")
    .select("annId,title,orgName,predictedSajungRate,actualSajungRate,deviationPct,optimalBidPrice,actualFinalPrice,bidPriceRangeLow,bidPriceRangeHigh,resultFilledAt")
    .gte("resultFilledAt", since)
    .not("actualFinalPrice", "is", null)
    .limit(300);
  const scoreRows = (preds ?? []) as unknown as (ScoreRow & { resultFilledAt: string })[];
  if (scoreRows.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "신규 개찰 결과 없음" });

  const annIds = scoreRows.map((r) => r.annId);
  const scoreByAnn = new Map(scoreRows.map((r) => [r.annId, r]));

  // 2. 해당 공고를 열람한 사용자
  const { data: visits } = await admin
    .from("AnnouncementVisit")
    .select("userId,annDbId")
    .in("annDbId", annIds)
    .limit(3000);
  if (!visits || visits.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "방문자 없음" });

  // 사용자별 공고 목록
  const byUser = new Map<string, string[]>();
  for (const v of visits as { userId: string; annDbId: string }[]) {
    const arr = byUser.get(v.userId) ?? [];
    if (!arr.includes(v.annDbId)) arr.push(v.annDbId);
    byUser.set(v.userId, arr);
  }

  // 3. 이메일 매핑 (AnnouncementVisit.userId = supabaseId)
  const supabaseIds = [...byUser.keys()];
  const { data: users } = await admin
    .from("User")
    .select("supabaseId,bizName,notifyEmail")
    .in("supabaseId", supabaseIds);
  const userMap = new Map((users ?? []).map((u) => [u.supabaseId as string, u as { bizName: string; notifyEmail: string | null }]));

  let sent = 0;
  for (const [supabaseId, userAnnIds] of byUser) {
    const u = userMap.get(supabaseId);
    if (!u?.notifyEmail) continue;

    // 중복 발송 방지 (RateLimit key 존재 = 이미 발송)
    const keys = userAnnIds.map((a) => `scorecard:${supabaseId}:${a}`);
    const { data: sentKeys } = await admin.from("RateLimit").select("key").in("key", keys);
    const already = new Set((sentKeys ?? []).map((k) => k.key as string));
    const fresh = userAnnIds.filter((a) => !already.has(`scorecard:${supabaseId}:${a}`)).slice(0, 3); // 일 3건
    if (fresh.length === 0) continue;

    const rows = fresh.map((a) => scoreByAnn.get(a)).filter(Boolean) as ScoreRow[];
    if (rows.length === 0) continue;

    try {
      await resend.emails.send({
        from: "낙비 <noreply@naktal.me>",
        to: u.notifyEmail,
        subject: `[낙비] 보셨던 공고 개찰 결과 — AI 예측 성적표 ${rows.length}건`,
        html: buildScorecardHtml(u.bizName, rows),
      });
      sent++;
      // 발송 기록 (180일 보존)
      const resetAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      await admin.from("RateLimit").upsert(
        fresh.map((a) => ({ id: crypto.randomUUID(), key: `scorecard:${supabaseId}:${a}`, count: 1, resetAt, updatedAt: now })),
        { onConflict: "key" },
      );
    } catch (err) {
      console.error(`[성적표 발송 실패] ${u.notifyEmail}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent, announcements: scoreRows.length });
}

// Vercel Cron (매일 10:30 KST)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runScorecard();
}

// 관리자 수동 트리거
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return runScorecard();
}
