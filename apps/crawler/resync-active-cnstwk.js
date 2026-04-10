/**
 * 나라장터 Cnstwk(시설공사) 공고를 G2B API로 재수집해서 올바른 category로 DB upsert
 * - 최근 60일치 조회 (활성 공고 대부분 커버)
 * - mainCnsttyNm → MAIN_CNSTWK_MAP으로 category 결정
 */
const { Pool } = require("pg");
const fs = require("fs"), path = require("path");

// ─── .env 로딩 ───────────────────────────────────────────────────────────────
function loadEnv() {
  const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf-8");
  const result = {};
  for (const l of env.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (v.startsWith('"') || v.startsWith("'")) {
      const q = v[0];
      const end = v.indexOf(q, 1);
      v = end > 0 ? v.slice(1, end) : v.slice(1);
    } else {
      const ci = v.indexOf(" #");
      if (ci > 0) v = v.slice(0, ci);
      v = v.trim();
    }
    result[k] = v;
  }
  return result;
}
const ENV = loadEnv();
const DB_URL = ENV.DATABASE_URL;
const API_KEY = ENV.G2B_ANNOUNCE_KEY || ENV.G2B_API_KEY;
if (!DB_URL || DB_URL.includes("[YOUR-PASSWORD]")) { console.error("DATABASE_URL 누락"); process.exit(1); }
if (!API_KEY) { console.error("G2B_ANNOUNCE_KEY 누락"); process.exit(1); }

// ─── mainCnsttyNm → category ────────────────────────────────────────────────
const MAP = {
  "토목공사업": "토목공사", "산림사업법인(산림토목)": "토목공사",
  "수중ㆍ준설공사업": "토목공사", "철도ㆍ궤도공사업": "토목공사",
  "지하수개발·이용시공업": "토목공사", "(제주지역한정)지하수개발,이용시공업": "토목공사",
  "전문광해방지사업(토양개량·복원및정화사업)": "토목공사", "토양정화업": "토목공사",
  "항만운송관련사업(선박수리업)": "토목공사",
  "건축공사업": "건축공사",
  "조경공사업": "조경공사", "조경식재ㆍ시설물공사업": "조경공사",
  "산림사업법인(숲가꾸기 및 병해충방제)": "조경공사", "산림사업법인(숲길 조성,관리)": "조경공사",
  "산림사업법인(자연휴양림등 조성)": "조경공사", "산림사업법인(도시숲등 조성, 관리)": "조경공사",
  "국유림영림단": "조경공사", "산림조합(지역조합)": "조경공사",
  "나무병원(1종)": "조경공사", "전문국가유산수리업(조경업)": "조경공사",
  "전기공사업": "전기공사",
  "정보통신공사업": "통신공사",
  "전문소방시설공사업": "소방시설공사", "일반소방시설공사업(기계)": "소방시설공사",
  "일반소방시설공사업(전기)": "소방시설공사", "전문소방공사감리업": "소방시설공사",
  "기계설비ㆍ가스공사업": "기계설비공사", "가스난방공사업": "기계설비공사",
  "산업·환경설비공사업": "기계설비공사", "환경전문공사업(대기분야)": "기계설비공사",
  "환경전문공사업(수질분야)": "기계설비공사",
  "전문광해방지사업(먼지날림,광연및소음·진동방지사업)": "기계설비공사",
  "전문광해방지사업(오염수질의개선사업)": "기계설비공사",
  "가축분뇨처리시설설계ㆍ시공업": "기계설비공사",
  "지반조성ㆍ포장공사업": "지반조성포장공사",
  "실내건축공사업": "실내건축공사", "금속창호ㆍ지붕건축물조립공사업": "실내건축공사",
  "철근ㆍ콘크리트공사업": "철근콘크리트공사",
  "구조물해체ㆍ비계공사업": "구조물해체비계공사", "석면해체.제거업": "구조물해체비계공사",
  "상ㆍ하수도설비공사업": "상하수도설비공사",
  "철강구조물공사업": "철강재설치공사",
  "승강기ㆍ삭도공사업": "삭도승강기기계설비공사",
  "도장ㆍ습식ㆍ방수ㆍ석공사업": "도장습식방수석공사",
  "종합국가유산수리업(보수단청업)": "문화재수리공사",
  "전문국가유산수리업(보존과학업)": "문화재수리공사",
  "전문국가유산수리업(식물보호업)": "문화재수리공사",
};

// ─── G2B API ─────────────────────────────────────────────────────────────────
const G2B_BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

