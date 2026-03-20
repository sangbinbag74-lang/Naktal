/**
 * CORE 2 — 실시간 참여자 수 수집기
 *
 * 나라장터 OpenAPI는 마감 전 참여자 수를 제공하지 않음.
 * 대신 개찰 후 낙찰결과에서 총참가사수(totPrtcptCo)를 파악하고,
 * ParticipantSnapshot 테이블에 스냅샷을 저장해 추세를 제공합니다.
 *
 * 실행: Vercel Cron 또는 GitHub Actions 에서 주기적으로 호출
 * (마감임박 공고만 대상: deadline 기준 3시간 이내)
 */

import { getBidResultDetail } from "../api/koneps-client";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수 누락");
  return createClient(url, key);
}

/**
 * 마감 임박 공고(3시간 이내)의 참여자 수를 업데이트
 * 개찰 완료된 공고 → BidResult에서 numBidders 가져와 스냅샷 저장
 */
export async function snapshotParticipants(): Promise<{ saved: number; skipped: number }> {
  const db = supabase();

  // 개찰이 완료된 공고 중 ParticipantSnapshot이 없거나 오래된 것
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: targets } = await db
    .from("Announcement")
    .select("id,konepsId,deadline")
    .lt("deadline", new Date().toISOString()) // 마감 완료
    .order("deadline", { ascending: false })
    .limit(50);

  if (!targets?.length) return { saved: 0, skipped: 0 };

  let saved = 0;
  let skipped = 0;

  for (const ann of targets) {
    // 이미 최근 스냅샷이 있으면 skip
    const { data: existing } = await db
      .from("ParticipantSnapshot")
      .select("id")
      .eq("annId", ann.id)
      .gte("snapshotAt", oneHourAgo)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    // KONEPS API에서 개찰 결과 조회
    const detail = await getBidResultDetail(ann.konepsId).catch(() => null);
    if (!detail) { skipped++; continue; }

    const count = parseInt(detail.totPrtcptCo || "0", 10);
    if (count <= 0) { skipped++; continue; }

    await db.from("ParticipantSnapshot").insert({ annId: ann.id, count });
    saved++;

    await new Promise((r) => setTimeout(r, 200)); // rate limit
  }

  return { saved, skipped };
}
