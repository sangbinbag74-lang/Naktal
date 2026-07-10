/** 읽기 전용 — cron 과 동일한 Supabase 경로 재현 (dbFilled 0 원인 실측) */
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
  const from = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // cron 과 동일: 페이지 조회
  const anns: { id: string; konepsId: string; deadline: string }[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await db
      .from("Announcement")
      .select("id,konepsId,deadline")
      .lt("deadline", now.toISOString())
      .gte("deadline", from.toISOString())
      .order("deadline", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) { console.log(`페이지 ${page} 오류:`, error.message); break; }
    anns.push(...((data ?? []) as typeof anns));
    if (!data || data.length < 1000) break;
  }
  console.log(`창 조회: ${anns.length}건, konepsId null: ${anns.filter((a) => !a.konepsId).length}건`);

  // 첫 chunk 만 재현 (200건)
  const ids = anns.map((a) => a.konepsId).slice(0, 200);
  const [br, od] = await Promise.all([
    db.from("BidResult").select("annId,numBidders").in("annId", ids),
    db.from("BidOpeningDetail").select("annId,bidCount").in("annId", ids),
  ]);
  console.log(`BidResult chunk1: error=${br.error?.message ?? "없음"}, rows=${br.data?.length ?? 0}`);
  console.log(`BidOpeningDetail chunk1: error=${od.error?.message ?? "없음"}, rows=${od.data?.length ?? 0}`);

  // 전체 chunk 로 countMap 재현
  const countMap = new Map<string, number>();
  let brErr = 0, odErr = 0, brRows = 0, odRows = 0;
  for (const c2 of chunk(anns.map((a) => a.konepsId), 200)) {
    const [b, o] = await Promise.all([
      db.from("BidResult").select("annId,numBidders").in("annId", c2),
      db.from("BidOpeningDetail").select("annId,bidCount").in("annId", c2),
    ]);
    if (b.error) brErr++;
    if (o.error) odErr++;
    brRows += b.data?.length ?? 0;
    odRows += o.data?.length ?? 0;
    for (const r of (o.data ?? []) as { annId: string; bidCount: number | null }[]) {
      if (r.bidCount && r.bidCount > 0) countMap.set(r.annId, r.bidCount);
    }
    for (const r of (b.data ?? []) as { annId: string; numBidders: number | null }[]) {
      if (r.numBidders && r.numBidders > 0) countMap.set(r.annId, r.numBidders);
    }
  }
  console.log(`전체: BidResult rows=${brRows} (err ${brErr}), OpeningDetail rows=${odRows} (err ${odErr})`);
  console.log(`countMap 크기: ${countMap.size} → 예상 dbFilled=${anns.filter((a) => countMap.has(a.konepsId)).length}`);

  // bidCount / numBidders 값 분포 (0 이하로 걸러지는지)
  const zeroB = ((await db.from("BidOpeningDetail").select("bidCount").in("annId", ids)).data ?? []) as { bidCount: number | null }[];
  const nullCnt = zeroB.filter((r) => !r.bidCount || r.bidCount <= 0).length;
  console.log(`OpeningDetail chunk1 bidCount null/0: ${nullCnt}/${zeroB.length}`);
})();