function toYMD(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // "YYYYMMDDHHMM" format
  const m1 = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}T${m1[4]}:${m1[5]}:00+09:00`;
  // "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS" format
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}:00+09:00`;
  return null;
}

function extractRegion(addr) {
  if (!addr) return "";
  const m = addr.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);
  return m ? m[1] : "";
}

async function fetchPage(fromDate, toDate, page) {
  const url = new URL(`${G2B_BASE}/getBidPblancListInfoCnstwk`);
  url.searchParams.set("serviceKey", API_KEY);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", String(page));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", `${fromDate}0000`);
  url.searchParams.set("inqryEndDt", `${toDate}2359`);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`G2B API ${res.status}`);
  const data = await res.json();
  if (!data.response) return { items: [], totalCount: 0 };
  if (data.response.header.resultCode !== "00") {
    console.warn("G2B 응답 오류:", data.response.header.resultMsg);
    return { items: [], totalCount: 0 };
  }
  const body = data.response.body;
  let items = [];
  if (body.items) {
    if (Array.isArray(body.items)) {
      items = body.items;
    } else if (body.items.item) {
      items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
    }
  }
  return { items, totalCount: body.totalCount ?? 0 };
}

// ─── DB ──────────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DB_URL, max: 2 });

async function upsertBatch(client, items) {
  if (items.length === 0) return 0;
  const values = [];
  const params = [];
  let idx = 1;
  const seen = new Set();

  for (const item of items) {
    const konepsId = item.bidNtceNo?.trim();
    const title    = item.bidNtceNm?.trim();
    const orgName  = (item.ntceInsttNm || item.demInsttNm)?.trim();
    const deadline = parseDate(item.bidClseDt);
    const budgetNum = parseInt((item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g,""), 10) || 0;
    if (!konepsId || !title || !orgName || !deadline) continue;
    if (seen.has(konepsId)) continue;
    seen.add(konepsId);

    const rawJson = {};
    for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");
    const category = MAP[item.mainCnsttyNm ?? ""] || item.ntceKindNm || "시설공사";
    const region   = extractRegion(item.ntceInsttAddr || "");

    values.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
    params.push(
      crypto.randomUUID(), konepsId, title, orgName,
      budgetNum, deadline, category, region, JSON.stringify(rawJson)
    );
  }

  if (values.length === 0) return 0;

  const sql = `
    INSERT INTO "Announcement" (id,"konepsId",title,"orgName",budget,deadline,category,region,"rawJson")
    VALUES ${values.join(",")}
    ON CONFLICT ("konepsId") DO UPDATE SET
      category = EXCLUDED.category,
      title = EXCLUDED.title,
      "orgName" = EXCLUDED."orgName",
      budget = EXCLUDED.budget,
      deadline = EXCLUDED.deadline,
      region = EXCLUDED.region,
      "rawJson" = EXCLUDED."rawJson"
  `;
  await client.query(sql, params);
  return values.length;
}

// 7일치 배치 날짜 배열 생성
function buildWeekBatches(daysBack) {
  const now = new Date();
  const batches = [];
  for (let d = 0; d < daysBack; d += 7) {
    const to   = new Date(now - d * 86400000);
    const from = new Date(now - Math.min(d + 6, daysBack - 1) * 86400000);
    batches.push({ from: toYMD(from), to: toYMD(to) });
  }
  return batches;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
(async () => {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '0'");

    const batches = buildWeekBatches(60); // 60일을 7일 단위로
    let total = 0;

    for (const { from, to } of batches) {
      console.log(`G2B Cnstwk 조회: ${from} ~ ${to}`);
      let page = 1, batchTotal = 0, totalCount = 0;
      do {
        const { items, totalCount: tc } = await fetchPage(from, to, page);
        if (page === 1) { totalCount = tc; if (tc > 0) console.log(`  총 ${tc}건`); }
        if (items.length === 0) break;

        const saved = await upsertBatch(client, items);
        batchTotal += saved;
        total += saved;

        if (page * 100 >= totalCount) break;
        page++;
        await new Promise(r => setTimeout(r, 150));
      } while (true);
      if (batchTotal > 0) console.log(`  저장: ${batchTotal}건 (누적 ${total}건)`);
      await new Promise(r => setTimeout(r, 300));
    }

    console.log("\n재수집 완료 (총):", total, "건 upsert");

    // 결과 확인
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt FROM "Announcement"
      WHERE deadline > NOW() AND category IN ('토목공사','건축공사','조경공사','전기공사','시설공사')
      GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log("\n진행중 공고 카테고리 분포:");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
