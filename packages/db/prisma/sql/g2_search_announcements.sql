-- G-2: 공고 목록 RPC 재활성화 + 인덱스 최적화
-- 적용: Supabase SQL Editor 에서 1회 실행 (CONCURRENTLY 인덱스는 트랜잭션 외에서 실행)
--
-- 목표: 659만 행에서 500ms 이내 응답
-- 핵심 최적화:
--   1. subCategories GIN 인덱스 (배열 @> 연산 O(log N))
--   2. (category, deadline) BTREE — 카테고리 필터 + 활성 정렬
--   3. (region, deadline) BTREE — 지역 필터
--   4. RPC 함수 단순화 — Path B 체인 쿼리 패턴 답습 (planner trap 회피)

-- 1. GIN 인덱스 — subCategories 배열 검색
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ann_subcat_gin
  ON "Announcement" USING GIN ("subCategories");

-- 2. category + deadline (활성 공고 정렬용)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ann_category_deadline
  ON "Announcement" (category, deadline);

-- 3. region + deadline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ann_region_deadline
  ON "Announcement" (region, deadline);

-- 4. 활성 공고 partial index — 폐기
--    PostgreSQL: timestamptz 캐스팅이 STABLE이라 partial WHERE에 못 씀 (IMMUTABLE 필요).
--    기존 idx_ann_deadline 풀 인덱스로 커버됨. 별도 partial 만들 가치 없음.

-- 5. 통계 갱신 (planner 정확도)
ANALYZE "Announcement";

-- ── 6. RPC 함수: search_announcements ─────────────────────────────────────────
-- 기존 RPC는 OFFSET/필터 조합에서 9초+ → 비활성화됨
-- 신규: planner trap 회피 + 단일 인덱스 경로 강제
CREATE OR REPLACE FUNCTION search_announcements(
  p_categories  text[]    DEFAULT NULL,
  p_subcats     text[]    DEFAULT NULL,
  p_regions     text[]    DEFAULT NULL,
  p_keyword     text      DEFAULT NULL,
  p_min_budget  bigint    DEFAULT NULL,
  p_max_budget  bigint    DEFAULT NULL,
  p_active_only boolean   DEFAULT TRUE,
  p_deadline_to timestamp DEFAULT NULL,
  p_sort        text      DEFAULT 'latest',  -- 'latest' | 'deadline'
  p_limit       int       DEFAULT 20,
  p_offset      int       DEFAULT 0
)
RETURNS TABLE (
  id text,
  "konepsId" text,
  title text,
  "orgName" text,
  budget bigint,
  deadline timestamp,
  category text,
  "subCategories" text[],
  region text,
  "createdAt" timestamp,
  "aValueYn" text,
  "rawJson" jsonb
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  now_ts timestamp := (NOW() AT TIME ZONE 'UTC')::timestamp;
BEGIN
  RETURN QUERY
  SELECT
    a.id, a."konepsId", a.title, a."orgName",
    a.budget, a.deadline, a.category,
    a."subCategories", a.region, a."createdAt", a."aValueYn",
    a."rawJson"
  FROM "Announcement" a
  WHERE (NOT p_active_only OR a.deadline >= now_ts)
    AND (p_deadline_to IS NULL OR a.deadline <= p_deadline_to)
    AND (
      p_categories IS NULL
      OR a.category = ANY(p_categories)
      OR (p_subcats IS NOT NULL AND a."subCategories" && p_subcats)
    )
    AND (p_regions IS NULL OR a.region = ANY(p_regions))
    AND (
      p_keyword IS NULL OR p_keyword = ''
      OR a.title    ILIKE '%' || p_keyword || '%'
      OR a."orgName" ILIKE '%' || p_keyword || '%'
    )
    AND (p_min_budget IS NULL OR a.budget >= p_min_budget)
    AND (p_max_budget IS NULL OR a.budget <= p_max_budget)
  ORDER BY
    CASE WHEN p_sort = 'deadline' THEN a.deadline END ASC NULLS LAST,
    CASE WHEN p_sort = 'latest'   THEN a."createdAt" END DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_announcements TO anon, authenticated, service_role;

-- 검증 쿼리
-- EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM search_announcements(
--     p_categories := ARRAY['공사'],
--     p_subcats    := ARRAY['조경식재'],
--     p_active_only := TRUE,
--     p_sort := 'latest',
--     p_limit := 20
--   );
