/**
 * Reparse v8 — v7 의 WHERE 결함 수정
 * v7: WHERE sucsfbidLwltRate=0 만 → ciblAplYn/mtltyAdvcPsblYn 미충족 행 누락
 * v8: WHERE 5필드 중 어느 하나라도 결측 + rawJson 존재 → 전 행 처리
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

function buildMonths(fromYM: string, toYM: string): Array<{ start: string; end: string; label: string }> {
  const [fy, fm] = [parseInt(fromYM.slice(0, 4)), parseInt(fromYM.slice(4, 6))];
  const [ty, tm] = [parseInt(toYM.slice(0, 4)), parseInt(toYM.slice(4, 6))];
  const out: Array<{ start: string; end: string; label: string }> = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${next.y}-${String(next.m).padStart(2, "0")}-01`;
    out.push({ start, end, label: `${y}-${String(m).padStart(2, "0")}` });
    y = next.y; m = next.m;
  }
  return out;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }

  const args = process.argv.slice(2);
  const fromYM = args.find(a => a.startsWith("--from="))?.slice(7) ?? "200201";
  const toYM = args.find(a => a.startsWith("--to="))?.slice(5) ?? "202605";

  const pool = new Pool({ connectionString: url, max: 2, statement_timeout: 0 });
  const months = buildMonths(fromYM, toYM);

  console.log(`=== reparse-rawjson v8 (월별 순차, WHERE 수정) ===`);
  console.log(`범위: ${fromYM} ~ ${toYM} (${months.length}개월)\n`);

  let totalUpdated = 0;
  const t0 = Date.now();

  for (let i = 0; i < months.length; i++) {
    const { start, end, label } = months[i];
    const c = await pool.connect();
    const mT0 = Date.now();
    try {
      const res = await c.query(
        `
        UPDATE "Announcement" SET
          "sucsfbidLwltRate"    = CASE WHEN "sucsfbidLwltRate" = 0
                                    THEN COALESCE(NULLIF("rawJson"->>'sucsfbidLwltRate',''),'0')::float8
                                    ELSE "sucsfbidLwltRate" END,
          "bidNtceDtlUrl"       = CASE WHEN "bidNtceDtlUrl" = ''
                                    THEN COALESCE("rawJson"->>'bidNtceDtlUrl','')
                                    ELSE "bidNtceDtlUrl" END,
          "ntceInsttOfclTelNo"  = CASE WHEN "ntceInsttOfclTelNo" = ''
                                    THEN COALESCE("rawJson"->>'ntceInsttOfclTelNo','')
                                    ELSE "ntceInsttOfclTelNo" END,
          "ciblAplYn"           = CASE WHEN "ciblAplYn" = ''
                                    THEN COALESCE("rawJson"->>'ciblAplYn','')
                                    ELSE "ciblAplYn" END,
          "mtltyAdvcPsblYn"     = CASE WHEN "mtltyAdvcPsblYn" = ''
                                    THEN COALESCE("rawJson"->>'mtltyAdvcPsblYn','')
                                    ELSE "mtltyAdvcPsblYn" END
        WHERE "deadline" >= $1::timestamptz
          AND "deadline" < $2::timestamptz
          AND "rawJson" IS NOT NULL
          AND (
            "sucsfbidLwltRate" = 0
            OR "bidNtceDtlUrl" = ''
            OR "ntceInsttOfclTelNo" = ''
            OR "ciblAplYn" = ''
            OR "mtltyAdvcPsblYn" = ''
          )
        `,
        [start, end],
      );
      const cnt = res.rowCount ?? 0;
      totalUpdated += cnt;
      const mElapsed = ((Date.now() - mT0) / 1000).toFixed(0);
      const totalMin = ((Date.now() - t0) / 1000 / 60).toFixed(1);
      const progress = ((i + 1) / months.length * 100).toFixed(1);
      console.log(`[${i + 1}/${months.length}] ${label} — ${cnt.toLocaleString()}건 (${mElapsed}초) | 누적 ${totalUpdated.toLocaleString()}, 전체 ${totalMin}분 (${progress}%)`);
    } catch (e) {
      console.error(`[${label}] 에러: ${(e as Error).message}`);
      await new Promise(r => setTimeout(r, 3000));
    } finally {
      c.release();
    }
  }

  const totalMin = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\n=== 완료: ${totalUpdated.toLocaleString()}건, ${totalMin}분 ===`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
