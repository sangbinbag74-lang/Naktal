// 결측 BidResult.openedAt 채우기 — SCSBID rlOpengDt 재수집
// 사용 방법: pnpm exec ts-node src/scripts/recollect-bidresult-rlopeng.ts
import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";

function loadEnv() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  const map: Record<string,string> = {};
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    // 따옴표로 감싸진 경우 따옴표 안의 내용만 추출
    const m = v.match(/^"([^"]*)"|^'([^']*)'/);
    if (m) v = m[1] ?? m[2];
    else { const hash = v.indexOf("#"); if (hash >= 0) v = v.slice(0, hash).trim(); }
    map[t.slice(0, i).trim()] = v;
  }
  return map;
}
const ENV = loadEnv();
const KEY = ENV.KONEPS_API_KEY || ENV.G2B_API_KEY;
if (!KEY) throw new Error("G2B_API_KEY missing");

const SCSBID_BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const OPS = ["getScsbidListSttusThng","getScsbidListSttusCnstwk","getScsbidListSttusServc","getScsbidListSttusFrgcpt"];

// 결측 분포 (annId prefix별, 큰 순서)
const YEARS = [2021,2014,2015,2020,2016,2024,2022,2002,2005,2004,2003,2010,2008,2011,2009,2012,2007,2013,2023,2006,2019,2025,2017,2018,2026,2001];

interface Item { bidNtceNo?: string; rlOpengDt?: string; opengDt?: string; }

async function fetchPage(op: string, ymd1: string, ymd2: string, page: number): Promise<{items: Item[]; total: number}> {
  const url = new URL(`${SCSBID_BASE}/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("numOfRows", "999");
  url.searchParams.set("pageNo", String(page));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", ymd1);
  url.searchParams.set("inqryEndDt", ymd2);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { await new Promise(r=>setTimeout(r,2000)); continue; }
      const d: any = await res.json();
      if (!d?.response) {
        const altErr = d?.["nkoneps.com.response.ResponseError"];
        if (altErr?.header?.resultCode === "07") return { items: [], total: 0 };
        await new Promise(r=>setTimeout(r,2000)); continue;
      }
      const h = d.response.header, b = d.response.body;
      if (h.resultCode === "07") return { items: [], total: 0 };
      if (h.resultCode !== "00") { await new Promise(r=>setTimeout(r,2000)); continue; }
      let items = b.items;
      if (!items || items === "") items = [];
      else if (Array.isArray(items)) {/*ok*/}
      else if (items.item) items = Array.isArray(items.item) ? items.item : [items.item];
      else items = [];
      return { items: items as Item[], total: b.totalCount ?? 0 };
    } catch { await new Promise(r=>setTimeout(r,2000)); }
  }
  return { items: [], total: 0 };
}

function parseRl(raw: string | undefined): string | null {
  if (!raw || raw.length < 8) return null;
  if (raw.includes("-")) {
    const s = raw.replace(" ", "T");
    const dt = new Date(s + (s.length <= 16 ? ":00+09:00" : "+09:00"));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  if (/^\d{12,14}$/.test(raw)) {
    const y = raw.slice(0,4), mo = raw.slice(4,6), d = raw.slice(6,8);
    const hh = raw.slice(8,10) || "00", mm = raw.slice(10,12) || "00";
    const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:00+09:00`);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

function fmt(ms: number): string {
  const s = Math.round(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${h}h ${m}m ${sec}s`;
}

(async () => {
  const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
  const c = await pool.connect();

  const r0 = await c.query(`SELECT COUNT(*)::int AS n FROM "BidResult" WHERE "openedAt" IS NULL`);
  const initialMissing = r0.rows[0].n;
  console.log(`[start] BidResult.openedAt 결측: ${initialMissing.toLocaleString()}`);
  console.log(`[start] 처리 연도: ${YEARS.length}, 월: ${YEARS.length*12}, ops: 4 → 예상 호출: ${YEARS.length*12*4} 월·op`);

  const t0 = Date.now();
  let totalCalls = 0, totalUpdates = 0, totalItems = 0;
  const totalUnits = YEARS.length * 12 * OPS.length;
  let unitsDone = 0;

  for (const yr of YEARS) {
    for (let m = 1; m <= 12; m++) {
      const ymd = `${yr}${String(m).padStart(2,"0")}`;
      const ymd1 = `${ymd}010000`;
      const lastDay = new Date(yr, m, 0).getDate();
      const ymd2 = `${ymd}${String(lastDay).padStart(2,"0")}2359`;

      for (const op of OPS) {
        let page = 1, calls = 0, items = 0, updates = 0;
        while (page <= 50) {
          calls++;
          totalCalls++;
          const { items: arr, total } = await fetchPage(op, ymd1, ymd2, page);
          if (arr.length === 0) break;
          items += arr.length;
          // batch UPDATE: 응답 안의 annId+rlOpengDt 매핑
          const pairs: { annId: string; iso: string }[] = [];
          for (const it of arr) {
            const annId = (it.bidNtceNo || "").trim();
            if (!annId) continue;
            const iso = parseRl(it.rlOpengDt) || parseRl(it.opengDt);
            if (!iso) continue;
            pairs.push({ annId, iso });
          }
          if (pairs.length > 0) {
            const annArr = pairs.map(p=>p.annId);
            const isoArr = pairs.map(p=>p.iso);
            const u = await c.query(`
              UPDATE "BidResult" br
              SET "openedAt" = src.iso::timestamptz
              FROM (SELECT unnest($1::text[]) AS annid, unnest($2::text[]) AS iso) src
              WHERE br."annId" = src.annid AND br."openedAt" IS NULL
            `, [annArr, isoArr]);
            updates += u.rowCount || 0;
          }
          if (page * 999 >= total) break;
          page++;
          await new Promise(r=>setTimeout(r,80));
        }
        unitsDone++;
        totalItems += items;
        totalUpdates += updates;
        const elapsed = Date.now() - t0;
        const eta = unitsDone > 0 ? Math.round(elapsed * (totalUnits - unitsDone) / unitsDone) : 0;
        console.log(`[${yr}-${String(m).padStart(2,"0")}/${op.replace("getScsbidListSttus","")}] pages=${calls} items=${items} upd=${updates} | 누적 update=${totalUpdates.toLocaleString()} calls=${totalCalls} | ${unitsDone}/${totalUnits} (${(unitsDone*100/totalUnits).toFixed(1)}%) elapsed=${fmt(elapsed)} ETA=${fmt(eta)}`);
      }
    }
  }

  const r1 = await c.query(`SELECT COUNT(*)::int AS n FROM "BidResult" WHERE "openedAt" IS NULL`);
  console.log(`\n=== 완료 ===`);
  console.log(`초기 결측: ${initialMissing.toLocaleString()}`);
  console.log(`최종 결측: ${r1.rows[0].n.toLocaleString()}`);
  console.log(`UPDATE 누적: ${totalUpdates.toLocaleString()}`);
  console.log(`API 호출: ${totalCalls.toLocaleString()}`);
  console.log(`총 소요: ${fmt(Date.now()-t0)}`);
  c.release(); await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
