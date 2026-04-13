/**
 * 어드민 API Route 인증 헬퍼.
 * 다음 3가지 중 하나라도 통과하면 OK:
 *  1. naktal_admin 쿠키 (HMAC 검증, admin-login)
 *  2. x-admin-secret 헤더 (서버간 호출)
 *  3. Supabase 세션 + User.isAdmin=true
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";

export async function requireAdmin(
  request: NextRequest
): Promise<true | NextResponse> {
  // 1. naktal_admin 쿠키 검증 (파트너 로그인)
  const cookieOk = await verifyAdminSession();
  if (cookieOk) return true;

  // 2. x-admin-secret 헤더 검증 (서버간 호출용)
  const headerSecret = request.headers.get("x-admin-secret");
  const adminKey = process.env.ADMIN_SECRET_KEY;
  if (!!adminKey && headerSecret === adminKey) return true;

  // 3. Supabase 세션 + User.isAdmin=true
  try {
    const { createClient, createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const admin = createAdminClient();
      const { data: dbUser } = await admin
        .from("User")
        .select("isAdmin")
        .eq("supabaseId", user.id)
        .single();
      if (dbUser?.isAdmin) return true;
    }
  } catch { /* 세션 없음 */ }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
