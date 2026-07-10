/**
 * 경쟁사 낙찰 알림 (P1, 2026-07-09) — 전 티어 제공 (개수는 등록 시 plan-guard가 제한)
 *
 * 추적 중인 경쟁사가 낙찰 받으면: "○○건설이 △△공사를 낙찰받았습니다 (낙찰가·낙찰률)" 이메일.
 *  - 개찰 후 공개 데이터만 사용 (박상빈님 데이터 0 노출 원칙 정합)
 *  - 대상: BidResult.createdAt 최근 36시간 × CompetitorWatch 이름 매칭(정규화 contains)
 *  - 중복 방지: RateLimit key cw:{userId}:{bidResultId} (90일), 유저당 일 5건
 *
 * 인증: Bearer CRON_SECRET (매일 11:00 KST) / 관리자 수동 POST(x-admin-secret)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { sendAlimtalk, isSolapiConfigured } from "@/lib/notifications/solapi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";

interface WinRow { id: string; annId: string; winnerName: string; finalPrice: string; bidRate: string; numBidders: number }
interface AnnMeta { konepsId: string; id: string; title: string; orgName: string }

const norm = (s: string) => s.replace(/\(주\)|주식회사|\(유\)|유한회사|㈜|\s+/g, "").toLowerCase();
const fmtWon = (v: string | number) => Number(v).toLocaleString("ko-KR") + "원";

function buildHtml(bizName: string, items: { competitor: string; title: string; orgName: string; finalPrice: string; bidRate: string; numBidders: number; annDbId: string | null }[]): string {
  const cards = items.map((it) => `
    <div style="border:1px solid #E8ECF2;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#B45309;background:#FEF3C7;display:inline-block;padding:2px 8px;border-radius:99px;margin-bottom:8px">추적 경쟁사 낙찰</div>
      <div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:2px">${it.competitor}</div>
      <div style="font-size:13px;color:#374151;margin-bottom:8px">${it.title}</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr><td style="padding:3px 0;color:#64748B;width:110px">발주처</td><td>${it.orgName}</td></tr>
        <tr><td style="padding:3px 0;color:#64748B">낙찰가</td><td style="font-weight:700;color:#1B3A6B">${fmtWon(it.finalPrice)}</td></tr>
        <tr><td style="padding:3px 0;color:#64748B">낙찰률 / 참여</td><td>${Number(it.bidRate).toFixed(3)}% · ${it.numBidders}개사</td></tr>
      </table>
      ${it.annDbId ? `<a href="${SITE_URL}/announcements/${it.annDbId}" style="display:inline-block;margin-top:10px;font-size:12px;font-weight:700;color:#1B3A6B;text-decoration:none">공고 상세 →</a>` : ""}
    </div>`).join("");
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e8ecf2">
    <h1 style="color:#1B3A6B;font-size:20px;margin:0 0 4px">낙비</h1>
    <p style="color:#64748B;font-size:13px;margin:0 0 18px">${bizName}님이 추적 중인 경쟁사의 낙찰 소식입니다.</p>
    ${cards}
    <p style="color:#9CA3AF;font-size:11px;margin-top:18px;text-align:center">
      개찰 후 공개된 나라장터 데이터 기준입니다.<br/>추적 설정: ${SITE_URL}/alerts
    </p>
  </div>
</div>`;
}

async function runCompetitorAlerts(): Promise<NextResponse> {
  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // 1. 최근 36시간 낙찰 결과
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data: wins } = await admin
    .from("BidResult")
    .select("id,annId,winnerName,finalPrice,bidRate,numBidders")
    .gte("createdAt", since)
    .not("winnerName", "is", null)
    .limit(2000);
  const winRows = ((wins ?? []) as WinRow[]).filter((w) => (w.winnerName ?? "").trim().length >= 2);
  if (winRows.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "신규 낙찰 없음" });

  // 2. 전체 추적 목록 (규모 작음 — 전량 로드 후 JS 매칭)
  const { data: watches } = await admin.from("CompetitorWatch").select("userId,competitorName").limit(5000);
  if (!watches || watches.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "추적 없음" });

  // 3. 매칭 (정규화 contains 양방향)
  const matchesByUser = new Map<string, { competitor: string; win: WinRow }[]>();
  for (const w of watches as { userId: string; competitorName: string }[]) {
    const nw = norm(w.competitorName);
    if (nw.length < 2) continue;
    for (const win of winRows) {
      const nwin = norm(win.winnerName);
      if (nwin.includes(nw) || nw.includes(nwin)) {
        const arr = matchesByUser.get(w.userId) ?? [];
        arr.push({ competitor: w.competitorName, win });
        matchesByUser.set(w.userId, arr);
      }
    }
  }
  if (matchesByUser.size === 0) return NextResponse.json({ ok: true, sent: 0, message: "매칭 없음" });

  // 4. 공고 메타 (BidResult.annId = konepsId)
  const konepsIds = [...new Set([...matchesByUser.values()].flat().map((m) => m.win.annId))];
  const { data: anns } = await admin
    .from("Announcement")
    .select("id,konepsId,title,orgName")
    .in("konepsId", konepsIds)
    .limit(1000);
  const annMap = new Map(((anns ?? []) as AnnMeta[]).map((a) => [a.konepsId, a]));

  // 5. 사용자 이메일 (CompetitorWatch.userId = User.id)
  const userIds = [...matchesByUser.keys()];
  const { data: users } = await admin.from("User").select("id,bizName,notifyEmail,notifyPhone").in("id", userIds);
  const userMap = new Map((users ?? []).map((u) => [u.id as string, u as { bizName: string; notifyEmail: string | null; notifyPhone: string | null }]));

  let sent = 0;
  for (const [userId, matches] of matchesByUser) {
    const u = userMap.get(userId);
    if (!u?.notifyEmail) continue;

    // 중복 방지 + 일 5건
    const keys = matches.map((m) => `cw:${userId}:${m.win.id}`);
    const { data: sentKeys } = await admin.from("RateLimit").select("key").in("key", keys);
    const already = new Set((sentKeys ?? []).map((k) => k.key as string));
    const fresh = matches.filter((m) => !already.has(`cw:${userId}:${m.win.id}`)).slice(0, 5);
    if (fresh.length === 0) continue;

    const items = fresh.map((m) => {
      const ann = annMap.get(m.win.annId);
      return {
        competitor: m.competitor,
        title: ann?.title ?? `공고번호 ${m.win.annId}`,
        orgName: ann?.orgName ?? "-",
        finalPrice: m.win.finalPrice,
        bidRate: m.win.bidRate,
        numBidders: m.win.numBidders,
        annDbId: ann?.id ?? null,
      };
    });

    try {
      await resend.emails.send({
        from: "낙비 <noreply@naktal.me>",
        to: u.notifyEmail,
        subject: `[낙비] 추적 경쟁사 낙찰 알림 ${items.length}건`,
        html: buildHtml(u.bizName, items),
      });
      sent++;

      // 카카오 알림톡 (솔라피, 2026-07-10) — 대표 1건, 검수 승인·notifyPhone 있을 때만 발송
      if (isSolapiConfigured() && u.notifyPhone) {
        const it = items[0];
        if (it) {
          await sendAlimtalk({
            to: u.notifyPhone,
            templateId: process.env.SOLAPI_TEMPLATE_COMPETITOR,
            variables: {
              "#{회사명}": u.bizName || "고객",
              "#{경쟁사}": it.competitor,
              "#{공고명}": items.length > 1 ? `${it.title} 외 ${items.length - 1}건` : it.title,
              "#{발주처}": it.orgName,
              "#{낙찰가}": fmtWon(it.finalPrice),
              "#{낙찰률}": `${Number(it.bidRate).toFixed(3)}%`,
            },
          });
        }
      }

      const resetAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      await admin.from("RateLimit").upsert(
        fresh.map((m) => ({ id: crypto.randomUUID(), key: `cw:${userId}:${m.win.id}`, count: 1, resetAt, updatedAt: now })),
        { onConflict: "key" },
      );
    } catch (err) {
      console.error(`[경쟁사 알림 실패] ${u.notifyEmail}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent, wins: winRows.length, watches: watches.length });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCompetitorAlerts();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return runCompetitorAlerts();
}
