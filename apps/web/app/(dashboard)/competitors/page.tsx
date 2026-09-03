"use client";
/**
 * 경쟁사·발주처 심층 분석 (PRO+) — 2026-07-10
 * 낙찰 DB 532만 건 기반: 경쟁사 낙찰 이력·사정율 패턴 / 발주처 상위 낙찰업체·투찰 패턴
 */
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { Feature, canAccess } from "@/lib/plan-guard";
import type { Plan } from "@naktal/types";

interface PlanData { plan: string; grandfathered?: boolean; isAdmin?: boolean }

interface Dist { count: number; min: number | null; p25: number | null; p50: number | null; p75: number | null; max: number | null; avg: number | null }
interface NameCount { name: string; count: number }
interface RecentRow {
  annId: string; title: string | null; orgName: string | null; winnerName: string | null;
  finalPrice: number; bidRate: number; numBidders: number | null; openedAt: string | null;
}
interface Report {
  type: "company" | "org";
  query: string;
  message?: string;
  error?: string;
  upgradeUrl?: string;
  wins?: number;
  annCount?: number;
  resultCount?: number;
  capped?: boolean;
  matchedNames?: NameCount[];
  orgNameMatched?: string;
  summary?: { totalAmount?: number; avgBidRate?: number | null; avgBidders?: number | null };
  rateDist?: Dist;
  sajung?: Dist | null;
  topOrgs?: NameCount[];
  topWinners?: { name: string; count: number; avgRate: number | null }[];
  topCategories?: NameCount[];
  topRegions?: NameCount[];
  monthly?: { ym: string; count: number }[];
  recent?: RecentRow[];
  disclaimer?: string;
}

const fmtWon = (v: number) => {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + "조원";
  if (v >= 1e8) return (v / 1e8).toFixed(1) + "억원";
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString("ko-KR") + "만원";
  return v.toLocaleString("ko-KR") + "원";
};

