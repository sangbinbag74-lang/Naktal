import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { PLAN_PRICES, PLAN_PRICES_YEARLY } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

export const dynamic = "force-dynamic";

// 계좌이체 입금 계좌 (토스 계약 전까지 유일 결제수단, 2026-07-09)
export const BANK_INFO = { bank: "신한은행", account: "100-038-306439", holder: "주식회사 호라이즌" };

const ORDERABLE: Plan[] = ["LITE", "PRO", "BIZ", "MASTER"];

// 내 신청 현황
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ requests: [] });

  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ requests: [] });

  const { data } = await admin
    .from("BankTransferRequest")
    .select("id,plan,period,amount,depositorName,status,createdAt")
    .eq("userId", dbUser.id)
    .order("createdAt", { ascending: false })
    .limit(5);
  return NextResponse.json({ requests: data ?? [], bankInfo: BANK_INFO });
}

// 구독 신청 (입금 대기 생성)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { plan?: string; period?: string; depositorName?: string };
  const plan = (body.plan ?? "") as Plan;
  const period = body.period === "YEARLY" ? "YEARLY" : "MONTHLY";
  const depositorName = (body.depositorName ?? "").trim();

  if (!ORDERABLE.includes(plan)) return NextResponse.json({ ok: false, error: "선택할 수 없는 플랜입니다." }, { status: 400 });
  if (!depositorName) return NextResponse.json({ ok: false, error: "입금자명을 입력해주세요." }, { status: 400 });

  // 금액은 서버에서 산정 (클라이언트 신뢰 X)
  const amount = period === "YEARLY" ? PLAN_PRICES_YEARLY[plan] : PLAN_PRICES[plan];

  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("id,plan").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ ok: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });

  // 중복 PENDING 방지
  const { count } = await admin
    .from("BankTransferRequest")
    .select("id", { count: "exact", head: true })
    .eq("userId", dbUser.id)
    .eq("status", "PENDING");
  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: "입금 확인 대기 중인 신청이 있습니다. 입금 후 영업일 기준 1일 내 처리됩니다." }, { status: 409 });
  }

  const { error } = await admin.from("BankTransferRequest").insert({
    id: crypto.randomUUID(),
    userId: dbUser.id,
    plan,
    period,
    amount,
    depositorName,
    status: "PENDING",
  });
  if (error) {
    console.error("[bank-request]", error.message);
    return NextResponse.json({ ok: false, error: "신청 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, amount, bankInfo: BANK_INFO });
}
