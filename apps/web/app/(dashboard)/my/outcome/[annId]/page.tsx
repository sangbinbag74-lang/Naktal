"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface PredictionData {
  annId: string;
  annTitle: string | null;
  annOrgName: string | null;
  annBudget: number | null;
  annDeadline: string | null;
  optimalBidPrice: number;
  predictedSajungRate: number;
  lowerLimitPrice: number;
  combo1?: number[];
  combo2?: number[];
  combo3?: number[];
  existingOutcome?: {
    id: string;
    bidPrice: string | null;
    result: string;
    actualSajungRate: string | null;
    actualFinalPrice: string | null;
    selectedNos: number[];
  } | null;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function OutcomePage() {
  const { annId } = useParams<{ annId: string }>();
  const router = useRouter();

  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [bidPrice, setBidPrice] = useState("");
  const [selectedNos, setSelectedNos] = useState<number[]>([]);
  const [result, setResult] = useState<"WIN" | "LOSE" | "DISQUALIFIED" | "PENDING">("PENDING");
  const [actualFinalPrice, setActualFinalPrice] = useState("");
  const [actualSajungRate, setActualSajungRate] = useState("");
  const [numBidders, setNumBidders] = useState("");

  useEffect(() => {
    fetch(`/api/outcome/${annId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        // 기존 결과 복원
        if (d.existingOutcome) {
          const o = d.existingOutcome;
          if (o.bidPrice) setBidPrice(o.bidPrice);
          if (o.result) setResult(o.result as typeof result);
          if (o.actualSajungRate) setActualSajungRate(o.actualSajungRate);
          if (o.actualFinalPrice) setActualFinalPrice(o.actualFinalPrice);
          if (o.selectedNos?.length) setSelectedNos(o.selectedNos);
        }
      })
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [annId]);

  async function handleSave() {
    if (!bidPrice) { setError("투찰금액을 입력하세요."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/outcome/${annId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bidPrice: parseInt(bidPrice.replace(/,/g, ""), 10),
          selectedNos,
          result,
          actualFinalPrice: actualFinalPrice ? parseInt(actualFinalPrice.replace(/,/g, ""), 10) : null,
          actualSajungRate: actualSajungRate ? parseFloat(actualSajungRate) : null,
          numBidders: numBidders ? parseInt(numBidders, 10) : null,
          bidAt: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setSaved(true);
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const inpStyle: React.CSSProperties = {
    width: "100%", height: 48, border: "1.5px solid #D1D5DB", borderRadius: 10,
    padding: "0 14px", fontSize: 14, color: "#0F172A", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, display: "block" };

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>로딩 중...</div>;

  if (saved) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>결과가 저장되었습니다</div>
      <div style={{ fontSize: 14, color: "#64748B", textAlign: "center", maxWidth: 340 }}>
        입력해주신 결과로 AI 예측 정확도가 개선됩니다.
        {result === "PENDING" && " 개찰 후 결과를 다시 입력해주시면 추천 1회를 추가로 드립니다."}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <Link href="/history" style={{
          padding: "10px 24px", borderRadius: 10, background: "#EEF2FF",
          color: "#1B3A6B", fontWeight: 600, fontSize: 14, textDecoration: "none",
        }}>이력 보기</Link>
        <Link href="/announcements" style={{
          padding: "10px 24px", borderRadius: 10, background: "#1B3A6B",
          color: "#fff", fontWeight: 600, fontSize: 14, textDecoration: "none",
        }}>공고 목록</Link>
      </div>
    </div>
  );

  const numberGroups = [
    ...(data?.combo1 ?? []),
    ...(data?.combo2 ?? []),
    ...(data?.combo3 ?? []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600, margin: "0 auto" }}>
      <div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>
          <Link href="/history" style={{ color: "#94A3B8", textDecoration: "none" }}>이력</Link>
          {" › "}결과 입력
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 결과 입력</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>입력 결과는 AI 예측 정확도 개선에 활용됩니다.</p>
      </div>

      {/* 공고 요약 */}
      {data && (
        <div style={{ background: "#F8FAFC", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{data.annOrgName}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
            {data.annTitle ?? annId}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { label: "AI 추천 투찰가", value: fmt(data.optimalBidPrice) },
              { label: "예측 사정율", value: data.predictedSajungRate.toFixed(2) + "%" },
              { label: "낙찰하한가", value: fmt(data.lowerLimitPrice) },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #E8ECF2" }}>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1B3A6B", marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#DC2626" }}>
          {error}
        </div>
      )}

      {/* Step 1 — 투찰 정보 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>1단계 — 투찰 정보</div>

        <div>
          <label style={labelStyle}>내가 실제 넣은 투찰금액 <span style={{ color: "#DC2626" }}>*</span></label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              style={inpStyle}
              type="text"
              placeholder="예: 98,500,000"
              value={bidPrice}
              onChange={(e) => setBidPrice(e.target.value)}
            />
            <span style={{ fontSize: 13, color: "#64748B", flexShrink: 0 }}>원</span>
          </div>
        </div>

        {numberGroups.length > 0 && (
          <div>
            <label style={labelStyle}>복수예가 선택 번호 (선택)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {numberGroups.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedNos((prev) =>
                    prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
                  )}
                  style={{
                    width: 40, height: 40, borderRadius: "50%", border: "2px solid",
                    borderColor: selectedNos.includes(n) ? "#1B3A6B" : "#D1D5DB",
                    background: selectedNos.includes(n) ? "#1B3A6B" : "#fff",
                    color: selectedNos.includes(n) ? "#fff" : "#374151",
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {String(n).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2 — 개찰 결과 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>2단계 — 개찰 결과 <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF" }}>(나중에 입력 가능)</span></div>

        <div>
          <label style={labelStyle}>결과</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["PENDING", "WIN", "LOSE", "DISQUALIFIED"] as const).map((r) => {
              const labels = { PENDING: "아직 개찰 전", WIN: "낙찰", LOSE: "유찰", DISQUALIFIED: "적격심사 탈락" };
              const colors = { PENDING: "#64748B", WIN: "#059669", LOSE: "#DC2626", DISQUALIFIED: "#D97706" };
              return (
                <button
                  key={r}
                  onClick={() => setResult(r)}
                  style={{
                    padding: "8px 16px", borderRadius: 8, border: "1.5px solid",
                    borderColor: result === r ? colors[r] : "#D1D5DB",
                    background: result === r ? colors[r] : "#fff",
                    color: result === r ? "#fff" : "#374151",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {labels[r]}
                </button>
              );
            })}
          </div>
        </div>

        {result === "WIN" && (
          <div>
            <label style={labelStyle}>실제 낙찰금액</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                style={inpStyle}
                type="text"
                placeholder="예: 97,200,000"
                value={actualFinalPrice}
                onChange={(e) => setActualFinalPrice(e.target.value)}
              />
              <span style={{ fontSize: 13, color: "#64748B", flexShrink: 0 }}>원</span>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>실제 사정율 (알면 입력)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                style={inpStyle}
                type="number"
                step="0.01"
                placeholder="예: 99.34"
                value={actualSajungRate}
                onChange={(e) => setActualSajungRate(e.target.value)}
              />
              <span style={{ fontSize: 13, color: "#64748B", flexShrink: 0 }}>%</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>참여 업체 수</label>
            <input
              style={inpStyle}
              type="number"
              placeholder="예: 12"
              value={numBidders}
              onChange={(e) => setNumBidders(e.target.value)}
            />
          </div>
        </div>
      </div>

      {result === "PENDING" && (
        <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#1B3A6B" }}>
          💡 개찰 후 결과를 다시 입력해주시면 <strong>번호 추천 1회를 추가</strong>로 드립니다.
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          height: 50, borderRadius: 12, background: saving ? "#94A3B8" : "#1B3A6B",
          color: "#fff", fontSize: 15, fontWeight: 700, border: "none", cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "저장 중..." : "저장하기"}
      </button>
    </div>
  );
}
