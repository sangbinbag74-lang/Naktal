/**
 * 공고문 PDF/HWP 본문에서 참가자격 지역제한 추출
 *
 * 입력: 첨부파일 URL (G2B PDF 또는 HWP)
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
  label: string;
  raw?: string;
}

// 시·군 패턴 — 본사/주된영업소/사무소 + 시·군 매칭
const SIGUN_PATTERNS = [
  /([가-힣]+(?:시|군|구))\s*(?:내|에)\s*(?:소재|있는|위치|둔)/g,
  /(?:사업장|본점|본사|주된\s*영업소|주된\s*사무소|주사무소)\s*(?:의)?\s*소재지[\s가-힣은는이가을를의에]*?([가-힣]+(?:시|군|구))/g,
  /([가-힣]+(?:시|군|구))\s*[가-힣]*\s*소재\s*(?:업체|업자|법인)/g,
  /([가-힣]+(?:시|군|구))\s*에\s*주된\s*영업소/g,
  /주된\s*영업소[\s가-힣은는이가을를의에]{0,30}?([가-힣]+(?:시|군|구))/g,
  /([가-힣]+(?:시|군|구))\s*관내/g,
  /관내\s*([가-힣]+(?:시|군|구))/g,
];

// 광역시·도 패턴
const GWANGYEOK_PATTERNS = [
  /([가-힣]+(?:특별시|광역시|특별자치시|특별자치도)|[가-힣]{2,4}도)\s*(?:내|에)\s*(?:소재|있는|위치|둔)/g,
  /(?:사업장|본점|본사|주된\s*영업소|주된\s*사무소|주사무소)\s*(?:의)?\s*소재지[\s가-힣은는이가을를의에]*?([가-힣]+(?:특별시|광역시|특별자치시|특별자치도)|[가-힣]{2,4}도)/g,
  /([가-힣]+(?:특별시|광역시|특별자치시|특별자치도)|[가-힣]{2,4}도)\s*[가-힣]*\s*소재\s*(?:업체|업자|법인)/g,
  /주된\s*영업소[\s가-힣은는이가을를의에]{0,30}?([가-힣]+(?:특별시|광역시|특별자치시|특별자치도)|[가-힣]{2,4}도)/g,
];

const NATIONAL_HINTS = [
  /지역\s*제한\s*없음/,
  /지역\s*에\s*제한\s*없음/,
  /전국\s*(?:업체|소재|어디서나)/,
  /제한\s*없이\s*참여/,
];

const VALID_GWANGYEOK = new Set([
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시",
  "세종특별자치시", "경기도", "강원특별자치도", "강원도", "충청북도", "충청남도", "전라북도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
]);

export async function extractRgnLimitFromPdf(
  ntceSpecDocUrl: string,
): Promise<PdfRgnLimit> {
  if (!ntceSpecDocUrl) return { type: "unknown", label: "확인 필요" };

  const tmpFile = join(tmpdir(), `naktal-${randomUUID()}.tmp`);
  try {
    // 1. 다운로드
    const res = await fetch(ntceSpecDocUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    if (!res.ok) return { type: "unknown", label: "확인 필요" };
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const cd = res.headers.get("content-disposition") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return { type: "unknown", label: "확인 필요" };
    await writeFile(tmpFile, buf);

    // 2. 파일 종류 판단 + 텍스트 추출
    const isPdf  = ct.includes("pdf")     || /\.pdf(?:["';]|$)/i.test(cd) || buf.slice(0, 4).toString() === "%PDF";
    const isHwp  = ct.includes("hwp")     || /\.hwp(?:["';]|$)/i.test(cd) || buf.slice(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
    const isHwpx = /\.hwpx(?:["';]|$)/i.test(cd) || ct.includes("hwpx");

    let text = "";
    if (isPdf) {
      try {
        const { stdout } = await execFileAsync(
          "pdftotext",
          ["-enc", "UTF-8", "-layout", tmpFile, "-"],
          { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
        );
        text = stdout ?? "";
      } catch { /* pdftotext 실패 */ }
    } else if (isHwp || isHwpx) {
      try {
        const { stdout } = await execFileAsync(
          "hwp5txt",
          [tmpFile],
          { maxBuffer: 10 * 1024 * 1024, timeout: 30_000, encoding: "utf8" },
        );
        text = stdout ?? "";
      } catch { /* hwp5txt 실패 */ }
    }

    if (!text || text.length < 100) return { type: "unknown", label: "확인 필요" };

    // 3. 참가자격 섹션 추출
    const idx = text.search(/참가\s*자격|입찰\s*참가|자격\s*요건|입찰\s*에\s*참가/);
    const hasJagyeok = idx >= 0;
    const target = hasJagyeok ? text.slice(idx, idx + 3000) : text.slice(0, 8000);

    // 4. 시·군 패턴 매칭
    for (const pat of SIGUN_PATTERNS) {
      pat.lastIndex = 0;
      const m = pat.exec(target);
      if (m && m[1]) {
        return { type: "sigun", label: m[1], raw: matchContext(target, m) };
      }
    }

    // 5. 광역 패턴
    for (const pat of GWANGYEOK_PATTERNS) {
      pat.lastIndex = 0;
      const m = pat.exec(target);
      if (m && m[1] && VALID_GWANGYEOK.has(m[1])) {
        return { type: "gwangyeok", label: shortenGwangyeok(m[1]), raw: matchContext(target, m) };
      }
    }

    // 6. 명시적 전국 힌트
    for (const pat of NATIONAL_HINTS) {
      const m = target.match(pat);
      if (m) return { type: "national", label: "전국", raw: m[0] };
    }

    // 7. 자격 섹션 추출 성공 + 시·군·광역 키워드 모두 없음 → 전국 참여 (지역제한 없음)
    //    공고문에 자격 명시는 있으나 '○○시 내', '○○도 소재' 등 지역 키워드 부재 = 전국
    if (hasJagyeok) {
      return { type: "national", label: "전국", raw: "지역제한 키워드 없음" };
    }

    // 8. 텍스트는 추출됐으나 자격 섹션 자체 없음 — 본문 4000자 내 검색
    //    그래도 시·군 키워드 없으면 전국으로 안전하게
    return { type: "national", label: "전국", raw: "자격 섹션 미검출 — 지역제한 단서 없음" };
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
