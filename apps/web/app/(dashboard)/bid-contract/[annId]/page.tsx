import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ContractForm } from "@/components/naktal/ContractForm";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export default async function BidContractPage({
  params,
}: {
  params: Promise<{ annId: string }>;
}) {
  const { annId } = await params;
  const admin = createAdminClient();

  // 인증 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 공고 조회
  const { data: ann } = await admin
    .from("Announcement")
    .select("id,konepsId,title,orgName,deadline,budget,rawJson,aValueYn,aValueTotal")
    .or(`id.eq.${annId},konepsId.eq.${annId}`)
    .maybeSingle();
  if (!ann) notFound();

  const rawJson = (ann.rawJson as Record<string, string>) ?? {};
  const budgetNum = Number(rawJson.bdgtAmt) || Number(ann.budget);
  const lowerLimitRate = parseFloat((rawJson.sucsfbidLwltRate ?? "87.745").replace(/[^0-9.]/g, "")) || 87.745;
  const aValueYn = String(ann.aValueYn ?? "");
  const aValueTotal = Number(String(ann.aValueTotal ?? "0").replace(/[^0-9]/g, "")) || 0;

  // 유저 DB ID + 기존 계약 여부
  const { data: dbUser } = await admin.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) redirect("/login");

  const { data: existing } = await admin
    .from("BidRequest")
    .select("contractAt")
    .eq("userId", dbUser.id as string)
    .eq("annId", ann.id as string)
    .maybeSingle();

  // 이미 계약됐으면 공고 상세로
  if (existing?.contractAt) redirect(`/announcements/${ann.id}`);

  // BidPricePrediction 캐시 조회
  const { data: pred } = await admin
    .from("BidPricePrediction")
    .select("optimalBidPrice,lowerLimitPrice,predictedSajungRate,winProbability,competitionScore")
    .eq("annId", ann.id as string)
    .gt("expiresAt", new Date().toISOString())
    .maybeSingle();

  const optimalBidPrice = Number(pred?.optimalBidPrice ?? 0);
  const lowerLimitPrice = Number(pred?.lowerLimitPrice ?? 0);
  const predictedSajungRate = Number(pred?.predictedSajungRate ?? 103.8);
  const winProbability = Number(pred?.winProbability ?? 0);
  const competitionScore = Number(pred?.competitionScore ?? 0);
  const estimatedPrice = budgetNum * (predictedSajungRate / 100);

  const feeRate = optimalBidPrice > 0 && optimalBidPrice < 100_000_000 ? 0.017 : 0.015;
  const feeAmount = Math.round(optimalBidPrice * feeRate);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* 뒤로가기 */}
      <Link
        href={`/announcements/${ann.id}`}
        style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}
      >
        ← 공고 상세로
      </Link>

      {/* 공고 헤더 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>투찰 AI 추천 서비스 이용 계약</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{ann.title as string}</div>
        <div style={{ fontSize: 12, color: "#64748B" }}>
          {ann.orgName as string} · 마감 {fmtDate(ann.deadline as string)}
        </div>
      </div>

      {/* 계약서 본문 */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
        padding: "24px 28px", maxHeight: 480, overflowY: "auto",
        fontSize: 13, color: "#374151", lineHeight: 1.9,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 20, color: "#0F172A" }}>
          Naktal.ai AI 투찰 추천 서비스 이용 계약서
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong>계약 당사자</strong><br />
          갑 (서비스 제공자): Naktal.ai 운영사<br />
          을 (이용자): 본 계약에 전자서명하는 사업자
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong>제1조 (서비스 내용)</strong><br />
          갑은 을이 신청한 공고에 대해 AI 기반 투찰가 분석 결과(이하 "추천가")를 제공합니다.
          추천가는 과거 낙찰 데이터의 통계적 분석 결과이며, 낙찰을 보장하지 않습니다.
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong>제2조 (수수료 조건)</strong><br />
          수수료는 <strong>낙찰 성공 시에만</strong> 발생합니다.<br />
          · 추천가 1억 원 미만: 낙찰금액의 1.7%<br />
          · 추천가 1억 원 이상: 낙찰금액의 1.5%<br />
          미낙찰 시 수수료는 일절 발생하지 않습니다.
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong>제3조 (추천금액 공개)</strong><br />
          AI 추천 투찰금액은 본 계약 전자서명 완료 후 즉시 공개됩니다.
          공개된 추천가는 취소하거나 환불받을 수 없습니다.
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong>제4조 (면책 조항)</strong><br />
          갑이 제공하는 추천가는 통계적 참고 자료이며, 실제 낙찰 결과에 대한 법적 책임을 지지 않습니다.
          을은 추천가를 참고하여 최종 투찰가를 자체적으로 결정해야 합니다.
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong>제5조 (개인정보 수집)</strong><br />
          계약 체결 시 사업자등록번호 및 대표자명이 수집됩니다.
          수집된 정보는 수수료 청구 및 계약 이행 목적으로만 사용되며,
          관련 법령에 따라 보관 후 파기됩니다.
        </div>
      </div>

      {/* 서명 폼 (분석 데이터 없으면 안내) */}
      {optimalBidPrice === 0 ? (
        <div style={{
          background: "#FFF7ED", border: "1px solid #FED7AA",
          borderRadius: 12, padding: "20px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#92400E", marginBottom: 8 }}>
            AI 분석 데이터가 없습니다
          </div>
          <div style={{ fontSize: 12, color: "#B45309", marginBottom: 16 }}>
            공고 상세 페이지에서 AI 분석을 먼저 실행해주세요.
          </div>
          <Link
            href={`/announcements/${ann.id}`}
            style={{
              display: "inline-block", padding: "8px 20px",
              background: "#1B3A6B", color: "#fff",
              borderRadius: 8, fontSize: 13, fontWeight: 700,
              textDecoration: "none",
            }}
          >
            공고 상세로 이동
          </Link>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>전자서명</div>
          <ContractForm
            annId={ann.id as string}
            konepsId={ann.konepsId as string}
            title={ann.title as string}
            orgName={ann.orgName as string}
            deadline={ann.deadline as string}
            budget={budgetNum}
            lowerLimitRate={lowerLimitRate}
            aValueYn={aValueYn}
            aValueTotal={aValueTotal}
            optimalBidPrice={optimalBidPrice}
            lowerLimitPrice={lowerLimitPrice}
            predictedSajungRate={predictedSajungRate}
            estimatedPrice={estimatedPrice}
            winProbability={winProbability}
            competitionScore={competitionScore}
            feeRate={feeRate}
            feeAmount={feeAmount}
          />
        </div>
      )}
    </div>
  );
}
