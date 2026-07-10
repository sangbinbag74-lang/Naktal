/** 읽기 전용 — 발주처 리포트 수정 로직(창+무정렬) 재현 검증 */
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
(async () => {
  const env = loadEnv();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  const now = new Date();

  // ilike 폴백 경로 (eq 0건 → 부분일치)
  {
    const t0 = Date.now();
    const from = new Date(now.getTime() - 6 * 30 * 86400000).toISOString();
    const { data, error } = await db.from("Announcement")
      .select("konepsId,title,orgName,deadline")
      .ilike("orgName", "%한국토지주택공사%")
      .gte("deadline", from).lt("deadline", now.toISOString())
      .limit(600);
    console.log(`[ilike 폴백] 한국토지주택공사 6개월: ${error ? "오류 " + error.message : (data?.length ?? 0) + "건"} (${Date.now() - t0}ms)`);
    const f = data?.[0];
    if (f) console.log(`   예: ${f.orgName} | ${String(f.deadline).slice(0, 10)}`);
  }

  for (const org of ["조달청", "한국토지주택공사", "경상북도 포항시"]) {
    let anns: { konepsId: string; title: string; deadline: string; bsisAmt: unknown }[] = [];
    let usedMonths = 0;
    const t0 = Date.now();
    for (const months of [6, 24, 96]) {
      const from = new Date(now.getTime() - months * 30 * 86400000).toISOString();
      const { data, error } = await db.from("Announcement")
        .select("konepsId,title,deadline,bsisAmt")
        .eq("orgName", org)
        .gte("deadline", from).lt("deadline", now.toISOString())
        .limit(600);
      if (error) { console.log(`${org} ${months}개월 오류:`, error.message); continue; }
      anns = (data ?? []) as typeof anns;
      usedMonths = months;
      if (anns.length >= 50) break;
    }
    anns.sort((a, b) => String(b.deadline).localeCompare(String(a.deadline)));
    let matched = 0;
    const winners = new Map<string, number>();
    for (const ids of chunk(anns.map((a) => a.konepsId), 200)) {
      const { data } = await db.from("BidResult").select("annId,winnerName").in("annId", ids);
      matched += (data ?? []).length;
      for (const r of data ?? []) { const w = String(r.winnerName ?? "").trim(); if (w.length >= 2) winners.set(w, (winners.get(w) ?? 0) + 1); }
    }
    const top = [...winners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n}(${c})`).join(" · ");
    console.log(`${org}: ${anns.length}건 (창 ${usedMonths}개월, ${Date.now() - t0}ms) · 개찰 ${matched}건 · top: ${top || "-"}`);
    const first = anns[0];
    if (first) console.log(`   최신 공고: ${String(first.deadline).slice(0, 10)} | ${first.title?.slice(0, 40)}`);
  }
})();
