/**
 * OrgBiddingPattern 집계 배치
 *
 * BidResult + Announcement JOIN → 발주처(orgName)별 millidigit 빈도 집계
 * → OrgBiddingPattern 테이블 upsert
 *
 * 실행: ts-node src/pipelines/build-org-pattern.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락");
  process.exit(1);
}

const PAGE_SIZE = 5000;
const MIN_SAMPLE = 10; // 최소 10건 이상인 발주처만 저장

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function run() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  console.log("[build-org-pattern] BidResult 수집 시작...");

  // orgName → bidRates 매핑
  const orgRates = new Map<string, string[]>();
  let page = 0;
  let totalFetched = 0;

  while (true) {
    const { data, error } = await db
      .from("BidResult")
      .select("bidRate, Announcement!inner(orgName)")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error("[build-org-pattern] BidResult 조회 오류:", error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const ann = (row as any).Announcement;
      if (!ann?.orgName) continue;

      const orgName = ann.orgName.trim();
      const rates = orgRates.get(orgName) ?? [];
      rates.push(String(row.bidRate));
      orgRates.set(orgName, rates);
    }

    totalFetched += data.length;
    console.log(`  페이지 ${page + 1}: ${data.length}건 처리 (누적 ${totalFetched})`);

    if (data.length < PAGE_SIZE) break;
    page++;
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[build-org-pattern] 발주처 ${orgRates.size}개 집계 완료`);

  // 최소 샘플 미만 제외
  const eligible = Array.from(orgRates.entries()).filter(([, rates]) => rates.length >= MIN_SAMPLE);
  console.log(`[build-org-pattern] 저장 대상 발주처: ${eligible.length}개 (${MIN_SAMPLE}건 이상)`);

  if (eligible.length === 0) {
    console.log("[build-org-pattern] 저장할 발주처 없음. 종료.");
    return;
  }

  // 발주처별 freqMap 계산 + upsert (50개씩 배치)
  const BATCH = 50;
  let upserted = 0;

  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH).map(([orgName, bidRates]) => {
      const freqMap: Record<number, number> = {};
      for (const rate of bidRates) {
        const n = parseFloat(rate.replace(/[^0-9.]/g, ""));
        if (isNaN(n) || n <= 0 || n > 100) continue;
        const md = Math.round((n % 1) * 1000) % 1000;
        freqMap[md] = (freqMap[md] ?? 0) + 1;
      }

      const total    = Object.values(freqMap).reduce((s, v) => s + v, 0);
      const avgFreq  = total > 0 ? total / 1000 : 0;
      const freqPct: Record<number, number>  = {};
      const deviation: Record<number, number> = {};

      for (const [k, v] of Object.entries(freqMap)) {
        const ki = parseInt(k);
        freqPct[ki]   = parseFloat(((v / total) * 100).toFixed(2));
        deviation[ki] = parseFloat(((v / total - avgFreq / total) * 100).toFixed(2));
      }

      return {
        id:         crypto.randomUUID(),
        orgName,
        freqMap:    freqPct,
        deviation,
        sampleSize: bidRates.length,
        updatedAt:  new Date().toISOString(),
      };
    });

    const { error } = await db
      .from("OrgBiddingPattern")
      .upsert(batch, { onConflict: "orgName" });

    if (error) console.error(`[build-org-pattern] upsert 오류 (배치 ${i / BATCH + 1}):`, error.message);
    else upserted += batch.length;

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[build-org-pattern] OrgBiddingPattern upsert 완료: ${upserted}개 발주처`);
}

run().catch((e) => { console.error(e); process.exit(1); });
