# Naktal.ai — Project Context

## 서비스 개요
나라장터 공공입찰 AI 분석 SaaS. 대한민국 전용 서비스.
⚠️ "낙찰 보장" 표현은 코드·UI·주석 어디에도 절대 사용 금지.

## 아키텍처
Next.js 16 (App Router) + Supabase + Prisma + TailwindCSS v4
모노레포: turbo / apps/web / apps/crawler / packages/db / packages/types

## 디자인 시스템
- 폰트: Pretendard (CDN — orioncactus)
- 프라이머리: #1B3A6B (navy-800) / 사이드바 배경: #0F1E3C (navy-900)
- 페이지 배경: #F0F2F5 / 카드: #fff + radius 12~14px + border 1px #E8ECF2
- 강조 accent: #60A5FA (blue-400)
- 컴포넌트 위치: components/naktal/ (BidBadge, BizNoInput, StatCard, BidCard, InfoTable, ScoreBar, AiResultCard, HistoryTable, FilterChip, UpgradeBanner)
- 인풋: height 48px / border 1.5px / radius 10px / focus #1B3A6B
- 버튼 CTA: height 50px / radius 12px / bg #1B3A6B → hover #152E58
- D-day 뱃지: D-1~2 #DC2626 / D-3~5 #C2410C / D-6~10 #1E40AF / D-11+ #475569
- shadcn 기본 blue 색상 사용 금지 → naktal-navy로 교체
- AI 분석 면책 고지 삭제·숨김·tiny 처리 절대 금지

## 공고 카드 필수 표시 항목
기초금액 / 예가범위 / 낙찰하한율 / 낙찰방법 / 적격심사구분
발주처평균낙찰률 / 마감일시 / D-day뱃지 / 계약방법 / 지역제한

## 공고 상세 필수 표시 항목
추정가격 / 예가하한상한 / 시공만점실적 / 적격심사배점
AI추천투찰률+신뢰구간 / 발주처낙찰이력 / 면책고지문구

## 인증
Supabase Auth (@supabase/ssr 전용)
- lib/supabase/client.ts : 클라이언트 컴포넌트용 (createBrowserClient)
- lib/supabase/server.ts : 서버 컴포넌트 / Route Handler용 (createServerClient)
- proxy.ts             : 라우트 가드 (미인증→/login, 인증→/dashboard)

## 결제
포트원(PortOne) v2 SDK
- 브라우저: @portone/browser-sdk (결제창 호출)
- 서버:     @portone/server-sdk  (결제 검증 Webhook)
- ⚠️ 구버전 아임포트(iamport / v1) 절대 사용 금지
- 지원 수단: 카카오페이 / 네이버페이 / 토스페이 / 신용카드
- 결제 플로우:
    1. 클라이언트에서 PortOne.requestPayment() 호출
    2. 서버 Route Handler에서 결제 검증 (@portone/server-sdk)
    3. 검증 성공 시 Subscription 테이블 업데이트

## 인증 방식 (Step 3 변경)
- 사업자번호 기반 로그인: `{10자리}@naktal.biz` 형식으로 Supabase에 저장
- 사용자에게는 사업자번호+비밀번호만 노출 (이메일 노출 금지)
- 회원가입 시 국세청 NTS API로 사업자번호 유효성 검증 (API 실패 시 graceful 허용)
- BizNoInput 컴포넌트: components/ui/biz-no-input.tsx (자동 하이픈 포매팅)

## 플랜 접근 제어
- lib/plan-guard.ts: canAccess(userPlan: Plan, feature: Feature): boolean
- Feature enum: REALTIME_ALERT | AI_RECOMMEND | PREEPRICE_ANALYSIS | COMPETITOR_WATCH | UNLIMITED_ALERTS
- 잠금 UI: components/ui/upgrade-banner.tsx → /pricing 링크

## ML 서버 (apps/ml)
- Python 3.11 + FastAPI + XGBoost + scikit-learn
- Modal.com에 배포 (무료 월 30시간 — 캐시로 최소화)
- 엔드포인트: POST /predict/bid-rate, POST /predict/preeprice
- 인증: x-api-key 헤더 (ML_API_KEY)
- 캐시: Prediction 테이블, 24시간 TTL (lib/ml-cache.ts)
- 학습: python apps/ml/pipelines/train.py (권장 최소 3,000건)
- 재학습: 매주 금요일 02:00 KST (Modal Cron 내장)
- ⚠️ "낙찰 보장" 표현 금지. AI 결과 화면에 면책 고지 필수.
- ⚠️ 복수예가 disclaimer 삭제·숨김·작은 글씨 금지.

