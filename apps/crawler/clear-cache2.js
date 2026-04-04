const { Pool } = require("pg");
const fs = require("fs"), path = require("path");
function loadEnv() { const envPath = path.resolve(__dirname, "../../.env"); if (!fs.existsSync(envPath)) return {}; const result = {}; for (let line of fs.readFileSync(envPath, "utf8").split("\n")) { line = line.trim(); if (!line || line.startsWith("#")) continue; const eq = line.indexOf("="); if (eq < 0) continue; let k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); result[k] = v.trim(); } return result; }
const ENV = loadEnv();
const pool = new Pool({ connectionString: ENV.DIRECT_URL, max: 1 });
async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(`DELETE FROM "BidPricePrediction"`);
    console.log(`BidPricePrediction ${r.rowCount}건 삭제 완료`);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error(e.message));
