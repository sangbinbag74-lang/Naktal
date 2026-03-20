import { NextRequest, NextResponse } from "next/server";
import * as PortOneServer from "@portone/server-sdk";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  // 포트원 웹훅 서명 검증
  const webhookSecret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] PORTONE_WEBHOOK_SECRET 미설정");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  type WebhookData = Awaited<ReturnType<typeof PortOneServer.Webhook.verify>>;
  let webhook: WebhookData;
  try {
    webhook = await PortOneServer.Webhook.verify(webhookSecret, rawBody, {
      "webhook-id":        request.headers.get("webhook-id") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    });
  } catch (err) {
    console.error("[webhook] 서명 검증 실패:", err);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = await createClient();

  if (webhook.type === "Transaction.Paid") {
    const paymentId = webhook.data.paymentId;
    await supabase
      .from("Subscription")
      .update({ status: "ACTIVE" })
      .eq("portonePaymentId", paymentId);
  } else if (
    webhook.type === "Transaction.Cancelled" ||
    webhook.type === "Transaction.Failed"
  ) {
    const paymentId = webhook.data.paymentId;
    const { data: sub } = await supabase
      .from("Subscription")
      .select("userId")
      .eq("portonePaymentId", paymentId)
      .single();

    if (sub) {
      const subTyped = sub as { userId: string };
      await supabase.from("Subscription").update({ status: webhook.type === "Transaction.Cancelled" ? "CANCELLED" : "EXPIRED" }).eq("portonePaymentId", paymentId);
      await supabase.from("User").update({ plan: "FREE" }).eq("id", subTyped.userId);
    }
  }

  return NextResponse.json({ ok: true });
}
