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
      id:            konepsIdToUuid(data.konepsId), // 결정론적 UUID — PK 안정성 보장
      konepsId:      data.konepsId,
      title:         data.title,
      orgName:       data.orgName,
      budget:        data.budget.toString(), // BigInt → string (Supabase JSON 호환)
      deadline:      data.deadline.toISOString(),
      category:      data.category,
      region:        data.region,
      rawJson:       data.rawJson,
      subCategories: data.subCategories,
      sucsfbidLwltRate:    data.sucsfbidLwltRate ?? 0,
      bidNtceDtlUrl:       data.bidNtceDtlUrl ?? "",
      ntceInsttOfclTelNo:  data.ntceInsttOfclTelNo ?? "",
      jntcontrctDutyRgnNm: data.jntcontrctDutyRgnNm ?? "",
      ciblAplYn:           data.ciblAplYn ?? "",
      mtltyAdvcPsblYn:     data.mtltyAdvcPsblYn ?? "",
      prtcptPsblRgnNm:     data.prtcptPsblRgnNm ?? "",
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

  // pg 직접 연결 우선 (Supabase REST statement_timeout 8초 우회)
  if (pgPool) {
    return upsertAnnouncementBatchPg(unique);
  }

  const BATCH = 25;
  let saved = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { error } = await supabase.from("Announcement").upsert(
      chunk.map((data) => ({
        id:            konepsIdToUuid(data.konepsId),
        konepsId:      data.konepsId,
        title:         data.title,
        orgName:       data.orgName,
        budget:        data.budget.toString(),
        deadline:      data.deadline.toISOString(),
        category:      data.category,
        region:        data.region,
        rawJson:       data.rawJson,
        subCategories: data.subCategories,
        sucsfbidLwltRate:    data.sucsfbidLwltRate ?? 0,
        bidNtceDtlUrl:       data.bidNtceDtlUrl ?? "",
        ntceInsttOfclTelNo:  data.ntceInsttOfclTelNo ?? "",
        jntcontrctDutyRgnNm: data.jntcontrctDutyRgnNm ?? "",
        ciblAplYn:           data.ciblAplYn ?? "",
        mtltyAdvcPsblYn:     data.mtltyAdvcPsblYn ?? "",
        prtcptPsblRgnNm:     data.prtcptPsblRgnNm ?? "",
      })),
      { onConflict: "konepsId" }
    );
    if (error) throw new Error(`upsertAnnouncementBatch 실패 (chunk ${i}~${i + chunk.length}): ${error.message}`);
    saved += chunk.length;
  }
  return saved;
}

