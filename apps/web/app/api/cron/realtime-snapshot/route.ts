/**
 * 실시간 모니터 파이프라인 (2026-07-10) — ParticipantSnapshot 채우기
 *
 * KONEPS OpenAPI는 마감 전 참여자 수를 제공하지 않음 → 개찰 직후 참가사수를 스냅샷.
 *  1. DB 백필: 최근 마감 공고 × BidResult.numBidders / BidOpeningDetail.bidCount (API 호출 0)
 *  2. 당일 프로브: 마감 1~24시간 경과 + DB에 결과 없는 공고 → 개찰 참여업체 단건 조회 (순차 250ms, 회당 ≤12건)
 *
 * 인증: Bearer CRON_SECRET (매시 정각) / 관리자 수동 POST(x-admin-secret, ?days=1~30 백필)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { g2bFetchOpengComptForBidNtceNo } from "@/lib/g2b";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PROBE_MAX = 12;          // 회당 KONEPS 프로브 상한 (저동시성 — 순차 250ms)
const PROBE_MIN_AGE_MS = 60 * 60 * 1000;       // 마감 후 1시간 지나야 개찰 조회 (개찰 전 낭비 방지)
const PROBE_MAX_AGE_MS = 24 * 60 * 60 * 1000;  // 24시간 이내만 프로브 (이후는 일일 sync-g2b가 BidResult로 커버)

interface AnnRow { id: string; konepsId: string; deadline: string }

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runSnapshot(days: number): Promise<NextResponse> {
  const admin = createAdminClient();
  const started = Date.now();
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 1. 최근 마감 공고 (기본 2일 창 — 매시 실행이므로 창이 겹쳐도 스냅샷 존재 검사로 중복 방지)
  const anns: AnnRow[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await admin
      .from("Announcement")
      .select("id,konepsId,deadline")
      .lt("deadline", now.toISOString())
      .gte("deadline", from.toISOString())
      .order("deadline", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    anns.push(...((data ?? []) as AnnRow[]));
    if (!data || data.length < 1000) break;
  }
  if (anns.length === 0) return NextResponse.json({ ok: true, window: 0, dbFilled: 0, probed: 0, probeFilled: 0 });

  // 2. 이미 스냅샷 있는 공고 제외
  const existing = new Set<string>();
  for (const ids of chunk(anns.map((a) => a.id), 200)) {
    const { data } = await admin.from("ParticipantSnapshot").select("annId").in("annId", ids);
    for (const r of data ?? []) existing.add((r as { annId: string }).annId);
  }
  const need = anns.filter((a) => !existing.has(a.id));

  // 3. BidResult(annId=konepsId).numBidders → BidOpeningDetail.bidCount 폴백으로 count 매핑
  const countMap = new Map<string, number>();
  for (const ids of chunk(need.map((a) => a.konepsId), 200)) {
    const [br, od] = await Promise.all([
      admin.from("BidResult").select("annId,numBidders").in("annId", ids),
      admin.from("BidOpeningDetail").select("annId,bidCount").in("annId", ids),
    ]);
    for (const r of (od.data ?? []) as { annId: string; bidCount: number | null }[]) {
      if (r.bidCount && r.bidCount > 0) countMap.set(r.annId, r.bidCount);
    }
    for (const r of (br.data ?? []) as { annId: string; numBidders: number | null }[]) {
      if (r.numBidders && r.numBidders > 0) countMap.set(r.annId, r.numBidders); // BidResult 우선
    }
  }

  // 4. DB 매칭분 bulk insert
  const rows = need
    .filter((a) => countMap.has(a.konepsId))
    .map((a) => ({ annId: a.id, count: countMap.get(a.konepsId) as number }));
  let dbFilled = 0;
  for (const batch of chunk(rows, 100)) {
    const { error } = await admin.from("ParticipantSnapshot").insert(batch);
    if (!error) dbFilled += batch.length;
    else console.error("[realtime-snapshot] insert 오류:", error.message);
  }

  // 5. DB에 결과 없는 당일 개찰분 프로브 (마감 1~24h 경과, 최신순 ≤12건, 순차 250ms)
  const probeTargets = need
    .filter((a) => !countMap.has(a.konepsId))
    .filter((a) => {
      const age = now.getTime() - new Date(a.deadline).getTime();
      return age >= PROBE_MIN_AGE_MS && age <= PROBE_MAX_AGE_MS;
    })
    .slice(0, PROBE_MAX);

  let probed = 0;
  let probeFilled = 0;
  for (const t of probeTargets) {
    if (Date.now() - started > 90_000) break; // maxDuration 여유
    // 개찰 지연(유찰·연기) 공고 반복 프로브 방지 — 공고당 3시간 1회
    const cooldown = await rateLimit(`rtprobe:${t.id}`, 1, 3 * 3600);
    if (!cooldown.allowed) continue;
    probed++;
    const compt = await g2bFetchOpengComptForBidNtceNo({
      bidNtceNo: t.konepsId,
      deadline: new Date(t.deadline),
    }).catch(() => []);
    if (compt.length > 0) {
      const { error } = await admin.from("ParticipantSnapshot").insert({ annId: t.id, count: compt.length });
      if (!error) probeFilled++;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`[realtime-snapshot] 창 ${anns.length}건 · 미충족 ${need.length}건 · DB백필 ${dbFilled}건 · 프로브 ${probed}건 중 ${probeFilled}건 저장`);
  return NextResponse.json({ ok: true, window: anns.length, need: need.length, dbFilled, probed, probeFilled });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSnapshot(2);
}

// 관리자 수동 트리거 (?days=1~30 — 과거 백필용, 프로브는 24h 이내만)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const raw = Number(request.nextUrl.searchParams.get("days") ?? "2");
  const days = Math.min(30, Math.max(1, Number.isFinite(raw) ? raw : 2));
  return runSnapshot(days);
}
