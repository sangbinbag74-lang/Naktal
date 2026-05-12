/**
 * 박상빈님 모순 지적 — 3건은 버그 아니라 대형 인프라/물품 특성. 원래값 복원.
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

// 원래값 (직전 diag-bpp-anomaly 출력 그대로)
const ORIG: [string, string][] = [
  ["2f05ffec-672b-425e-8f59-a77ad95bc51e", "94.592"], // 군산항 4,5부두 305억
  ["a2573964-fe8e-41a4-832c-f9e9cc4b0560", "94.592"], // 비응항 330억
  ["7f848f72-774c-4879-863a-439c05b040e8", "90.837"], // 굴삭기 종합낙찰제
];

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  for (const [annId, val] of ORIG) {
    await p.query(`UPDATE "BidPricePrediction" SET "predictedSajungRate" = $1 WHERE "annId" = $2`, [val, annId]);
    console.log(`  ✓ ${annId} → ${val}%`);
  }
  await p.end();
  process.exit(0);
})();
