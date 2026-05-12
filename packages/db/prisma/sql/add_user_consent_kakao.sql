-- 회원가입 신규 컬럼 (수신동의 + 카카오 본인인증)
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → RUN
-- 모두 IF NOT EXISTS 라 중복 실행 안전.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoVerifiedName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoVerifiedPhone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoVerifiedAt" TIMESTAMP(3);

-- kakaoId 유니크 인덱스 (NULL 허용, 중복 가입 방지)
CREATE UNIQUE INDEX IF NOT EXISTS "User_kakaoId_key" ON "User"("kakaoId") WHERE "kakaoId" IS NOT NULL;
