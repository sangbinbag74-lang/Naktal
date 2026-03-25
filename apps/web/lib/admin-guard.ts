/**
 * 어드민 API Route 인증 헬퍼.
 * naktal_admin 쿠키(HMAC 검증) OR x-admin-secret 헤더 중 하나면 통과.
 * 파트너 로그인은 Supabase 세션 없이 쿠키만 사용하므로 isAdmin DB 체크 제거.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";

export async function requireAdmin(
  request: NextRequest
): Promise<true | NextResponse> {
  // 1. naktal_admin 쿠키 검증 (파트너 로그인)
  const cookieOk = await verifyAdminSession();

  // 2. x-admin-secret 헤더 검증 (서버간 호출용)
  const headerSecret = request.headers.get("x-admin-secret");
  const adminKey = process.env.ADMIN_SECRET_KEY;
  const headerOk = !!adminKey && headerSecret === adminKey;

  if (!cookieOk && !headerOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return true;
}

/** AdminLog 기록 */
export async function writeAdminLog(opts: {
  adminId: string;
  action: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/server");
  const supabase = createAdminClient();
  await supabase.from("AdminLog").insert({
    adminId: opts.adminId,
    action: opts.action,
    targetId: opts.targetId,
    before: opts.before ?? null,
    after: opts.after ?? null,
    reason: opts.reason ?? null,
  });
}
