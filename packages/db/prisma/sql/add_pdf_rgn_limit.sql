-- Announcement 에 pdfRgnLimit + pdfParsedAt 컬럼 추가
-- AnnouncementActive MV 도 새 컬럼 포함하도록 재생성
-- Supabase SQL Editor 에서 1회 실행 필요

ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "pdfRgnLimit" jsonb;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "pdfParsedAt" timestamptz;

-- AnnouncementActive MV 재생성 (SELECT * 패턴이라 ALTER 후 재생성 필요)
DROP MATERIALIZED VIEW IF EXISTS "AnnouncementActive" CASCADE;
CREATE MATERIALIZED VIEW "AnnouncementActive" AS
  SELECT * FROM "Announcement" WHERE deadline > NOW();

CREATE UNIQUE INDEX ON "AnnouncementActive" (id);
CREATE INDEX ON "AnnouncementActive" (deadline DESC);
CREATE INDEX ON "AnnouncementActive" ("createdAt" DESC);
CREATE INDEX ON "AnnouncementActive" (category);
CREATE INDEX ON "AnnouncementActive" (region);
CREATE INDEX ON "AnnouncementActive" USING gin ("subCategories");
ANALYZE "AnnouncementActive";

-- pg_cron 등록된 5분 refresh 는 그대로 유지 (job_id=9)
-- 필요 시 수동 REFRESH MATERIALIZED VIEW CONCURRENTLY "AnnouncementActive";
