"use client";

// 계좌이체 입금 확인 (토스 계약 전까지 유일 결제수단, 2026-07-09)
import { useCallback, useEffect, useState } from "react";

interface BankRequest {
  id: string; userId: string; plan: string; period: string; amount: number;
  depositorName: string; status: string; adminMemo: string | null; createdAt: string; confirmedAt: string | null;
}
interface UserInfo { bizName: string; bizNo: string; plan: string }

const PLAN_LABELS: Record<string, string> = { LITE: "라이트", PRO: "프로", BIZ: "비즈", MASTER: "마스터" };
const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function AdminBankRequestsPage() {
  const [status, setStatus] = useState("PENDING");
  const [rows, setRows] = useState<BankRequest[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserInfo>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/bank-requests?status=${status}`);
    const data = (await res.json()) as { requests: BankRequest[]; userMap: Record<string, UserInfo> };
    setRows(data.requests ?? []);
    setUserMap(data.userMap ?? {});
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: "confirm" | "reject") {
    if (action === "reject" && !window.confirm("이 신청을 거절할까요?")) return;
    setBusy(id);
    await fetch("/api/admin/bank-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action }),
    });
    setBusy(null);
    void load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>입금 확인</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>계좌이체 구독 신청 — 신한은행 100-038-306439 입금 대조 후 확인</p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {["PENDING", "CONFIRMED", "REJECTED"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} style={{
            height: 34, padding: "0 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            border: status === s ? "2px solid #1B3A6B" : "1px solid #E2E8F0",
            background: status === s ? "#EFF6FF" : "#fff", color: status === s ? "#1B3A6B" : "#64748B",
          }}>
            {s === "PENDING" ? "대기" : s === "CONFIRMED" ? "확인 완료" : "거절"}
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>해당 상태의 신청이 없습니다.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E8ECF2", color: "#64748B", fontSize: 11.5, textAlign: "left" }}>
                <th style={{ padding: "8px 8px" }}>신청일</th>
                <th style={{ padding: "8px 8px" }}>업체</th>
                <th style={{ padding: "8px 8px" }}>플랜</th>
                <th style={{ padding: "8px 8px" }}>기간</th>
                <th style={{ padding: "8px 8px" }}>입금액</th>
                <th style={{ padding: "8px 8px" }}>입금자명</th>
                {status === "PENDING" && <th style={{ padding: "8px 8px" }}>처리</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const u = userMap[r.userId];
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "10px 8px", color: "#64748B" }}>{r.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600, color: "#0F172A" }}>{u?.bizName ?? "-"}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{u?.bizNo ?? r.userId} · 현재 {u?.plan ?? "-"}</div>
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: 700, color: "#1B3A6B" }}>{PLAN_LABELS[r.plan] ?? r.plan}</td>
                    <td style={{ padding: "10px 8px" }}>{r.period === "YEARLY" ? "연간" : "월간"}</td>
                    <td style={{ padding: "10px 8px", fontWeight: 700 }}>{fmt(r.amount)}원</td>
                    <td style={{ padding: "10px 8px" }}>{r.depositorName}</td>
                    {status === "PENDING" && (
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button disabled={busy === r.id} onClick={() => void act(r.id, "confirm")}
                            style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            입금 확인
                          </button>
                          <button disabled={busy === r.id} onClick={() => void act(r.id, "reject")}
                            style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "1px solid #FECACA", background: "#fff", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            거절
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
