export interface AnnouncementRow {
  konepsId: string;
  title: string;
  orgName: string;
  budget: bigint;
  deadline: Date;
  category: string;
  region: string;
  rawJson: Record<string, string>;
}

/**
 * "123,456,000원" 또는 "123,456,000" → BigInt(123456000)
 */
export function parseBudget(raw: string): bigint {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) throw new Error(`budget 파싱 실패: "${raw}"`);
  return BigInt(digits);
}

/**
 * "2024/06/30 18:00" → Date
 * "2024-06-30 18:00" → Date
 */
export function parseDeadline(raw: string): Date {
  const normalized = raw.trim().replace(/\//g, "-");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) throw new Error(`deadline 파싱 실패: "${raw}"`);
  return d;
}

/**
 * 나라장터 공고 목록 테이블 한 행의 셀 텍스트 배열을 AnnouncementRow로 변환
 *
 * 나라장터 공고 목록 테이블 컬럼 순서 (실제 사이트에서 확인 후 조정 필요):
 * [0] 공고번호   → konepsId
 * [1] 공고명     → title
 * [2] 발주기관   → orgName
 * [3] 기초금액   → budget
 * [4] 입찰마감일 → deadline
 * [5] 업종       → category
 * [6] 지역       → region
 */
export function parseAnnouncementRow(
  cells: string[]
): AnnouncementRow | null {
  try {
    const rawJson: Record<string, string> = {};
    cells.forEach((v, i) => { rawJson[`col_${i}`] = v; });

    const konepsId = cells[0]?.trim();
    const title    = cells[1]?.trim();
    const orgName  = cells[2]?.trim();
    const budgetRaw   = cells[3]?.trim();
    const deadlineRaw = cells[4]?.trim();
    const category = cells[5]?.trim() ?? "";
    const region   = cells[6]?.trim() ?? "";

    if (!konepsId || !title || !orgName || !budgetRaw || !deadlineRaw) {
      return null;
    }

    const budget   = parseBudget(budgetRaw);
    const deadline = parseDeadline(deadlineRaw);

    return { konepsId, title, orgName, budget, deadline, category, region, rawJson };
  } catch {
    return null;
  }
}
