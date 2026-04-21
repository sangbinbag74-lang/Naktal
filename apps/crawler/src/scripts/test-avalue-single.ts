/**
 * A값 대체 수집 방법 테스트:
 * 1. getBidPblancListBidPrceCalclAInfo inqryDiv=1 (bulk) vs inqryDiv=2 (단건)
 * 2. getOpengResultListInfoCnstwk 응답에 A값 필드 존재 여부
 * 3. 과거 공고 단건 조회로 A값 수신 가능 확인
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
import * as https from "https";

function loadEnv(): { dbUrl: string; apiKey: string } {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const env: Record<string, string> = {};
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      env[k] = v;
    }
  } catch {}
  const dbUrl = env.DATABASE_URL || process.env.DATABASE_URL || "";
  const apiKey = env.KONEPS_API_KEY || env.G2B_API_KEY || process.env.KONEPS_API_KEY || "";
  return { dbUrl, apiKey };
}

function httpsGet(url: string, ms = 15000): Promise<string> {
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

async function main() {
  const { dbUrl, apiKey } = loadEnv();
  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  // 과거 공사 공고 샘플 3개 가져오기 (2015, 2020, 2024)
  const c = await pool.connect();
  let samples: Array<{ konepsId: string; year: number }> = [];
  try {
    for (const yr of [2015, 2020, 2024]) {
      const r = await c.query(`
        SELECT "konepsId", EXTRACT(YEAR FROM deadline)::int AS yr
        FROM "Announcement"
        WHERE category LIKE '%공사%'
          AND deadline >= $1::timestamptz
          AND deadline < $2::timestamptz
          AND "konepsId" IS NOT NULL
        LIMIT 1
      `, [`${yr}-06-01`, `${yr}-07-01`]);
      if (r.rows[0]) samples.push({ konepsId: r.rows[0].konepsId, year: yr });
    }
  } finally {
    c.release();
  }

  console.log(`=== 테스트 대상 공고 ===`);
  for (const s of samples) console.log(`  ${s.year}: ${s.konepsId}`);
  console.log();

  const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
  const SCSBID = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";

  for (const s of samples) {
    console.log(`\n━━━ ${s.year} 공고 ${s.konepsId} ━━━`);

    // 1. CalclA inqryDiv=2 (단건)
    const calA = `${BASE}/getBidPblancListBidPrceCalclAInfo?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${s.konepsId}&bidNtceOrd=000&numOfRows=10&pageNo=1&type=json`;
    try {
      const text = await httpsGet(calA);
      const json = JSON.parse(text);
      const items = json?.response?.body?.items;
      const cnt = json?.response?.body?.totalCount ?? 0;
      console.log(`  1. CalclA(inqryDiv=2) totalCount: ${cnt}`);
      if (cnt > 0 && items) {
        const first = Array.isArray(items) ? items[0] : items.item;
        const item = Array.isArray(first) ? first[0] : first;
        if (item) {
          console.log(`     sftyMngcst: ${item.sftyMngcst ?? "-"}`);
          console.log(`     mrfnHealthInsrprm: ${item.mrfnHealthInsrprm ?? "-"}`);
          console.log(`     npnInsrprm: ${item.npnInsrprm ?? "-"}`);
          console.log(`     rtrfundNon: ${item.rtrfundNon ?? "-"}`);
        }
      } else {
        console.log(`     응답: ${JSON.stringify(json?.response?.header ?? json).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  1. CalclA: 에러 ${(e as Error).message}`);
    }

    // 2. OpengResultListInfoCnstwk inqryDiv=2
    const opng = `${SCSBID}/getOpengResultListInfoCnstwk?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${s.konepsId}&bidNtceOrd=000&numOfRows=10&pageNo=1&type=json`;
    try {
      const text = await httpsGet(opng);
      const json = JSON.parse(text);
      const cnt = json?.response?.body?.totalCount ?? 0;
      console.log(`  2. OpengResultCnstwk(inqryDiv=2) totalCount: ${cnt}`);
      if (cnt > 0) {
        const items = json.response.body.items;
        const first = Array.isArray(items) ? items[0] : items?.item;
        const item = Array.isArray(first) ? first[0] : first;
        if (item) {
          // A값 관련 필드 찾기
          const aKeys = Object.keys(item).filter(k =>
            /mngcst|insrprm|rtrfund|sfty|qlty|aval|avalue/i.test(k)
          );
          console.log(`     A값 관련 필드: ${aKeys.length > 0 ? aKeys.join(", ") : "없음"}`);
          console.log(`     전체 키(일부): ${Object.keys(item).slice(0, 15).join(", ")}`);
        }
      }
    } catch (e) {
      console.log(`  2. OpengResult: 에러 ${(e as Error).message}`);
    }

    // 3. 기초금액 inqryDiv=2
    const bsis = `${BASE}/getBidPblancListInfoCnstwkBsisAmount?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${s.konepsId}&bidNtceOrd=000&numOfRows=5&pageNo=1&type=json`;
    try {
      const text = await httpsGet(bsis);
      const json = JSON.parse(text);
      const cnt = json?.response?.body?.totalCount ?? 0;
      console.log(`  3. BsisAmount(inqryDiv=2) totalCount: ${cnt}`);
      if (cnt > 0) {
        const items = json.response.body.items;
        const first = Array.isArray(items) ? items[0] : items?.item;
        const item = Array.isArray(first) ? first[0] : first;
        if (item) {
          console.log(`     bidPrceCalclAYn: ${item.bidPrceCalclAYn ?? "-"} (A값 대상 여부)`);
          console.log(`     bssamt: ${item.bssamt ?? "-"}`);
        }
      }
    } catch (e) {
      console.log(`  3. BsisAmount: 에러 ${(e as Error).message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  await pool.end();
}

main().catch(console.error);
