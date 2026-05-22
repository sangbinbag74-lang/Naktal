/**
 * IndexNow API 클라이언트
 *
 * 네이버·Bing 등 IndexNow 지원 검색엔진에 URL 색인 즉시 요청.
 * 박상빈님 데이터 일체 노출 X — 정적 공개 페이지 URL만 전송.
 *
 * 키 발급: https://www.indexnow.org/  (무료)
 * 발급 후:
 *   1. public/<key>.txt 파일에 키 값 한 줄 저장
 *   2. INDEXNOW_KEY 환경변수에 키 값 등록
 */

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const SITE_HOST = "naktal.me";

export type IndexNowResult = {
  ok: boolean;
  status: number;
  urlCount: number;
  message: string;
};

/**
 * 박상빈님 공개 페이지만 — robots.ts 의 allow 목록과 일치.
 * 새 페이지 추가 X (박상빈님 데이터 0 노출 원칙).
 */
export function getPublicUrls(): string[] {
  const base = "https://naktal.me";
  return [
    `${base}/`,
    `${base}/pricing`,
    `${base}/faq`,
    `${base}/terms`,
    `${base}/privacy`,
    `${base}/refund`,
  ];
}

/**
 * IndexNow API 호출.
 * 키 미설정 시 즉시 noop (배포 사고 방지).
 */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return { ok: false, status: 0, urlCount: urls.length, message: "INDEXNOW_KEY not set" };
  }
  if (urls.length === 0) {
    return { ok: false, status: 0, urlCount: 0, message: "no urls" };
  }

  const body = {
    host: SITE_HOST,
    key,
    keyLocation: `https://${SITE_HOST}/${key}.txt`,
    urlList: urls,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    const ok = res.status === 200 || res.status === 202;
    return {
      ok,
      status: res.status,
      urlCount: urls.length,
      message: ok ? "submitted" : `IndexNow returned ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      urlCount: urls.length,
      message: `IndexNow fetch failed: ${String(e)}`,
    };
  }
}
