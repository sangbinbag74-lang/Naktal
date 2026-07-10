/** 읽기 전용 — 발주처 fuzzy 폴백(search_ann_nospace RPC) 재현 검증 */
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
      out[t.slice(0, i).trim()] = t.slice(1 + i).trim().replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out;
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
(async () => {
  const env = loadEnv();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

  for (const name of ["한국토지주택공사", "국가철도공단"]) {
    const t0 = Date.now();
    const { data: fuzzy, error } = await db.rpc("search_ann_nospace", {
      p_keyword: name, p_deadline_gte: null, p_limit: 600, p_offset: 0,
    });
    if (error) { console.log(`${name}: RPC 오류 ${error.message}`); continue; }
    const target = norm(name);
    const rows = (fuzzy ?? []) as { konepsId: string; orgName: string | null }[];
    const ids = rows.filter((f) => f.orgName && norm(f.orgName).includes(target)).map((f) => f.konepsId);
    console.log(`${name}: RPC ${rows.length}건 → orgName 필터 ${ids.length}건 (${Date.now() - t0}ms)`);

    const nowIso = new Date().toISOString();
    const anns: { konepsId: string; orgName: string; deadline: string; bsisAmt: unknown }[] = [];
    for (const c of chunk([...new Set(ids)], 200)) {
      const { data } = await db.from("Announcement").select("konepsId,orgName,deadline,bsisAmt").in("konepsId", c).lt("deadline", nowIso);
      anns.push(...((data ?? []) as typeof anns));
    }
    let matched = 0;
    const winners = new Map<string, number>();
    for (const c of chunk(anns.map((a) => a.konepsId), 200)) {
      const { data } = await db.from("BidResult").select("annId,winnerName").in("annId", c);
      matched += (data ?? []).length;
      for (const r of data ?? []) { const w = String(r.winnerName ?? "").trim(); if (w.length >= 2) winners.set(w, (winners.get(w) ?? 0) + 1); }
    }
    const orgVariants = [...new Set(anns.map((a) => a.orgName))].slice(0, 4);
    console.log(`   마감완료 ${anns.length}건 · 개찰 ${matched}건 · 표기: ${orgVariants.join(" | ")}`);
    console.log(`   top:`, [...winners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n}(${c})`).join(" · ") || "-");
  }
})();
