import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";

const PLAN_PRICES: Record<string, number> = { STANDARD: 99000, PRO: 199000 };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 50;

  let query = supabase
    .from("Subscription")
    .select("id,userId,plan,portonePaymentId,status,createdAt,currentPeriodEnd", { count: "exact" })
    .order("createdAt", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq("status", status);
  if (plan) query = query.eq("plan", plan);
  if (from) query = query.gte("createdAt", from);
  if (to) query = query.lte("createdAt", to + "T23:59:59");

  const { data, count } = await query;

  // 월별 매출 합계 계산
  const subs = (data ?? []) as { plan: string; status: string; createdAt: string }[];
  const monthlyRevenue = subs
    .filter((s) => s.status === "ACTIVE")
    .reduce((sum, s) => sum + (PLAN_PRICES[s.plan] ?? 0), 0);

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    monthlyRevenue,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = await createClient();
  const body = (await request.json()) as { subscriptionId: string; reason?: string };

  const { data: sub } = await supabase
    .from("Subscription")
    .select("userId,plan,status")
    .eq("id", body.subscriptionId)
    .single();

  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("Subscription").update({ status: "CANCELLED" }).eq("id", body.subscriptionId);
  await supabase.from("User").update({ plan: "FREE" }).eq("id", (sub as { userId: string }).userId);

  await writeAdminLog({
    adminId: guard.adminId,
    action: "SUBSCRIPTION_CANCEL",
    targetId: body.subscriptionId,
    before: sub,
    after: { status: "CANCELLED" },
    reason: body.reason,
  });

  return NextResponse.json({ ok: true });
}
