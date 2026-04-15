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
  n != null && n !== "" ? Number(n).toLocaleString("ko-KR") + "원" : "-";

const planLabel: Record<string, string> = { FREE: "무료", STANDARD: "스탠다드", PRO: "프로" };

function calcFee(isWon: string, actualFinalPrice: string, recommendedBidPrice: string | number | null) {
  if (isWon !== "true" || !actualFinalPrice) return { feeRate: "", feeAmount: "", feeStatus: "pending" };
  const finalPrice = Number(actualFinalPrice);
  if (!finalPrice) return { feeRate: "", feeAmount: "", feeStatus: "pending" };
  const recPrice = Number(recommendedBidPrice ?? 0);
  const rate = recPrice > 0 && recPrice < 100_000_000 ? 0.017 : 0.015;
  return {
    feeRate: String(rate),
    feeAmount: String(Math.round(finalPrice * rate)),
    feeStatus: "invoiced",
  };
}

export function RequestsTable({ requests, userMap, bidResultMap }: Props) {
  const router = useRouter();
  const [editingRow, setEditingRow] = useState<Request | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  // 검색/필터 상태
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const now = new Date();

  // 필터링
  const filtered = requests.filter((r) => {
    const bizName = userMap[r.userId]?.bizName ?? "";
    const matchSearch = !search ||
      bizName.includes(search) ||
      (r.title ?? "").includes(search) ||
      (r.orgName ?? "").includes(search);
    const isPast = new Date(r.deadline) < now && r.isWon === null;
    const matchStatus =
      statusFilter === "all" ? true :
      statusFilter === "pending" ? isPast :
      statusFilter === "won" ? r.isWon === true :
      statusFilter === "lost" ? r.isWon === false :
      statusFilter === "invoiced" ? r.feeStatus === "invoiced" :
      statusFilter === "paid" ? r.feeStatus === "paid" :
      true;
    return matchSearch && matchStatus;
  });

  // 대기 건수 (결과 재조회 버튼 표시용)
  const pendingCount = requests.filter(r => new Date(r.deadline) < now && r.isWon === null).length;

  async function handleRefreshOutcomes() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/refresh-outcomes", { method: "POST" });
      const result = await res.json();
      const msg = result.updated > 0
        ? `✅ ${result.updated}건 결과 자동 입력 완료\n(BidResult 없음: ${result.skipped ?? 0}건)`
        : `조회 대상 없음 또는 G2B 미게재\n(skipped: ${result.skipped ?? 0}건)`;
      alert(msg);
      router.refresh();
    } catch {
      alert("재조회 중 오류가 발생했습니다.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleFetchResult(r: Request) {
    if (!r.konepsId) { alert("konepsId 없음"); return; }
    setFetchingId(r.id);
    try {
      const res = await fetch(`/api/admin/requests/${r.id}/fetch-result`, { method: "POST" });
      const result = await res.json();
      if (result.ok) {
        alert(`✅ G2B 조회 성공: 결과 입력 완료`);
        router.refresh();
      } else {
        alert(`G2B에 개찰결과 미게재\n(${result.message ?? "결과 없음"})`);
      }
    } catch {
      alert("G2B 조회 중 오류 발생");
    } finally {
      setFetchingId(null);
    }
  }

  async function handleMarkPaid(id: string) {
    if (!confirm("수납 처리 하시겠습니까?")) return;
    const res = await fetch(`/api/admin/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeStatus: "paid", paidAt: new Date().toISOString() }),
    });
    if (res.ok) router.refresh();
    else alert("처리 실패");
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
      feeRate: r.feeRate ?? "",
      feeStatus: r.feeStatus ?? "pending",
      memo: r.memo ?? "",
    });
  }

  function handleFormChange(patch: Record<string, unknown>) {
    const next = { ...form, ...patch };
    // isWon=true + actualFinalPrice 있으면 수수료 자동계산
    if ("isWon" in patch || "actualFinalPrice" in patch) {
      const recalc = calcFee(
        String(next.isWon ?? ""),
        String(next.actualFinalPrice ?? ""),
        editingRow?.recommendedBidPrice ?? null,
      );
      if (recalc.feeAmount) {
        next.feeRate = recalc.feeRate;
        next.feeAmount = recalc.feeAmount;
        next.feeStatus = recalc.feeStatus;
      }
    }
    setForm(next);
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

      if (form.feeRate !== "") payload.feeRate = form.feeRate;
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

  // CSV 내보내기
  function handleExportCsv() {
    const headers = ["회사명", "사업자번호", "공고명", "기관명", "마감일", "낙찰여부", "수수료율", "수수료금액", "상태", "납부일"];
    const rows = filtered.map((r) => {
      const u = userMap[r.userId];
      return [
        u?.bizName ?? "",
        u?.bizNo ?? "",
        r.title ?? "",
        r.orgName ?? "",
        r.deadline ? new Date(r.deadline).toLocaleDateString("ko-KR") : "",
        r.isWon === true ? "낙찰" : r.isWon === false ? "미낙찰" : "대기",
        r.feeRate ? (Number(r.feeRate) * 100).toFixed(1) + "%" : "",
        r.feeAmount ? Number(r.feeAmount).toLocaleString("ko-KR") : "",
        feeStatusStyle[r.feeStatus]?.label ?? r.feeStatus ?? "",
        r.paidAt ? new Date(r.paidAt).toLocaleDateString("ko-KR") : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `수수료정산_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* 툴바 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* 검색 */}
        <input
          type="text"
          placeholder="회사명 / 공고명 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 160px", minWidth: 140, padding: "7px 11px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12.5, color: "#374151", outline: "none" }}
        />
        {/* 상태 필터 */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "7px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12.5, color: "#374151", background: "#fff" }}
        >
          <option value="all">전체</option>
          <option value="pending">확인 필요</option>
          <option value="won">낙찰</option>
          <option value="lost">미낙찰</option>
          <option value="invoiced">수수료 청구중</option>
          <option value="paid">납부 완료</option>
        </select>
        <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>{filtered.length}건</span>
        {/* 버튼들 */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button
            onClick={handleExportCsv}
            style={{ fontSize: 12, padding: "7px 12px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", cursor: "pointer", color: "#374151", fontWeight: 600 }}
          >
            CSV 다운로드
          </button>
          <button
            onClick={handleRefreshOutcomes}
            disabled={refreshing}
            style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid #CBD5E1", background: refreshing ? "#F1F5F9" : "#fff", cursor: "pointer", color: "#1B3A6B", fontWeight: 600, opacity: refreshing ? 0.7 : 1, whiteSpace: "nowrap" }}
          >
            {refreshing ? "조회 중..." : `⟳ 결과 재조회${pendingCount > 0 ? ` (${pendingCount}건 대기)` : ""}`}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "#9CA3AF", fontSize: 13, padding: "20px 0" }}>
          {requests.length === 0 ? "데이터 없음" : "검색 결과 없음"}
        </div>
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
              {filtered.map((r: Request, i: number) => {
                const isPast = new Date(r.deadline) < now && r.isWon === null;
                const user = userMap[r.userId];
                const bidResult = bidResultMap[r.annId];
                const effectiveWinnerName = r.winnerName || bidResult?.winnerName;
                const noResult = !r.openingDt && !r.isWon && new Date(r.deadline) < now;

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
                    {/* 공고명 */}
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
                        : noResult
                          ? (
                            <button
                              onClick={() => handleFetchResult(r)}
                              disabled={fetchingId === r.id}
                              style={{ fontSize: 10, padding: "3px 7px", borderRadius: 5, border: "1px solid #CBD5E1", background: fetchingId === r.id ? "#F1F5F9" : "#fff", cursor: "pointer", color: "#1B3A6B", fontWeight: 600, opacity: fetchingId === r.id ? 0.7 : 1 }}
                            >
                              {fetchingId === r.id ? "조회중..." : "G2B 조회"}
                            </button>
                          )
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
                      {r.feeAmount && Number(r.feeAmount) > 0
                        ? (
                          <div>
                            <span style={{ color: "#374151", fontWeight: 600 }}>{fmtPrice(r.feeAmount)}</span>
                            {r.feeRate && <div style={{ color: "#9CA3AF", fontSize: 10 }}>{(Number(r.feeRate) * 100).toFixed(1)}%</div>}
                          </div>
                        )
                        : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                    {/* 상태 */}
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: fee.color, background: fee.color + "1a", padding: "2px 7px", borderRadius: 5, display: "inline-block" }}>
                          {fee.label}
                        </span>
                        {/* 납부 확인 버튼 */}
                        {r.feeStatus === "invoiced" && (
                          <button
                            onClick={() => handleMarkPaid(r.id)}
                            style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid #059669", background: "#ECFDF5", cursor: "pointer", color: "#059669", fontWeight: 700 }}
                          >
                            납부 확인
                          </button>
                        )}
                        {r.isHit != null && (
                          <div style={{ fontSize: 10, color: r.isHit ? "#059669" : "#9CA3AF" }}>
                            {r.isHit ? "✓ 적중" : `오차 ${r.deviationPct ? Number(r.deviationPct).toFixed(3) : "?"}%`}
                          </div>
                        )}
                        {r.memo && (
                          <div style={{ fontSize: 10, color: "#D97706" }}>📝 메모있음</div>
                        )}
                      </div>
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
                <input type="number" value={form.userBidPrice as string} onChange={(e) => handleFormChange({ userBidPrice: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
              <Field label="추천 따름 여부">
                <select value={form.userFollowedRecommendation as string} onChange={(e) => handleFormChange({ userFollowedRecommendation: e.target.value })} style={inputStyle}>
                  <option value="">미선택</option>
                  <option value="true">추천 따름</option>
                  <option value="false">직접 입력</option>
                </select>
              </Field>
            </Section>

            {/* 개찰 결과 */}
            <Section label="개찰 결과">
              <Field label="개찰일">
                <input type="date" value={form.openingDt as string} onChange={(e) => handleFormChange({ openingDt: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="낙찰 여부">
                <select value={form.isWon as string} onChange={(e) => handleFormChange({ isWon: e.target.value })} style={inputStyle}>
                  <option value="">대기</option>
                  <option value="true">낙찰</option>
                  <option value="false">미낙찰</option>
                </select>
              </Field>
              <Field label="낙찰 업체명">
                <input type="text" value={form.winnerName as string} onChange={(e) => handleFormChange({ winnerName: e.target.value })}
                  style={inputStyle} placeholder="낙찰 업체명" />
              </Field>
              <Field label="실제 낙찰금액 (원)">
                <input type="number" value={form.actualFinalPrice as string} onChange={(e) => handleFormChange({ actualFinalPrice: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
              <Field label="참여 업체 수">
                <input type="number" value={form.totalBidders as string} onChange={(e) => handleFormChange({ totalBidders: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
            </Section>

            {/* 수수료 정산 */}
            <Section label="수수료 정산">
              {form.isWon === "true" && !!form.actualFinalPrice && (
                <div style={{ fontSize: 11, color: "#059669", background: "#ECFDF5", padding: "6px 10px", borderRadius: 7, marginBottom: 6 }}>
                  ✓ 수수료 자동 계산됨 — 낙찰금액 × {form.feeRate ? (Number(form.feeRate) * 100).toFixed(1) : "?"}%
                </div>
              )}
              <Field label="수수료 금액 (원)">
                <input type="number" value={form.feeAmount as string} onChange={(e) => handleFormChange({ feeAmount: e.target.value })}
                  style={inputStyle} placeholder="미입력" />
              </Field>
              <Field label="수수료 상태">
                <select value={form.feeStatus as string} onChange={(e) => handleFormChange({ feeStatus: e.target.value })} style={inputStyle}>
                  {feeStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </Section>

            {/* 메모 */}
            <Section label="관리자 메모">
              <textarea value={form.memo as string} onChange={(e) => handleFormChange({ memo: e.target.value })}
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
