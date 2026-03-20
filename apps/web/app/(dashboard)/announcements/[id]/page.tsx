import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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
}

function fmt(n: string) {
  const num = parseInt(n, 10);
  return isNaN(num) ? n : new Intl.NumberFormat("ko-KR").format(num) + "원";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getDDay(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "마감";
  return `D-${diff}`;
}

const INFO_ROWS = [
  { label: "발주기관", key: "orgName" },
  { label: "공고번호", key: "konepsId" },
  { label: "업종/공사구분", key: "category" },
  { label: "지역", key: "region" },
  { label: "등록일", key: "createdAt", fmt: fmtDate },
];

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: ann, error } = await supabase
    .from("Announcement")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ann) notFound();
  const a = ann as Announcement;

  const budgetNum = parseInt(a.budget, 10);
  const estimatedPrice = isNaN(budgetNum) ? null : Math.round(budgetNum * 1.03);

  return (
    <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 뒤로가기 */}
      <Link
        href="/announcements"
        style={{ fontSize: 13, color: "#64748B", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
      >
        ← 공고 목록으로
      </Link>

      {/* 섹션1 — 헤더 카드 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
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
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", lineHeight: 1.5, marginBottom: 6 }}>{a.title}</h1>
        <p style={{ fontSize: 12, color: "#64748B" }}>{a.orgName} · 공고번호 {a.konepsId} · 등록 {fmtDate(a.createdAt)}</p>

        {/* 금액 3열 그리드 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginTop: 16,
          background: "#F8FAFC",
          borderRadius: 10,
          padding: "16px",
        }}>
          {[
            { label: "기초금액", value: fmt(a.budget), sub: "VAT 별도" },
            { label: "추정가격", value: estimatedPrice ? new Intl.NumberFormat("ko-KR").format(estimatedPrice) + "원" : "-", sub: "기초금액 기준 추정" },
            { label: "예가범위", value: "기초금액 ±2%", sub: "복수예가 적용" },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1B3A6B" }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 섹션2 — 액션바 */}
      <div style={{
        background: "linear-gradient(135deg, #1B3A6B 0%, #0F1E3C 100%)",
        borderRadius: 14,
        padding: "18px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>입찰 마감</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{fmtDate(a.deadline)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FCA5A5", marginTop: 2 }}>{getDDay(a.deadline)}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={`https://www.g2b.go.kr/`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              borderRadius: 9,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            나라장터 원문 ↗
          </a>
        </div>
      </div>

      {/* 섹션3 — 2열 정보 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* 좌: 공고 기본정보 */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>공고 기본정보</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {INFO_ROWS.map((row) => {
                const rawVal = (a as unknown as Record<string, string>)[row.key] ?? "-";
                const val = row.fmt ? row.fmt(rawVal) : rawVal;
                return (
                  <tr key={row.label} style={{ borderBottom: "1px solid #F8FAFC" }}>
                    <td style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0", width: "40%" }}>{row.label}</td>
                    <td style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, padding: "8px 0" }}>{val}</td>
                  </tr>
                );
              })}
              <tr style={{ borderBottom: "1px solid #F8FAFC" }}>
                <td style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0" }}>낙찰방법</td>
                <td style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, padding: "8px 0" }}>적격심사</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #F8FAFC" }}>
                <td style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0" }}>낙찰하한율</td>
                <td style={{ fontSize: 13, color: "#DC2626", fontWeight: 600, padding: "8px 0" }}>87.745%</td>
              </tr>
              <tr>
                <td style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0" }}>예가방법</td>
                <td style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, padding: "8px 0" }}>복수예가</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 우: 적격심사 배점 */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>적격심사 배점</div>
          {[
            { label: "시공실적", score: 30, max: 30 },
            { label: "기술능력", score: 15, max: 15 },
            { label: "경영상태", score: 15, max: 15 },
            { label: "신인도", score: 5, max: 5 },
            { label: "입찰가격", score: 35, max: 35 },
          ].map((item) => (
            <div key={item.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#374151" }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1B3A6B" }}>{item.score}점</span>
              </div>
              <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${(item.score / 100) * 100}%`,
                  background: "#1B3A6B",
                  borderRadius: 3,
                }} />
              </div>
            </div>
          ))}
          <div style={{
            marginTop: 12,
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            color: "#92400E",
          }}>
            ⚠ 시공만점 실적 기준: 해당 공고 기초금액의 30% 이상
          </div>
        </div>
      </div>

      {/* 섹션4 — AI 분석 카드 */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "2px solid #C7D2FE",
        padding: "20px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>AI 분석</div>
          <span style={{ fontSize: 10, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "3px 8px", borderRadius: 4 }}>
            Beta
          </span>
        </div>

        {/* 3열 지표 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
          {[
            { label: "AI 추천 투찰률", value: "-", sub: "데이터 수집 중", color: "#1B3A6B" },
            { label: "추천 금액", value: "-", sub: "기초금액 기준", color: "#0F172A" },
            { label: "발주처 낙찰률", value: "-", sub: "최근 10건 평균", color: "#059669" },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center", padding: "12px", background: "#F8FAFC", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* 신뢰구간 바 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
            <span>낙찰하한율 87.745%</span>
            <span>100%</span>
          </div>
          <div style={{ height: 12, background: "#F1F5F9", borderRadius: 6, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: "87.745%", background: "linear-gradient(90deg, #E8ECF2, #C7D2FE)", borderRadius: 6 }} />
            <div style={{
              position: "absolute",
              top: "50%",
              left: "89%",
              transform: "translate(-50%, -50%)",
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#1B3A6B",
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px #1B3A6B",
            }} />
          </div>
        </div>

        {/* ⚠️ 면책 고지 — 삭제·숨김·작은글씨 절대 금지 */}
        <div style={{
          background: "#FFF7ED",
          border: "1px solid #FDE68A",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
          color: "#92400E",
          fontWeight: 500,
        }}>
          ⚠ AI 분석 결과는 통계적 참고 자료입니다. 낙찰을 보장하지 않습니다. 실제 입찰 전 반드시 전문가와 검토하세요.
        </div>
      </div>

      {/* 섹션5 — 발주처 낙찰이력 */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>발주처 낙찰이력</div>
        <div style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: "24px 0" }}>
          아직 수집된 낙찰이력 데이터가 없습니다.
        </div>
      </div>
    </div>
  );
}
