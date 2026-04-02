/**
 * GET /api/admin/request-outcome
 * pg_cron 매일 09:00 KST 실행 (또는 관리자 수동 실행)
 * 개찰일(deadline)이 어제인 공고 중 BidOutcome PENDING 사용자에게 결과 입력 요청 알림 발송
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyOutcomeRequest } from "@/lib/notifications/kakao";

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const adminKey = request.headers.get("x-admin-key");
  const validTokens = [process.env.CRON_SECRET, process.env.ADMIN_SECRET_KEY].filter(Boolean);
  if ((!token || !validTokens.includes(token)) && adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 어제 마감된 공고 조회
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBefore = new Date(yesterday);
  dayBefore.setDate(dayBefore.getDate() - 1);

  const { data: announcements } = await admin
    .from("Announcement")
    .select("id,title,orgName")
    .gte("deadline", dayBefore.toISOString())
    .lt("deadline", yesterday.toISOString())
    .limit(200);

  if (!announcements?.length) {
    return NextResponse.json({ ok: true, notified: 0, message: "대상 공고 없음" });
  }

  const annIds = announcements.map((a) => a.id);

  // PENDING 상태인 BidOutcome 조회 + 사용자 이메일/전화번호
  const { data: pendingOutcomes } = await admin
    .from("BidOutcome")
    .select("id,userId,annId,User!userId(email,phone)")
    .in("annId", annIds)
    .eq("result", "PENDING");

  if (!pendingOutcomes?.length) {
    return NextResponse.json({ ok: true, notified: 0, message: "알림 대상 없음" });
  }

  const annMap = new Map(announcements.map((a) => [a.id, a]));
  let notified = 0;
  const errors: string[] = [];

  for (const outcome of pendingOutcomes) {
    const ann = annMap.get(outcome.annId);
    const user = (outcome as any).User;
    if (!ann || !user?.email) continue;

    const outcomeUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me"}/my/outcome/${outcome.annId}`;

    try {
      await notifyOutcomeRequest(user.phone ?? null, user.email, ann.title, outcomeUrl);
      notified++;
    } catch (e) {
      errors.push(`${outcome.id}: ${String(e)}`);
    }

    // rate limit 방지
    await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({ ok: true, notified, errors: errors.length > 0 ? errors : undefined });
}
