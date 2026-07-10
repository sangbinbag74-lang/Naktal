import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { sendAlimtalk, isSolapiConfigured } from "@/lib/notifications/solapi";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";

interface Announcement {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  budget: string;
  deadline: string;
  category: string;
  region: string;
  createdAt: string;
}

interface UserAlert {
  id: string;
  userId: string;
  keywords: string[];
  categories: string[];
  regions: string[];
  minBudget: string | null;
  maxBudget: string | null;
}

interface DbUser {
  id: string;
  bizName: string;
  notifyEmail: string | null;
  notifyPhone: string | null;
  plan: string;
  grandfathered: boolean | null;
}

function matchesAlert(ann: Announcement, alert: UserAlert): boolean {
  if (alert.keywords.length > 0) {
    const titleLower = ann.title.toLowerCase();
    if (!alert.keywords.some((k) => titleLower.includes(k.toLowerCase()))) return false;
  }
  if (alert.categories.length > 0 && !alert.categories.includes(ann.category)) return false;
  if (alert.regions.length > 0 && !alert.regions.includes(ann.region)) return false;
  if (alert.minBudget && parseInt(ann.budget, 10) < parseInt(alert.minBudget, 10)) return false;
  if (alert.maxBudget && parseInt(ann.budget, 10) > parseInt(alert.maxBudget, 10)) return false;
  return true;
}

function buildEmailHtml(ann: Announcement, bizName: string): string {
  const budget = new Intl.NumberFormat("ko-KR").format(parseInt(ann.budget, 10));
  const deadline = new Date(ann.deadline).toLocaleDateString("ko-KR");
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
  <h1 style="color:#1E3A5F;font-size:20px;margin-bottom:4px">낙비</h1>
  <p style="color:#94A3B8;font-size:11px;margin:0 0 8px">내 손안의 AI 낙찰비서</p>
  <p style="color:#6b7280;font-size:14px;margin-top:0">${bizName}님을 위한 신규 공고 알림</p>
  <hr style="border-color:#e5e7eb;margin:16px 0"/>
  <h2 style="font-size:16px;color:#111827">${ann.title}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
    <tr><td style="padding:6px 0;color:#6b7280;width:120px">발주기관</td><td>${ann.orgName}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">기초금액</td><td style="font-weight:bold;color:#1E3A5F">${budget}원</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">입찰마감</td><td>${deadline}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">업종 / 지역</td><td>${ann.category} / ${ann.region}</td></tr>
  </table>
  <div style="margin-top:20px">
    <a href="${SITE_URL}/announcements/${ann.id}" style="display:inline-block;padding:10px 20px;background:#1E3A5F;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">공고 상세 보기</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px">
    이 메일은 낙비 알림 설정에 따라 발송되었습니다.<br/>
    알림 설정 변경: ${SITE_URL}/alerts
  </p>
</div>`;
}

// 발송 본체 — 관리자 수동(POST)·Vercel Cron(GET) 공용 (2026-07-09 cron 가동)
async function runNotify(): Promise<NextResponse> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = createAdminClient(); // cron 은 쿠키 세션이 없으므로 service role

  // 오늘 등록된 신규 공고
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: announcements } = await supabase
    .from("Announcement")
    .select("*")
    .gte("createdAt", today.toISOString());

  if (!announcements || announcements.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "신규 공고 없음" });
  }

  // 활성 UserAlert 조회
  const { data: userAlerts } = await supabase
    .from("UserAlert")
    .select("*, user:User(id, bizName, notifyEmail, notifyPhone, plan, grandfathered)")
    .eq("active", true);

  let sentCount = 0;
  let alimtalkCount = 0;
  const alimtalkSentUser = new Set<string>(); // 유저당 일 1건 (알림톡 과금 통제)

  for (const alertRow of userAlerts ?? []) {
    const alert = alertRow as UserAlert & { user: DbUser };
    const user = alert.user;
    if (!user?.notifyEmail) continue;

    const matched = (announcements as Announcement[]).filter((ann) => matchesAlert(ann, alert));
    if (matched.length === 0) continue;

    // 각 매칭 공고마다 이메일 발송 (최대 5건/유저/일)
    for (const ann of matched.slice(0, 5)) {
      try {
        await resend.emails.send({
          from: "낙비 <noreply@naktal.me>",
          to: user.notifyEmail,
          subject: `[낙비] 새 공고: ${ann.title}`,
          html: buildEmailHtml(ann, user.bizName),
        });
        sentCount++;
      } catch (err) {
        console.error(`[알림 발송 실패] ${user.notifyEmail}:`, err);
      }
    }

    // 카카오 알림톡 (솔라피, 2026-07-10) — LITE 이상 혜택, 유저당 일 1건 (첫 매칭 공고)
    const effPlan = user.grandfathered ? "PRO" : user.plan;
    const alimtalkEligible = effPlan === "LITE" || effPlan === "STANDARD" || effPlan === "PRO" || effPlan === "BIZ" || effPlan === "MASTER";
    const first = matched[0];
    if (alimtalkEligible && first && user.notifyPhone && isSolapiConfigured() && !alimtalkSentUser.has(user.id)) {
      const ok = await sendAlimtalk({
        to: user.notifyPhone,
        variables: {
          "#{회사명}": user.bizName || "고객",
          "#{공고명}": first.title.slice(0, 40),
          "#{발주처}": first.orgName.slice(0, 20),
          "#{마감일}": new Date(first.deadline).toLocaleDateString("ko-KR"),
        },
      });
      if (ok) { alimtalkCount++; alimtalkSentUser.add(user.id); }
    }
  }

  return NextResponse.json({ ok: true, sent: sentCount, alimtalk: alimtalkCount, solapiConfigured: isSolapiConfigured() });
}

// 관리자 수동 트리거 (기존 호환)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return runNotify();
}

// Vercel Cron (매일 09:00 KST) — Bearer CRON_SECRET (seo-ping 과 동일 패턴)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runNotify();
}
