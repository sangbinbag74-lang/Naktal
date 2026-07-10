/** 읽기 전용 — /api/competitors/report 계산 로직 실데이터 재현 검증 (배포 검증용) */
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
function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))] ?? null;
}
(async () => {
  const env = loadEnv();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

  // ── 경쟁사 리포트 재현: 도화엔지니어링 ──
  const name = "도화엔지니어링";
  const t0 = Date.now();
  const { data: rows } = await db.from("BidResult")
    .select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt")
    .ilike("winnerName", `%${name}%`)
    .order("openedAt", { ascending: false, nullsFirst: false })
    .limit(1000);
  console.log(`[경쟁사] '${name}' 낙찰 ${rows?.length}건 (${Date.now() - t0}ms)`);

  const annMap = new Map<string, { title: string; orgName: string; bsisAmt: number }>();
  for (const ids of chunk([...new Set((rows ?? []).map((r) => r.annId as string))], 200)) {
    const { data } = await db.from("Announcement").select("konepsId,title,orgName,bsisAmt").in("konepsId", ids);
    for (const a of data ?? []) annMap.set(a.konepsId as string, { title: a.title, orgName: a.orgName, bsisAmt: Number(a.bsisAmt ?? 0) });
  }
  console.log(`Announcement 조인: ${annMap.size}/${new Set((rows ?? []).map((r) => r.annId)).size} 매칭`);

  const rates: number[] = []; const sajungs: number[] = []; const orgs = new Map<string, number>();
  for (const r of rows ?? []) {
    const rate = Number(r.bidRate ?? 0); const price = Number(r.finalPrice ?? 0);
    if (rate > 0) rates.push(rate);
    const ann = annMap.get(r.annId as string);
    if (ann && ann.bsisAmt > 0 && rate > 0 && price > 0) {
      const s = (price / (rate / 100) / ann.bsisAmt) * 100;
      if (s >= 97 && s <= 103) sajungs.push(s);
    }
    if (ann?.orgName) orgs.set(ann.orgName, (orgs.get(ann.orgName) ?? 0) + 1);
  }
  rates.sort((a, b) => a - b); sajungs.sort((a, b) => a - b);
  console.log(`낙찰률: min ${pct(rates, 0)?.toFixed(3)} / p50 ${pct(rates, 50)?.toFixed(3)} / max ${pct(rates, 100)?.toFixed(3)} (${rates.length}건)`);
  console.log(`사정율(유효 97~103): ${sajungs.length}건 · p25 ${pct(sajungs, 25)?.toFixed(3)} / avg ${(sajungs.reduce((a, b) => a + b, 0) / Math.max(1, sajungs.length)).toFixed(3)} / p75 ${pct(sajungs, 75)?.toFixed(3)}`);
  console.log("주력 발주처 top5:", [...orgs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}(${c})`).join(" · "));
  console.log("\n표본 5건 (최근):");
  for (const r of (rows ?? []).slice(0, 5)) {
    const ann = annMap.get(r.annId as string);
    console.log(`  ${String(r.openedAt).slice(0, 10)} | ${ann?.title?.slice(0, 42) ?? r.annId} | ${ann?.orgName ?? "-"} | ${Number(r.finalPrice).toLocaleString()}원 | ${r.bidRate}% | ${r.numBidders}개사`);
  }

  // ── 발주처 리포트 재현: 조달청 (정확 일치) ──
  const org = "조달청";
  const t1 = Date.now();
  const { data: anns } = await db.from("Announcement")
    .select("konepsId,title,orgName,bsisAmt,deadline")
    .eq("orgName", org)
    .order("deadline", { ascending: false })
    .limit(600);
  console.log(`\n[발주처] '${org}' 정확일치 공고 ${anns?.length}건 (${Date.now() - t1}ms)`);
  const results: { annId: string; bidRate: unknown; winnerName: string | null }[] = [];
  for (const ids of chunk((anns ?? []).map((a) => a.konepsId as string), 200)) {
    const { data } = await db.from("BidResult").select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt").in("annId", ids);
    results.push(...(data ?? []));
  }
  const winners = new Map<string, number>();
  for (const r of results) { const w = (r.winnerName ?? "").trim(); if (w.length >= 2) winners.set(w, (winners.get(w) ?? 0) + 1); }
  console.log(`개찰 완료 ${results.length}건 · 상위 낙찰업체:`, [...winners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}(${c})`).join(" · ") || "없음");
})();
