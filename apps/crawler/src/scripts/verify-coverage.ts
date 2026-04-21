/**
 * 데이터 전수 커버리지 검증
 *
 * 각 API에 대해 월별 totalCount와 DB 저장 건수 비교.
 * 차이 있는 월 → 재실행 필요 리스트.
 *
 * 주의: API 호출 많음 (17 API × 292월 = 최대 5000회) → 일부 월만 샘플링
 *
 * 실행: pnpm ts-node src/scripts/verify-coverage.ts [--from YYYYMM] [--to YYYYMM]
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
  return {
    dbUrl: env.DATABASE_URL || process.env.DATABASE_URL || "",
    apiKey: env.KONEPS_API_KEY || env.G2B_API_KEY || process.env.KONEPS_API_KEY || "",
  };
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

async function apiTotalCount(base: string, op: string, apiKey: string, bgn: string, end: string): Promise<number> {
  const url = new URL(`${base}/${op}`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", bgn);
  url.searchParams.set("inqryEndDt", end);
  url.searchParams.set("numOfRows", "1");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  try {
    const text = await httpsGet(url.toString());
    const json: any = JSON.parse(text);
    return json?.response?.body?.totalCount ?? 0;
  } catch {
    return -1; // 에러
  }
}

async function main() {
  const { dbUrl, apiKey } = loadEnv();
  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  const args = process.argv.slice(2);
  const fromArg = args.find(a => a.startsWith("--from="))?.slice(7) ?? "202001";
  const toArg = args.find(a => a.startsWith("--to="))?.slice(5) ?? "202604";

  const [fY, fM] = [parseInt(fromArg.slice(0, 4)), parseInt(fromArg.slice(4, 6))];
  const [tY, tM] = [parseInt(toArg.slice(0, 4)), parseInt(toArg.slice(4, 6))];

  const months: [number, number][] = [];
  let y = fY, m = fM;
  while (y < tY || (y === tY && m <= tM)) {
    months.push([y, m]);
    m++; if (m > 12) { m = 1; y++; }
  }

  const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

  // 비교 대상: ChgHstry 3종 (가장 누락 많은 API)
  const APIS = [
    "getBidPblancListInfoChgHstryCnstwk",
    "getBidPblancListInfoChgHstryServc",
    "getBidPblancListInfoChgHstryThng",
  ];

  console.log(`=== 커버리지 검증: ${fromArg} ~ ${toArg} (${months.length}개월) ===\n`);
  console.log(`대상 API: ${APIS.join(", ")}\n`);

  const missing: Array<{ month: string; api: string; apiCount: number; dbCount: number; diff: number }> = [];

  const c = await pool.connect();
  try {
    for (const [yy, mm] of months) {
      const mmStr = String(mm).padStart(2, "0");
      const bgn = `${yy}${mmStr}010000`;
      const last = new Date(yy, mm, 0).getDate();
      const end = `${yy}${mmStr}${String(last).padStart(2, "0")}2359`;

      for (const op of APIS) {
        const apiCount = await apiTotalCount(BASE, op, apiKey, bgn, end);
        if (apiCount < 0) continue;
        if (apiCount === 0) continue;

        // DB 저장 건수 (해당 API 월 범위)
        const dbResult = await c.query(`
          SELECT COUNT(*)::bigint AS n
          FROM "AnnouncementChgHst" h
          JOIN "Announcement" a ON a."konepsId" = h."annId"
          WHERE a.deadline >= $1::timestamptz
            AND a.deadline < ($1::timestamptz + interval '1 month')
        `, [`${yy}-${mmStr}-01`]);
        const dbCount = Number(dbResult.rows[0].n);

        const diff = apiCount - dbCount;
        if (diff > 1000) {
          missing.push({ month: `${yy}-${mmStr}`, api: op.replace("getBidPblancListInfoChgHstry", ""), apiCount, dbCount, diff });
          console.log(`  ${yy}-${mmStr} [${op.slice(-10)}]: API ${apiCount} / DB ${dbCount} → 누락 ${diff}`);
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`\n=== 누락 발견: ${missing.length}건 ===`);
    if (missing.length > 0) {
      console.log(`\n재실행 권장 월:`);
      const uniqueMonths = [...new Set(missing.map(m => m.month))].sort();
      for (const m of uniqueMonths) {
        console.log(`  ${m}`);
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);
