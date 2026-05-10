import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    console.log("=== 우리 DB 모든 필드 (가로수 결주지 보식) ===");
    const a = await p.query(`SELECT id, "konepsId", "rawJson", "subCategories", category, region, "orgName" FROM "Announcement" WHERE title ILIKE '%가로수 결주지 보식%' LIMIT 1`);
    if (!a.rows[0]) {
      console.log("우리 DB 에 없음");
      return;
    }
    const r = a.rows[0];
    console.log("  konepsId:", r.konepsId);
    console.log("  category:", r.category);
    console.log("  region:", r.region);
    console.log("  orgName:", r.orgName);
    console.log("  subCategories:", r.subCategories);
    console.log("\n=== rawJson 모든 필드 (자격/제한 관련) ===");
    const rj = r.rawJson as Record<string, string>;
    const keys = Object.keys(rj).sort();
    for (const k of keys) {
      const v = rj[k];
      if (typeof v !== "string") continue;
      const lk = k.toLowerCase();
      if (lk.includes("rgn") || lk.includes("lmt") || lk.includes("prtcpt") ||
          lk.includes("locplc") || lk.includes("jntcontrct") || lk.includes("incntv") ||
          lk.includes("instt") || lk.includes("indstryty") || lk.includes("locplc") ||
          lk.includes("evl") || lk.includes("qlfct")) {
        console.log("  ", k.padEnd(35), "=", JSON.stringify(v));
      }
    }

    console.log("\n=== AnnouncementChgHst (변경공고 이력) — 자격 변경 추적 ===");
    const chg = await p.query(`SELECT "chgItemNm", "rawJson" FROM "AnnouncementChgHst" WHERE "annId"=$1 ORDER BY "createdAt" LIMIT 5`, [r.id]);
    for (const row of chg.rows) console.log(" ", row.chgItemNm);

    console.log("\n=== ntceSpecDocUrl (공고문 PDF) ===");
    for (let i = 1; i <= 3; i++) {
      const u = rj[`ntceSpecDocUrl${i}`];
      const f = rj[`ntceSpecFileNm${i}`];
      if (u) console.log(`  ${i}.`, f, "->", u);
    }
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });
