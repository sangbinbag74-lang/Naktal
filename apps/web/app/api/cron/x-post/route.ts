/**
 * Vercel Cron — 매일 1회 X(트위터) 자동 포스팅.
 *
 * 콘텐츠 원천: content-queue.ts(랜딩 페이지 정보만).
 * 박상빈님 데이터 0 노출 — DB·Prisma import 없음.
 *
 * 인증: Bearer CRON_SECRET (Vercel Cron 표준)
 * X 자격증명 미설정 시 즉시 noop (배포 사고 방지).
 */

import { NextRequest, NextResponse } from "next/server";
import { postTweet } from "@/lib/marketing/x-bot";
import { X_POSTS, pickByDate } from "@/lib/marketing/content-queue";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const post = pickByDate(X_POSTS);
  const result = await postTweet(post.text);

  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    tag: post.tag,
    textLength: post.text.length,
    tweetId: result.tweetId,
    message: result.message,
    timestamp: new Date().toISOString(),
  });
}
