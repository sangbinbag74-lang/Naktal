// BidPricePrediction 캐시 전부 삭제 (SajungRateStat 재수집 후 재분석 강제)
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs"), path = require("path");
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env"); if (!fs.existsSync(envPath)) return {};
  const result = {}; for (let line of fs.readFileSync(envPath, "utf8").split("\n")) { line = line.trim(); if (!line || line.startsWith("#")) continue; const eq = line.indexOf("="); if (eq < 0) continue; let k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); result[k] = v.trim(); } return result;
}
const ENV = loadEnv();
const supabase = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function main() {
  const { count, error } = await supabase.from("BidPricePrediction").delete({ count: "exact" }).gte("id", "00000000-0000-0000-0000-000000000000");
  if (error) { console.error("삭제 오류:", error.message); return; }
  console.log(`BidPricePrediction 캐시 ${count}건 삭제 완료`);
}
main().catch(e => console.error(e.message));
