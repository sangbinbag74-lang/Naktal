import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ContractForm } from "@/components/naktal/ContractForm";
import { AutoAnalysisTrigger } from "@/components/naktal/AutoAnalysisTrigger";
import { classifyCategory, DEFAULT_LWLT_BY_KIND, DEFAULT_SAJUNG_BY_KIND } from "@/lib/analysis/category-config";

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

  // dbUser + ann 병렬 (서로 독립)
  const [dbUserRes, annRes] = await Promise.all([
    admin.from("User").select("id,bizNo,bizName,ownerName").eq("supabaseId", user.id).single(),
    admin
      .from("Announcement")
      .select("id,konepsId,title,orgName,deadline,budget,bsisAmt,aValueAmt,category,rawJson,aValueYn,aValueTotal")
      .or(`id.eq.${annId},konepsId.eq.${annId}`)
      .maybeSingle(),
  ]);
  const dbUser = dbUserRes.data;
  const ann = annRes.data;
  if (!dbUser) redirect("/login");
  if (!ann) notFound();

  const rawJson = (ann.rawJson as Record<string, string>) ?? {};
  // 사정율 분모 우선순위 (박상빈님 5/17 명시): bsisAmt (기초금액) > aValueAmt > 추정가격×1.1
  const bsisAmtNum = Number((ann as unknown as Record<string, unknown>).bsisAmt ?? 0);
  const aValueAmtNum = Number((ann as unknown as Record<string, unknown>).aValueAmt ?? 0);
  const rawBudget = Number(rawJson.bdgtAmt) || Number(ann.budget);
  const budgetNum = bsisAmtNum > 0 ? bsisAmtNum : aValueAmtNum > 0 ? aValueAmtNum : rawBudget * 1.1;
  const annCategory = String(ann.category ?? "");
  const annKind = classifyCategory(annCategory);
  const defaultLwlt = DEFAULT_LWLT_BY_KIND[annKind];
  const defaultSajung = DEFAULT_SAJUNG_BY_KIND[annKind];
  const lowerLimitRate = parseFloat((rawJson.sucsfbidLwltRate ?? "").replace(/[^0-9.]/g, "")) || defaultLwlt;
  const aValueYn = String(ann.aValueYn ?? "");
  const aValueTotal = Number(String(ann.aValueTotal ?? "0").replace(/[^0-9]/g, "")) || 0;

  const userBizNo = String((dbUser as { bizNo?: string }).bizNo ?? "");
  const userBizName = String((dbUser as { bizName?: string }).bizName ?? "");
  const userOwnerName = String((dbUser as { ownerName?: string }).ownerName ?? "");
  // 사업자번호 포맷 (000-00-00000)
  const fmtBizNo = (b: string) => {
    const d = b.replace(/\D/g, "");
    if (d.length !== 10) return b;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  };

  // BidRequest (existing + bidReq 합침) + BidPricePrediction 폴백 병렬
  const [bidReqRes, predRes] = await Promise.all([
    admin
      .from("BidRequest")
      .select("contractAt,bizRegNo,repName,recommendedBidPrice,lowerLimitPrice,predictedSajungRate,winProbability,competitionScore,cancelledAt")
      .eq("userId", dbUser.id as string)
      .eq("annId", ann.id as string)
      .maybeSingle(),
    admin
      .from("BidPricePrediction")
      .select("optimalBidPrice,lowerLimitPrice,predictedSajungRate,winProbability,competitionScore")
      .eq("annId", ann.id as string)
      .gt("expiresAt", new Date().toISOString())
      .maybeSingle(),
  ]);
  const bidReqRow = bidReqRes.data;
  const existing = bidReqRow; // contractAt/bizRegNo/repName 포함
  const isContractDone = !!existing?.contractAt;
  // cancelledAt null 인 row 만 분석값으로 사용
  const bidReq = bidReqRow && !bidReqRow.cancelledAt ? bidReqRow : null;
  const pred = bidReq ? null : predRes.data;

  const optimalBidPrice = Number(bidReq?.recommendedBidPrice ?? pred?.optimalBidPrice ?? 0);
  const lowerLimitPrice = Number(bidReq?.lowerLimitPrice ?? pred?.lowerLimitPrice ?? 0);
  // 사정율 fallback — 카테고리별 (공사 100 / 용역 87 / 물품 80)
  const predictedSajungRate = Number(bidReq?.predictedSajungRate ?? pred?.predictedSajungRate ?? defaultSajung.center);
  // winProbability scale: BidRequest 는 0~100 정수 / BidPricePrediction 은 0~1 소수
  const winProbability = bidReq
    ? Number(bidReq.winProbability ?? 0) / 100
    : Number(pred?.winProbability ?? 0);
  const competitionScore = Number(bidReq?.competitionScore ?? pred?.competitionScore ?? 0);
  const estimatedPrice = budgetNum * (predictedSajungRate / 100);

  const feeRate = optimalBidPrice > 0 && optimalBidPrice < 100_000_000 ? 0.017 : 0.015;
  const feeAmount = Math.round(optimalBidPrice * feeRate);

  // 분석 없으면 계약서 없이 분석 화면만 표시
  if (optimalBidPrice === 0) {
    return <AutoAnalysisTrigger annId={ann.id as string} annDbId={ann.id as string} />;
  }

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
          낙비 AI 투찰 추천 서비스 이용 계약서
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>계약 당사자</strong><br /><br />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "12px 14px" }}>
              <strong style={{ color: "#1B3A6B" }}>갑 (서비스 제공자)</strong><br /><br />
              상호: <strong>주식회사 호라이즌</strong><br />
              사업자등록번호: <strong>398-87-03453</strong><br />
              서비스명: 낙비
            </div>
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "12px 14px" }}>
              <strong style={{ color: "#1E40AF" }}>을 (이용자)</strong><br /><br />
              {isContractDone ? (
                <>
                  상호: <strong>{userBizName || "-"}</strong><br />
                  사업자등록번호: <strong>{userBizNo ? fmtBizNo(userBizNo) : "-"}</strong><br />
                  대표자: <strong>{userOwnerName || "-"}</strong>
                </>
              ) : (
                <>
                  상호: <strong style={{ color: "#94A3B8" }}>전자서명 시 본인 확인</strong><br />
                  사업자등록번호: <strong style={{ color: "#94A3B8" }}>전자서명 시 본인 확인</strong><br />
                  대표자: <strong style={{ color: "#94A3B8" }}>전자서명 시 본인 확인</strong>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>제1조 (서비스의 내용)</strong><br /><br />
          ① 갑은 을이 신청한 나라장터 입찰 공고에 대하여 과거 낙찰 데이터의 통계적 분석에 기반한 AI 투찰가 추천 결과(이하 "추천가")를 제공합니다.<br /><br />
          ② 추천가는 통계적 참고 자료로서 낙찰을 보장하지 않으며, 최종 투찰가 결정 및 그에 따른 결과는 전적으로 을의 책임입니다.<br /><br />
          ③ 갑은 공고별 1회에 한하여 추천가를 제공하며, 본 계약 체결 후 즉시 공개됩니다.
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>제2조 (수수료 조건)</strong><br /><br />
          ① 수수료는 <strong>낙찰 성공 시에만</strong> 발생합니다. 미낙찰 시 수수료는 일절 발생하지 않습니다.<br /><br />
          ② 수수료율은 다음 기준에 따라 적용합니다.<br />
          &nbsp;&nbsp;&nbsp;· 추천가 1억 원 미만: 실제 낙찰금액의 1.7%<br />
          &nbsp;&nbsp;&nbsp;· 추천가 1억 원 이상: 실제 낙찰금액의 1.5%<br /><br />
          ③ 을은 낙찰 결과 공고일로부터 14일 이내에 아래 법인 계좌로 수수료를 납부하여야 합니다.<br /><br />
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "12px 16px", marginTop: 8 }}>
            <strong>[수수료 납부 계좌]</strong><br />
            은행: 신한은행<br />
            계좌번호: 100-038-306439<br />
            예금주: 주식회사 호라이즌
          </div><br />
          ④ 수수료는 반드시 법인 계좌로만 납부하여야 하며, 개인 계좌 등 타 계좌 입금은 인정되지 않습니다.
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>제3조 (수수료 미납 시 제재)</strong><br /><br />
          ① 을이 제2조 제3항의 납부 기한을 도과한 경우, 미납 수수료에 대하여 연 6%의 지연이자가 부과됩니다.<br /><br />
          ② 납부 기한 도과 시 갑은 을의 서비스 이용을 영구적으로 제한할 수 있으며, 을은 이에 이의를 제기할 수 없습니다.<br /><br />
          ③ 납부 기한 도과 후 30일이 경과하도록 수수료가 납부되지 않은 경우, 갑은 민사소송, 지급명령 등 법적 조치를 취할 수 있으며, 이에 따른 소송비용, 변호사 비용 등 일체의 비용은 을이 부담합니다.<br /><br />
          ④ 법적 조치에 따른 관할 법원은 서울중앙지방법원으로 합니다.
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>제4조 (추천금액 공개 및 취소 불가)</strong><br /><br />
          ① AI 추천 투찰금액은 본 계약의 전자서명 완료 즉시 공개됩니다.<br /><br />
          ② 공개된 추천가는 어떠한 사유로도 취소, 환불, 변경이 불가합니다.<br /><br />
          ③ 을이 추천가를 기준으로 ±0.5% 이내의 금액으로 투찰하여 낙찰된 경우 본 계약의 수수료 조건이 적용됩니다. 단, 투찰금액의 끝자리 절사(나라장터 규정에 따른 원 단위 처리)는 동일 금액으로 간주합니다.<br /><br />
          ④ 을이 추천가 ±0.5% 범위를 벗어난 금액으로 투찰하여 낙찰된 경우에도, 갑의 추천가가 낙찰에 기여하였다고 판단되는 경우 수수료가 청구될 수 있으며, 이 경우 갑과 을이 협의하여 결정합니다.<br /><br />
          ⑤ 미낙찰 시 어떠한 경우에도 수수료는 발생하지 않습니다.
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>제5조 (면책 조항)</strong><br /><br />
          ① 갑이 제공하는 추천가는 과거 데이터 기반의 통계적 참고 자료이며, 갑은 실제 낙찰 결과에 대한 어떠한 법적 책임도 부담하지 않습니다.<br /><br />
          ② 을은 추천가를 참고하여 최종 투찰가를 자체적으로 판단하고 결정하여야 합니다.<br /><br />
          ③ 나라장터 시스템 장애, 예가 산정 방식 변경, 천재지변 등 갑의 귀책 사유가 아닌 원인으로 발생한 불이익에 대하여 갑은 책임을 지지 않습니다.
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>제6조 (개인정보 수집 및 이용)</strong><br /><br />
          ① 계약 체결 시 수집하는 정보: 사업자등록번호, 대표자 성명, 계약 체결 일시, 접속 IP<br /><br />
          ② 수집 목적: 수수료 청구, 계약 이행, 법적 분쟁 대응<br /><br />
          ③ 보유 기간: 계약 종료 후 5년 (상법 및 국세기본법 기준)<br /><br />
          ④ 을은 개인정보 수집·이용에 동의하지 않을 권리가 있으나, 미동의 시 서비스 이용이 불가합니다.
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", marginBottom: 16, paddingTop: 16 }}>
          <strong>제7조 (계약의 효력)</strong><br /><br />
          ① 본 계약은 을이 사업자등록번호 및 대표자 성명을 입력하고 전자서명 버튼을 클릭한 시점에 유효하게 성립합니다.<br /><br />
          ② 전자서명은 「전자서명법」에 따른 서명으로서 자필 서명과 동일한 법적 효력을 가집니다.<br /><br />
          ③ 계약 체결 일시, 접속 IP 등은 서버에 기록되며 법적 증거로 활용될 수 있습니다.
        </div>

        <div style={{ borderTop: "1px solid #E8ECF2", paddingTop: 16, fontSize: 12, color: "#6B7280" }}>
          <strong>부칙</strong><br /><br />
          본 계약에 명시되지 않은 사항은 대한민국 민법 및 상법에 따릅니다.<br />
          분쟁 발생 시 관할 법원은 서울중앙지방법원으로 합니다.
        </div>
      </div>

      {/* 서명 폼 또는 완료 안내 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
        {isContractDone ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#059669", marginBottom: 6 }}>계약 완료</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 4 }}>
              계약일시: {fmtDate(existing.contractAt as string)}
            </div>
            {existing.bizRegNo && (
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>
                사업자등록번호: {existing.bizRegNo as string}
              </div>
            )}
            {existing.repName && (
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>
                대표자: {existing.repName as string}
              </div>
            )}
            <Link
              href={`/bid-result/${(ann.konepsId as string) ?? (ann.id as string)}`}
              style={{
                display: "inline-block", marginTop: 12,
                background: "#1B3A6B", color: "#fff",
                padding: "10px 24px", borderRadius: 8,
                fontSize: 13, fontWeight: 600, textDecoration: "none",
              }}
            >
              결과 페이지로 →
            </Link>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
