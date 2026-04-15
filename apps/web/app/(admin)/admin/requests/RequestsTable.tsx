"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type UserInfo = { id: string; bizName: string; bizNo: string; ownerName: string; plan: string };
type BidResultInfo = { annId: string; winnerName: string | null; finalPrice: number | null; numBidders: number | null; bidRate: number | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Request = Record<string, any>;

interface Props {
  requests: Request[];
  userMap: Record<string, UserInfo>;
  bidResultMap: Record<string, BidResultInfo>;
}

const feeStatusOptions = [
  { value: "pending",   label: "대기" },
  { value: "invoiced",  label: "청구중" },
  { value: "paid",      label: "수납" },
  { value: "cancelled", label: "취소" },
];

const feeStatusStyle: Record<string, { label: string; color: string }> = {
  pending:   { label: "대기",   color: "#9CA3AF" },
  invoiced:  { label: "청구중", color: "#D97706" },
  paid:      { label: "수납",   color: "#059669" },
  cancelled: { label: "취소",   color: "#DC2626" },
};

const fmtPrice = (n: unknown) =>
  n != null ? Number(n).toLocaleString("ko-KR") + "원" : "-";

const planLabel: Record<string, string> = { FREE: "무료", STANDARD: "스탠다드", PRO: "프로" };

export function RequestsTable({ requests, userMap, bidResultMap }: Props) {
  const router = useRouter();
  const [editingRow, setEditingRow] = useState<Request | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const now = new Date();

  async function handleRefreshOutcomes() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/refresh-outcomes", { method: "POST" });
      const result = await res.json();
      alert(`결과 재조회 완료: ${result.updated ?? 0}건 업데이트, ${result.skipped ?? 0}건 BidResult 없음`);
      router.refresh();
    } catch {
      alert("재조회 중 오류가 발생했습니다.");
    } finally {
      setRefreshing(false);
    }
  }

  function openEdit(r: Request) {
    setEditingRow(r);
    setForm({
      userBidPrice: r.userBidPrice ?? "",
      userFollowedRecommendation: r.userFollowedRecommendation ?? "",
      openingDt: r.openingDt ? new Date(r.openingDt).toISOString().slice(0, 10) : "",
      isWon: r.isWon === true ? "true" : r.isWon === false ? "false" : "",
      winnerName: r.winnerName ?? "",
      actualFinalPrice: r.actualFinalPrice ?? "",
      totalBidders: r.totalBidders ?? "",
      feeAmount: r.feeAmount ?? "",
      feeStatus: r.feeStatus ?? "pending",
      memo: r.memo ?? "",
    });
  }

  async function handleSave() {
    if (!editingRow) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};

      const userBidPrice = form.userBidPrice !== "" ? Number(form.userBidPrice) : null;
      if (userBidPrice !== null) payload.userBidPrice = userBidPrice;

      if (form.userFollowedRecommendation !== "") {
        payload.userFollowedRecommendation = form.userFollowedRecommendation === "true";
      }

      if (form.openingDt) payload.openingDt = new Date(form.openingDt as string).toISOString();
      else payload.openingDt = null;

      if (form.isWon === "true")  payload.isWon = true;
      else if (form.isWon === "false") payload.isWon = false;
      else payload.isWon = null;

      if (form.winnerName !== "") payload.winnerName = form.winnerName;

      const actualFinalPrice = form.actualFinalPrice !== "" ? Number(form.actualFinalPrice) : null;
      if (actualFinalPrice !== null) payload.actualFinalPrice = actualFinalPrice;

      const totalBidders = form.totalBidders !== "" ? Number(form.totalBidders) : null;
      if (totalBidders !== null) payload.totalBidders = totalBidders;

      const feeAmount = form.feeAmount !== "" ? Number(form.feeAmount) : null;
      if (feeAmount !== null) payload.feeAmount = feeAmount;

      payload.feeStatus = form.feeStatus;
      payload.memo = form.memo || null;

      const res = await fetch(`/api/admin/requests/${editingRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("저장 실패: " + err.error);
        return;
      }
      setEditingRow(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* 결과 재조회 버튼 */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          onClick={handleRefreshOutcomes}
          disabled={refreshing}
          style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid #CBD5E1", background: refreshing ? "#F1F5F9" : "#fff", cursor: "pointer", color: "#1B3A6B", fontWeight: 600, opacity: refreshing ? 0.7 : 1 }}
        >
          {refreshing ? "조회 중..." : "⟳ 결과 재조회"}
        </button>
      </div>
      {requests.length === 0 ? (
        <div style={{ color: "#9CA3AF", fontSize: 13 }}>데이터 없음 — BidRequest 마이그레이션 후 표시됩니다</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["회사명", "공고명", "마감일", "추천금액", "실투찰금액", "개찰일", "낙찰", "수수료", "상태", ""].map((h) => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r: Request, i: number) => {
                const isPast = new Date(r.deadline) < now && r.isWon === null;
                const user = userMap[r.userId];
                const bidResult = bidResultMap[r.annId];
                const effectiveWinnerName = r.winnerName || bidResult?.winnerName;

                const fee = feeStatusStyle[r.feeStatus as string] ?? { label: r.feeStatus ?? "-", color: "#9CA3AF" };
                const wonColor = isPast
                  ? "#D97706"
                  : r.isWon === true ? "#059669" : r.isWon === false ? "#DC2626" : "#9CA3AF";
                const wonLabel = isPast
                  ? "확인 필요"
                  : r.isWon === true ? "낙찰" : r.isWon === false ? "미낙찰" : "대기";

                return (
                  <tr key={r.id ?? i} style={{ borderBottom: "1px solid #F1F5F9", background: isPast ? "#FFFBEB" : undefined }}>
                    {/* 회사명 */}
                    <td style={{ padding: "8px 12px", minWidth: 110 }}>
                      <div style={{ color: "#374151", fontWeight: 600, fontSize: 12.5 }}>
                        {user?.bizName ?? <span style={{ color: "#D1D5DB" }}>-</span>}
                      </div>
                      {user?.bizNo && (
                        <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 1 }}>{user.bizNo}</div>
                      )}
                      {user?.plan && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#1B3A6B", background: "#EFF6FF", padding: "1px 5px", borderRadius: 3 }}>
                          {planLabel[user.plan] ?? user.plan}
                        </span>
                      )}
                    </td>
                    {/* 공고명 — 클릭 시 공고 상세 이동 */}
                    <td style={{ padding: "8px 12px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.title}>
                      <Link href={`/announcements/${r.annId}`} target="_blank"
                        style={{ color: "#1B3A6B", fontWeight: 500, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {r.title}
                      </Link>
                      <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.orgName}</div>
                    </td>
                    {/* 마감일 */}
                    <td style={{ padding: "8px 12px", color: isPast ? "#DC2626" : "#6B7280", whiteSpace: "nowrap", fontWeight: isPast ? 600 : 400 }}>
                      {new Date(r.deadline).toLocaleDateString("ko-KR")}
                      {isPast && <span style={{ fontSize: 9, marginLeft: 4 }}>(마감)</span>}
                    </td>
                    {/* 추천금액 */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#1B3A6B", fontWeight: 600 }}>{fmtPrice(r.recommendedBidPrice)}</div>
                      {r.predictedSajungRate && (
                        <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 1 }}>사정율 {Number(r.predictedSajungRate).toFixed(2)}%</div>
                      )}
                    </td>
                    {/* 실투찰금액 */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {r.userBidPrice
                        ? <span style={{ color: "#374151" }}>{fmtPrice(r.userBidPrice)}</span>
                        : <span style={{ color: "#D1D5DB" }}>미입력</span>}
                    </td>
                    {/* 개찰일 */}
                    <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                      {r.openingDt
                        ? new Date(r.openingDt).toLocaleDateString("ko-KR")
                        : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                    {/* 낙찰 */}
                    <td style={{ padding: "8px 12px", minWidth: 100 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: wonColor, background: wonColor + "1a", padding: "2px 7px", borderRadius: 5 }}>
                        {wonLabel}
                      </span>
                      {effectiveWinnerName && (
                        <div style={{ color: "#374151", fontSize: 10.5, marginTop: 3, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={effectiveWinnerName}>
                          {effectiveWinnerName}
                        </div>
                      )}
                      {r.totalBidders && (
                        <div style={{ color: "#9CA3AF", fontSize: 10 }}>{r.totalBidders}사 참여</div>
                      )}
                    </td>
                    {/* 수수료 */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {r.feeAmount
                        ? <span style={{ color: "#374151", fontWeight: 600 }}>{fmtPrice(r.feeAmount)}</span>
                        : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                    {/* 상태 */}
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: fee.color, background: fee.color + "1a", padding: "2px 7px", borderRadius: 5 }}>
                        {fee.label}
                      </span>
                      {r.isHit != null && (
                        <div style={{ fontSize: 10, marginTop: 3, color: r.isHit ? "#059669" : "#9CA3AF" }}>
                          {r.isHit ? "✓ 적중" : `오차 ${r.deviationPct ? Number(r.deviationPct).toFixed(3) : "?"}%`}
                        </div>
                      )}
                      {r.memo && (
                        <div style={{ fontSize: 10, color: "#D97706", marginTop: 2 }}>📝 메모있음</div>
                      )}
                    </td>
                    {/* 편집 */}
                    <td style={{ padding: "8px 12px" }}>
                      <button
                        onClick={() => openEdit(r)}
                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #CBD5E1", background: "#fff", cursor: "pointer", color: "#374151", fontWeight: 500 }}
                      >
                        편집
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 편집 모달 */}
      {editingRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingRow(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>의뢰 편집</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 20 }}>{editingRow.title}</div>

            {/* 투찰 정보 */}
            <Section label="투찰 정보">
              <Field label="실투찰금액 (원)">
                <input type="number" value={form.userBidPrice as string} onChange={(e) => setForm({ ...form, userBidPrice: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
              <Field label="추천 따름 여부">
                <select value={form.userFollowedRecommendation as string} onChange={(e) => setForm({ ...form, userFollowedRecommendation: e.target.value })} style={inputStyle}>
                  <option value="">미선택</option>
                  <option value="true">추천 따름</option>
                  <option value="false">직접 입력</option>
                </select>
              </Field>
            </Section>

            {/* 개찰 결과 */}
            <Section label="개찰 결과">
              <Field label="개찰일">
                <input type="date" value={form.openingDt as string} onChange={(e) => setForm({ ...form, openingDt: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="낙찰 여부">
                <select value={form.isWon as string} onChange={(e) => setForm({ ...form, isWon: e.target.value })} style={inputStyle}>
                  <option value="">대기</option>
                  <option value="true">낙찰</option>
                  <option value="false">미낙찰</option>
                </select>
              </Field>
              <Field label="낙찰 업체명">
                <input type="text" value={form.winnerName as string} onChange={(e) => setForm({ ...form, winnerName: e.target.value })}
                  style={inputStyle} placeholder="낙찰 업체명" />
              </Field>
              <Field label="실제 낙찰금액 (원)">
                <input type="number" value={form.actualFinalPrice as string} onChange={(e) => setForm({ ...form, actualFinalPrice: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
              <Field label="참여 업체 수">
                <input type="number" value={form.totalBidders as string} onChange={(e) => setForm({ ...form, totalBidders: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
            </Section>

            {/* 수수료 정산 */}
            <Section label="수수료 정산">
              <Field label="수수료 금액 (원)">
                <input type="number" value={form.feeAmount as string} onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
              <Field label="수수료 상태">
                <select value={form.feeStatus as string} onChange={(e) => setForm({ ...form, feeStatus: e.target.value })} style={inputStyle}>
                  {feeStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </Section>

            {/* 메모 */}
            <Section label="관리자 메모">
              <textarea value={form.memo as string} onChange={(e) => setForm({ ...form, memo: e.target.value })}
                rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="내부 메모 (사용자에게 표시 안 됨)" />
            </Section>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditingRow(null)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer", fontSize: 13, color: "#64748B" }}>
                취소
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "#1B3A6B", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", opacity: saving ? 0.7 : 1 }}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#64748B", width: 130, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1.5px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 12.5,
  color: "#374151",
  outline: "none",
  boxSizing: "border-box",
};
