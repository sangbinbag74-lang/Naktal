import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
let url = "";
for (const l of env.split("\n")) {
  if (l.startsWith("DIRECT_URL=")) {
    url = l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
}
const pool = new Pool({ connectionString: url, max: 1 });
(async () => {
  const r = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'BidOutcome' ORDER BY ordinal_position
  `);
  console.log("=== BidOutcome 컬럼 ===");
  for (const c of r.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
