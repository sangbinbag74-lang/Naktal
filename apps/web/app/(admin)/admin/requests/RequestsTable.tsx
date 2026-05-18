"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserInfo = Record<string, any>;
type BidResultInfo = { annId: string; winnerName: string | null; finalPrice: number | null; numBidders: number | null; bidRate: number | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Request = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompanyProfile = Record<string, any>;

type AnnInfo = { bsisAmt: number; aValueTotal: number; lowerLimitRate: number };

interface Props {
  requests: Request[];
  userMap: Record<string, UserInfo>;
  companyProfileMap?: Record<string, CompanyProfile>;
  bidResultMap: Record<string, BidResultInfo>;
  annOpengMap?: Record<string, string | null>; // 공고 rawJson.opengDt fallback
  annInfoMap?: Record<string, AnnInfo>; // 사정율 역산용 (bsisAmt/aValueTotal/lowerLimitRate)
}

/**
 * 투찰가 → 사정율 역산
 * 예정가 = (price - aValue) × 100 / lowerLimitRate + aValue
 * 사정율 = 예정가 ÷ 기초금액(base) × 100
 * base 우선순위: bsisAmt > aValueTotal > budget × 1.1
 */
function reverseSajung(price: number, info: AnnInfo | undefined, budget: number): number | null {
  if (!info || price <= 0) return null;
  const lwlt = info.lowerLimitRate > 0 ? info.lowerLimitRate : 89.745;
  const aVal = info.aValueTotal > 0 ? info.aValueTotal : 0;
  const base = info.bsisAmt > 0
    ? info.bsisAmt
    : info.aValueTotal > 0
      ? info.aValueTotal
      : budget > 0
        ? budget * 1.1
        : 0;
  if (base <= 0) return null;
  const estimated = (price - aVal) * 100 / lwlt + aVal;
  return estimated / base * 100;
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

/**
 * 안전한 Date 파싱
 * - 이미 timezone 정보 (Z 또는 ±HH:MM) 있으면 그대로
 * - 없으면 UTC 강제(Z 추가)
 * - 공백 구분("2026-05-13 11:00:00")도 T로 치환
 * - 실패 시 invalid Date 반환 (호출자가 isNaN 체크)
 */
function parseDt(v: unknown): Date {
  if (v == null || v === "") return new Date(NaN);
  const s = String(v).trim();
  // 이미 timezone 정보 있음 — 그대로 파싱
  if (/Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  // naive timestamp — UTC 로 가정해서 Z 추가
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  return new Date(iso + "Z");
}

const fmtKstDateTime = (v: unknown): string => {
  const d = parseDt(v);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
};

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


export function RequestsTable({ requests, userMap, companyProfileMap = {}, bidResultMap, annOpengMap = {}, annInfoMap = {} }: Props) {
  const router = useRouter();
  const [editingRow, setEditingRow] = useState<Request | null>(null);
  const [detailRow, setDetailRow] = useState<Request | null>(null);
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
                {["회사명", "공고명", "의뢰 시간", "마감/개찰", "추천금액", "실투찰금액", "순위", "G2B", "낙찰", "수수료", "상태", "", ""].map((h) => (
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
                    {/* 의뢰 시간 (createdAt + contractAt) */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#374151", fontWeight: 500, fontSize: 11.5 }}>
                        시작 {fmtKstDateTime(r.createdAt)}
                      </div>
                      <div style={{ fontSize: 10.5, marginTop: 2, color: r.contractAt ? "#059669" : "#D97706", fontWeight: r.contractAt ? 500 : 700 }}>
                        {r.contractAt ? `계약 ${fmtKstDateTime(r.contractAt)}` : "계약 미완료"}
                      </div>
                    </td>
                    {/* 마감 (마감일시 + 개찰일시 통합) */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {/* 마감일시 */}
                      <div style={{ color: isPast ? "#DC2626" : "#374151", fontWeight: isPast ? 700 : 600, fontSize: 12 }}>
                        {fmtKstDateTime(r.deadline)}
                        {isPast && <span style={{ fontSize: 9, marginLeft: 4, color: "#DC2626" }}>(마감)</span>}
                      </div>
                      {/* 개찰일시 — 실제 개찰값 우선, 없으면 예정값 */}
                      {(() => {
                        const actualDt = r.openingDt;
                        const planDt = annOpengMap[r.annId];
                        const src = actualDt ?? planDt;
                        if (!src) return null;
                        const txt = fmtKstDateTime(src);
                        if (txt === "-") return null;
                        const isPlan = !actualDt;
                        return (
                          <div style={{ fontSize: 10.5, color: isPlan ? "#94A3B8" : "#0F766E", marginTop: 2 }}>
                            개찰 {txt}
                            {isPlan && <span style={{ fontSize: 9, marginLeft: 4 }}>(예정)</span>}
                          </div>
                        );
                      })()}
                    </td>
                    {/* 추천금액 */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#1B3A6B", fontWeight: 600 }}>{fmtPrice(r.recommendedBidPrice)}</div>
                      {r.predictedSajungRate && (
                        <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 1 }}>예측사정율 {Number(r.predictedSajungRate).toFixed(3)}%</div>
                      )}
                    </td>
                    {/* 실투찰금액 — 본인 투찰가 기준 사정율 역산 */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {r.userBidPrice
                        ? <>
                            <div style={{ color: "#374151", fontWeight: 600 }}>{fmtPrice(r.userBidPrice)}</div>
                            {(() => {
                              const info = annInfoMap[r.annId];
                              const mySajung = reverseSajung(Number(r.userBidPrice ?? 0), info, Number(r.budget ?? 0));
                              if (mySajung != null) {
                                return <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 1 }}>본인사정율 {mySajung.toFixed(3)}%</div>;
                              }
                              if (r.userBidRate != null) {
                                return <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 1 }}>투찰률 {Number(r.userBidRate).toFixed(3)}%</div>;
                              }
                              return null;
                            })()}
                          </>
                        : <span style={{ color: "#D1D5DB" }}>미입력</span>}
                    </td>
                    {/* 순위 — null 이면 G2B 사유(낙찰하한선 미달 등) 또는 마감 지난 경우 조회 버튼 표시 */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", textAlign: "center" }}>
                      {r.userRank != null ? (
                        <span style={{
                          display: "inline-block",
                          fontSize: 12,
                          fontWeight: 700,
                          color: r.userRank === 1 ? "#059669" : r.userRank <= 3 ? "#D97706" : "#64748B",
                          background: r.userRank === 1 ? "#ECFDF5" : r.userRank <= 3 ? "#FFFBEB" : "#F1F5F9",
                          padding: "3px 8px",
                          borderRadius: 6,
                        }}>
                          {r.userRank}{r.totalBidders ? `/${r.totalBidders}` : ""}위
                        </span>
                      ) : r.userRemark ? (
                        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{
                            display: "inline-block",
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "#DC2626",
                            background: "#FEF2F2",
                            padding: "3px 8px",
                            borderRadius: 6,
                            maxWidth: 140,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }} title={r.userRemark}>
                            {r.userRemark}
                          </span>
                          {r.userBidRate != null && (
                            <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                              투찰률 {Number(r.userBidRate).toFixed(3)}%
                            </span>
                          )}
                        </div>
                      ) : isPast ? (
                        <button
                          onClick={() => handleFetchResult(r)}
                          disabled={fetchingId === r.id}
                          style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid #1B3A6B", background: fetchingId === r.id ? "#F1F5F9" : "#fff", cursor: "pointer", color: "#1B3A6B", fontWeight: 700, opacity: fetchingId === r.id ? 0.7 : 1 }}
                        >
                          {fetchingId === r.id ? "조회중…" : "🔄 조회"}
                        </button>
                      ) : (
                        <span style={{ color: "#D1D5DB", fontSize: 11 }}>-</span>
                      )}
                    </td>
                    {/* G2B 조회 — 마감 지났는데 결과 없을 때만 */}
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", textAlign: "center" }}>
                      {noResult ? (
                        <button
                          onClick={() => handleFetchResult(r)}
                          disabled={fetchingId === r.id}
                          style={{ fontSize: 10, padding: "3px 7px", borderRadius: 5, border: "1px solid #CBD5E1", background: fetchingId === r.id ? "#F1F5F9" : "#fff", cursor: "pointer", color: "#1B3A6B", fontWeight: 600, opacity: fetchingId === r.id ? 0.7 : 1 }}
                        >
                          {fetchingId === r.id ? "조회중..." : "G2B 조회"}
                        </button>
                      ) : <span style={{ color: "#D1D5DB", fontSize: 11 }}>-</span>}
                    </td>
                    {/* 낙찰 결과 (G2B 자동 확인) */}
                    <td style={{ padding: "8px 12px", minWidth: 110 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: wonColor, background: wonColor + "1a", padding: "2px 7px", borderRadius: 5 }}>
                        {r.isWon === true ? "✅ 낙찰" : wonLabel}
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
                    {/* 더보기 — 소송/연락 가능한 모든 정보 (박상빈님 5/18 명시) */}
                    <td style={{ padding: "8px 12px" }}>
                      <button
                        onClick={() => setDetailRow(r)}
                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #1B3A6B", background: "#1B3A6B", cursor: "pointer", color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        더보기
                      </button>
                    </td>
                  </tr>
                );
              }).flatMap((tr, i) => {
                const r = filtered[i];
                if (!r) return [tr];
                // 보조행에는 메인에 없는 정보만 — 추첨번호 / 투찰일시 / 투찰률 / 낙찰금액 / 낙찰사정율 / 결과사정율
                const info = annInfoMap[r.annId];
                const winSajung = reverseSajung(Number(r.actualFinalPrice ?? 0), info, Number(r.budget ?? 0));
                const hasExtra =
                  r.userDrwtNo1 != null || r.userDrwtNo2 != null || r.userBidAt ||
                  r.userBidRate != null ||
                  (r.actualFinalPrice != null && Number(r.actualFinalPrice) > 0) ||
                  winSajung != null || r.actualSajungRate != null;
                if (!hasExtra) return [tr];
                return [
                  tr,
                  <tr key={(r.id ?? i) + "-detail"} style={{ background: "#F8FAFC", borderBottom: "1px solid #E8ECF2" }}>
                    <td colSpan={13} style={{ padding: "6px 18px", fontSize: 11.5, color: "#475569" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>📊 상세</span>
                        {r.userBidRate != null && (
                          <span>
                            <span style={{ color: "#94A3B8" }}>투찰률 </span>
                            <strong>{Number(r.userBidRate).toFixed(3)}%</strong>
                          </span>
                        )}
                        {(r.userDrwtNo1 != null || r.userDrwtNo2 != null) && (
                          <span>
                            <span style={{ color: "#94A3B8" }}>추첨번호 </span>
                            <strong style={{ color: "#7C3AED" }}>
                              {r.userDrwtNo1 != null ? String(r.userDrwtNo1).padStart(2, "0") : "-"}
                              {" · "}
                              {r.userDrwtNo2 != null ? String(r.userDrwtNo2).padStart(2, "0") : "-"}
                            </strong>
                          </span>
                        )}
                        {r.userBidAt && (() => {
                          const d = parseDt(r.userBidAt);
                          if (isNaN(d.getTime())) return null;
                          return (
                            <span>
                              <span style={{ color: "#94A3B8" }}>투찰일시 </span>
                              <strong>{d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}</strong>
                            </span>
                          );
                        })()}
                        {r.actualFinalPrice != null && Number(r.actualFinalPrice) > 0 && (
                          <span>
                            <span style={{ color: "#94A3B8" }}>낙찰금액 </span>
                            <strong style={{ color: "#059669" }}>{fmtPrice(r.actualFinalPrice)}</strong>
                          </span>
                        )}
                        {/* 낙찰사정율 = 낙찰가 역산 */}
                        {winSajung != null && (
                          <span>
                            <span style={{ color: "#94A3B8" }}>낙찰사정율 </span>
                            <strong style={{ color: "#059669" }}>{winSajung.toFixed(3)}%</strong>
                          </span>
                        )}
                        {/* 결과 사정율 (G2B 공식, 비교용) */}
                        {r.actualSajungRate != null && (
                          <span>
                            <span style={{ color: "#94A3B8" }}>결과사정율 </span>
                            <strong style={{ color: "#7C3AED" }}>{Number(r.actualSajungRate).toFixed(3)}%</strong>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>,
                ];
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

      {/* 상세 정보 모달 — 박상빈님 5/18 명시 (소송/연락 가능한 모든 정보) */}
      {detailRow && (
        <DetailModal
          row={detailRow}
          user={userMap[detailRow.userId]}
          profile={companyProfileMap[detailRow.userId]}
          annInfo={annInfoMap[detailRow.annId]}
          bidResult={bidResultMap[detailRow.annId]}
          onClose={() => setDetailRow(null)}
        />
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DetailModal({ row, user, profile, annInfo, bidResult, onClose }: { row: any; user: any; profile: any; annInfo: AnnInfo | undefined; bidResult: BidResultInfo | undefined; onClose: () => void }) {
  const mySajung = row.userBidPrice ? reverseSajung(Number(row.userBidPrice ?? 0), annInfo, Number(row.budget ?? 0)) : null;
  const winSajung = row.actualFinalPrice ? reverseSajung(Number(row.actualFinalPrice ?? 0), annInfo, Number(row.budget ?? 0)) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 720, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>의뢰 상세 정보</div>
            <div style={{ fontSize: 12, color: "#9CA3AF" }}>소송·연락 대비 전체 기록</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, padding: "0 6px", background: "transparent", border: "none", cursor: "pointer", color: "#94A3B8" }}>✕</button>
        </div>

        <DetailSection title="🏢 사용자 정보 (User)">
          <Row label="회사명"        value={user?.bizName} />
          <Row label="사업자번호"    value={user?.bizNo} mono />
          <Row label="대표자명"      value={user?.ownerName} />
          <Row label="가입 이메일"   value={user?.notifyEmail} mono />
          <Row label="가입 전화"     value={user?.notifyPhone} mono />
          <Row label="가입 주소"     value={user?.address} />
          <Row label="요금제"        value={user?.plan} />
          <Row label="회원가입 시각" value={fmtFull(user?.createdAt)} mono />
        </DetailSection>

        <DetailSection title="📱 카카오 본인인증">
          <Row label="인증 이름"   value={user?.kakaoVerifiedName ?? "(미인증)"} />
          <Row label="인증 전화"   value={user?.kakaoVerifiedPhone ?? "-"} mono />
          <Row label="인증 일시"   value={fmtFull(user?.kakaoVerifiedAt)} mono />
        </DetailSection>

        {profile && (
          <DetailSection title="🏗️ G2B 자동조회 회사정보 (CompanyProfile)">
            <Row label="대표자명"     value={profile?.ceoName} />
            <Row label="회사 주소"    value={profile?.address} />
            <Row label="설립일"       value={profile?.establishedAt} mono />
            <Row label="임직원 수"    value={profile?.employeeCount != null ? `${profile.employeeCount}명` : null} />
            <Row label="자본금"       value={profile?.capitalAmount ? Number(profile.capitalAmount).toLocaleString("ko-KR") + "원" : null} />
            <Row label="신용도"       value={profile?.creditScore} />
            <Row label="주력 업종"    value={profile?.mainCategory} />
            <Row label="세부 업종"    value={Array.isArray(profile?.subCategories) ? profile.subCategories.join(", ") : null} />
            <Row label="면허 수"      value={Array.isArray(profile?.licenses) ? `${profile.licenses.length}건` : null} />
          </DetailSection>
        )}

        <DetailSection title="📬 의뢰 시점 (createdAt — 감사 정보)">
          <Row label="의뢰 시각"     value={fmtFull(row.createdAt)} mono highlight />
          <Row label="의뢰 IP"       value={row.createdIp} mono highlight />
          <Row label="User-Agent"   value={row.createdUserAgent} mono small />
          <Row label="Referer"      value={row.createdReferer} mono small />
          <Row label="Session ID"   value={row.supabaseSessionId} mono />
          <Row label="공고명"        value={row.title} />
          <Row label="발주처"        value={row.orgName} />
          <Row label="공고 ID"       value={row.konepsId} mono />
          <Row label="마감 일시"     value={fmtFull(row.deadline)} mono />
        </DetailSection>

        <DetailSection title="📝 계약 시점 (contractAt)">
          <Row label="계약 시각"        value={fmtFull(row.contractAt)} mono highlight />
          <Row label="계약 IP"          value={row.contractIp} mono highlight />
          <Row label="계약 User-Agent" value={row.contractUserAgent} mono small />
          <Row label="입력 사업자번호" value={row.bizRegNo} mono />
          <Row label="입력 대표자명"   value={row.repName} />
          <Row label="동의 시각"        value={fmtFull(row.agreedAt)} mono />
          <Row label="동의 수수료율"   value={row.agreedFeeRate ? `${(Number(row.agreedFeeRate) * 100).toFixed(2)}%` : null} />
          <Row label="동의 수수료액"   value={row.agreedFeeAmount ? Number(row.agreedFeeAmount).toLocaleString("ko-KR") + "원" : null} />
          {row.cancelledAt && <Row label="취소 시각" value={fmtFull(row.cancelledAt)} mono />}
        </DetailSection>

        <DetailSection title="💡 AI 추천 / 사용자 투찰">
          <Row label="추천 투찰가"     value={row.recommendedBidPrice ? Number(row.recommendedBidPrice).toLocaleString("ko-KR") + "원" : null} />
          <Row label="예측 사정율"     value={row.predictedSajungRate != null ? `${Number(row.predictedSajungRate).toFixed(3)}%` : null} />
          <Row label="추정 예정가"     value={row.estimatedPrice ? Number(row.estimatedPrice).toLocaleString("ko-KR") + "원" : null} />
          <Row label="낙찰 하한가"     value={row.lowerLimitPrice ? Number(row.lowerLimitPrice).toLocaleString("ko-KR") + "원" : null} />
          <Row label="낙찰 확률"       value={row.winProbability != null ? `${row.winProbability}%` : null} />
          <Row label="—— 사용자 투찰 ——" value="" />
          <Row label="투찰 시각"       value={fmtFull(row.userBidAt)} mono />
          <Row label="실투찰가"        value={row.userBidPrice ? Number(row.userBidPrice).toLocaleString("ko-KR") + "원" : null} />
          <Row label="본인 사정율"     value={mySajung != null ? `${mySajung.toFixed(3)}%` : null} />
          <Row label="추천 따름"       value={row.userFollowedRecommendation === true ? "따름" : row.userFollowedRecommendation === false ? "직접" : "미입력"} />
          <Row label="순위"           value={row.userRank != null ? `${row.userRank}${row.totalBidders ? `/${row.totalBidders}` : ""}위` : null} />
          <Row label="투찰률"         value={row.userBidRate != null ? `${Number(row.userBidRate).toFixed(3)}%` : null} />
          <Row label="추첨번호 1"     value={row.userDrwtNo1 != null ? String(row.userDrwtNo1).padStart(2, "0") : null} mono />
          <Row label="추첨번호 2"     value={row.userDrwtNo2 != null ? String(row.userDrwtNo2).padStart(2, "0") : null} mono />
          <Row label="비고"           value={row.userRemark} />
        </DetailSection>

        <DetailSection title="🏆 개찰 결과">
          <Row label="개찰 시각"      value={fmtFull(row.openingDt)} mono />
          <Row label="낙찰 여부"      value={row.isWon === true ? "✅ 낙찰" : row.isWon === false ? "❌ 미낙찰" : "대기"} />
          <Row label="낙찰 업체"      value={row.winnerName || bidResult?.winnerName} />
          <Row label="실 낙찰가"      value={row.actualFinalPrice ? Number(row.actualFinalPrice).toLocaleString("ko-KR") + "원" : null} />
          <Row label="낙찰 사정율"    value={winSajung != null ? `${winSajung.toFixed(3)}%` : null} />
          <Row label="결과 사정율"    value={row.actualSajungRate != null ? `${Number(row.actualSajungRate).toFixed(3)}%` : null} />
          <Row label="참여 업체 수"   value={row.totalBidders != null ? `${row.totalBidders}개사` : (bidResult?.numBidders != null ? `${bidResult.numBidders}개사` : null)} />
          <Row label="결과 감지 시각" value={fmtFull(row.resultDetectedAt)} mono />
          <Row label="편차"          value={row.deviationPct != null ? `${Number(row.deviationPct).toFixed(3)}%p` : null} />
          <Row label="적중"          value={row.isHit === true ? "✅ 적중" : row.isHit === false ? "❌ 빗나감" : null} />
        </DetailSection>

        <DetailSection title="💰 수수료 정산">
          <Row label="수수료율"       value={row.feeRate ? `${(Number(row.feeRate) * 100).toFixed(2)}%` : null} />
          <Row label="수수료액"       value={row.feeAmount ? Number(row.feeAmount).toLocaleString("ko-KR") + "원" : null} />
          <Row label="상태"          value={row.feeStatus} />
          <Row label="청구 시각"      value={fmtFull(row.invoicedAt)} mono />
          <Row label="납부 시각"      value={fmtFull(row.paidAt)} mono />
          {row.memo && <Row label="메모" value={row.memo} />}
        </DetailSection>

        <DetailSection title="📊 스냅샷 (의뢰 시점 통계 보존)">
          <Row label="발주처+카테고리 평균"  value={row.snapshotAvgSajungRate != null ? `${Number(row.snapshotAvgSajungRate).toFixed(3)}%` : null} />
          <Row label="샘플 수"               value={row.snapshotSampleSize != null ? `${row.snapshotSampleSize}건` : null} />
          <Row label="신뢰도"                value={row.snapshotConfidence} />
          <Row label="카테고리 전체 평균"    value={row.snapshotCategoryAvg != null ? `${Number(row.snapshotCategoryAvg).toFixed(3)}%` : null} />
          <Row label="카테고리 전체 샘플"    value={row.snapshotCategoryTotal != null ? `${row.snapshotCategoryTotal}건` : null} />
        </DetailSection>

        <DetailSection title="🔗 식별자">
          <Row label="BidRequest ID"    value={row.id} mono small />
          <Row label="userId"           value={row.userId} mono small />
          <Row label="annId"            value={row.annId} mono small />
        </DetailSection>

        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "#FEF3F2", border: "1px solid #FECACA", fontSize: 11, color: "#991B1B" }}>
          본 화면 정보는 AdminLog 에 조회 기록이 남습니다. 외부 공유 시 개인정보보호법 위반 가능.
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, padding: 14, background: "#F8FAFC", borderRadius: 10, border: "1px solid #E8ECF2" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1B3A6B", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 18px" }}>{children}</div>
    </div>
  );
}

function Row({ label, value, mono = false, small = false, highlight = false }: { label: string; value: unknown; mono?: boolean; small?: boolean; highlight?: boolean }) {
  const v = value == null || value === "" ? "-" : String(value);
  const isEmpty = v === "-";
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", borderBottom: "1px dotted #E8ECF2", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#64748B", flexShrink: 0, width: 130 }}>{label}</div>
      <div style={{
        fontSize: small ? 10 : 11.5,
        color: isEmpty ? "#CBD5E1" : highlight ? "#DC2626" : "#0F172A",
        fontWeight: highlight && !isEmpty ? 700 : 500,
        fontFamily: mono ? "ui-monospace,'SF Mono',Consolas,monospace" : "inherit",
        wordBreak: "break-all",
        flex: 1,
        minWidth: 0,
      }}>{v}</div>
    </div>
  );
}

function fmtFull(v: unknown): string {
  if (v == null || v === "") return "";
  const d = new Date(typeof v === "string" && !/Z$/i.test(v) && !/[+-]\d{2}:?\d{2}$/.test(v) ? (v as string).replace(" ", "T") + "Z" : (v as string));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
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
