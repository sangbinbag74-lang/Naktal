/**
 * 모든 사용자 plan='PRO' + Default 변경
 * - User.plan default FREE → PRO
 * - 기존 모든 row plan='PRO'
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    process.stdout.write("START\n");
    // 1. 기존 사용자 모두 PRO 로
    const u = await p.query(`UPDATE "User" SET plan='PRO' WHERE plan != 'PRO'`);
    process.stdout.write(`UPDATED=${u.rowCount}\n`);
    // 2. default 변경
    await p.query(`ALTER TABLE "User" ALTER COLUMN plan SET DEFAULT 'PRO'`);
    process.stdout.write("DEFAULT_SET\n");
    // 검증
    const r = await p.query(`SELECT plan, COUNT(*) FROM "User" GROUP BY plan`);
    for (const row of r.rows) process.stdout.write(`  ${row.plan}: ${row.count}\n`);
    process.stdout.write("DONE\n");
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();
