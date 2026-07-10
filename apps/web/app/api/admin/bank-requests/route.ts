import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 계좌이체 신청 목록 (기본 PENDING)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = createAdminClient();
  const status = new URL(request.url).searchParams.get("status") ?? "PENDING";

  let query = supabase
    .from("BankTransferRequest")
    .select("id,userId,plan,period,amount,depositorName,status,adminMemo,createdAt,confirmedAt")
    .order("createdAt", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const requests = data ?? [];

  // 신청자 정보 배치 조회
  const userIds = [...new Set(requests.map((r) => r.userId as string))];
  let userMap: Record<string, { bizName: string; bizNo: string; plan: string }> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from("User").select("id,bizName,bizNo,plan").in("id", userIds);
    userMap = Object.fromEntries((users ?? []).map((u) => [u.id as string, u as { bizName: string; bizNo: string; plan: string }]));
  }
  return NextResponse.json({ requests, userMap });
}

// 입금 확인 / 거절
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = createAdminClient();
  const body = (await request.json().catch(() => ({}))) as { requestId?: string; action?: "confirm" | "reject"; memo?: string };
  if (!body.requestId || !body.action) return NextResponse.json({ error: "requestId/action 필요" }, { status: 400 });

  const { data: req } = await supabase
    .from("BankTransferRequest")
    .select("id,userId,plan,period,amount,status")
    .eq("id", body.requestId)
    .single();
  if (!req) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (req.status !== "PENDING") return NextResponse.json({ error: "이미 처리된 신청입니다." }, { status: 409 });

  if (body.action === "reject") {
    await supabase.from("BankTransferRequest").update({ status: "REJECTED", adminMemo: body.memo ?? null }).eq("id", req.id);
    await writeAdminLog({ adminId: "partner", action: "BANK_TRANSFER_REJECT", targetId: req.id, before: req, after: { status: "REJECTED" }, reason: body.memo });
    return NextResponse.json({ ok: true });
  }

  // confirm: 플랜 승급 + Subscription ACTIVE + 신청 CONFIRMED
  const months = req.period === "YEARLY" ? 12 : 1;
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + months);

  await supabase.from("User").update({ plan: req.plan }).eq("id", req.userId);
  // Subscription upsert (userId unique)
  const { data: existingSub } = await supabase.from("Subscription").select("id").eq("userId", req.userId).maybeSingle();
  if (existingSub) {
    await supabase.from("Subscription").update({ plan: req.plan, status: "ACTIVE", currentPeriodEnd: periodEnd.toISOString() }).eq("id", existingSub.id);
  } else {
    await supabase.from("Subscription").insert({
      id: crypto.randomUUID(),
      userId: req.userId,
      plan: req.plan,
      status: "ACTIVE",
      currentPeriodEnd: periodEnd.toISOString(),
    });
  }
  await supabase.from("BankTransferRequest").update({ status: "CONFIRMED", confirmedAt: new Date().toISOString(), adminMemo: body.memo ?? null }).eq("id", req.id);

  await writeAdminLog({ adminId: "partner", action: "BANK_TRANSFER_CONFIRM", targetId: req.id, before: req, after: { status: "CONFIRMED", plan: req.plan, periodEnd: periodEnd.toISOString() }, reason: body.memo });
  return NextResponse.json({ ok: true });
}
