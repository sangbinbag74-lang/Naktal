/**
 * 용역 카테고리 (공사 외) 의 bsisAmt 채움
 * 박상빈님 5/20 명시 D-2 옵션 c — 용역 BsisAmount op 별도 처리.
 *
 * 박상빈님 메모리 reference_g2b_apis:
 *   "getBidPblancListInfoServcBsisAmount | 용역 기초금액 | bsisAmt | ✅ | v2"
 *   "공사 BsisAmount에만 A값 필드 존재. 용역/물품 BsisAmount에는 없음."
 *
 * 대상: 공사 카테고리 외 + bsisAmt 빈 row (진행중)
 * API: getBidPblancListInfoServcBsisAmount (inqryDiv=2 단건)
 * Update: bsisAmt 만 (aValueYn/aValueTotal X — 용역은 A값 X)
 *
 * 실행: pnpm ts-node src/fill-bsis-servc.ts (또는 index.ts --type fill-bsis-servc)
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";

function loadEnv(): { apiKey: string; dbUrl: string } {
  let text = "";
  const candidates = [
    path.resolve(__dirname, "../../../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  try {
    for (const p of candidates) {
      if (fs.existsSync(p)) { text = fs.readFileSync(p, "utf8"); break; }
    }
  } catch {}
  const get = (k: string) => {
    if (text) {
      for (const line of text.split("\n")) {
        if (line.startsWith(k + "=")) return line.slice(k.length + 1).replace(/^["']|["']\s*$/g, "").trim();
      }
    }
    return process.env[k] ?? "";
  };
  return {
    apiKey: get("KONEPS_API_KEY") || get("G2B_API_KEY") || get("G2B_ANNOUNCE_KEY"),
    dbUrl: get("DATABASE_URL"),
  };
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

function httpsGet(url: string, ms = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, ms);
    const req = https.get(url, (res) => {
      let body = "";
      res.on("data", (d: Buffer) => { body += d.toString(); });
      res.on("end", () => { clearTimeout(timer); resolve(body); });
      res.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

interface ServcBsisAmountItem {
  bssamt?: string;
}

async function fetchServcBsisAmount(bidNtceNo: string, apiKey: string): Promise<{ bsisAmt: bigint } | null> {
  const url = `${BASE}/getBidPblancListInfoServcBsisAmount?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${bidNtceNo}&bidNtceOrd=000&numOfRows=1&pageNo=1&type=json`;
  try {
    const text = await httpsGet(url);
    const json = JSON.parse(text) as { response?: { body?: { items?: ServcBsisAmountItem[] } } };
    const items = json?.response?.body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) return null;
    const bsisAmt = BigInt(parseInt((items[0].bssamt ?? "0").replace(/[^0-9]/g, ""), 10) || 0);
    if (bsisAmt === 0n) return null;
    return { bsisAmt };
  } catch {
    return null;
  }
}

const CNSTWK_CATEGORIES = [
  "시설공사", "건축공사", "토건공사", "토목공사", "조경공사", "산업환경공사",
  "전기공사", "통신공사", "소방시설공사", "지반조성포장공사", "실내건축공사",
  "철근콘크리트공사", "구조물해체비계공사", "상하수도설비공사", "도장습식방수석공사",
  "조경식재공사", "조경시설물공사", "철강재설치공사", "기계설비공사",
];

export async function fillBsisServc(): Promise<void> {
  const { apiKey, dbUrl } = loadEnv();
  if (!dbUrl || !apiKey) { console.error("DATABASE_URL/API_KEY 미설정 — fill-bsis-servc 중단"); return; }
  const pool = new Pool({ connectionString: dbUrl, max: 2, statement_timeout: 0 });
  const now = new Date().toISOString();

  // 공사 외 카테고리 + bsisAmt 빈 row
  const r = await pool.query<{ id: string; konepsId: string }>(
    `SELECT id, "konepsId"
     FROM "Announcement"
     WHERE "category" != ALL($2::text[])
       AND "deadline" >= $1::timestamptz
       AND ("bsisAmt" IS NULL OR "bsisAmt" = 0)`,
    [now, CNSTWK_CATEGORIES],
  );
  const list = r.rows;
  console.log(`진행중 공사 외 + bsisAmt 빈: ${list.length}건`);

  let updated = 0;
  let skipped = 0;
  let processed = 0;
  const tStart = Date.now();

  async function processOne(ann: typeof list[number]): Promise<void> {
    try {
      const bs = await fetchServcBsisAmount(ann.konepsId, apiKey);
      if (!bs) { skipped++; return; }
      await pool.query(
        `UPDATE "Announcement" SET "bsisAmt" = $2::bigint WHERE id = $1`,
        [ann.id, bs.bsisAmt.toString()],
      );
      updated++;
    } catch (e) {
      console.error(`[${ann.konepsId}] 오류:`, (e as Error).message);
    } finally {
      processed++;
      if (processed % 200 === 0) {
        const rate = processed / ((Date.now() - tStart) / 1000);
        const eta = Math.round((list.length - processed) / rate);
        console.log(`  ${processed}/${list.length} (${rate.toFixed(1)} row/s, ETA ${eta}s) | 업데이트 ${updated} | 스킵 ${skipped}`);
      }
    }
  }

  const WORKER = 2;
  const queue = [...list];
  async function worker() {
    while (queue.length > 0) {
      const ann = queue.shift();
      if (!ann) break;
      await processOne(ann);
    }
  }
  await Promise.all(Array.from({ length: WORKER }, () => worker()));

  console.log(`\n완료: ${updated}건 업데이트 / ${skipped}건 스킵 / 총 ${list.length}건 (${((Date.now() - tStart) / 1000 / 60).toFixed(1)}분)`);
  await pool.end();
}

if (require.main === module) {
  fillBsisServc().catch(console.error);
}
