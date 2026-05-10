/**
 * 공고문 PDF 본문에서 참가자격 지역제한 추출
 *
 * 입력: PDF URL (G2B 첨부파일 다운로드 URL)
 * 출력: { type: 'sigun' | 'gwangyeok' | 'national' | 'unknown', label, raw }
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

export interface PdfRgnLimit {
  type: "sigun" | "gwangyeok" | "national" | "unknown";
  label: string;            // 예: '완주군' / '전북' / '전국' / '확인 필요'
  raw?: string;             // PDF 에서 발견된 원문 1~2 줄
}

const SIGUN_PATTERNS = [
  /([가-힣]+(?:시|군|구))\s*내/g,                       // '완주군내'
  /([가-힣]+(?:시|군|구))\s*에\s*(?:있는|소재)/g,         // '완주군에 있는' / '소재'
  /사업장\s*소재지[\s가-힣]*?([가-힣]+(?:시|군|구))/g,    // '사업장 소재지 ~ 완주군'
  /주된\s*영업소[\s가-힣]*?([가-힣]+(?:시|군|구))/g,      // '주된 영업소 ~ 완주군'
];

const GWANGYEOK_PATTERNS = [
  /([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))\s*내/g,
  /([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))\s*에\s*(?:있는|소재)/g,
  /사업장\s*소재지[\s가-힣]*?([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))/g,
];

const NATIONAL_HINTS = [
  /지역\s*제한\s*없음/,
  /전국\s*업체/,
  /제한\s*없이\s*참여/,
];

/**
 * 메인 함수 — URL 받아서 자격 정보 반환
 * @param ntceSpecDocUrl G2B 첨부 파일 URL
 * @returns 추출 결과 (실패 시 unknown)
 */
export async function extractRgnLimitFromPdf(
  ntceSpecDocUrl: string,
): Promise<PdfRgnLimit> {
  if (!ntceSpecDocUrl) return { type: "unknown", label: "확인 필요" };

  const tmpFile = join(tmpdir(), `naktal-${randomUUID()}.pdf`);
  try {
    // 1. 다운로드
    const res = await fetch(ntceSpecDocUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    if (!res.ok) return { type: "unknown", label: "확인 필요" };
    const ct = res.headers.get("content-type") ?? "";
    // PDF 만 처리 (HWP 는 파싱 어려워 일단 unknown)
    if (!ct.includes("pdf")) return { type: "unknown", label: "확인 필요" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return { type: "unknown", label: "확인 필요" };
    await writeFile(tmpFile, buf);

    // 2. pdftotext 추출
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-enc", "UTF-8", "-layout", tmpFile, "-"],
      { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
    );
    const text = stdout ?? "";

    // 3. 참가자격 섹션 추출 (있으면 그 부분만, 없으면 전체)
    const idx = text.search(/참가\s*자격|입찰\s*참가|자격\s*요건/);
    const target = idx >= 0 ? text.slice(idx, idx + 2000) : text.slice(0, 5000);

    // 4. 시·군 패턴 매칭 (제일 강한 신호)
    for (const pat of SIGUN_PATTERNS) {
      pat.lastIndex = 0;
      const m = pat.exec(target);
      if (m) {
        return { type: "sigun", label: m[1]!, raw: matchContext(target, m) };
      }
    }

    // 5. 광역 패턴
    for (const pat of GWANGYEOK_PATTERNS) {
      pat.lastIndex = 0;
      const m = pat.exec(target);
      if (m) {
        return { type: "gwangyeok", label: shortenGwangyeok(m[1]!), raw: matchContext(target, m) };
      }
    }

    // 6. 명시적 전국
    for (const pat of NATIONAL_HINTS) {
      const m = target.match(pat);
      if (m) return { type: "national", label: "전국", raw: m[0] };
    }

    // 7. 자격 키워드는 있는데 매칭 안 됨 → 확인 필요
    return { type: "unknown", label: "확인 필요" };
  } catch {
    return { type: "unknown", label: "확인 필요" };
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

function matchContext(text: string, m: RegExpExecArray): string {
  const start = Math.max(0, m.index - 30);
  const end = Math.min(text.length, m.index + 100);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function shortenGwangyeok(name: string): string {
  return name
    .replace(/특별자치시$/, "")
    .replace(/특별자치도$/, "")
    .replace(/특별시$/, "")
    .replace(/광역시$/, "")
    .replace(/도$/, "");
}
