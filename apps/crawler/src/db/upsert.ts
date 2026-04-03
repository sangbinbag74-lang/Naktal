import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";
import type { AnnouncementRow } from "../parsers/announcement";
import type { BidResultRow } from "../parsers/bid-result";

/** konepsId → 결정론적 UUID (MD5 기반). 같은 공고번호는 항상 같은 PK. */
function konepsIdToUuid(konepsId: string): string {
  const h = createHash("md5").update(konepsId).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수 누락"
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Announcement ───────────────────────────────────────────────────────────

export async function upsertAnnouncement(data: AnnouncementRow): Promise<void> {
  const { error } = await supabase.from("Announcement").upsert(
    {
      id:       konepsIdToUuid(data.konepsId), // 결정론적 UUID — PK 안정성 보장
      konepsId: data.konepsId,
      title:    data.title,
      orgName:  data.orgName,
      budget:   data.budget.toString(), // BigInt → string (Supabase JSON 호환)
      deadline: data.deadline.toISOString(),
      category: data.category,
      region:   data.region,
      rawJson:  data.rawJson,
    },
    { onConflict: "konepsId" }
  );
  if (error) throw new Error(`upsertAnnouncement 실패 (${data.konepsId}): ${error.message}`);
}

export async function upsertAnnouncementBatch(rows: AnnouncementRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  // 같은 배치 내 중복 konepsId 제거 (3개 타입 API에서 동일 공고 반환 시 ON CONFLICT 오류 방지)
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.konepsId)) return false;
    seen.add(r.konepsId);
    return true;
  });
  const BATCH = 100;
  let saved = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { error } = await supabase.from("Announcement").upsert(
      chunk.map((data) => ({
        id:       konepsIdToUuid(data.konepsId),
        konepsId: data.konepsId,
        title:    data.title,
        orgName:  data.orgName,
        budget:   data.budget.toString(),
        deadline: data.deadline.toISOString(),
        category: data.category,
        region:   data.region,
        rawJson:  data.rawJson,
      })),
      { onConflict: "konepsId" }
    );
    if (error) throw new Error(`upsertAnnouncementBatch 실패 (chunk ${i}~${i + chunk.length}): ${error.message}`);
    saved += chunk.length;
  }
  return saved;
}

// ─── BidResult ───────────────────────────────────────────────────────────────

export async function upsertBidResult(data: BidResultRow): Promise<void> {
  const { error } = await supabase.from("BidResult").upsert(
    {
      id:         randomUUID(),
      annId:      data.annId,
      bidRate:    data.bidRate,
      finalPrice: data.finalPrice.toString(),
      numBidders: data.numBidders,
      winnerName: data.winnerName ?? null,
    },
    { onConflict: "annId" }
  );
  if (error) throw new Error(`upsertBidResult 실패 (${data.annId}): ${error.message}`);
}

export async function upsertBidResultBatch(rows: BidResultRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  // 배치 내 중복 annId 제거
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.annId)) return false;
    seen.add(r.annId);
    return true;
  });
  const BATCH = 100;
  let saved = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { error } = await supabase.from("BidResult").upsert(
      chunk.map((data) => ({
        id:         randomUUID(),
        annId:      data.annId,
        bidRate:    data.bidRate,
        finalPrice: data.finalPrice.toString(),
        numBidders: data.numBidders,
        winnerName: data.winnerName ?? null,
      })),
      { onConflict: "annId" }
    );
    if (error) throw new Error(`upsertBidResultBatch 실패 (chunk ${i}~${i + chunk.length}): ${error.message}`);
    saved += chunk.length;
  }
  return saved;
}

// ─── CrawlLog ─────────────────────────────────────────────────────────────────

export interface CrawlLogInput {
  type: "ANNOUNCEMENT" | "BID_RESULT";
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  count: number;
  errors?: string;
}

export async function logCrawl(log: CrawlLogInput): Promise<void> {
  const { error } = await supabase.from("CrawlLog").insert({
    type:   log.type,
    status: log.status,
    count:  log.count,
    errors: log.errors ?? null,
  });
  if (error) {
    console.error(`[CrawlLog 기록 실패]: ${error.message}`);
  }
}
