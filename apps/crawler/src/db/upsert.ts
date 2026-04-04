import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { Pool } from "pg";
import type { AnnouncementRow } from "../parsers/announcement";
import type { BidResultRow } from "../parsers/bid-result";

/** 루트 .env에서 DATABASE_URL 로드 */
function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DATABASE_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
    }
  } catch { /* 없으면 무시 */ }
  return process.env.DATABASE_URL;
}

const DATABASE_URL = loadDatabaseUrl();
const pgPool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 3 }) : null;

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

  // pg 직접 연결 사용 (Supabase REST API 우회)
  if (pgPool) {
    return upsertBidResultBatchPg(unique);
  }

  // 폴백: supabase-js (재시도 포함)
  const BATCH = 50;
  let saved = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const payload = chunk.map((data) => ({
      id:         randomUUID(),
      annId:      data.annId,
      bidRate:    data.bidRate,
      finalPrice: data.finalPrice.toString(),
      numBidders: data.numBidders,
      winnerName: data.winnerName ?? null,
    }));
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 5000 * Math.pow(3, attempt - 1)));
      const { error } = await supabase.from("BidResult").upsert(payload, { onConflict: "annId" });
      if (!error) { lastErr = null; break; }
      lastErr = error.message;
    }
    if (lastErr) throw new Error(`upsertBidResultBatch 실패 (chunk ${i}~${i + chunk.length}): ${lastErr}`);
    saved += chunk.length;
    await new Promise((r) => setTimeout(r, 200));
  }
  return saved;
}

async function upsertBidResultBatchPg(rows: BidResultRow[]): Promise<number> {
  const BATCH = 200;
  let saved = 0;
  const client = await pgPool!.connect();
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      // VALUES ($1,$2,...), ($n+1,...) 형태로 구성
      const values: unknown[] = [];
      const placeholders = chunk.map((data, j) => {
        const base = j * 6;
        values.push(
          randomUUID(),
          data.annId,
          data.bidRate,
          data.finalPrice.toString(),
          data.numBidders,
          data.winnerName ?? null,
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`;
      }).join(",");
      await client.query(
        `INSERT INTO "BidResult" (id,"annId","bidRate","finalPrice","numBidders","winnerName")
         VALUES ${placeholders}
         ON CONFLICT ("annId") DO UPDATE SET
           "bidRate"    = EXCLUDED."bidRate",
           "finalPrice" = EXCLUDED."finalPrice",
           "numBidders" = EXCLUDED."numBidders",
           "winnerName" = EXCLUDED."winnerName"`,
        values,
      );
      saved += chunk.length;
    }
  } finally {
    client.release();
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
