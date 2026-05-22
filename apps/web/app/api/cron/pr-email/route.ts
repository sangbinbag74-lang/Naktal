/**
 * Vercel Cron — 주 1회 PR 자동 이메일 발송.
 *
 * 콘텐츠 원천: content-queue.ts(랜딩 페이지 정보만).
 * 박상빈님 데이터 0 노출 — DB·Prisma import 없음.
 *
 * 인증: Bearer CRON_SECRET (Vercel Cron 표준)
 * RESEND_API_KEY 또는 PR_PRESS_EMAILS 미설정 시 즉시 noop.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendPrEmail } from "@/lib/marketing/pr-email";
import { PR_EMAILS, pickByDate } from "@/lib/marketing/content-queue";

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = pickByDate(PR_EMAILS);
  const result = await sendPrEmail(email.subject, email.body);

  return NextResponse.json({
    ok: result.ok,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    tag: email.tag,
    subject: email.subject,
    message: result.message,
    timestamp: new Date().toISOString(),
  });
}