## 어드민 (/admin)
- 접근: User.isAdmin=true + ADMIN_SECRET_KEY 헤더 두 겹 보호
- 레이아웃: app/(admin)/layout.tsx (배경 #0F172A, ADMIN MODE 빨간 뱃지)
- 가드: proxy.ts에서 isAdmin 확인, 아니면 /dashboard redirect
- 모든 /api/admin/* Route: requireAdmin() → admin-guard.ts
- 모든 조작은 AdminLog 테이블에 기록 → writeAdminLog()
- 최초 어드민 설정: Supabase SQL Editor에서
    UPDATE "User" SET "isAdmin" = true WHERE "bizNo" = '{사업자번호}';
- robots.txt: Disallow: /admin

## 크롤링 자동화
- Supabase Edge Function: supabase/functions/trigger-crawl/index.ts
- pg_cron: supabase/migrations/pg_cron_schedules.sql (KST 06:00/12:00/18:00)
- SQL의 {SUPABASE_PROJECT_REF}, {SUPABASE_ANON_KEY} 실제 값으로 교체 후 실행

## 환경변수 (필수)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=
ADMIN_SECRET_KEY=
NEXT_PUBLIC_PORTONE_STORE_ID=
NEXT_PUBLIC_PORTONE_CHANNEL_KEY=
PORTONE_SECRET_KEY=
PORTONE_WEBHOOK_SECRET=
NTS_API_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_SITE_URL=https://naktal.ai
ML_API_URL=
ML_API_KEY=

## DB
Prisma + Supabase PostgreSQL
스키마: packages/db/prisma/schema.prisma
⚠️ migrations/ 폴더 직접 수정 금지

## 크롤러 (apps/crawler)
- Playwright headless Chromium 사용
- 나라장터 공고/낙찰 결과 수집
- CSS 셀렉터 상수: scrapers/announcement.ts, scrapers/bid-result.ts의 SELECTORS 객체
- 실행: pnpm crawl:ann | pnpm crawl:result | pnpm crawl:all
- DB 저장: Supabase service role key로 upsert
- 요청 간격: 2~3.5초 randomDelay 적용
- 관리자 트리거: POST /api/admin/crawl (x-admin-secret 헤더)

## 컨벤션
- 파일명: kebab-case / 컴포넌트: PascalCase
- API Route: apps/web/app/api/ 하위
- 에러: console.error만 사용, alert 금지
- 금액 단위: 항상 원(KRW), 소수점 없음
- shadcn/ui 컴포넌트 원본 수정 금지 → 래핑해서 사용

## 현재 스프린트: Step 5 완료 — 어드민 대시보드
- [x] 모노레포 세팅 (turbo + pnpm)
- [x] Supabase 인증 연동 (@supabase/ssr)
- [x] 기본 레이아웃 UI (Sidebar, Header, Dashboard)
- [x] Prisma 스키마 초안 (포트원 필드 포함)
- [x] CLAUDE.md + .env.local.example
- [x] Prisma 마이그레이션 (CrawlLog 추가)
- [x] 크롤러 패키지 (apps/crawler)
- [x] 공고 수집 스크래퍼 (Playwright)
- [x] 낙찰 결과 수집 스크래퍼 (Playwright)
- [x] DB upsert 로직 (Supabase service role)
- [x] 관리자 크롤 트리거 API
- [x] 사업자번호 기반 인증 전환 (login / signup / forgot-password)
- [x] 국세청 NTS 사업자번호 검증 API
- [x] 공고 목록 UI (필터·무한스크롤)
- [x] 투찰률 통계 차트 (Recharts — 업종별·분포·참여업체수)
- [x] 이메일 알림 시스템 (Resend)
- [x] 포트원 v2 구독 결제 연동
- [x] 대시보드 실시간 통계 API
- [x] 플랜별 기능 접근 제어 (plan-guard.ts)
- [x] 업그레이드 배너 컴포넌트
- [x] XGBoost 투찰률 예측 모델 (Modal.com 서빙)
- [x] 복수예가 번호 통계 추천
- [x] AI 투찰 추천 UI (신뢰 구간 + 면책 고지)
- [x] ML API 24시간 캐시 (Prediction 테이블)
- [x] Supabase Edge Function (trigger-crawl)
- [x] pg_cron 자동화 (1일 3회 + 주간 재학습)
- [x] Vercel 배포 설정 (vercel.json)
- [x] Prisma isAdmin + AdminLog 스키마
- [x] 어드민 라우트 가드 (proxy.ts)
- [x] 어드민 레이아웃 (배경 #0F172A, ADMIN MODE 뱃지)
- [x] 운영 대시보드 지표 6개 + 7일 추이 차트
- [x] 사용자 관리 (목록·상세·플랜변경·비활성화·AdminLog)
- [x] 결제 내역 (목록·취소·CSV)
- [x] 크롤링 관리 (로그·수동실행·다음 예정 시각)
- [x] 공고 관리 (삭제·복구·핀 지정)
- [x] robots.txt Disallow: /admin

## 운영 배포 체크리스트
1. python apps/ml/pipelines/train.py → MAE 출력 확인
2. modal deploy apps/ml/modal_app.py → ML_API_URL 발급
3. supabase functions deploy trigger-crawl
4. Supabase SQL Editor에서 pg_cron_schedules.sql 실행 ({} 교체 필수)
5. vercel --prod 배포
6. Vercel 환경변수 15개 전체 등록
7. naktal.ai A레코드: 76.76.21.21 / CNAME www → cname.vercel-dns.com
8. 포트원 Webhook URL → https://naktal.ai/api/payment/webhook
9. 실결제 1건 테스트 후 환불
