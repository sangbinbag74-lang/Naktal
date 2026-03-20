"use client";

import { useState } from "react";

const PLANS = [
  { id: "FREE", name: "무료", priceLabel: "0원", priceSub: "영원히 무료", features: ["CORE 1 번호 추천 월 3회","CORE 3 적격심사 기본","공고 목록 열람","알림 1개"], cta: "현재 플랜", disabled: true, recommended: false, accent: "#475569" },
  { id: "STANDARD", name: "스탠다드", priceLabel: "99,000원", priceSub: "월 / 부가세 포함", features: ["CORE 1 번호 추천 월 30회","CORE 3 적격심사 전체","공고 알림 무제한","마감 임박 알림","투찰 이력 관리"], cta: "스탠다드 시작", disabled: false, recommended: true, accent: "#1B3A6B" },
  { id: "PRO", name: "프로", priceLabel: "199,000원", priceSub: "월 / 부가세 포함", features: ["CORE 1 번호 추천 무제한","CORE 2 실시간 참여자 모니터","CORE 3 적격심사 전체","공고 알림 무제한","투찰 이력 관리"], cta: "프로 시작", disabled: false, recommended: false, accent: "#0F172A" },
] as const;

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handlePayment(planId: "STANDARD" | "PRO", amount: number) {
    setLoading(planId);
    try {
      const portone = await import("@portone/browser-sdk/v2");
      const paymentId = `naktal-${planId.toLowerCase()}-${Date.now()}`;
      const response = await portone.requestPayment({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!,
        paymentId,
        orderName: `낙탈AI ${planId === "STANDARD" ? "스탠다드" : "프로"} 구독`,
        totalAmount: amount, currency: "CURRENCY_KRW", payMethod: "EASY_PAY",
      });
      if (response?.code !== undefined) { console.error("[결제 실패]", response.message); return; }
      const verify = await fetch("/api/payment/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId, plan: planId, expectedAmount: amount }) });
      const data = await verify.json() as { ok: boolean; message?: string };
      if (data.ok) window.location.href = "/dashboard";
      else console.error("[결제 검증 실패]", data.message);
    } catch (err) { console.error("[결제 오류]", err); } finally { setLoading(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>요금제</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>필요한 기능에 맞는 플랜을 선택하세요.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {PLANS.map((plan) => (
          <div key={plan.id} style={{
            background: "#fff", borderRadius: 16, padding: "28px 24px",
            display: "flex", flexDirection: "column", position: "relative",
            border: plan.recommended ? `2px solid ${plan.accent}` : "1px solid #E8ECF2",
            boxShadow: plan.recommended ? "0 4px 24px rgba(27,58,107,0.10)" : "none",
          }}>
            {plan.recommended && (
              <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: plan.accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 14px", borderRadius: 99 }}>추천</div>
            )}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: plan.accent, marginBottom: 8 }}>{plan.name}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", lineHeight: 1 }}>{plan.priceLabel}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{plan.priceSub}</div>
            </div>
            <div style={{ flex: 1, marginBottom: 24 }}>
              {plan.features.map((f) => (
                <div key={f} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <span style={{ color: "#059669", fontSize: 14, lineHeight: "20px", flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: "#374151", lineHeight: "20px" }}>{f}</span>
                </div>
              ))}
            </div>
            <button
              disabled={plan.disabled || loading === plan.id}
              onClick={() => { if (plan.id === "STANDARD") handlePayment("STANDARD", 99000); if (plan.id === "PRO") handlePayment("PRO", 199000); }}
              style={{ height: 46, borderRadius: 10, fontSize: 14, fontWeight: 600, border: "none", cursor: plan.disabled || loading === plan.id ? "not-allowed" : "pointer", background: plan.disabled ? "#F1F5F9" : plan.accent, color: plan.disabled ? "#94A3B8" : "#fff" }}
            >{loading === plan.id ? "결제 중..." : plan.cta}</button>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "#94A3B8" }}>카카오페이 · 네이버페이 · 토스페이 · 신용카드 결제 가능 · 매월 자동 갱신 · 언제든 해지 가능</div>
    </div>
  );
}
