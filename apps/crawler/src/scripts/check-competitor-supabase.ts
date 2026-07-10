/** 읽기 전용 — Supabase REST(service_role) 경유 winnerName ilike 실측 (statement timeout 확인) */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs"; import * as path from "path";
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of ["../../../../.env", "../../../../apps/web/.env", "../../../../apps/web/.env.local"]) {
    const f = path.resolve(__dirname, p);
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, "utf-8").split("\n")) {
      const t = l.trim(); if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("="); if (i === -1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
(async () => {
  const env = loadEnv();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

  for (const q of ["디비손해보험", "도화엔지니어링"]) {
    const t0 = Date.now();
    const { data, error } = await db
      .from("BidResult")
      .select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt")
      .ilike("winnerName", `%${q}%`)
      .order("openedAt", { ascending: false, nullsFirst: false })
      .limit(1000);
    console.log(`'${q}': ${error ? "오류 " + error.message : (data?.length ?? 0) + "건"}, ${Date.now() - t0}ms`);
  }
})();
