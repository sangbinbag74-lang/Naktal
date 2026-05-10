interface Props {
  budget: number;            // 추정가격 (presmptPrce, 부가세 별도)
  category: string;          // 업종 (예: "시설공사", "용역")
  subCategories?: string[];  // 부종 업종
  cntrctCnclsMthdNm?: string | null; // 계약방법 (일반/제한/수의)
}

/**
 * 별표4 적격심사 시공경험평가 추정 (지자체·종합건설 기준).
 * 정확한 기준은 공고문 / 발주처 확인 필요. 안내용 추정값.
 */
function calcEstimatedExperience(budget: number, isService: boolean): {
  rate: number;
  label: string;
} | null {
  if (budget <= 0) return null;
  // 단위: 원
  const oh = 100_000_000;
  if (isService) {
    if (budget < 0.5 * oh) return { rate: 0, label: "면제 또는 별도 기준" };
    if (budget < 1 * oh)  return { rate: 0.7,  label: "추정가격 5천만~1억" };
    if (budget < 5 * oh)  return { rate: 0.8,  label: "추정가격 1억~5억" };
    return { rate: 1.0, label: "추정가격 5억 이상" };
  }
  // 공사 (지자체 종합건설 기본 별표4)
  if (budget < 1 * oh)   return { rate: 0,    label: "1억 미만 (소액·면제 가능)" };
  if (budget < 3 * oh)   return { rate: 0.5,  label: "1억~3억" };
  if (budget < 5 * oh)   return { rate: 0.6,  label: "3억~5억" };
  if (budget < 10 * oh)  return { rate: 0.7,  label: "5억~10억" };
  if (budget < 30 * oh)  return { rate: 0.8,  label: "10억~30억" };
  if (budget < 100 * oh) return { rate: 0.9,  label: "30억~100억" };
  return { rate: 1.0, label: "100억 이상" };
}

function fmtKRW(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

export function QualificationDetail({ budget, category, subCategories = [], cntrctCnclsMthdNm }: Props) {
  const isService = category.includes("용역") || category.includes("서비스");
  const exp = calcEstimatedExperience(budget, isService);
  const expAmount = exp && exp.rate > 0 ? Math.ceil(budget * exp.rate) : 0;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>적격심사 세부정보 (추정)</div>
        {cntrctCnclsMthdNm && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
            background: "#EEF2FF", color: "#1B3A6B", border: "1px solid #C7D2FE",
          }}>
            {cntrctCnclsMthdNm}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
        <Row label="업종">
          <span style={{ color: "#0F172A", fontWeight: 600 }}>{category || "-"}</span>
          {subCategories.length > 0 && (
            <span style={{ color: "#64748B", marginLeft: 6 }}>
              (주력 {subCategories[0]})
            </span>
          )}
        </Row>

        <Row label="심사기준">
          <span style={{ color: "#0F172A" }}>
            {isService ? "용역" : "공사"} · {exp?.label ?? "정보 없음"}
          </span>
        </Row>

        {exp && exp.rate > 0 && expAmount > 0 ? (
          <Row label="시공경험평가">
            <div>
              <div style={{ color: "#0F172A", fontWeight: 700, fontSize: 13 }}>
                5년 합계실적 {fmtKRW(expAmount)}원 이상
              </div>
              <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 2 }}>
                추정가격 × {(exp.rate * 100).toFixed(0)}% (별표4 추정)
              </div>
            </div>
          </Row>
        ) : (
          <Row label="시공경험평가">
            <span style={{ color: "#64748B" }}>{exp?.label ?? "정보 없음"}</span>
          </Row>
        )}
      </div>

      <div style={{
        marginTop: 14, padding: "10px 12px",
        background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A",
        fontSize: 11, color: "#92400E", lineHeight: 1.5,
      }}>
        ⚠ 본 정보는 별표4 표준 비율 기반 추정값입니다. 정확한 실적 기준금액·심사항목·평가기준은 반드시 발주처 공고문을 확인하세요.
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 8, alignItems: "start" }}>
      <div style={{ fontSize: 11, color: "#94A3B8", paddingTop: 1 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
