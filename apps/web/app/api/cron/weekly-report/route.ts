/**
 * 주간 리포트 (P2, 2026-07-09) — 재방문 리듬 장치 + BIZ/MASTER 심층 혜택 실물화
 *
 * 매주 월요일 08:00 KST, notifyEmail 보유 활성 회원 전원.
 *  - 공통: 지난 7일 공사 신규 공고·낙찰 동향 + 이번 주 마감 임박 top5
 *  - BIZ/MASTER: 발주처별 낙찰 top5 + 내 추적 경쟁사 주간 낙찰 심층 섹션
 *  - 개찰 후 공개 데이터만 사용 (박상빈님 데이터 0 노출 원칙 정합)
 *
 * 인증: Bearer CRON_SECRET / 관리자 수동 POST(x-admin-secret)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";
const fmtWon = (v: string | number | bigint) => Number(v).toLocaleString("ko-KR") + "원";

interface UpcomingAnn { id: string; title: string; orgName: string; budget: string; deadline: string }
interface OrgTop { org: string; count: number; avgRate: number }

function dday(deadline: string): string {
  const d = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  return d <= 0 ? "오늘" : `D-${d}`;
}

function buildHtml(
  bizName: string,
  isDeep: boolean,
  stats: { newAnns: number; wins: number; avgRate: number | null },
  upcoming: UpcomingAnn[],
  orgTops: OrgTop[],
  competitorWins: { name: string; count: number }[],
): string {
  const upcomingHtml = upcoming.map((a) => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid #F1F5F9">
        <a href="${SITE_URL}/announcements/${a.id}" style="color:#0F172A;text-decoration:none;font-weight:600;font-size:13px">${a.title}</a>
        <div style="font-size:11px;color:#94A3B8">${a.orgName}</div>
      </td>
      <td style="padding:7px 0;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap">
        <div style="font-size:12px;font-weight:700;color:#1B3A6B">${fmtWon(a.budget)}</div>
        <div style="font-size:11px;color:#DC2626;font-weight:700">${dday(a.deadline)}</div>
      </td>
    </tr>`).join("");

  const deepHtml = !isDeep ? "" : `
    <div style="margin-top:20px;padding:16px;border:1px solid #E9D5FF;border-radius:10px;background:#FAF5FF">
      <div style="font-size:12px;font-weight:800;color:#6D28D9;margin-bottom:10px">📊 비즈·마스터 심층 — 지난주 발주처 낙찰 TOP</div>
      ${orgTops.length === 0 ? `<div style="font-size:12px;color:#94A3B8">지난주 낙찰 데이터가 부족합니다.</div>` : `
      <table style="width:100%;font-size:12.5px;border-collapse:collapse">
        ${orgTops.map((o) => `<tr><td style="padding:4px 0;color:#374151">${o.org}</td><td style="text-align:right;color:#64748B">${o.count}건 · 평균 낙찰률 ${o.avgRate.toFixed(2)}%</td></tr>`).join("")}
      </table>`}
      ${competitorWins.length > 0 ? `
      <div style="font-size:12px;font-weight:800;color:#6D28D9;margin:12px 0 6px">🏗 내 추적 경쟁사 주간 동향</div>
      <table style="width:100%;font-size:12.5px;border-collapse:collapse">
        ${competitorWins.map((c) => `<tr><td style="padding:3px 0;color:#374151">${c.name}</td><td style="text-align:right;color:${c.count > 0 ? "#DC2626" : "#94A3B8"};font-weight:${c.count > 0 ? 700 : 400}">${c.count > 0 ? `낙찰 ${c.count}건` : "낙찰 없음"}</td></tr>`).join("")}
      </table>` : ""}
    </div>`;

  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e8ecf2">
    <h1 style="color:#1B3A6B;font-size:20px;margin:0 0 4px">낙비 주간 리포트</h1>
    <p style="color:#64748B;font-size:13px;margin:0 0 18px">${bizName}님, 이번 주 입찰 시장 브리핑입니다.</p>

    <div style="display:flex;gap:10px;margin-bottom:18px">
      <div style="flex:1;background:#F8FAFC;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#94A3B8">지난 7일 신규 공사 공고</div>
        <div style="font-size:20px;font-weight:800;color:#1B3A6B">${stats.newAnns.toLocaleString("ko-KR")}건</div>
      </div>
      <div style="flex:1;background:#F8FAFC;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#94A3B8">개찰 완료</div>
        <div style="font-size:20px;font-weight:800;color:#1B3A6B">${stats.wins.toLocaleString("ko-KR")}건</div>
      </div>
      <div style="flex:1;background:#F8FAFC;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;color:#94A3B8">평균 낙찰률</div>
        <div style="font-size:20px;font-weight:800;color:#1B3A6B">${stats.avgRate != null ? stats.avgRate.toFixed(2) + "%" : "-"}</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:800;color:#0F172A;margin-bottom:6px">⏰ 이번 주 마감 임박 (기초금액순)</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:4px">${upcomingHtml || `<tr><td style="font-size:12px;color:#94A3B8;padding:8px 0">이번 주 마감 공고가 없습니다.</td></tr>`}</table>
    ${deepHtml}

    <a href="${SITE_URL}/announcements" style="display:block;text-align:center;padding:13px;background:#1B3A6B;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;margin-top:18px">공고 검색 + AI 분석 →</a>
    <p style="color:#9CA3AF;font-size:11px;margin-top:16px;text-align:center">
      나라장터 공개 데이터 기준 · AI 분석은 참고 자료이며 낙찰을 보장하지 않습니다.<br/>알림 설정: ${SITE_URL}/alerts
    </p>
  </div>
</div>`;
}

async function runWeeklyReport(): Promise<NextResponse> {
  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString();
  const nowIso = new Date().toISOString();

  // ── 전역 통계 (1회 계산, 전 유저 공용) ──
  const { count: newAnns } = await admin
    .from("Announcement")
    .select("id", { count: "exact", head: true })
    .eq("category", "공사")
    .gte("createdAt", weekAgo);

  const { data: winRows } = await admin
    .from("BidResult")
    .select("bidRate,winnerName,annId")
    .gte("createdAt", weekAgo)
    .limit(3000);
  const wins = winRows ?? [];
  const rates = wins.map((w) => Number(w.bidRate)).filter((r) => r > 50 && r < 120);
  const avgRate = rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : null;

  // 이번 주 마감 top5 (기초금액순)
  const { data: upcomingRows } = await admin
    .from("Announcement")
    .select("id,title,orgName,budget,deadline")
    .eq("category", "공사")
    .gt("deadline", nowIso)
    .lt("deadline", weekAhead)
    .order("budget", { ascending: false })
    .limit(5);
  const upcoming = (upcomingRows ?? []) as unknown as UpcomingAnn[];

  // 발주처별 낙찰 top5 (심층) — 낙찰 공고의 orgName 집계
  const winKonepsIds = [...new Set(wins.map((w) => w.annId as string))].slice(0, 1000);
  let orgTops: OrgTop[] = [];
  if (winKonepsIds.length > 0) {
    const { data: winAnns } = await admin
      .from("Announcement")
      .select("konepsId,orgName")
      .in("konepsId", winKonepsIds)
      .limit(1000);
    const orgOfKoneps = new Map((winAnns ?? []).map((a) => [a.konepsId as string, a.orgName as string]));
    const agg = new Map<string, { count: number; sum: number }>();
    for (const w of wins) {
      const org = orgOfKoneps.get(w.annId as string);
      if (!org) continue;
      const rate = Number(w.bidRate);
      const cur = agg.get(org) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += rate > 50 && rate < 120 ? rate : 0;
      agg.set(org, cur);
    }
    orgTops = [...agg.entries()]
      .map(([org, v]) => ({ org, count: v.count, avgRate: v.count > 0 ? v.sum / v.count : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // ── 수신자 ──
  const { data: users } = await admin
    .from("User")
    .select("id,bizName,notifyEmail,plan,grandfathered")
    .eq("isActive", true)
    .not("notifyEmail", "is", null);
  if (!users || users.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // 심층 대상의 경쟁사 추적 목록 배치 조회
  const { data: watches } = await admin.from("CompetitorWatch").select("userId,competitorName").limit(5000);
  const watchByUser = new Map<string, string[]>();
  for (const w of (watches ?? []) as { userId: string; competitorName: string }[]) {
    const arr = watchByUser.get(w.userId) ?? [];
    arr.push(w.competitorName);
    watchByUser.set(w.userId, arr);
  }
  const norm = (s: string) => s.replace(/\(주\)|주식회사|\(유\)|유한회사|㈜|\s+/g, "").toLowerCase();
  const winnerNorms = wins.map((w) => norm(String(w.winnerName ?? "")));

  let sent = 0;
  for (const u of users as { id: string; bizName: string; notifyEmail: string; plan: string; grandfathered: boolean }[]) {
    const effectivePlan = u.grandfathered ? "PRO" : u.plan;
    const isDeep = effectivePlan === "BIZ" || effectivePlan === "MASTER";
    const competitorWins = (watchByUser.get(u.id) ?? []).map((name) => ({
      name,
      count: winnerNorms.filter((wn) => wn.length >= 2 && (wn.includes(norm(name)) || norm(name).includes(wn))).length,
    }));
    try {
      await resend.emails.send({
        from: "낙비 <noreply@naktal.me>",
        to: u.notifyEmail,
        subject: `[낙비] 주간 리포트 — 신규 ${newAnns ?? 0}건 · 개찰 ${wins.length}건`,
        html: buildHtml(u.bizName, isDeep, { newAnns: newAnns ?? 0, wins: wins.length, avgRate }, upcoming, orgTops, competitorWins),
      });
      sent++;
    } catch (err) {
      console.error(`[주간리포트 실패] ${u.notifyEmail}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent, newAnns: newAnns ?? 0, wins: wins.length });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runWeeklyReport();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return runWeeklyReport();
}
