import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // unknown 으로 잡힌 row 만 재시도 (sigun/gwangyeok/national 은 보존)
    const r = await p.query(`
      UPDATE "Announcement"
      SET "pdfParsedAt" = NULL, "pdfRgnLimit" = NULL
      WHERE "pdfParsedAt" IS NOT NULL
        AND ("pdfRgnLimit" IS NULL OR "pdfRgnLimit"->>'type' = 'unknown')
    `);
    process.stdout.write(`RESET=${r.rowCount}\n`);
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();
