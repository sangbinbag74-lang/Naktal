/**
 * 어드민 API Route 인증 헬퍼.
 * ADMIN_SECRET_KEY 헤더 검증 + Supabase isAdmin 확인.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(
  request: NextRequest
): Promise<{ adminId: string } | NextResponse> {
  // 1. ADMIN_SECRET_KEY 헤더 검증
  const secret = request.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Supabase 세션 + isAdmin 확인
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: dbUser } = await supabase
    .from("User")
    .select("id,isAdmin,isActive")
    .eq("supabaseId", user.id)
    .single();

  const u = dbUser as { id: string; isAdmin: boolean; isActive: boolean } | null;
  if (!u?.isAdmin || !u?.isActive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { adminId: u.id };
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
  const supabase = await createClient();
  await supabase.from("AdminLog").insert({
    adminId: opts.adminId,
    action: opts.action,
    targetId: opts.targetId,
    before: opts.before ?? null,
    after: opts.after ?? null,
    reason: opts.reason ?? null,
  });
}
