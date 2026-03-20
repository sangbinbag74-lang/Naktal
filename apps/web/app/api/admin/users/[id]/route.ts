import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const supabase = await createClient();

  const [userRes, alertsRes, subRes] = await Promise.all([
    supabase.from("User").select("*").eq("id", id).single(),
    supabase.from("UserAlert").select("*").eq("userId", id),
    supabase.from("Subscription").select("*").eq("userId", id).single(),
  ]);

  return NextResponse.json({
    user: userRes.data,
    alerts: alertsRes.data ?? [],
    subscription: subRes.data,
  });
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const supabase = await createClient();
  const body = (await request.json()) as {
    plan?: string;
    adminMemo?: string;
    currentPeriodEnd?: string;
    reason?: string;
  };

  // 변경 전 상태 기록
  const { data: before } = await supabase.from("User").select("plan,adminMemo").eq("id", id).single();

  const updates: Record<string, unknown> = {};
  if (body.plan !== undefined) updates.plan = body.plan;
  if (body.adminMemo !== undefined) updates.adminMemo = body.adminMemo;

  const { error } = await supabase.from("User").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 구독 만료일 변경
  if (body.currentPeriodEnd) {
    await supabase
      .from("Subscription")
      .update({ currentPeriodEnd: body.currentPeriodEnd })
      .eq("userId", id);
  }

  await writeAdminLog({
    adminId: guard.adminId,
    action: "USER_UPDATE",
    targetId: id,
    before,
    after: updates,
    reason: body.reason,
  });

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const supabase = await createClient();
  const body = (await request.json()) as { action: string; reason?: string };

  if (body.action === "deactivate") {
    await supabase.from("User").update({ isActive: false }).eq("id", id);
    await writeAdminLog({
      adminId: guard.adminId,
      action: "USER_DEACTIVATE",
      targetId: id,
      reason: body.reason,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "activate") {
    await supabase.from("User").update({ isActive: true }).eq("id", id);
    await writeAdminLog({
      adminId: guard.adminId,
      action: "USER_ACTIVATE",
      targetId: id,
      reason: body.reason,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
