"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const PLANS = [
  {
    id: "FREE",
    name: "무료",
    priceLabel: "0원",
    priceSub: "영원히 무료",
    features: ["공고 목록 열람", "공고 저장(서류함)", "번호 분석 이력 조회"],
    ctaDefault: "무료 플랜",
    accent: "#475569",
    recommended: false,
  },
  {
    id: "PRO",
    name: "프로",
    priceLabel: "9,900원",
    priceSub: "월 / 부가세 포함",
    features: ["AI 투찰가 분석 무제한", "번호 분석 무제한", "사정율 예측 + 추세 분석", "공고 알림 무제한", "투찰 이력 관리"],
    ctaDefault: "프로 시작하기",
    accent: "#1B3A6B",
    recommended: true,
  },
] as const;

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<"FREE" | "STANDARD" | "PRO" | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("User").select("plan").eq("supabaseId", user.id).single()
        .then(({ data }) => { if (data?.plan) setCurrentPlan(data.plan as "FREE" | "STANDARD" | "PRO"); });
    });
  }, []);

  async function handlePayment(amount: number) {
    setLoading("PRO");
    try {
      const portone = await import("@portone/browser-sdk/v2");
      const paymentId = `naktal-pro-${Date.now()}`;
      const response = await portone.requestPayment({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!,
        paymentId,
        orderName: "낙찰AI 프로 구독",
        totalAmount: amount,
        currency: "CURRENCY_KRW",
        payMethod: "EASY_PAY",
      });
      if (response?.code !== undefined) { console.error("[결제 실패]", response.message); return; }
      const verify = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, plan: "PRO", expectedAmount: amount }),
      });
      const data = await verify.json() as { ok: boolean; message?: string };
      if (data.ok) window.location.href = "/dashboard";
      else console.error("[결제 검증 실패]", data.message);
    } catch (err) { console.error("[결제 오류]", err); } finally { setLoading(null); }
  }

  // STANDARD 유저는 PRO로 표시
  const effectivePlan = currentPlan === "STANDARD" ? "PRO" : currentPlan;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>요금제</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>필요한 기능에 맞는 플랜을 선택하세요.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, maxWidth: 680 }}>
        {PLANS.map((plan) => {
          const isCurrent = effectivePlan === plan.id;
          const isDisabled = isCurrent || loading === plan.id;
          const borderStyle = isCurrent
            ? "2px solid #059669"
            : plan.recommended ? `2px solid ${plan.accent}` : "1px solid #E8ECF2";
          return (
            <div key={plan.id} style={{
              background: "#fff", borderRadius: 16, padding: "28px 24px",
              display: "flex", flexDirection: "column", position: "relative",
              border: borderStyle,
              boxShadow: isCurrent ? "0 4px 24px rgba(5,150,105,0.12)" : plan.recommended ? "0 4px 24px rgba(27,58,107,0.10)" : "none",
            }}>
              {isCurrent && (
                <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: "#059669", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 14px", borderRadius: 99 }}>현재 플랜</div>
              )}
              {!isCurrent && plan.recommended && (
                <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: plan.accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 14px", borderRadius: 99 }}>추천</div>
              )}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "#059669" : plan.accent, marginBottom: 8 }}>{plan.name}</div>
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
                disabled={isDisabled}
                onClick={() => { if (plan.id === "PRO") void handlePayment(9900); }}
                style={{ height: 46, borderRadius: 10, fontSize: 14, fontWeight: 600, border: "none", cursor: isDisabled ? "not-allowed" : "pointer", background: isCurrent ? "#ECFDF5" : isDisabled ? "#F1F5F9" : plan.accent, color: isCurrent ? "#059669" : isDisabled ? "#94A3B8" : "#fff" }}
              >{loading === plan.id ? "결제 중..." : isCurrent ? "현재 플랜" : plan.ctaDefault}</button>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "#94A3B8" }}>카카오페이 · 네이버페이 · 토스페이 · 신용카드 결제 가능 · 매월 자동 갱신 · 언제든 해지 가능</div>
    </div>
  );
}
