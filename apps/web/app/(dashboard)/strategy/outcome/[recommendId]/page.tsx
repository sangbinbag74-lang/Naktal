"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

type Result = "WIN" | "LOSE" | "DISQUALIFIED";

export default function OutcomePage() {
  const { recommendId } = useParams<{ recommendId: string }>();
  const router = useRouter();
  const [rec, setRec] = useState<any>(null);
  const [form, setForm] = useState({
    selectedNos: ["", "", ""],
    bidRate: "",
    result: "" as Result | "",
    finalWinningNos: ["", "", ""],
    actualBidRate: "",
    numBidders: "",
    bidAt: new Date().toISOString().slice(0, 16),
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/strategy/outcome/" + recommendId)
      .then((r) => r.json())
      .then((d) => {
        setRec(d);
        if (d.combo1) setForm((f) => ({ ...f, selectedNos: [String(d.combo1[0] ?? ""), String(d.combo1[1] ?? ""), String(d.combo1[2] ?? "")] }));
      })
      .catch(() => {});
  }, [recommendId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.result || !form.bidRate) { setError("결과와 실제 투찰률을 입력해주세요."); return; }
    setSubmitting(true); setError("");
    const res = await fetch("/api/strategy/outcome/" + recommendId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedNos: form.selectedNos.map(Number).filter(Boolean),
        bidRate: parseFloat(form.bidRate),
        result: form.result,
        finalWinningNos: form.finalWinningNos.map(Number).filter(Boolean),
        actualBidRate: form.actualBidRate ? parseFloat(form.actualBidRate) : undefined,
        numBidders: form.numBidders ? parseInt(form.numBidders) : undefined,
        bidAt: new Date(form.bidAt).toISOString(),
      }),
    });
    if (res.ok) { setDone(true); } else { const d = await res.json(); setError(d.error ?? "오류가 발생했습니다."); }
    setSubmitting(false);
  };

  if (done) return (
    <div style={{ maxWidth: 560, margin: "40px auto", background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "40px", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1B3A6B", marginBottom: 8 }}>결과 입력 완료!</h2>
      <p style={{ color: "#64748B", fontSize: 14, marginBottom: 4 }}>번호 추천 이력이 업데이트되었습니다.</p>
      <p style={{ color: "#60A5FA", fontSize: 14, fontWeight: 600, marginBottom: 24 }}>감사의 의미로 번호 추천 1회가 추가 지급되었습니다.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button onClick={() => router.push("/strategy")} style={{ height: 44, padding: "0 24px", background: "#1B3A6B", color: "#fff", borderRadius: 10, border: "none", fontWeight: 700, cursor: "pointer" }}>번호 전략으로</button>
        <button onClick={() => router.push("/history")} style={{ height: 44, padding: "0 24px", background: "#F8FAFC", color: "#374151", borderRadius: 10, border: "1px solid #E8ECF2", fontWeight: 600, cursor: "pointer" }}>투찰 이력 보기</button>
      </div>
    </div>
  );

  const inputStyle = { width: "100%", height: 44, padding: "0 12px", border: "1.5px solid #E8ECF2", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { display: "block" as const, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 };

  return (
    <div style={{ maxWidth: 580, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 결과 입력</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>결과를 입력하시면 번호 추천 1회가 추가 지급됩니다.</p>
      </div>

      {rec && (
        <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "14px 16px", marginBottom: 20, fontSize: 13 }}>
          <span style={{ color: "#1B3A6B", fontWeight: 600 }}>추천 번호: </span>
          <span style={{ color: "#374151" }}>[{rec.combo1?.join(", ")}] / [{rec.combo2?.join(", ")}] / [{rec.combo3?.join(", ")}]</span>
        </div>
      )}

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>실제 선택한 번호 *</label>
          <div style={{ display: "flex", gap: 8 }}>
            {form.selectedNos.map((n, i) => (
              <input key={i} type="number" value={n} onChange={(e) => { const arr = [...form.selectedNos]; arr[i] = e.target.value; setForm((f) => ({ ...f, selectedNos: arr })); }}
                placeholder={"번호 " + (i + 1)} style={{ ...inputStyle, width: "33%" }} />
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>실제 투찰률 (%) *</label>
          <input type="number" step="0.001" value={form.bidRate} onChange={(e) => setForm((f) => ({ ...f, bidRate: e.target.value }))} placeholder="예: 87.345" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>투찰 일시 *</label>
          <input type="datetime-local" value={form.bidAt} onChange={(e) => setForm((f) => ({ ...f, bidAt: e.target.value }))} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>결과 *</label>
          <div style={{ display: "flex", gap: 10 }}>
            {(["WIN", "LOSE", "DISQUALIFIED"] as Result[]).map((r) => (
              <button key={r} type="button" onClick={() => setForm((f) => ({ ...f, result: r }))}
                style={{ flex: 1, height: 44, borderRadius: 10, border: "1.5px solid", fontWeight: 600, fontSize: 14, cursor: "pointer",
                  borderColor: form.result === r ? (r === "WIN" ? "#059669" : r === "LOSE" ? "#DC2626" : "#9CA3AF") : "#E8ECF2",
                  background: form.result === r ? (r === "WIN" ? "#ECFDF5" : r === "LOSE" ? "#FEF2F2" : "#F9FAFB") : "#fff",
                  color: form.result === r ? (r === "WIN" ? "#059669" : r === "LOSE" ? "#DC2626" : "#374151") : "#94A3B8" }}>
                {r === "WIN" ? "낙찰" : r === "LOSE" ? "유찰" : "탈락"}
              </button>
            ))}
          </div>
        </div>

        <details style={{ borderTop: "1px solid #F1F5F9", paddingTop: 16 }}>
          <summary style={{ fontSize: 13, color: "#64748B", cursor: "pointer", marginBottom: 12 }}>개찰 정보 입력 (선택)</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>실제 낙찰률 (%)</label>
              <input type="number" step="0.001" value={form.actualBidRate} onChange={(e) => setForm((f) => ({ ...f, actualBidRate: e.target.value }))} placeholder="예: 87.123" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>참여 업체 수</label>
              <input type="number" value={form.numBidders} onChange={(e) => setForm((f) => ({ ...f, numBidders: e.target.value }))} placeholder="예: 12" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>실제 낙찰 번호</label>
              <div style={{ display: "flex", gap: 8 }}>
                {form.finalWinningNos.map((n, i) => (
                  <input key={i} type="number" value={n} onChange={(e) => { const arr = [...form.finalWinningNos]; arr[i] = e.target.value; setForm((f) => ({ ...f, finalWinningNos: arr })); }}
                    placeholder={"번호 " + (i + 1)} style={{ ...inputStyle, width: "33%" }} />
                ))}
              </div>
            </div>
          </div>
        </details>

        <button type="submit" disabled={submitting}
          style={{ height: 50, background: submitting ? "#94A3B8" : "#1B3A6B", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: submitting ? "wait" : "pointer" }}>
          {submitting ? "저장 중..." : "결과 저장 (+추천 1회)"}
        </button>
      </form>
    </div>
  );
}
