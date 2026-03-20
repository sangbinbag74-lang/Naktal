"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PlanDef {
  id: string;
  name: string;
  price: number;
  priceLabel: string;
  features: string[];
  cta: string;
  disabled: boolean;
  recommended?: boolean;
}

const PLANS: PlanDef[] = [
  {
    id: "FREE",
    name: "무료",
    price: 0,
    priceLabel: "무료",
    features: ["공고 목록 열람", "알림 1개", "기본 투찰률 통계"],
    cta: "현재 플랜",
    disabled: true,
  },
  {
    id: "STANDARD",
    name: "스탠다드",
    price: 99000,
    priceLabel: "99,000원 / 월",
    features: ["모든 무료 기능", "실시간 공고 알림 무제한", "AI 투찰률 추천", "복수예가 분석", "경쟁사 기본 분석"],
    cta: "스탠다드 시작",
    disabled: false,
    recommended: true,
  },
  {
    id: "PRO",
    name: "프로",
    price: 199000,
    priceLabel: "199,000원 / 월",
    features: ["모든 스탠다드 기능", "경쟁사 심층 분석", "우선 고객 지원", "맞춤형 리포트"],
    cta: "프로 시작",
    disabled: false,
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handlePayment(planId: "STANDARD" | "PRO", amount: number) {
    setLoading(planId);
    try {
      const portoneModule = await import("@portone/browser-sdk/v2");
      const paymentId = `naktal-${planId.toLowerCase()}-${Date.now()}`;

      const response = await portoneModule.requestPayment({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!,
        paymentId,
        orderName: `낙탈AI ${planId === "STANDARD" ? "스탠다드" : "프로"} 구독`,
        totalAmount: amount,
        currency: "CURRENCY_KRW",
        payMethod: "EASY_PAY",
      });

      if (response?.code !== undefined) {
        console.error("[결제 실패]", response.message);
        return;
      }

      // 결제 검증
      const verifyRes = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, plan: planId, expectedAmount: amount }),
      });
      const verifyData = (await verifyRes.json()) as { ok: boolean; message?: string };
      if (verifyData.ok) {
        window.location.href = "/dashboard";
      } else {
        console.error("[결제 검증 실패]", verifyData.message);
      }
    } catch (err) {
      console.error("[결제 오류]", err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">요금제</h2>
        <p className="text-sm text-gray-500 mt-1">필요한 플랜을 선택하세요.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={`relative ${plan.recommended ? "border-[#1E3A5F] border-2 shadow-lg" : ""}`}
          >
            {plan.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-[#1E3A5F] text-white px-3">추천</Badge>
              </div>
            )}
            <CardHeader className="text-center pt-6">
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <p className="text-2xl font-bold text-[#1E3A5F] mt-2">{plan.priceLabel}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={plan.recommended ? "default" : "outline"}
                style={plan.recommended ? { backgroundColor: "#1E3A5F" } : {}}
                disabled={plan.disabled || loading === plan.id}
                onClick={() => {
                  if (plan.id !== "FREE") {
                    handlePayment(plan.id as "STANDARD" | "PRO", plan.price);
                  }
                }}
              >
                {loading === plan.id ? "결제 중..." : plan.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center">
        카카오페이 · 네이버페이 · 토스페이 · 신용카드 결제 가능. 매월 자동 갱신.
      </p>
    </div>
  );
}
