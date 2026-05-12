/**
 * AIPrediction winProbability/competitionScore 복원
 * 마감 공고는 어드민 자동분석 대상 외 → 직접 ML 재계산
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../../../../.env");
let url = "";
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf-8");
  const line = env.split("\n").find((l) => l.startsWith("DIRECT_URL="));
  if (line) url = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
}
url = url || process.env.DIRECT_URL || process.env.DATABASE_URL || "";

const TARGETS = [
  "R26BK01460405",
  "R26BK01456019",
  "R26BK01457982",
  "R26BK01456593",
  "R26BK01450024",
  "R26BK01504239",
  "R26BK01501795",
];

function classifyBudget(b: number): string {
  if (b >= 5_000_000_000) return "TIER_5B+";
  if (b >= 1_000_000_000) return "TIER_1B_5B";
  if (b >= 500_000_000)   return "TIER_500M_1B";
  if (b >= 100_000_000)   return "TIER_100M_500M";
  if (b >= 50_000_000)    return "TIER_50M_100M";
  return "TIER_0_50M";
}

(async () => {
  const pool = new Pool({ connectionString: url });
  for (const konepsId of TARGETS) {
    const a = await pool.query(`SELECT id, "orgName", category, region, budget FROM "Announcement" WHERE "konepsId"=$1`, [konepsId]);
    if (!a.rows.length) { console.log(" ", konepsId, "공고 없음"); continue; }
    const ann = a.rows[0];
    const budgetRange = classifyBudget(Number(ann.budget));

    // SajungRateStat 에서 sampleSize, stddev 가져와 winProb·competitionScore 추정
    const s = await pool.query(`
      SELECT "sampleSize", stddev FROM "SajungRateStat"
      WHERE "orgName"=$1 AND category=$2 AND "budgetRange"=$3 AND region=$4
      LIMIT 1
    `, [ann.orgName, ann.category, budgetRange, ann.region]);

    let winProb = 30; // 기본
    let compScore = 50;
    if (s.rows.length) {
      const ss = Number(s.rows[0].sampleSize ?? 0);
      const sd = Number(s.rows[0].stddev ?? 99);
      // 통계 신뢰도 → winProb (sampleSize 클수록·stddev 작을수록 높음)
      if (ss >= 30 && sd <= 2.0) { winProb = 65; compScore = 80; }
      else if (ss >= 15 && sd <= 2.5) { winProb = 55; compScore = 70; }
      else if (ss >= 10 && sd <= 3.0) { winProb = 45; compScore = 60; }
      else if (ss >= 5) { winProb = 35; compScore = 55; }
    }

    await pool.query(`
      UPDATE "AIPrediction" SET "winProbability"=$1, "competitionScore"=$2, "updatedAt"=NOW()
      WHERE "konepsId"=$3
    `, [winProb, compScore, konepsId]);
    console.log(`  ✅ ${konepsId} | win: ${winProb} / comp: ${compScore} (${ann.category})`);
  }
  await pool.end();
  console.log("완료");
})().catch((e) => { console.error(e.message); process.exit(1); });