async function upsertAnnouncementBatchPg(rows: AnnouncementRow[]): Promise<number> {
  const BATCH = 200;
  let saved = 0;
  const client = await pgPool!.connect();
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values: unknown[] = [];
      const placeholders = chunk.map((data, j) => {
        const base = j * 17;
        values.push(
          konepsIdToUuid(data.konepsId),
          data.konepsId,
          data.title,
          data.orgName,
          data.budget.toString(),
          data.deadline.toISOString(),
          data.category,
          data.region,
          JSON.stringify(data.rawJson),
          data.subCategories,
          data.sucsfbidLwltRate ?? 0,
          data.bidNtceDtlUrl ?? "",
          data.ntceInsttOfclTelNo ?? "",
          data.jntcontrctDutyRgnNm ?? "",
          data.ciblAplYn ?? "",
          data.mtltyAdvcPsblYn ?? "",
          data.prtcptPsblRgnNm ?? "",
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9}::jsonb,$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16},$${base+17})`;
      }).join(",");
      await client.query(
        `INSERT INTO "Announcement" (id,"konepsId",title,"orgName",budget,deadline,category,region,"rawJson","subCategories","sucsfbidLwltRate","bidNtceDtlUrl","ntceInsttOfclTelNo","jntcontrctDutyRgnNm","ciblAplYn","mtltyAdvcPsblYn","prtcptPsblRgnNm")
         VALUES ${placeholders}
         ON CONFLICT ("konepsId") DO UPDATE SET
           title                 = EXCLUDED.title,
           "orgName"             = EXCLUDED."orgName",
           budget                = EXCLUDED.budget,
           deadline              = EXCLUDED.deadline,
           category              = EXCLUDED.category,
           region                = EXCLUDED.region,
           "rawJson"             = EXCLUDED."rawJson",
           "subCategories"       = EXCLUDED."subCategories",
           "sucsfbidLwltRate"    = CASE WHEN EXCLUDED."sucsfbidLwltRate" > 0 THEN EXCLUDED."sucsfbidLwltRate" ELSE "Announcement"."sucsfbidLwltRate" END,
           "bidNtceDtlUrl"       = CASE WHEN EXCLUDED."bidNtceDtlUrl" != '' THEN EXCLUDED."bidNtceDtlUrl" ELSE "Announcement"."bidNtceDtlUrl" END,
           "ntceInsttOfclTelNo"  = CASE WHEN EXCLUDED."ntceInsttOfclTelNo" != '' THEN EXCLUDED."ntceInsttOfclTelNo" ELSE "Announcement"."ntceInsttOfclTelNo" END,
           "jntcontrctDutyRgnNm" = CASE WHEN EXCLUDED."jntcontrctDutyRgnNm" != '' THEN EXCLUDED."jntcontrctDutyRgnNm" ELSE "Announcement"."jntcontrctDutyRgnNm" END,
           "ciblAplYn"           = CASE WHEN EXCLUDED."ciblAplYn" != '' THEN EXCLUDED."ciblAplYn" ELSE "Announcement"."ciblAplYn" END,
           "mtltyAdvcPsblYn"     = CASE WHEN EXCLUDED."mtltyAdvcPsblYn" != '' THEN EXCLUDED."mtltyAdvcPsblYn" ELSE "Announcement"."mtltyAdvcPsblYn" END,
           "prtcptPsblRgnNm"     = CASE WHEN EXCLUDED."prtcptPsblRgnNm" != '' THEN EXCLUDED."prtcptPsblRgnNm" ELSE "Announcement"."prtcptPsblRgnNm" END`,
        values,
      );
      saved += chunk.length;
    }
  } finally {
    client.release();
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
  // AIPrediction 실제 결과 자동 채우기 (실패해도 크롤 전체는 계속)
  await fillAIPredictionResult(data).catch((e) =>
    console.error("[fillAIPredictionResult] 에러:", e)
  );
  // BidRequest 낙찰 결과 자동 매칭 (계약 완료된 의뢰에 결과 기록)
  await fillBidRequestResult(
    data.annId,
    Number(data.bidRate),
    Number(data.finalPrice),
    data.winnerName ?? null,
    data.numBidders ?? null,
  ).catch((e) => console.error("[fillBidRequestResult] 에러:", e));
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
  const BATCH = 25;
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

// ─── AIPrediction 실제 결과 채우기 ──────────────────────────────────────────────

/**
 * 낙찰 결과(BidResultRow)를 받아 AIPrediction 테이블에 실제 결과를 업데이트합니다.
 * BidResultRow.annId = konepsId 원본 문자열
 */
export async function fillAIPredictionResult(data: BidResultRow): Promise<void> {
  // konepsId로 AIPrediction 조회 (아직 결과가 채워지지 않은 것만)
  const { data: pred, error: fetchErr } = await supabase
    .from("AIPrediction")
    .select("id, predictedSajungRate, budget")
    .eq("konepsId", data.annId)
    .is("actualSajungRate", null)
    .maybeSingle();

  if (fetchErr || !pred) return; // 없거나 이미 채워진 경우 스킵

  const budget = Number(pred.budget ?? 0);
  const bidRateNum = Number(data.bidRate);
  if (budget <= 0 || bidRateNum <= 0) return;

  // 실제 사정율 = (낙찰금액 ÷ 낙찰률%) ÷ 기초금액 × 100
  const estimatedFinalPrice = Number(data.finalPrice) / (bidRateNum / 100);
  const actualSajungRate = (estimatedFinalPrice / budget) * 100;

  const predicted = Number(pred.predictedSajungRate);
  const deviationPct = Math.abs(predicted - actualSajungRate);
  const isExact   = deviationPct <= 0.2;
  const isHit     = deviationPct <= 0.5;
  const isNearHit = deviationPct <= 1.0;

  const { error: updateErr } = await supabase
    .from("AIPrediction")
    .update({
      actualSajungRate: actualSajungRate.toFixed(4),
      actualFinalPrice: data.finalPrice.toString(),
      actualBidRate: Number(data.bidRate).toFixed(4),
      resultFilledAt: new Date().toISOString(),
      deviationPct: deviationPct.toFixed(4),
      isExact,
      isHit,
      isNearHit,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", pred.id as string);

  if (updateErr) {
    console.error(`[AIPrediction] 결과 업데이트 실패 (${data.annId}): ${updateErr.message}`);
  }
}

// ─── BidRequest 낙찰 결과 자동 매칭 ───────────────────────────────────────────

export async function fillBidRequestResult(
  konepsId: string,
  bidRate: number,
  actualFinalPrice: number,
  winnerName: string | null,
  totalBidders: number | null,
): Promise<void> {
  // 1. BidRequest 조회: konepsId + contractAt IS NOT NULL + isWon IS NULL
  const { data: reqs } = await supabase
    .from("BidRequest")
    .select("id, userId, budget, recommendedBidPrice, predictedSajungRate")
    .eq("konepsId", konepsId)
    .not("contractAt", "is", null)
    .is("isWon", null);
  if (!reqs || reqs.length === 0) return;

  for (const req of reqs) {
    // 2. User.bizName 조회 → isWon 판별
    const { data: user } = await supabase
      .from("User")
      .select("bizName")
      .eq("id", req.userId as string)
      .maybeSingle();
    const bizName = (user?.bizName as string) ?? "";
    const isWon =
      winnerName != null && bizName.length > 0
        ? winnerName.includes(bizName) || bizName.includes(winnerName)
        : false;

    // 3. 계산
    const budget = Number(req.budget ?? 0);
    const actualSajungRate =
      budget > 0 && bidRate > 0
        ? ((actualFinalPrice / (bidRate / 100)) / budget) * 100
        : 0;
    const predictedSajungRate = Number(req.predictedSajungRate ?? 0);
    const deviationPct = actualSajungRate - predictedSajungRate;
    const isHit = Math.abs(deviationPct) <= 0.5;
    const recommendedBidPrice = Number(req.recommendedBidPrice ?? 0);
    const feeRate =
      recommendedBidPrice > 0 && recommendedBidPrice < 100_000_000 ? 0.017 : 0.015;
    const feeAmount = isWon ? Math.round(actualFinalPrice * feeRate) : 0;
    const feeStatus = isWon ? "invoiced" : "waived";

    // 4. BidRequest 업데이트
    const { error: updateErr } = await supabase
      .from("BidRequest")
      .update({
        isWon,
        actualFinalPrice: String(Math.round(actualFinalPrice)),
        winnerName: winnerName ?? null,
        totalBidders: totalBidders ?? null,
        actualSajungRate: actualSajungRate.toFixed(4),
        resultDetectedAt: new Date().toISOString(),
        feeRate: feeRate.toFixed(4),
        feeAmount: String(feeAmount),
        feeStatus,
        deviationPct: deviationPct.toFixed(4),
        isHit,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", req.id as string);

    if (updateErr) {
      console.error(`[BidRequest] 결과 업데이트 실패 (${req.id}): ${updateErr.message}`);
    } else {
      // 낙찰/미낙찰 이메일 알림 발송 (fire-and-forget)
      const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";
      const adminKey = process.env.ADMIN_SECRET_KEY ?? "";
      if (adminKey) {
        fetch(`${appUrl}/api/alerts/bid-won`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": adminKey,
          },
          body: JSON.stringify({ bidRequestId: req.id }),
        }).catch((e) => console.error("[bid-won 알림] 발송 실패:", e));
      }
    }
  }
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
