/**
 * POST /api/admin/rebuild-stat-cache
 * BidResult → NumberSelectionStat + OrgBiddingPattern 재집계 (청크 분할)
 *
 * 사용법:
 *   첫 호출: POST { "offset": 0 }   → 테이블 초기화 후 첫 50K행 처리
 *   이후:    POST { "offset": N }   → 응답의 nextOffset 값을 그대로 전달
 *   done: true 가 되면 완료
 *
 * 인증: x-admin-key 헤더 또는 Authorization Bearer
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const maxDuration = 300;

const CHUNK_SIZE = 50_000;
const MIN_ORG_SAMPLE = 10;

function getPool() {
  return new Pool({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const adminKey = process.env.ADMIN_SECRET_KEY;
  const token =
    req.headers.get("x-admin-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const offset: number = typeof body.offset === "number" ? body.offset : 0;

  const pool = getPool();

  try {
    // ── 첫 청크: 테이블 초기화 ────────────────────────────────────────────
    if (offset === 0) {
      await pool.query('TRUNCATE TABLE "NumberSelectionStat"');
      await pool.query('TRUNCATE TABLE "OrgBiddingPattern"');
    }

    // ── 전체 행 수 확인 (done 판단용) ─────────────────────────────────────
    const {
      rows: [{ count: totalStr }],
    } = await pool.query(
      'SELECT COUNT(*) FROM "BidResult" br JOIN "Announcement" a ON a."konepsId" = br."annId"'
    );
    const totalRows = parseInt(totalStr, 10);
    const done = offset + CHUNK_SIZE >= totalRows;

    // ── NumberSelectionStat 청크 집계 + upsert (winCount 누적) ────────────
    await pool.query(
      `
      WITH raw AS (
        SELECT
          br."bidRate"::text  AS "bidRate",
          br."numBidders",
          a.category,
          a.region,
          a.budget::text      AS budget
        FROM "BidResult" br
        JOIN "Announcement" a ON a."konepsId" = br."annId"
        ORDER BY br.id
        LIMIT $1 OFFSET $2
      ),
      parsed AS (
        SELECT
          LEFT(TRIM(SPLIT_PART(COALESCE(category, '기타'), ' ', 1)), 20) AS category,
          CASE
            WHEN CAST(NULLIF(REGEXP_REPLACE(budget, '[^0-9]', '', 'g'), '') AS BIGINT) < 100000000      THEN '1억미만'
            WHEN CAST(NULLIF(REGEXP_REPLACE(budget, '[^0-9]', '', 'g'), '') AS BIGINT) < 300000000      THEN '1억-3억'
            WHEN CAST(NULLIF(REGEXP_REPLACE(budget, '[^0-9]', '', 'g'), '') AS BIGINT) < 1000000000     THEN '3억-10억'
            WHEN CAST(NULLIF(REGEXP_REPLACE(budget, '[^0-9]', '', 'g'), '') AS BIGINT) < 3000000000     THEN '10억-30억'
            ELSE '30억이상'
          END AS "budgetRange",
          COALESCE(region, '기타') AS region,
          CASE
            WHEN COALESCE("numBidders", 0) <= 5  THEN '1-5'
            WHEN "numBidders" <= 10              THEN '6-10'
            WHEN "numBidders" <= 20              THEN '11-20'
            WHEN "numBidders" <= 50              THEN '21-50'
            ELSE '51+'
          END AS "bidderRange",
          MOD(
            ROUND(
              (CAST(NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') AS NUMERIC) % 1) * 1000
            )::int,
            1000
          ) AS "rateInt"
        FROM raw
        WHERE NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') IS NOT NULL
          AND CAST(NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') AS NUMERIC) > 0
          AND CAST(NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') AS NUMERIC) <= 100
      ),
      agg AS (
        SELECT category, "budgetRange", region, "bidderRange", "rateInt",
               COUNT(*)::int AS cnt
        FROM parsed
        GROUP BY category, "budgetRange", region, "bidderRange", "rateInt"
      )
      INSERT INTO "NumberSelectionStat"
        (id, category, "budgetRange", region, "bidderRange", "rateInt", "winCount", "totalCount", "updatedAt")
      SELECT gen_random_uuid(), category, "budgetRange", region, "bidderRange", "rateInt", cnt, 0, NOW()
      FROM agg
      ON CONFLICT (category, "budgetRange", region, "bidderRange", "rateInt")
      DO UPDATE SET
        "winCount"  = "NumberSelectionStat"."winCount" + EXCLUDED."winCount",
        "updatedAt" = NOW()
      `,
      [CHUNK_SIZE, offset]
    );

    let statRows = 0;
    let orgPatterns = 0;

    if (done) {
      // ── totalCount 보정: 그룹 내 winCount 전체 합산 ───────────────────────
      await pool.query(`
        UPDATE "NumberSelectionStat" nss
        SET "totalCount" = sub.total
        FROM (
          SELECT category, "budgetRange", region, "bidderRange",
                 SUM("winCount") AS total
          FROM "NumberSelectionStat"
          GROUP BY category, "budgetRange", region, "bidderRange"
        ) sub
        WHERE nss.category      = sub.category
          AND nss."budgetRange" = sub."budgetRange"
          AND nss.region        = sub.region
          AND nss."bidderRange" = sub."bidderRange"
      `);

      const {
        rows: [{ count: sc }],
      } = await pool.query('SELECT COUNT(*) FROM "NumberSelectionStat"');
      statRows = parseInt(sc, 10);

      // ── OrgBiddingPattern 전체 SQL 집계 ──────────────────────────────────
      const { rowCount } = await pool.query(
        `
        WITH raw AS (
          SELECT a."orgName", br."bidRate"::text AS "bidRate"
          FROM "BidResult" br
          JOIN "Announcement" a ON a."konepsId" = br."annId"
          WHERE a."orgName" IS NOT NULL AND br."bidRate" IS NOT NULL
        ),
        md AS (
          SELECT "orgName",
            MOD(
              ROUND(
                (CAST(NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') AS NUMERIC) % 1) * 1000
              )::int,
              1000
            ) AS "rateInt"
          FROM raw
          WHERE NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') IS NOT NULL
            AND CAST(NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') AS NUMERIC) > 0
            AND CAST(NULLIF(REGEXP_REPLACE("bidRate", '[^0-9.]', '', 'g'), '') AS NUMERIC) <= 100
        ),
        per_org AS (
          SELECT "orgName", "rateInt", COUNT(*)::int AS cnt
          FROM md
          GROUP BY "orgName", "rateInt"
        ),
        totals AS (
          SELECT "orgName", SUM(cnt)::int AS total
          FROM per_org
          GROUP BY "orgName"
          HAVING SUM(cnt) >= $1
        )
        INSERT INTO "OrgBiddingPattern"
          (id, "orgName", "freqMap", deviation, "sampleSize", "updatedAt")
        SELECT
          gen_random_uuid(),
          t."orgName",
          (
            SELECT jsonb_object_agg(p."rateInt"::text, ROUND((p.cnt::numeric / t.total * 100), 2))
            FROM per_org p WHERE p."orgName" = t."orgName"
          ),
          '{}'::jsonb,
          t.total,
          NOW()
        FROM totals t
        ON CONFLICT ("orgName") DO UPDATE SET
          "freqMap"    = EXCLUDED."freqMap",
          deviation    = EXCLUDED.deviation,
          "sampleSize" = EXCLUDED."sampleSize",
          "updatedAt"  = NOW()
        `,
        [MIN_ORG_SAMPLE]
      );

      orgPatterns = rowCount ?? 0;
    }

    console.log("[rebuild-stat-cache]", { offset, totalRows, done });

    return NextResponse.json({
      ok: true,
      offset,
      nextOffset: offset + CHUNK_SIZE,
      totalRows,
      done,
      ...(done ? { statRows, orgPatterns } : {}),
    });
  } catch (err) {
    console.error("[rebuild-stat-cache]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    await pool.end();
  }
}
