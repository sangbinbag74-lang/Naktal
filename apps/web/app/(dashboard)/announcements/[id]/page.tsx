import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { isMultiplePriceBid } from "@/lib/bid-utils";
import { AnnouncementTabs } from "@/components/naktal/AnnouncementTabs";
import {
  g2bFetchAnnouncementByNo,
  g2bParseDate,
  g2bExtractRegion,
  type G2BAnnouncement,
} from "@/lib/g2b";

interface Announcement {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  budget: string;
  deadline: string;
  category: string;
  region: string;
  createdAt: string;
  rawJson: Record<string, string> | null;
}

interface BidResultDb {
  bidRate: string;
  finalPrice: string;
  numBidders: number;
  annId: string;
  winnerName: string | null;
  Announcement: { budget: string } | null;
}

function fmt(n: string) {
  const num = parseInt(n, 10);
  return isNaN(num) ? n : new Intl.NumberFormat("ko-KR").format(num) + "원";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getDDay(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "마감";
  return `D-${diff}`;
}

function extractParticipationConditions(rawJson: Record<string, string> | null): { label: string; value: string }[] {
  if (!rawJson) return [];
  const fields: { key: string; label: string }[] = [
    { key: "prtcptnLmtNm",    label: "참가제한" },
    { key: "ntceInsttAddr",    label: "공고기관주소" },
    { key: "demInsttNm",       label: "수요기관" },
    { key: "rbidPermsnYn",     label: "재입찰허용" },
    { key: "sucsfbidLwltRate", label: "낙찰하한율" },
    { key: "indutyCtgryNm",    label: "업종카테고리" },
  ];
  return fields
    .map(({ key, label }) => ({ label, value: rawJson[key] ?? "" }))
    .filter(({ value }) => value.trim() !== "");
}

function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function g2bToAnnouncement(item: G2BAnnouncement): Announcement {
  const rawJson: Record<string, string> = {};
  for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");
  return {
    id: item.bidNtceNo,
    konepsId: item.bidNtceNo,
    title: item.bidNtceNm ?? "",
    orgName: item.ntceInsttNm || item.demInsttNm || "",
    budget: String(+(item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, "")),
    deadline: g2bParseDate(item.bidClseDt) ?? "",
    category: item.indutyCtgryNm || item.ntceKindNm || "",
    region: g2bExtractRegion(item.ntceInsttAddr || ""),
    createdAt: g2bParseDate(item.bidNtceDt) ?? new Date().toISOString(),
    rawJson,
  };
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  let ann: Announcement | null = null;

  if (isUUID(id)) {
    const { data } = await admin.from("Announcement").select("*").eq("id", id).single();
    ann = data as Announcement | null;
  }
  if (!ann) {
    const { data } = await admin.from("Announcement").select("*").eq("konepsId", id).single();
    ann = data as Announcement | null;
  }
  if (!ann) {
    try {
      const item = await g2bFetchAnnouncementByNo(id);
      if (item) ann = g2bToAnnouncement(item);
    } catch { /* notFound */ }
  }
  if (!ann) notFound();

  const a = ann as Announcement;
  const multiplePrice = isMultiplePriceBid(a.rawJson);
  const isClosed = new Date(a.deadline) < new Date();
  const rawJson = (a.rawJson ?? {}) as Record<string, string>;
  const bidMethodDisplay = rawJson.bidMthdNm || rawJson.cntrctMthdNm || rawJson.ntceKindNm || "";
  const sucsfbidLwltRate = rawJson.sucsfbidLwltRate ?? "";
  const lowerLimitRate = parseFloat(sucsfbidLwltRate.replace(/[^0-9.]/g, "")) || 87.745;
  const participationConditions = extractParticipationConditions(a.rawJson);
  const prtcptnLmtNm = rawJson.prtcptnLmtNm ?? "";
  const budgetNum = parseInt(a.budget, 10);
  const estimatedPrice = isNaN(budgetNum) ? null : Math.round(budgetNum * 1.03);

  // 발주처 낙찰이력
  const { data: orgAnns } = await admin
    .from("Announcement")
    .select("konepsId")
    .ilike("orgName", `%${a.orgName}%`)
    .order("createdAt", { ascending: false })
    .limit(30);

  const konepsIds = (orgAnns ?? []).map((x: { konepsId: string }) => x.konepsId);
  let bidHistoryRaw: BidResultDb[] = [];
  if (konepsIds.length > 0) {
    const { data: bidData } = await admin
      .from("BidResult")
      .select("bidRate,finalPrice,numBidders,annId,winnerName,Announcement!annId(budget)")
      .in("annId", konepsIds)
      .order("createdAt", { ascending: false })
      .limit(10);
    bidHistoryRaw = (bidData ?? []) as BidResultDb[];
  }

  // 사정율 계산 (유효 97~103%)
  const bidHistory = bidHistoryRaw.map((r) => {
    const bidRate = parseFloat(r.bidRate);
    const finalPrice = parseFloat(r.finalPrice);
    const bgt = parseFloat(r.Announcement?.budget ?? "0");
    let sajungRate: number | null = null;
    if (bidRate > 0 && finalPrice > 0 && bgt > 0) {
      const est = finalPrice / (bidRate / 100);
      const raw = (est / bgt) * 100;
      sajungRate = raw >= 97 && raw <= 103 ? Math.round(raw * 100) / 100 : null;
    }
    return { bidRate: r.bidRate, finalPrice: r.finalPrice, numBidders: r.numBidders, sajungRate, winnerName: r.winnerName };
  });

  const avgBidRate =
    bidHistory.length > 0
      ? (bidHistory.reduce((s, r) => s + parseFloat(r.bidRate), 0) / bidHistory.length).toFixed(3)
      : null;

  return (
    <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/announcements" style={{ fontSize: 13, color: "#64748B", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
        ← 공고 목록으로
      </Link>

      {/* 헤더 카드 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {a.category && <span style={{ fontSize: 11, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "3px 8px", borderRadius: 4 }}>{a.category}</span>}
          {a.region && <span style={{ fontSize: 11, fontWeight: 600, background: "#F8FAFC", color: "#64748B", padding: "3px 8px", borderRadius: 4 }}>{a.region}</span>}
          {multiplePrice && <span style={{ fontSize: 11, fontWeight: 600, background: "#ECFDF5", color: "#059669", padding: "3px 8px", borderRadius: 4 }}>복수예가</span>}
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", lineHeight: 1.5, marginBottom: 6 }}>{a.title}</h1>
        <p style={{ fontSize: 12, color: "#64748B" }}>{a.orgName} · 공고번호 {a.konepsId} · 등록 {fmtDate(a.createdAt)}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16, background: "#F8FAFC", borderRadius: 10, padding: "16px" }}>
          {[
            { label: "기초금액", value: fmt(a.budget), sub: "VAT 별도" },
            { label: "추정가격", value: estimatedPrice ? new Intl.NumberFormat("ko-KR").format(estimatedPrice) + "원" : "-", sub: "기초금액 기준 추정" },
            { label: "예가범위", value: sucsfbidLwltRate ? `${sucsfbidLwltRate}% ~` : "기초금액 ±2%", sub: "낙찰하한율 기준" },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1B3A6B" }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 액션바 */}
      <div style={{ background: "linear-gradient(135deg, #1B3A6B 0%, #0F1E3C 100%)", borderRadius: 14, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>입찰 마감</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{fmtDate(a.deadline)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FCA5A5", marginTop: 2 }}>{getDDay(a.deadline)}</div>
        </div>
        <a
          href={rawJson.ntcePbancUrl || `https://www.g2b.go.kr:8081/ep/peoplecvpl/narasVary.do?bidno=${a.konepsId}&bidseq=${rawJson.bidNtceSqNo ?? "00"}`}
          target="_blank" rel="noopener noreferrer"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
        >
          나라장터 원문 ↗
        </a>
      </div>

      {/* 공고 기본정보 + 참가조건 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>공고 기본정보</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                { label: "발주기관",      value: a.orgName },
                { label: "공고번호",      value: a.konepsId },
                { label: "업종/공사구분", value: a.category },
                { label: "지역",          value: a.region },
                { label: "낙찰방법",      value: bidMethodDisplay || "-" },
                { label: "낙찰하한율",    value: sucsfbidLwltRate ? `${sucsfbidLwltRate}%` : "-" },
                { label: "예가방법",      value: multiplePrice ? "복수예가" : "-" },
              ].map((row) => (
                <tr key={row.label} style={{ borderBottom: "1px solid #F8FAFC" }}>
                  <td style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0", width: "40%" }}>{row.label}</td>
                  <td style={{ fontSize: 13, fontWeight: 500, padding: "8px 0", color: row.label === "낙찰하한율" && sucsfbidLwltRate ? "#DC2626" : "#0F172A" }}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>참가자격 / 조건</div>
          {prtcptnLmtNm ? (
            <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-line" }}>{prtcptnLmtNm}</div>
          ) : participationConditions.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {participationConditions.map((row) => (
                  <tr key={row.label} style={{ borderBottom: "1px solid #F8FAFC" }}>
                    <td style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0", width: "40%" }}>{row.label}</td>
                    <td style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, padding: "8px 0" }}>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 13, color: "#94A3B8" }}>참가조건 정보가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 3탭 분석 영역 */}
      <AnnouncementTabs
        annId={a.konepsId}
        annDbId={a.id}
        orgName={a.orgName}
        budget={budgetNum || 0}
        lowerLimitRate={lowerLimitRate}
        multiplePrice={multiplePrice}
        isClosed={isClosed}
        bidMethod={bidMethodDisplay}
        bidHistory={bidHistory}
        avgBidRate={avgBidRate}
      />

      {/* 면책 고지 */}
      <div style={{ background: "#FFF7ED", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400E", fontWeight: 500 }}>
        ⚠ AI 분석 결과는 통계적 참고 자료입니다. 낙찰을 보장하지 않습니다. 실제 입찰 전 반드시 전문가와 검토하세요.
      </div>
    </div>
  );
}
