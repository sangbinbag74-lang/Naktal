/**
 * 월간 맞춤 백테스트 리포트 (P2, 2026-07-09) — MASTER 플랜 전용 혜택
 *
 * 매월 1일 09:00 KST: 지난달 그 회사가 열람한 공고들의 사후 성적 정밀 분석.
 *  - 열람 N건 중 개찰완료 M건 / AI 평균 오차 / ±0.5% 적중률 / 박스권 포함률
 *  - 근접 TOP3 · 빗나감 TOP3 상세 (공고명·예측 vs 실제)
 *  - 개찰 후 공개 데이터 + 본인 열람 이력만 사용
 *
 * 인증: Bearer CRON_SECRET / 관리자 수동 POST(x-admin-secret)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";

interface PredRow {
  annId: string; title: string; orgName: string;
  predictedSajungRate: number; actualSajungRate: number | null;
  deviationPct: number | null; isHit: boolean | null;
  optimalBidPrice: string; actualFinalPrice: string | null;
  bidPriceRangeLow: string | null; bidPriceRangeHigh: string | null;
}

const fmtWon = (v: string | number | null) => (v == null ? "-" : Number(v).toLocaleString("ko-KR") + "원");

function rowHtml(r: PredRow): string {
  const dev = r.deviationPct != null ? Math.abs(Number(r.deviationPct)) : null;
  return `
  <div style="border:1px solid #F1F5F9;border-radius:8px;padding:12px;margin-bottom:8px">
    <div style="font-size:12.5px;font-weight:700;color:#0F172A">${r.title}</div>
    <div style="font-size:11px;color:#94A3B8;margin-bottom:6px">${r.orgName}</div>
    <div style="font-size:12px;color:#374151">
      AI 추천 ${fmtWon(r.optimalBidPrice)} → 실제 낙찰 ${fmtWon(r.actualFinalPrice)}
      ${dev != null ? `<span style="font-weight:700;color:${dev <= 0.5 ? "#065F46" : "#92400E"}"> (오차 ${dev.toFixed(3)}%p)</span>` : ""}
    </div>
  </div>`;
}

function buildHtml(bizName: string, ym: string, s: {
  visited: number; opened: number; avgDev: number | null; hits: number; inBox: number;
  best: PredRow[]; worst: PredRow[];
}): string {
  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "-");
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e8ecf2">
    <div style="display:inline-block;font-size:10.5px;font-weight:800;color:#F8FAFC;background:#0F172A;padding:3px 10px;border-radius:99px;margin-bottom:10px">MASTER 전용 월간 백테스트</div>
    <h1 style="color:#1B3A6B;font-size:20px;margin:0 0 4px">${ym} 맞춤 백테스트 리포트</h1>
    <p style="color:#64748B;font-size:13px;margin:0 0 18px">${bizName}님이 지난달 열람하신 공고의 AI 예측 사후 검증입니다.</p>

    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
      <div style="flex:1;min-width:110px;background:#F8FAFC;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:#94A3B8">열람 → 개찰완료</div>
        <div style="font-size:18px;font-weight:800;color:#1B3A6B">${s.visited}건 → ${s.opened}건</div>
      </div>
      <div style="flex:1;min-width:110px;background:#F8FAFC;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:#94A3B8">AI 평균 오차</div>
        <div style="font-size:18px;font-weight:800;color:#1B3A6B">${s.avgDev != null ? s.avgDev.toFixed(3) + "%p" : "-"}</div>
      </div>
      <div style="flex:1;min-width:110px;background:#F8FAFC;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:#94A3B8">±0.5%p 적중</div>
        <div style="font-size:18px;font-weight:800;color:#065F46">${pct(s.hits, s.opened)}</div>
      </div>
      <div style="flex:1;min-width:110px;background:#F8FAFC;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:#94A3B8">박스권 포함</div>
        <div style="font-size:18px;font-weight:800;color:#1B3A6B">${pct(s.inBox, s.opened)}</div>
      </div>
    </div>

    ${s.best.length > 0 ? `<div style="font-size:13px;font-weight:800;color:#065F46;margin-bottom:6px">🎯 근접 TOP ${s.best.length}</div>${s.best.map(rowHtml).join("")}` : ""}
    ${s.worst.length > 0 ? `<div style="font-size:13px;font-weight:800;color:#92400E;margin:12px 0 6px">📐 오차 컸던 공고 (참고)</div>${s.worst.map(rowHtml).join("")}` : ""}

    <a href="${SITE_URL}/announcements" style="display:block;text-align:center;padding:13px;background:#0F172A;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;margin-top:14px">이번 달 공고 분석 시작 →</a>
    <p style="color:#9CA3AF;font-size:11px;margin-top:16px;text-align:center">
      본 리포트는 개찰 후 공개 데이터와 회원님의 열람 이력만으로 작성되었습니다.<br/>AI 분석은 참고 자료이며 낙찰을 보장하지 않습니다.
    </p>
  </div>
</div>`;
}

async function runMonthlyBacktest(): Promise<NextResponse> {
  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // 지난달 범위
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const ymLabel = `${monthStart.getFullYear()}년 ${monthStart.getMonth() + 1}월`;

  // MASTER 회원
  const { data: masters } = await admin
    .from("User")
    .select("id,supabaseId,bizName,notifyEmail")
    .eq("plan", "MASTER")
    .eq("isActive", true)
    .not("notifyEmail", "is", null);
  if (!masters || masters.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "MASTER 회원 없음" });

  let sent = 0;
  for (const u of masters as { id: string; supabaseId: string; bizName: string; notifyEmail: string }[]) {
    // 지난달 열람 공고 (AnnouncementVisit.userId = supabaseId)
    const { data: visits } = await admin
      .from("AnnouncementVisit")
      .select("annDbId")
      .eq("userId", u.supabaseId)
      .gte("visitedAt", monthStart.toISOString())
      .lt("visitedAt", monthEnd.toISOString())
      .limit(500);
    const annIds = [...new Set((visits ?? []).map((v) => v.annDbId as string))];
    if (annIds.length === 0) continue; // 열람 이력 없으면 skip

    const { data: preds } = await admin
      .from("AIPrediction")
      .select("annId,title,orgName,predictedSajungRate,actualSajungRate,deviationPct,isHit,optimalBidPrice,actualFinalPrice,bidPriceRangeLow,bidPriceRangeHigh")
      .in("annId", annIds)
      .not("actualFinalPrice", "is", null)
      .limit(500);
    const rows = ((preds ?? []) as unknown as PredRow[]);

    const withDev = rows.filter((r) => r.deviationPct != null);
    const avgDev = withDev.length > 0 ? withDev.reduce((s, r) => s + Math.abs(Number(r.deviationPct)), 0) / withDev.length : null;
    const hits = rows.filter((r) => r.isHit === true).length;
    const inBox = rows.filter((r) =>
      r.actualFinalPrice != null && r.bidPriceRangeLow != null && r.bidPriceRangeHigh != null
      && Number(r.actualFinalPrice) >= Number(r.bidPriceRangeLow) && Number(r.actualFinalPrice) <= Number(r.bidPriceRangeHigh)
    ).length;
    const sorted = [...withDev].sort((a, b) => Math.abs(Number(a.deviationPct)) - Math.abs(Number(b.deviationPct)));
    const best = sorted.slice(0, 3);
    const worst = sorted.length > 3 ? sorted.slice(-2).reverse() : [];

    try {
      await resend.emails.send({
        from: "낙비 <noreply@naktal.me>",
        to: u.notifyEmail,
        subject: `[낙비] ${ymLabel} 맞춤 백테스트 — 열람 ${annIds.length}건 사후 검증`,
        html: buildHtml(u.bizName, ymLabel, { visited: annIds.length, opened: rows.length, avgDev, hits, inBox, best, worst }),
      });
      sent++;
    } catch (err) {
      console.error(`[월간백테스트 실패] ${u.notifyEmail}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent, masters: masters.length });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runMonthlyBacktest();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return runMonthlyBacktest();
}