export default function CompetitorsPage() {
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("User")
        .select("plan,grandfathered,isAdmin")
        .eq("supabaseId", user.id)
        .single();
      setPlanData(data);
      setLoading(false);
    });
  }, []);

  const effPlan = planData?.grandfathered ? "PRO" : planData?.plan;
  // 권한 판정의 단일 소스 = plan-guard. 전면 무료 개방 중에는 FREE 도 통과한다.
  const isPro = planData?.isAdmin || canAccess((effPlan ?? "FREE") as Plan, Feature.REALTIME_MONITOR);

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>로딩 중...</div>;

  if (!isPro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Header />
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ filter: "blur(4px)", pointerEvents: "none", background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[["낙찰 이력", "312건"], ["총 낙찰액", "1,240억원"], ["평균 낙찰률", "87.912%"], ["주 사정율 구간", "99.2~100.4%"]].map(([label, val]) => (
                <div key={label} style={{ background: "#F8FAFC", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 180, background: "#F8FAFC", borderRadius: 10 }} />
          </div>
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,30,60,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, borderRadius: 14 }}>
            <span style={{ fontSize: 40 }}>🔍</span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>PRO 플랜 전용 기능</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>경쟁사의 낙찰 이력·사정율 패턴, 발주처별 상위 낙찰업체를 낱낱이 분석하세요</div>
              <Link href="/billing" style={{ background: "#60A5FA", color: "#fff", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-block" }}>PRO 시작하기 →</Link>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { icon: "🏗", title: "경쟁사 낙찰 이력", desc: "특정 업체의 낙찰 건수·총액·주력 발주처를 한눈에" },
            { icon: "🎯", title: "사정율 패턴 분석", desc: "그 업체가 어떤 사정율 구간에서 낙찰받는지 분포 공개" },
            { icon: "🏛", title: "발주처 심층 분석", desc: "이 발주처는 누가 휩쓸고 있는지 상위 낙찰업체 top10" },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <CompetitorReport />;
}

function Header() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>경쟁사·발주처 심층 분석</h2>
        <span style={{ fontSize: 10, fontWeight: 700, background: "#059669", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>PRO</span>
      </div>
      <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
        개찰 완료 낙찰 데이터 532만 건에서 경쟁사의 투찰 패턴과 발주처의 낙찰 지형을 분석합니다.
      </p>
    </div>
  );
}

function CompetitorReport() {
  const [tab, setTab] = useState<"company" | "org">("company");
  const [name, setName] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [fetching, setFetching] = useState(false);

  // /competitors?name=X&type=org 딥링크 (알림 설정 페이지 연동)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const n = sp.get("name");
    const t = sp.get("type");
    if (t === "org") setTab("org");
    if (n && n.trim().length >= 2) {
      setName(n.trim());
      void run(n.trim(), t === "org" ? "org" : "company");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(q: string, t: "company" | "org") {
    if (q.trim().length < 2) return;
    setFetching(true);
    setReport(null);
    try {
      const res = await fetch(`/api/competitors/report?type=${t}&name=${encodeURIComponent(q.trim())}`);
      const json = (await res.json()) as Report;
      setReport(json);
    } catch {
      setReport({ type: t, query: q, error: "조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." } as Report);
    }
    setFetching(false);
  }

  const empty = report && (report.message || report.error);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Header />

      {/* 탭 */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: "#E8ECF2", borderRadius: 12, width: "fit-content" }}>
        {([["company", "🏗 경쟁사 분석"], ["org", "🏛 발주처 분석"]] as ["company" | "org", string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setReport(null); }}
            style={{
              padding: "9px 20px", fontSize: 13.5, fontWeight: tab === key ? 700 : 500,
              color: tab === key ? "#1B3A6B" : "#64748B",
              background: tab === key ? "#fff" : "transparent",
              border: "none", borderRadius: 9, cursor: "pointer",
              boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div style={{ display: "flex", gap: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tab === "company" ? "경쟁사 상호명 (예: 대한종합건설)" : "발주처명 (예: 조달청, 서울특별시)"}
          style={{ flex: 1, height: 48, padding: "0 14px", border: "1.5px solid #E8ECF2", borderRadius: 10, fontSize: 14, outline: "none", background: "#fff" }}
          onKeyDown={(e) => e.key === "Enter" && !fetching && run(name, tab)}
        />
        <button
          onClick={() => run(name, tab)}
          disabled={fetching}
          style={{ height: 48, padding: "0 26px", background: "#1B3A6B", color: "#fff", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 14, cursor: fetching ? "wait" : "pointer" }}
        >
          {fetching ? "분석 중..." : "심층 분석"}
        </button>
      </div>

      {fetching && (
        <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: "36px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#374151", fontWeight: 600, marginBottom: 6 }}>낙찰 DB 532만 건을 스캔하고 있습니다...</div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>최대 10초 정도 걸릴 수 있습니다</div>
        </div>
      )}

      {empty && (
        <div style={{ background: report?.error ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${report?.error ? "#FECACA" : "#FDE68A"}`, borderRadius: 12, padding: "14px 18px", fontSize: 13, color: report?.error ? "#991B1B" : "#92400E" }}>
          {report?.error ?? report?.message}
          {report?.upgradeUrl && (
            <Link href={report.upgradeUrl} style={{ marginLeft: 8, color: "#1B3A6B", fontWeight: 700 }}>구독하기 →</Link>
          )}
        </div>
      )}

      {report && !empty && <ReportView r={report} />}
    </div>
  );
}

function ReportView({ r }: { r: Report }) {
  const isCompany = r.type === "company";
  const s = r.sajung;
  const maxMonthly = Math.max(1, ...(r.monthly ?? []).map((m) => m.count));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 매칭 정보 */}
      {isCompany && r.matchedNames && r.matchedNames.length > 0 && (
        <div style={{ fontSize: 12, color: "#64748B" }}>
          매칭 상호: {r.matchedNames.map((m) => `${m.name} (${m.count}건)`).join(" · ")}
          {r.capped && <span style={{ color: "#92400E" }}> · 최근 1,000건 기준</span>}
        </div>
      )}
      {!isCompany && (
        <div style={{ fontSize: 12, color: "#64748B" }}>
          발주처: <strong>{r.orgNameMatched}</strong> · 최근 공고 {r.annCount?.toLocaleString("ko-KR")}건 중 개찰 완료 {r.resultCount?.toLocaleString("ko-KR")}건
          {r.capped && <span style={{ color: "#92400E" }}> · 최근 600건 기준</span>}
        </div>
      )}

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label={isCompany ? "낙찰 건수" : "개찰 완료"} value={`${(isCompany ? r.wins : r.resultCount)?.toLocaleString("ko-KR")}건`} />
        {isCompany
          ? <StatCard label="총 낙찰액" value={r.summary?.totalAmount ? fmtWon(r.summary.totalAmount) : "-"} />
          : <StatCard label="공고 수" value={`${r.annCount?.toLocaleString("ko-KR")}건`} />}
        <StatCard label="평균 낙찰률" value={r.summary?.avgBidRate != null ? r.summary.avgBidRate.toFixed(3) + "%" : "-"} accent />
        {isCompany
          ? <StatCard label="평균 경쟁자 수" value={r.summary?.avgBidders != null ? r.summary.avgBidders.toFixed(1) + "개사" : "-"} />
          : <StatCard label="주 사정율" value={s?.avg != null ? s.avg.toFixed(3) + "%" : "-"} />}
      </div>

      {/* 사정율 패턴 (핵심) */}
      {s && s.p25 != null && s.p75 != null && (
        <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
            🎯 사정율 패턴 <span style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8" }}>(유효 {s.count}건 · 97~103% 범위)</span>
          </div>
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 14 }}>
            {isCompany ? "이 업체는" : "이 발주처 낙찰 건은"} 사정율 <strong style={{ color: "#1B3A6B" }}>{s.p25.toFixed(2)}% ~ {s.p75.toFixed(2)}%</strong> 구간에서 절반이 발생했습니다
            {s.avg != null && <> (평균 <strong>{s.avg.toFixed(3)}%</strong>)</>}.
          </div>
          {/* 97~103 축 밴드 */}
          <div style={{ position: "relative", height: 34, background: "#F1F5F9", borderRadius: 8 }}>
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${((s.p25 - 97) / 6) * 100}%`,
              width: `${((s.p75 - s.p25) / 6) * 100}%`,
              background: "rgba(27,58,107,0.22)", borderRadius: 6,
            }} />
            {s.avg != null && (
              <div style={{ position: "absolute", top: -2, bottom: -2, left: `${((s.avg - 97) / 6) * 100}%`, width: 2.5, background: "#1B3A6B", borderRadius: 2 }} />
            )}
            <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 6px", fontSize: 10, color: "#94A3B8" }}>
              <span>97%</span><span>100%</span><span>103%</span>
            </div>
          </div>
        </div>
      )}

      {/* 낙찰률 분포 + 월별 추이 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {r.rateDist && r.rateDist.count > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>낙찰률 분포</div>
            {([["최저", r.rateDist.min], ["하위 25%", r.rateDist.p25], ["중앙값", r.rateDist.p50], ["상위 25%", r.rateDist.p75], ["최고", r.rateDist.max]] as [string, number | null][]).map(([label, v]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F8FAFC", fontSize: 13 }}>
                <span style={{ color: "#64748B" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "#1B3A6B" }}>{v != null ? v.toFixed(3) + "%" : "-"}</span>
              </div>
            ))}
          </div>
        )}
        {r.monthly && (
          <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>최근 12개월 낙찰 추이</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }}>
              {r.monthly.map((m) => (
                <div key={m.ym} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ fontSize: 9, color: "#64748B", fontWeight: 600 }}>{m.count > 0 ? m.count : ""}</div>
                  <div style={{ width: "100%", height: Math.max(3, (m.count / maxMonthly) * 80), background: m.count > 0 ? "#1B3A6B" : "#E8ECF2", borderRadius: 3 }} />
                  <div style={{ fontSize: 8.5, color: "#94A3B8" }}>{m.ym.slice(5)}월</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 주력 발주처 / 상위 낙찰업체 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
            {isCompany ? "주력 발주처 TOP 5" : "상위 낙찰업체 TOP 10"}
          </div>
          {(isCompany ? (r.topOrgs ?? []) : (r.topWinners ?? [])).map((t, i) => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #F8FAFC", fontSize: 13 }}>
              <span style={{ width: 20, fontWeight: 700, color: i < 3 ? "#1B3A6B" : "#94A3B8" }}>{i + 1}</span>
              <span style={{ flex: 1, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              <span style={{ fontWeight: 600, color: "#1B3A6B" }}>{t.count}건</span>
              {"avgRate" in t && t.avgRate != null && (
                <span style={{ fontSize: 11, color: "#94A3B8" }}>평균 {Number(t.avgRate).toFixed(2)}%</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>공종·지역</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>주력 공종</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {(r.topCategories ?? []).map((c) => (
              <span key={c.name} style={{ fontSize: 12, background: "#EFF6FF", color: "#1B3A6B", padding: "4px 10px", borderRadius: 99, fontWeight: 600 }}>{c.name} {c.count}건</span>
            ))}
            {(r.topCategories ?? []).length === 0 && <span style={{ fontSize: 12, color: "#9CA3AF" }}>데이터 없음</span>}
          </div>
          {isCompany && (
            <>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>주력 지역</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(r.topRegions ?? []).map((c) => (
                  <span key={c.name} style={{ fontSize: 12, background: "#ECFDF5", color: "#065F46", padding: "4px 10px", borderRadius: 99, fontWeight: 600 }}>{c.name} {c.count}건</span>
                ))}
                {(r.topRegions ?? []).length === 0 && <span style={{ fontSize: 12, color: "#9CA3AF" }}>데이터 없음</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 최근 낙찰 이력 */}
      {r.recent && r.recent.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>최근 낙찰 이력 {Math.min(20, r.recent.length)}건</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: "#94A3B8", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>개찰일</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>공고명</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{isCompany ? "발주처" : "낙찰업체"}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>낙찰액</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>낙찰률</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>참여</th>
                </tr>
              </thead>
              <tbody>
                {r.recent.map((row) => (
                  <tr key={row.annId + String(row.openedAt)} style={{ borderTop: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "7px 8px", color: "#64748B", whiteSpace: "nowrap" }}>
                      {row.openedAt ? new Date(row.openedAt).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td style={{ padding: "7px 8px", color: "#0F172A", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.title ?? row.annId}
                    </td>
                    <td style={{ padding: "7px 8px", color: "#374151", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isCompany ? (row.orgName ?? "-") : (row.winnerName ?? "-")}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: "#1B3A6B", whiteSpace: "nowrap" }}>{fmtWon(row.finalPrice)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#374151" }}>{row.bidRate > 0 ? row.bidRate.toFixed(3) + "%" : "-"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748B" }}>{row.numBidders != null ? row.numBidders + "개사" : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r.disclaimer && (
        <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>{r.disclaimer} AI 분석은 참고 자료이며 낙찰을 보장하지 않습니다.</div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: accent ? "#1B3A6B" : "#0F172A", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
