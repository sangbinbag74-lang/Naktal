/**
 * G2B rawJson 필드 추출 헬퍼
 * — KONEPS API 가 같은 정보를 다른 키로 반환하는 경우 다중 키 시도
 */

type Raw = Record<string, string | undefined> | null | undefined;

function pick(rawJson: Raw, keys: string[]): string | null {
  if (!rawJson) return null;
  for (const k of keys) {
    const v = rawJson[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function pickNum(rawJson: Raw, keys: string[]): number | null {
  const s = pick(rawJson, keys);
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}

/** 입찰 일정 4단계 */
export function extractBidSchedule(rawJson: Raw) {
  return {
    rcptBgnDt: pick(rawJson, ["rcptBgnDt", "bidBeginDt", "bidPrtcptBgnDt"]),
    bidPrtcptQlfctRgstDdln: pick(rawJson, ["bidPrtcptQlfctRgstDdln", "qlfctRgstDdln", "rgstDdlnDt"]),
    bidClseDt: pick(rawJson, ["bidClseDt", "bidEndDt", "bidNtceClseDt"]),
    opengDt: (() => {
      const date = pick(rawJson, ["opengDt", "opengDate"]);
      const time = pick(rawJson, ["opengTm", "opengTime"]);
      if (!date) return null;
      // "2026-05-14" + "11:00" → "2026-05-14 11:00:00"
      if (time) return `${date} ${time.length === 4 ? time.slice(0, 2) + ":" + time.slice(2) : time}`;
      return date;
    })(),
  };
}

/** 추가 메타데이터 */
export function extractMetadata(rawJson: Raw) {
  return {
    pureWorkCnstcAmt: pickNum(rawJson, ["pureWorkCnstcAmt", "pureWorkAmt", "prearngPrceAmt"]),
    cntrctCnclsMthdNm: pick(rawJson, ["cntrctCnclsMthdNm", "cntrctMthdNm"]),
    prearngPrceDcsnMthdNm: pick(rawJson, ["prearngPrceDcsnMthdNm"]), // 가격결정방식 (복수예가/단일예가/비예가)
    sucsfbidMthdNm: pick(rawJson, ["sucsfbidMthdNm"]), // 낙찰자결정방식 (협상/최저가/수의시담 등)
    indstrytyNm: pick(rawJson, ["indstrytyNm", "indstrytyCdNm"]),
    indstrytyCd: pick(rawJson, ["indstrytyCd", "indCd"]),
    dmndInsttNm: pick(rawJson, ["dmndInsttNm"]),
    rsrvtnPrceMakNumPrearngPrceCnt: pickNum(rawJson, ["rsrvtnPrceMakNumPrearngPrceCnt", "selPrearngPrceCnt"]),
    prearngPrceCnt: pickNum(rawJson, ["prearngPrceCnt", "totlPrearngPrceCnt"]),
    pqRcptDdlnDt: pick(rawJson, ["pqRcptDdlnDt"]),
    rsltSbmsnDdlnDt: pick(rawJson, ["rsltSbmsnDdlnDt"]),
    cnclsMethodDdlnDt: pick(rawJson, ["cnclsMethodDdlnDt"]),
    sitePrcrmntDt: pick(rawJson, ["sitePrcrmntDt", "siteSpotDt"]),
  };
}

/** 예가방법 표시 문자열 */
export function formatPrearngPrceMethod(rawJson: Raw): string {
  const sel = pickNum(rawJson, ["rsrvtnPrceMakNumPrearngPrceCnt", "selPrearngPrceCnt"]);
  const total = pickNum(rawJson, ["prearngPrceCnt", "totlPrearngPrceCnt"]);
  if (sel != null && total != null) return `복수예가 ${sel}추첨/${total}총예가`;
  return "복수예가";
}
