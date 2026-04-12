import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { isMultiplePriceBid } from "@/lib/bid-utils";
import { AnnouncementTabs } from "@/components/naktal/AnnouncementTabs";
import { AiAnalysisPanel } from "@/components/naktal/AiAnalysisPanel";
import { NumberAnalysisSection } from "@/components/naktal/NumberAnalysisSection";
import {
  g2bFetchAnnouncementByNo,
  g2bParseDate,
  g2bExtractRegion,
  type G2BAnnouncement,
} from "@/lib/g2b";
import { parseSubCategories, getAllCategories } from "@/lib/category-map";

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
  rawJson: Record<string, unknown> | null;
  subCategories?: string[];
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

function extractParticipationConditions(rawJson: Record<string, unknown> | null): { label: string; value: string }[] {
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
    .map(({ key, label }) => ({ label, value: String(rawJson[key] ?? "") }))
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
  const multiplePrice = isMultiplePriceBid(a.rawJson as Record<string, string> | null);
  const isClosed = new Date(a.deadline) < new Date();
  const rawJson = (a.rawJson ?? {}) as Record<string, unknown>;
  const bidMethodDisplay = String(rawJson.bidMthdNm ?? rawJson.cntrctMthdNm ?? rawJson.ntceKindNm ?? "");
  const sucsfbidLwltRate = String(rawJson.sucsfbidLwltRate ?? "");
  const lowerLimitRate = parseFloat(sucsfbidLwltRate.replace(/[^0-9.]/g, "")) || 87.745;
  const participationConditions = extractParticipationConditions(a.rawJson);
  const prtcptnLmtNm = String(rawJson.prtcptnLmtNm ?? "");
  const subCats = (a.subCategories && a.subCategories.length > 0)
    ? a.subCategories
    : parseSubCategories(a.rawJson as Record<string, string> | null);
  const allLicenses = getAllCategories(a.category, subCats);
  const budgetNum = parseInt(a.budget, 10);
  const estimatedPrice = isNaN(budgetNum) ? null : Math.round(budgetNum * 1.03);
  const g2bUrl = String(rawJson.ntcePbancUrl || `https://www.g2b.go.kr:8081/ep/peoplecvpl/narasVary.do?bidno=${a.konepsId}&bidseq=${String(rawJson.bidNtceSqNo ?? "00")}`);

  return (
    <div className="w-full min-h-screen px-4 py-5" style={{ background: "#EEF2F7" }}>

      {/* 뒤로가기 */}
      <Link
        href="/announcements"
        style={{ fontSize: 13, color: "#64748B", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", marginBottom: 16 }}
      >
        ← 공고 목록으로
      </Link>

      {/* 공고 헤더 — 전체 너비 흰 카드 */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #E8ECF2",
        padding: "24px",
        marginBottom: 20,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>

          {/* 왼쪽: 뱃지 + 공고명 + 발주처 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {a.category && (
                <span style={{ fontSize: 11, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "3px 8px", borderRadius: 4 }}>
                  {a.category}
                </span>
              )}
              {a.region && (
                <span style={{ fontSize: 11, fontWeight: 600, background: "#F8FAFC", color: "#64748B", padding: "3px 8px", borderRadius: 4 }}>
                  {a.region}
                </span>
              )}
              {multiplePrice && (
                <span style={{ fontSize: 11, fontWeight: 600, background: "#ECFDF5", color: "#059669", padding: "3px 8px", borderRadius: 4 }}>
                  복수예가
                </span>
              )}
              {isClosed && (
                <span style={{ fontSize: 11, fontWeight: 600, background: "#FEF2F2", color: "#DC2626", padding: "3px 8px", borderRadius: 4 }}>
                  마감
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", lineHeight: 1.5, marginBottom: 6 }}>
              {a.title}
            </h1>
            <p style={{ fontSize: 12, color: "#64748B" }}>
              {a.orgName} · 공고번호 {a.konepsId} · 등록 {fmtDate(a.createdAt)}
            </p>
          </div>

          {/* 오른쪽: D-day 배지 */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ background: "#1B3A6B", color: "#fff", borderRadius: 12, padding: "12px 20px", textAlign: "center", minWidth: 120 }}>
              <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>입찰 마감</div>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                {new Date(a.deadline).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, background: "rgba(255,255,255,0.15)", borderRadius: 99, padding: "2px 10px" }}>
                {getDDay(a.deadline)}
              </div>
            </div>
            <a href={g2bUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#3B82F6", textDecoration: "none" }}>
              나라장터 원문 ↗
            </a>
          </div>
        </div>

        {/* 핵심 숫자 3개 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, background: "#F8FAFC", borderRadius: 10, padding: "16px 20px", marginTop: 16 }}>
          {[
            { label: "기초금액",   value: fmt(a.budget),                                                                    sub: "VAT 별도" },
            { label: "추정가격",   value: estimatedPrice ? new Intl.NumberFormat("ko-KR").format(estimatedPrice) + "원" : "-", sub: "기초금액 기준 추정" },
            { label: "낙찰하한율", value: sucsfbidLwltRate ? `${sucsfbidLwltRate}%` : "89.745%",                             sub: "낙찰하한율 기준" },
          ].map((item) => (
            <div key={item.label}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 본문 반응형 그리드 */}
      <div className="grid gap-5 items-start grid-cols-1 md:grid-cols-2 2xl:grid-cols-[1fr_1.2fr_1.8fr]">

        {/* 1열: 공고 정보 */}
        <div className="order-3 md:col-span-2 2xl:col-span-1 2xl:order-1 col-scroll" style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 기본정보 카드 */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8ECF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 16 }}>공고 기본정보</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
              {[
                { label: "발주기관",      value: a.orgName },
                { label: "공고번호",      value: a.konepsId },
                { label: "업종/공사구분", value: a.category || "-" },
                { label: "지역",          value: a.region || "-" },
                { label: "낙찰방법",      value: bidMethodDisplay || "-" },
                { label: "낙찰하한율",    value: sucsfbidLwltRate ? `${sucsfbidLwltRate}%` : "-" },
                { label: "예가방법",      value: multiplePrice ? "복수예가" : "단일예가" },
                { label: "재입찰여부",    value: String(rawJson.rbidPermsnYn ?? "") === "Y" ? "재공고" : "일반" },
              ].map((row) => (
                <div key={row.label}>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{row.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: row.label === "낙찰하한율" ? "#DC2626" : "#0F172A" }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 참가자격 카드 */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8ECF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 16 }}>참가자격 / 조건</div>

            {/* 입찰가능업종 뱃지 */}
            {allLicenses.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>입찰가능업종</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {allLicenses.map((lic, i) => (
                    <span key={lic} style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                      background: i === 0 ? "#EEF2FF" : "#F8FAFC",
                      color: i === 0 ? "#1B3A6B" : "#64748B",
                      border: `1px solid ${i === 0 ? "#C7D2FE" : "#E2E8F0"}`,
                    }}>
                      {i === 0 ? "주종 " : "부종 "}{lic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {prtcptnLmtNm ? (
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-line" }}>{prtcptnLmtNm}</div>
            ) : participationConditions.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
                {participationConditions.map((row) => (
                  <div key={row.label}>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{row.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#94A3B8" }}>참가조건 정보가 없습니다.</div>
            )}
          </div>

          <div style={{ fontSize: 11, color: "#94A3B8", paddingLeft: 4 }}>
            ⚠ AI 분석 결과는 통계적 참고 자료입니다. 낙찰을 보장하지 않습니다.
          </div>
        </div>

        {/* 2열: AI 분석 패널 + 번호 분석 — sticky */}
        <div className="order-1 md:order-1 2xl:order-2 col-scroll" style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <AiAnalysisPanel
            annDbId={a.id}
            budget={budgetNum || 0}
            g2bUrl={g2bUrl}
          />
          {multiplePrice && (
            <div style={{ border: "2px solid #C7D2FE", borderRadius: 12, padding: "20px 24px", background: "#fff" }}>
              <NumberAnalysisSection
                annId={a.id}
                isClosed={isClosed}
                bidMethod={bidMethodDisplay}
              />
            </div>
          )}
        </div>

        {/* 3열: 사정율 분석 탭 — sticky */}
        <div className="order-2 md:order-2 2xl:order-3 col-scroll" style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", minWidth: 0 }}>
          <AnnouncementTabs
            annId={a.konepsId}
            annDbId={a.id}
            title={a.title}
            orgName={a.orgName}
            budget={budgetNum || 0}
            deadline={a.deadline}
            category={a.category}
            region={a.region}
            lowerLimitRate={lowerLimitRate}
            multiplePrice={multiplePrice}
            isClosed={isClosed}
            bidMethod={bidMethodDisplay}
          />
        </div>

      </div>
    </div>
  );
}
