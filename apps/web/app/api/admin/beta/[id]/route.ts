import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(request);
  if (guard !== true) return guard;

  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  const action = body.action;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action은 approve 또는 reject 이어야 합니다." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 현재 상태 조회
  const { data: app, error: fetchErr } = await admin
    .from("BetaApplication")
    .select("id,status,bizName")
    .eq("id", id)
    .single();

  if (fetchErr || !app) {
    return NextResponse.json({ error: "신청 건을 찾을 수 없습니다." }, { status: 404 });
  }

  if (app.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리된 신청입니다." }, { status: 409 });
  }

  const newStatus = action === "approve" ? "APPROVED" : "REJECTED";

  const { error: updateErr } = await admin
    .from("BetaApplication")
    .update({ status: newStatus })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // AdminLog 기록 (어드민 식별자 파악)
  let adminId = "system";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) adminId = user.id;
  } catch { /* ignore */ }

  await admin.from("AdminLog").insert({
    adminId,
    action: action === "approve" ? "BETA_APPROVE" : "BETA_REJECT",
    targetId: id,
    before: { status: "PENDING" },
    after: { status: newStatus },
    reason: null,
  });

  return NextResponse.json({ ok: true, status: newStatus });
}
