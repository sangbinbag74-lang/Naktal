/**
 * 구독 만료 처리 (2026-07-09 검증에서 부재 발견 — 만료돼도 영원히 유료 유지되던 구멍)
 *
 * 매일 08:30 KST:
 *  ① 만료 D-3 이내 ACTIVE 구독 → 연장 안내 메일 (계좌이체 재결제 유도, 자동갱신 아님)
 *  ② currentPeriodEnd 경과 ACTIVE 구독 → status EXPIRED + User.plan FREE 강등
 *     (grandfathered 초기회원은 PRO 유지)
 *
 * 인증: Bearer CRON_SECRET / 관리자 수동 POST(x-admin-secret)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { sendAlimtalk, isSolapiConfigured } from "@/lib/notifications/solapi";
import { PLAN_LABELS } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";

function reminderHtml(bizName: string, plan: string, endDate: string): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e8ecf2">
    <h1 style="color:#1B3A6B;font-size:20px;margin:0 0 4px">낙비</h1>
    <p style="color:#64748B;font-size:13px;margin:0 0 16px">${bizName}님, 구독 만료가 다가옵니다.</p>
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px;margin-bottom:16px;font-size:13.5px;color:#92400E">
      <strong>${plan}</strong> 플랜이 <strong>${endDate}</strong>에 만료됩니다.<br/>
      낙비는 자동으로 결제되지 않습니다 — 계속 이용하시려면 아래에서 연장해주세요.
    </div>
    <a href="${SITE_URL}/billing" style="display:block;text-align:center;padding:13px;background:#1B3A6B;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">구독 연장하기 (계좌이체)</a>
    <p style="color:#9CA3AF;font-size:11px;margin-top:16px;text-align:center">만료 후에는 무료 플랜(정밀 추천 월 3건)으로 전환됩니다. 데이터는 사라지지 않습니다.</p>
  </div>
</div>`;
}

async function runExpiry(): Promise<NextResponse> {
  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const now = new Date();
  const d3 = new Date(now.getTime() + 3 * 86400000);

  // ① 만료 임박 안내 (D-3 이내, 미발송분만 — RateLimit 키로 1회 보장)
  const { data: expiring } = await admin
    .from("Subscription")
    .select("id,userId,plan,currentPeriodEnd")
    .eq("status", "ACTIVE")
    .gt("currentPeriodEnd", now.toISOString())
    .lt("currentPeriodEnd", d3.toISOString());
  let reminded = 0;
  for (const sub of (expiring ?? []) as { id: string; userId: string; plan: string; currentPeriodEnd: string }[]) {
    const key = `subexp:${sub.id}:${sub.currentPeriodEnd.slice(0, 10)}`;
    const { count } = await admin.from("RateLimit").select("key", { count: "exact", head: true }).eq("key", key);
    if ((count ?? 0) > 0) continue;
    const { data: u } = await admin.from("User").select("bizName,notifyEmail,notifyPhone").eq("id", sub.userId).single();
    if (!u?.notifyEmail) continue;
    try {
      await resend.emails.send({
        from: "낙비 <noreply@naktal.me>",
        to: u.notifyEmail,
        subject: `[낙비] ${sub.plan} 구독이 곧 만료됩니다 (${sub.currentPeriodEnd.slice(0, 10)})`,
        html: reminderHtml(u.bizName as string, sub.plan, sub.currentPeriodEnd.slice(0, 10)),
      });
      reminded++;

      // 카카오 알림톡 (솔라피, 2026-07-10) — 검수 승인·notifyPhone 있을 때만
      if (isSolapiConfigured() && u.notifyPhone) {
        await sendAlimtalk({
          to: u.notifyPhone as string,
          templateId: process.env.SOLAPI_TEMPLATE_EXPIRY,
          variables: {
            "#{고객명}": (u.bizName as string) || "고객",
            "#{서비스명}": "낙비",
            "#{만료일}": sub.currentPeriodEnd.slice(0, 10),
            "#{서비스플랜}": PLAN_LABELS[sub.plan as Plan] ?? sub.plan,
          },
        });
      }
      await admin.from("RateLimit").upsert(
        { id: crypto.randomUUID(), key, count: 1, resetAt: new Date(now.getTime() + 30 * 86400000).toISOString(), updatedAt: now.toISOString() },
        { onConflict: "key" },
      );
    } catch (err) {
      console.error("[구독만료 안내 실패]", err);
    }
  }

  // ② 만료 경과 → EXPIRED + FREE 강등 (grandfathered 는 PRO 유지)
  const { data: expired } = await admin
    .from("Subscription")
    .select("id,userId,plan")
    .eq("status", "ACTIVE")
    .lt("currentPeriodEnd", now.toISOString());
  let downgraded = 0;
  for (const sub of (expired ?? []) as { id: string; userId: string; plan: string }[]) {
    await admin.from("Subscription").update({ status: "EXPIRED" }).eq("id", sub.id);
    const { data: u } = await admin.from("User").select("grandfathered").eq("id", sub.userId).single();
    await admin.from("User").update({ plan: u?.grandfathered ? "PRO" : "FREE" }).eq("id", sub.userId);
    downgraded++;
  }

  return NextResponse.json({ ok: true, reminded, downgraded });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runExpiry();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return runExpiry();
}
