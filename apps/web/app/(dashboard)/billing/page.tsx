"use client";

// 5티어 + 계좌이체 결제 (2026-07-09 박상빈님 확정)
//  - 수수료 전면 폐지, 구독 단일 수익. 토스 계약 체결 전까지 계좌이체 단독.
//  - "자동 갱신" 표기 금지 (정기결제 미구현 — 허위표시 방지). 입금 확인 후 기간제 활성화.
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type PlanId = "FREE" | "LITE" | "PRO" | "BIZ" | "MASTER";
type Period = "MONTHLY" | "YEARLY";

const BANK = { bank: "신한은행", account: "100-038-306439", holder: "주식회사 호라이즌" };

const PLANS: {
  id: PlanId; name: string; monthly: number; yearly: number;
  original?: number; badge?: string; accent: string;
  features: { text: string; soon?: boolean }[];
}[] = [
  {
    id: "FREE", name: "무료", monthly: 0, yearly: 0, accent: "#475569",
    features: [
      { text: "공고 검색·상세 무제한" },
      { text: "사정율 박스권(범위) 전 공고" },
      { text: "정밀 추천 월 3건" },
      { text: "개찰 후 성적표 알림" },
      { text: "공고 알림 3개 · 경쟁사 추적 1개사" },
    ],
  },
  {
    id: "LITE", name: "라이트", monthly: 9900, yearly: 99000, accent: "#1D4ED8",
    features: [
      { text: "정밀 투찰가·번호 추천 무제한" },
      { text: "광고 제거" },
      { text: "공고 알림 10개 + 카카오 알림톡" },
      { text: "경쟁사 추적 3개사" },
      { text: "사정율 추세·안정성 분석" },
    ],
  },
  {
    id: "PRO", name: "프로", monthly: 19900, yearly: 199000, original: 29900, badge: "⭐ 가장 인기", accent: "#1B3A6B",
    features: [
      { text: "AI 원본값 — 개인화 보정 0, 운영점 그대로" },
      { text: "실시간 참여자 모니터 (마감 직전)" },
      { text: "경쟁사·발주처 심층 분석" },
      { text: "우선 알림 무제한 · 엑셀 내보내기" },
      { text: "경쟁사 추적 5개사" },
    ],
  },
  {
    id: "BIZ", name: "비즈", monthly: 49900, yearly: 499000, accent: "#6D28D9",
    features: [
      { text: "프로 전체 포함" },
      { text: "팀 계정 3개 (대표+실무자)", soon: true },
      { text: "주간 맞춤 심층 리포트" },
      { text: "경쟁사 추적 10개사" },
      { text: "우선 1:1 지원" },
    ],
  },
  {
    id: "MASTER", name: "마스터", monthly: 99000, yearly: 990000, accent: "#0F172A",
    features: [
      { text: "비즈 전체 포함" },
      { text: "팀 계정 5개", soon: true },
      { text: "월 1회 맞춤 백테스트 리포트" },
      { text: "전담 온보딩 · 컨설팅 콜" },
      { text: "경쟁사 추적 무제한" },
    ],
  },
];

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function BillingPage() {
  const [period, setPeriod] = useState<Period>("MONTHLY");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [grandfathered, setGrandfathered] = useState(false);
  const [pending, setPending] = useState<{ plan: string; amount: number } | null>(null);
  const [applyPlan, setApplyPlan] = useState<PlanId | null>(null);
  const [depositor, setDepositor] = useState("");
  const [done, setDone] = useState<{ amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("User").select("plan,grandfathered").eq("supabaseId", user.id).single()
        .then(({ data }) => {
          if (data?.plan) setCurrentPlan(data.plan as string);
          if (data?.grandfathered) setGrandfathered(true);
        });
    });
    fetch("/api/billing/bank-request").then((r) => r.json()).then((d: { requests?: { plan: string; amount: number; status: string }[] }) => {
      const p = (d.requests ?? []).find((x) => x.status === "PENDING");
      if (p) setPending({ plan: p.plan, amount: p.amount });
    }).catch(() => {});
  }, []);

  async function submitApply() {
    if (!applyPlan) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/bank-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: applyPlan, period, depositorName: depositor }),
      });
      const data = (await res.json()) as { ok: boolean; amount?: number; error?: string };
      if (!data.ok) { setError(data.error ?? "신청에 실패했습니다."); return; }
      setDone({ amount: data.amount ?? 0 });
      setPending({ plan: applyPlan, amount: data.amount ?? 0 });
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally { setLoading(false); }
  }

  const effective = currentPlan === "STANDARD" ? "LITE" : currentPlan;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>요금제</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>
          낙찰 수수료 0원 — 구독만으로 모든 기능을 사용합니다.
        </p>
      </div>

      {grandfathered && (
        <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#065F46" }}>
          🎖 초기 회원 혜택 — <strong>프로 플랜 영구 무료</strong>가 적용된 계정입니다.
        </div>
      )}

      {pending && !done && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400E" }}>
          ⏳ <strong>{pending.plan}</strong> 플랜 입금 확인 대기 중 ({fmt(pending.amount)}원 · {BANK.bank} {BANK.account} {BANK.holder}) — 입금 후 영업일 1일 내 활성화됩니다.
        </div>
      )}

      {/* 월/연 토글 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {(["MONTHLY", "YEARLY"] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            height: 36, padding: "0 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: period === p ? "2px solid #1B3A6B" : "1px solid #E2E8F0",
            background: period === p ? "#EFF6FF" : "#fff",
            color: period === p ? "#1B3A6B" : "#64748B", cursor: "pointer",
          }}>
            {p === "MONTHLY" ? "월간" : "연간 (2개월 무료)"}
          </button>
        ))}
      </div>

      {/* 5티어 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        {PLANS.map((plan) => {
          const isCurrent = effective === plan.id;
          const price = period === "MONTHLY" ? plan.monthly : plan.yearly;
          const canApply = plan.id !== "FREE" && !isCurrent && !pending;
          return (
            <div key={plan.id} style={{
              background: "#fff", borderRadius: 16, padding: "24px 20px",
              display: "flex", flexDirection: "column", position: "relative",
              border: isCurrent ? "2px solid #059669" : plan.badge ? `2px solid ${plan.accent}` : "1px solid #E8ECF2",
              boxShadow: plan.badge ? "0 4px 24px rgba(27,58,107,0.10)" : "none",
            }}>
              {(isCurrent || plan.badge) && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: isCurrent ? "#059669" : plan.accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 99, whiteSpace: "nowrap" }}>
                  {isCurrent ? "현재 플랜" : plan.badge}
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: plan.accent, marginBottom: 8 }}>{plan.name}</div>
                {plan.original && period === "MONTHLY" && (
                  <div style={{ fontSize: 13, color: "#94A3B8", textDecoration: "line-through" }}>정가 {fmt(plan.original)}원</div>
                )}
                <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", lineHeight: 1.15 }}>
                  {price === 0 ? "0원" : `${fmt(price)}원`}
                </div>
                <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3 }}>
                  {price === 0 ? "영원히 무료" : period === "MONTHLY" ? "월 / 부가세 포함 · 런칭 가격" : "연 / 부가세 포함 (2개월 무료)"}
                </div>
              </div>
              <div style={{ flex: 1, marginBottom: 18 }}>
                {plan.features.map((f) => (
                  <div key={f.text} style={{ display: "flex", gap: 7, marginBottom: 8 }}>
                    <span style={{ color: "#059669", fontSize: 13, lineHeight: "18px", flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 12.5, color: "#374151", lineHeight: "18px" }}>
                      {f.text}
                      {f.soon && <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: "#B45309", background: "#FEF3C7", padding: "1px 6px", borderRadius: 4 }}>8월 오픈</span>}
                    </span>
                  </div>
                ))}
              </div>
              <button
                disabled={!canApply}
                onClick={() => { setApplyPlan(plan.id); setDone(null); setError(null); }}
                style={{
                  height: 42, borderRadius: 10, fontSize: 13.5, fontWeight: 700, border: "none",
                  cursor: canApply ? "pointer" : "not-allowed",
                  background: isCurrent ? "#ECFDF5" : canApply ? plan.accent : "#F1F5F9",
                  color: isCurrent ? "#059669" : canApply ? "#fff" : "#94A3B8",
                }}
              >
                {isCurrent ? "현재 플랜" : plan.id === "FREE" ? "기본 제공" : pending ? "입금 확인 대기 중" : "계좌이체로 시작"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", fontSize: 12, color: "#94A3B8" }}>
        결제 수단: 계좌이체 (세금계산서 발행 가능) · 토스페이 결제 준비 중 · 기간 만료 전 알림을 드립니다
      </div>

      {/* 계좌이체 신청 모달 */}
      {applyPlan && (
        <div onClick={() => !loading && setApplyPlan(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,30,60,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 28px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            {done ? (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginBottom: 14 }}>입금 안내</div>
                <div style={{ background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 10, padding: "14px 16px", fontSize: 13.5, color: "#0F172A", lineHeight: 1.9 }}>
                  <div><strong>{BANK.bank} {BANK.account}</strong></div>
                  <div>예금주: {BANK.holder}</div>
                  <div>입금액: <strong style={{ color: "#1B3A6B" }}>{fmt(done.amount)}원</strong></div>
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 12, lineHeight: 1.6 }}>
                  입금자명이 신청 시 입력한 이름과 같아야 확인이 빠릅니다.<br />
                  입금 확인 후 영업일 1일 내 플랜이 활성화되고 알림을 드립니다.
                </div>
                <button onClick={() => setApplyPlan(null)} className="naktal-btn-primary" style={{ marginTop: 18, width: "100%" }}>확인</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
                  {PLANS.find((p) => p.id === applyPlan)?.name} 플랜 신청
                </div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
                  {period === "MONTHLY" ? "월간" : "연간(2개월 무료)"} ·{" "}
                  <strong>{fmt(period === "MONTHLY" ? (PLANS.find((p) => p.id === applyPlan)?.monthly ?? 0) : (PLANS.find((p) => p.id === applyPlan)?.yearly ?? 0))}원</strong>
                </div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>입금자명</label>
                <input value={depositor} onChange={(e) => setDepositor(e.target.value)} placeholder="입금하실 분 성함 (통장 표시명)" className="naktal-input" disabled={loading} />
                {error && <div style={{ marginTop: 10, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: "#DC2626" }}>{error}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={() => setApplyPlan(null)} disabled={loading} style={{ flex: 1, height: 44, borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
                  <button onClick={() => void submitApply()} disabled={loading || !depositor.trim()} className="naktal-btn-primary" style={{ flex: 2, marginTop: 0, opacity: loading || !depositor.trim() ? 0.6 : 1 }}>
                    {loading ? "신청 중..." : "신청하고 계좌 확인"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
