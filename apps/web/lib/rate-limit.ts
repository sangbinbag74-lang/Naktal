/**
 * API 속도 제한 헬퍼
 * Supabase RateLimit 테이블 기반 (Redis 없이 동작)
 *
 * 사용:
 *   const { allowed, remaining } = await rateLimit(req, "recommend", 10, 60);
 *   if (!allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429, headers: { "Retry-After": "60" } });
 */

import { createServerClient } from "@supabase/ssr";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * @param key     고유 키 (예: `${userId}:recommend`, `${ip}:auth`)
 * @param limit   허용 횟수
 * @param windowSec 시간 창 (초)
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: () => null as any },
  );

  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);

  const { data: existing } = await supabase
    .from("RateLimit")
    .select("id,count,resetAt")
    .eq("key", key)
    .maybeSingle();

  // 만료된 레코드 또는 없는 경우 → 새로 시작
  if (!existing || new Date(existing.resetAt) <= now) {
    await supabase.from("RateLimit").upsert(
      { key, count: 1, resetAt: resetAt.toISOString() },
      { onConflict: "key" },
    );
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  // 한도 초과
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: new Date(existing.resetAt) };
  }

  // 카운트 증가
  await supabase
    .from("RateLimit")
    .update({ count: existing.count + 1 })
    .eq("key", key);

  return {
    allowed: true,
    remaining: limit - existing.count - 1,
    resetAt: new Date(existing.resetAt),
  };
}

/** IP 추출 (Vercel 환경) */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
