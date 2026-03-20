-- ================================================================
-- Naktal.ai — Supabase RLS 설정
-- Supabase 대시보드 > SQL Editor 에서 전체 복붙 후 실행
-- (재실행 가능 — 기존 policy 자동 삭제 후 재생성)
-- ================================================================

-- ──────────────────────────────────────────────
-- 1. User 테이블
-- ──────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own" ON "User";
DROP POLICY IF EXISTS "user_update_own" ON "User";

CREATE POLICY "user_select_own" ON "User"
  FOR SELECT USING (auth.uid()::text = "supabaseId");

CREATE POLICY "user_update_own" ON "User"
  FOR UPDATE USING (auth.uid()::text = "supabaseId");

-- ──────────────────────────────────────────────
-- 2. Subscription 테이블
-- ──────────────────────────────────────────────
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_select_own" ON "Subscription";

CREATE POLICY "subscription_select_own" ON "Subscription"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

-- ──────────────────────────────────────────────
-- 3. UserAlert 테이블
-- ──────────────────────────────────────────────
ALTER TABLE "UserAlert" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_select_own" ON "UserAlert";
DROP POLICY IF EXISTS "alert_insert_own" ON "UserAlert";
DROP POLICY IF EXISTS "alert_update_own" ON "UserAlert";
DROP POLICY IF EXISTS "alert_delete_own" ON "UserAlert";

CREATE POLICY "alert_select_own" ON "UserAlert"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "alert_insert_own" ON "UserAlert"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "alert_update_own" ON "UserAlert"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "alert_delete_own" ON "UserAlert"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

-- ──────────────────────────────────────────────
-- 4. CompanyProfile 테이블
-- ──────────────────────────────────────────────
ALTER TABLE "CompanyProfile" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_select_own" ON "CompanyProfile";
DROP POLICY IF EXISTS "profile_upsert_own" ON "CompanyProfile";

CREATE POLICY "profile_select_own" ON "CompanyProfile"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "profile_upsert_own" ON "CompanyProfile"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

-- ──────────────────────────────────────────────
-- 5. NumberRecommendation 테이블
-- ──────────────────────────────────────────────
ALTER TABLE "NumberRecommendation" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recommend_select_own" ON "NumberRecommendation";

CREATE POLICY "recommend_select_own" ON "NumberRecommendation"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

-- ──────────────────────────────────────────────
-- 6. BidOutcome 테이블
-- ──────────────────────────────────────────────
ALTER TABLE "BidOutcome" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outcome_select_own" ON "BidOutcome";
DROP POLICY IF EXISTS "outcome_insert_own" ON "BidOutcome";
DROP POLICY IF EXISTS "outcome_update_own" ON "BidOutcome";

CREATE POLICY "outcome_select_own" ON "BidOutcome"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "outcome_insert_own" ON "BidOutcome"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "outcome_update_own" ON "BidOutcome"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "userId" AND u."supabaseId" = auth.uid()::text
    )
  );

-- ──────────────────────────────────────────────
-- 7. Announcement — 인증된 사용자 전체 읽기
-- ──────────────────────────────────────────────
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ann_select_all" ON "Announcement";

CREATE POLICY "ann_select_all" ON "Announcement"
  FOR SELECT USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 8. BidResult — 인증된 사용자 전체 읽기
-- ──────────────────────────────────────────────
ALTER TABLE "BidResult" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bidresult_select_all" ON "BidResult";

CREATE POLICY "bidresult_select_all" ON "BidResult"
  FOR SELECT USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 9. NumberSelectionStat — 인증된 사용자 전체 읽기
-- ──────────────────────────────────────────────
ALTER TABLE "NumberSelectionStat" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stat_select_all" ON "NumberSelectionStat";

CREATE POLICY "stat_select_all" ON "NumberSelectionStat"
  FOR SELECT USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 10. OrgBiddingPattern — 인증된 사용자 전체 읽기
-- ──────────────────────────────────────────────
ALTER TABLE "OrgBiddingPattern" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgpattern_select_all" ON "OrgBiddingPattern";

CREATE POLICY "orgpattern_select_all" ON "OrgBiddingPattern"
  FOR SELECT USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 11. ParticipantSnapshot — 인증된 사용자 전체 읽기
-- ──────────────────────────────────────────────
ALTER TABLE "ParticipantSnapshot" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshot_select_all" ON "ParticipantSnapshot";

CREATE POLICY "snapshot_select_all" ON "ParticipantSnapshot"
  FOR SELECT USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 12. BetaApplication — 누구나 INSERT (베타 신청)
-- ──────────────────────────────────────────────
ALTER TABLE "BetaApplication" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_insert_anon" ON "BetaApplication";

CREATE POLICY "beta_insert_anon" ON "BetaApplication"
  FOR INSERT WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 13. RateLimit / AdminLog / CrawlLog / Prediction
--     — service_role만 접근 (RLS 활성화 시 anon/auth 차단)
-- ──────────────────────────────────────────────
ALTER TABLE "RateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrawlLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prediction" ENABLE ROW LEVEL SECURITY;
-- 별도 policy 없음 → service_role 키로만 접근 가능

-- ──────────────────────────────────────────────
-- 14. 어드민 계정 isAdmin 설정
--     ★ 아래 이메일을 본인 사업자번호로 변경 후 실행
-- ──────────────────────────────────────────────
-- UPDATE "User" SET "isAdmin" = true
-- WHERE "supabaseId" = (
--   SELECT id::text FROM auth.users WHERE email = '사업자번호10자리@naktal.biz' LIMIT 1
-- );
