/**
 * Vercel Cron — SEO 색인 즉시 요청
 *
 * 매일 1회 IndexNow API에 공개 페이지 URL 일괄 제출.
 * 박상빈님 데이터 일체 노출 X (기존 공개 6개 페이지만).
 *
 * 인증: Bearer CRON_SECRET 헤더 (Vercel Cron 표준)
 * 키 미설정 시 즉시 200 OK 반환 (noop, 배포 차단 방지).
 */

import { NextRequest, NextResponse } from "next/server";
import { submitToIndexNow, getPublicUrls } from "@/lib/seo/indexnow";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urls = getPublicUrls();
  const result = await submitToIndexNow(urls);

  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    urlCount: result.urlCount,
    urls,
    message: result.message,
    timestamp: new Date().toISOString(),
  });
}
