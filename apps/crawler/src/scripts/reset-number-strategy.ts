/**
 * BidRequest.numberStrategy NULL 화 — 다음 결과 페이지 진입 시 새 2-번호 조합으로 재계산
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const r = await p.query(`UPDATE "BidRequest" SET "numberStrategy"=NULL WHERE "numberStrategy" IS NOT NULL`);
    process.stdout.write(`RESET=${r.rowCount}\n`);
    process.stdout.write("DONE\n");
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();
