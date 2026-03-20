import { createClient } from "@supabase/supabase-js";
import type { AnnouncementRow } from "../parsers/announcement";
import type { BidResultRow } from "../parsers/bid-result";

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

// ─── BidResult ───────────────────────────────────────────────────────────────

export async function upsertBidResult(data: BidResultRow): Promise<void> {
  const { error } = await supabase.from("BidResult").upsert(
    {
      annId:      data.annId,
      bidRate:    data.bidRate,
      finalPrice: data.finalPrice.toString(),
      numBidders: data.numBidders,
    },
    { onConflict: "annId" }
  );
  if (error) throw new Error(`upsertBidResult 실패 (${data.annId}): ${error.message}`);
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
