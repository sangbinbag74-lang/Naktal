import { NextRequest, NextResponse } from "next/server";
import * as PortOneServer from "@portone/server-sdk";
import { createClient } from "@/lib/supabase/server";

const PLAN_PRICES: Record<string, number> = {
  STANDARD: 99000,
  PRO: 199000,
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    paymentId: string;
    plan: string;
    expectedAmount: number;
  };

  // 포트원 서버에서 결제 정보 조회
  const portone = PortOneServer.PortOneClient({ secret: process.env.PORTONE_SECRET_KEY! });

  let payment: Awaited<ReturnType<typeof portone.payment.getPayment>>;
  try {
    payment = await portone.payment.getPayment({ paymentId: body.paymentId });
  } catch (err) {
    console.error("[payment/verify] 포트원 조회 실패:", err);
    return NextResponse.json({ ok: false, message: "결제 정보 조회 실패" }, { status: 502 });
  }

  // 금액 검증
  const expectedAmount = PLAN_PRICES[body.plan];
  if (!expectedAmount) return NextResponse.json({ ok: false, message: "Invalid plan" }, { status: 400 });
  const paymentAny = payment as Record<string, unknown>;
  const paymentAmount = paymentAny.amount as { total?: number } | undefined;
  if (paymentAmount?.total !== expectedAmount) {
    return NextResponse.json({ ok: false, message: "결제 금액 불일치" }, { status: 400 });
  }

  // User 조회
  const { data: dbUser } = await supabase.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
  const userId = (dbUser as { id: string }).id;

  // Subscription 업데이트
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  await supabase.from("Subscription").upsert(
    {
      userId,
      plan: body.plan,
      portoneOrderId:   body.paymentId,
      portonePaymentId: body.paymentId,
      status: "ACTIVE",
      currentPeriodEnd: currentPeriodEnd.toISOString(),
    },
    { onConflict: "userId" }
  );

  // User.plan 업데이트
  await supabase.from("User").update({ plan: body.plan }).eq("id", userId);

  return NextResponse.json({ ok: true });
}
