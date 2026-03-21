# Naktal.ai — Project Context (B안: 번호 전략 특화)

## ⚠️ 번호 분석 진입 규칙 (절대 변경 금지)
- POST /api/strategy/recommend 의 `annId`는 **필수 파라미터**
- annId 없는 요청 → 400 ANNOUNCEMENT_REQUIRED
- 단일예가 공고 → 422 NOT_MULTIPLE_PRICE
- 마감 공고 → 422 ANNOUNCEMENT_CLOSED
- **허용 진입점 2개만**: /announcements/[id] 공고 상세 하단 섹션, /folder 카드 버튼
- **금지**: 독립 /strategy 페이지 + 직접 조건 입력 (삭제됨)
- isMultiplePriceBid() 함수는 반드시 `@/lib/bid-utils`에서 import

## 서비스 한 줄 정의
"이 공고 몇 번 넣어야 해요?"를 데이터로 답하는 유일한 서비스.
⚠️ "낙찰 보장" 표현은 코드·UI·주석 어디에도 절대 사용 금지.

## 핵심 3대 엔진 (CORE)

### CORE 1 — 번호 역이용 AI
- 수만 건 개찰 데이터 → 번호별 선택 빈도 학습
- 고빈도 번호(상위 30%) 자동 회피, 저빈도 조합 추천
- 업종/금액/지역/시즌/참여자수 조건별 최적 조합 3세트 출력
- API: POST /api/strategy/recommend
- 플랜: 무료 월3회 / 스탠다드 월30회 / 프로 무제한

### CORE 2 — 실시간 참여자 수 예측 (Pro 전용)
- 마감 3시간 전부터 나라장터 참여 신청 현황 크롤링
- 예상 참여자 수 변화에 따라 번호 추천 실시간 갱신
- UI: /realtime (Pro 미가입 시 블러 + 업그레이드 배너)

### CORE 3 — 적격심사 통과 계산기
- 업체 실적 DB(CompanyProfile) 기반 자동 심사 가능성 산출
- API: POST /api/analysis/qualification
- 무료: 기본 / 스탠다드·프로: 전체

## 아키텍처
Next.js (App Router) + Supabase + Prisma + TailwindCSS v4
모노레포: turbo / apps/web / apps/crawler / packages/db / packages/types

## 요금제별 CORE 접근 권한
| 기능                   | 무료 | 스탠다드 | 프로 |
|------------------------|------|----------|------|
| CORE1 번호 추천        | 월3회 | 월30회  | 무제한 |
| CORE2 실시간 모니터    | ❌   | ❌       | ✅   |
| CORE3 적격심사 기본    | ✅   | ✅       | ✅   |
| CORE3 적격심사 전체    | ❌   | ✅       | ✅   |
| 알림 무제한            | ❌   | ✅       | ✅   |

## 디자인 시스템
- 폰트: Pretendard (CDN — orioncactus)
- 프라이머리: #1B3A6B (navy-800) / 사이드바 배경: #0F1E3C (navy-900)
- 페이지 배경: #F0F2F5 / 카드: #fff + radius 12~14px + border 1px #E8ECF2
- 강조 accent: #60A5FA (blue-400)
- 인풋: height 48px / border 1.5px / radius 10px / focus #1B3A6B
- 버튼 CTA: height 50px / radius 12px / bg #1B3A6B → hover #152E58
- D-day 뱃지: D-1~2 #DC2626 / D-3~5 #C2410C / D-6~10 #1E40AF / D-11+ #475569
- shadcn 기본 blue 색상 사용 금지 → naktal-navy로 교체
- AI 분석 면책 고지 삭제·숨김·tiny 처리 절대 금지

## 네비게이션 구조
[핵심 기능]
  공고 목록       → /announcements     ★ 메인 진입점 (번호 분석은 공고 상세에서)
  적격심사 계산기 → /qualification
  실시간 모니터   → /realtime          (Pro 전용)

[내 활동]
  분석 이력       → /history           (구 /strategy 독립 페이지 삭제됨)
  서류함          → /folder
  알림 설정       → /alerts

[계정]
  내 업체 정보    → /profile
  요금제          → /pricing
  설정            → /settings

## DB 스키마 주요 모델
- User: 사용자 (사업자번호 기반)
- CompanyProfile: 업체 실적·업종 정보
- NumberRecommendation: 번호 추천 이력 (사용량 추적)
- ParticipantSnapshot: 실시간 참여자 수 스냅샷
- Announcement: 나라장터 공고
- BidResult: 낙찰 결과 (번호 빈도 학습 재료)
- CrawlLog: 크롤링 로그 + 역대 수집 커서

## plan-guard.ts Feature enum
- CORE1_NUMBER_RECOMMEND: 번호 추천 (무료3/스탠다드30/프로∞)
- CORE2_REALTIME_MONITOR: 실시간 모니터 (프로 전용)
- CORE3_QUALIFICATION_BASIC: 적격심사 기본
- CORE3_QUALIFICATION_FULL: 적격심사 전체 (스탠다드+)
- UNLIMITED_ALERTS: 알림 무제한

## 인증
Supabase Auth (@supabase/ssr 전용)
- 사업자번호 기반: `{10자리}@naktal.biz` 형식 (이메일 노출 금지)
- lib/supabase/client.ts: createBrowserClient
- lib/supabase/server.ts: createServerClient
- middleware.ts: 라우트 가드

## 결제
포트원(PortOne) v2 SDK — ⚠️ 구버전 아임포트 절대 사용 금지
- 지원: 카카오페이 / 네이버페이 / 토스페이 / 신용카드

## 어드민 (/admin)
- 접근: User.isAdmin=true + ADMIN_SECRET_KEY 헤더
- 모든 조작: AdminLog 테이블 기록

## 크롤러 (apps/crawler)
- G2B OpenAPI 기반 (Playwright 제거됨)
- 전체 역대 수집: apps/crawler/src/bulk-import.ts
- Vercel Cron: /api/cron/sync-g2b (일 1회, 12개월씩)

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
NEXT_PUBLIC_SITE_URL=https://naktal.me
G2B_API_KEY=
KONEPS_API_KEY=          # G2B_API_KEY와 동일 값 사용 가능 (공공데이터포털)
KONEPS_API_BASE=https://apis.data.go.kr/1230000
KONEPS_DAILY_LIMIT=1000  # 일일 API 호출 한도
SENTRY_DSN=              # Sentry 오류 모니터링 (npx @sentry/wizard로 설정)
SENTRY_AUTH_TOKEN=       # Sentry 소스맵 업로드용
KAKAO_API_KEY=           # 카카오 알림톡 API 키 (Kakao Developers)
KAKAO_TEMPLATE_ANN=      # 새 공고 알림 템플릿 ID
KAKAO_TEMPLATE_OUTCOME=  # 결과 입력 요청 템플릿 ID
KAKAO_TEMPLATE_DEADLINE= # 마감 임박 알림 템플릿 ID

## 컨벤션
- 파일명: kebab-case / 컴포넌트: PascalCase
- API Route: apps/web/app/api/ 하위
- 에러: console.error만 사용, alert 금지
- 금액 단위: 항상 원(KRW), 소수점 없음
- shadcn/ui 컴포넌트 원본 수정 금지 → 래핑

## 현재 상태: 실서비스 운영 중 (B안 베타)
배포: Vercel → naktal.me (vercel.json 루트에 있음)

## 운영 스케줄
매일 03:00 KST   — /api/cron/sync-g2b (공고 + 낙찰결과 수집)
GitHub Actions  — bulk-import.yml (2012~ 역대 데이터, 수동 실행)
pg_cron (선택)  — 실시간 참여자 스냅샷 (snapshotParticipants 함수)

## 장애 대응
CORE 1 DB 데이터 부족 → estimated-v1 폴백 + isEstimated:true UI 표시
나라장터 API 장애 → CrawlLog 기록 후 다음 배치에서 재시도

## 현재 스프린트: B안 Step 2 — 실제 엔진 구현

### Step 1 완료 ✅
- [x] Prisma 스키마 B안 확장 (CompanyProfile, NumberRecommendation, ParticipantSnapshot)
- [x] CLAUDE.md B안 전면 재작성
- [x] plan-guard.ts B안 Feature enum 업데이트
- [x] 사이드바 네비게이션 B안 재편
- [x] 대시보드 B안 지표·섹션 교체
- [x] /strategy 번호 전략 페이지 (Mock API → Step 2에서 실제 엔진으로 교체)
- [x] /qualification 적격심사 계산기
- [x] /profile 내 업체 정보 페이지
- [x] /realtime 실시간 모니터 UI
- [x] 공고 목록 "번호 전략" 버튼 교체
- [x] apps/ml XGBoost 삭제, analysis/ 페이지 삭제

### Step 2 완료 ✅
- [x] NumberSelectionStat Prisma 모델 추가
- [x] apps/crawler/src/api/koneps-client.ts — 5개 KONEPS API 메서드
- [x] apps/crawler/src/scrapers/realtime-participants.ts — 참여자 스냅샷 수집
- [x] apps/web/lib/core1/frequency-engine.ts — CORE 1 빈도 분석 엔진
- [x] /api/strategy/recommend — Mock → 실제 주파수 분석으로 교체
- [x] /api/analysis/qualification — Mock → 실제 적격심사 로직으로 교체
- [x] /api/realtime/participants — CORE 2 참여자 조회 API
- [x] /api/realtime/recommend-live — CORE 2 실시간 번호 갱신 API
- [x] /realtime 페이지 — Supabase Realtime 구독 연동

## DB 스키마 추가 모델
- NumberSelectionStat: 투찰률 millidigit 빈도 통계 캐시
  - category/budgetRange/region/bidderRange 기준 분류
  - rateInt: 투찰률 × 1000 (예: 87345 = 87.345%)
  - winCount/totalCount: 낙찰/전체 건수

## Step 3 완료 ✅ — 배포 + 보안 + 베타 오픈
- [x] Prisma: RateLimit + BetaApplication 모델 추가
- [x] 랜딩 페이지 (app/landing-page.tsx) — Hero, 기능 소개, 경쟁사 비교, 베타 신청 폼
- [x] app/page.tsx — 비로그인: 랜딩, 로그인: /dashboard 리다이렉트
- [x] /api/beta/apply — 베타 신청 API (중복 검사 + BetaApplication 저장)
- [x] /privacy, /terms — 법적 필수 페이지 (개인정보처리방침, 이용약관)
- [x] components/layout/Footer.tsx — 사업자 정보 + 법적 링크
- [x] lib/rate-limit.ts — Supabase 기반 속도 제한 헬퍼 (Redis 불필요)
- [x] /api/strategy/recommend — 분당 10회 속도 제한 + Retry-After 헤더
- [x] app/layout.tsx — SEO 메타데이터, OpenGraph, metadataBase
- [x] app/robots.ts + app/sitemap.ts — 크롤러 제어 + 사이트맵
- [x] next.config.js — 보안 헤더 (X-Frame-Options, CSP, nosniff 등)
- [x] vercel.json — 빌드 설정 + maxDuration + Cron (03:00 KST)
- [x] CLAUDE.md — 현재 상태, 운영 스케줄 업데이트

## Step 4 완료 ✅ — 피드백 루프 + 자기개선 + 정식 런치
- [x] Prisma: BidOutcome + OrgBiddingPattern 모델 + OutcomeResult enum 추가
- [x] /strategy/outcome/[recommendId] — 투찰 결과 입력 UI + API
- [x] /history — 투찰 이력 대시보드 (통계 + 타임라인)
- [x] apps/crawler/src/pipelines/auto-outcome.ts — 자동 결과 수집 파이프라인
- [x] lib/core1/org-pattern.ts — 발주처별 빈도 패턴 오버레이 (CORE 1 v2)
- [x] lib/notifications/kakao.ts — 카카오 알림톡 + 이메일 폴백
- [x] /admin/model — 모델 적중률 모니터링 대시보드
- [x] /admin/outcomes — 결과 데이터 관리
- [x] /faq — FAQ 페이지
- [x] public/manifest.json — PWA 설정
- [x] Sidebar.tsx — 투찰 이력 + 어드민 섹션 추가
- [x] app/layout.tsx — PWA manifest 링크 추가

## ⚠️ 개발자 직접 처리 필요 (코드 외)
1. **Supabase RLS**: SQL Editor에서 Task 1 SQL 실행 (CLAUDE.md 상단 Step 3 스펙 참고)
2. **Prisma 마이그레이션**:
   - `pnpm prisma migrate dev --name add-rate-limit-beta`
   - `pnpm prisma migrate dev --name add-bid-outcome-org-pattern`
3. **통신판매업 신고** (정부24) → 신고번호 푸터에 기재
4. **포트원 실서비스 모드 전환** → Vercel ENV 업데이트
5. **Sentry 설정**: `npx @sentry/wizard@latest -i nextjs` → SENTRY_DSN 등록
6. **Vercel ENV 22개 등록** (CLAUDE.md 환경변수 목록 참고, KAKAO_* 4개 추가)
7. **베타 모집**: 건설협회 커뮤니티, 네이버 카페, 지인 소개
8. **사업자 정보 업데이트**: landing-page.tsx + Footer.tsx의 "000-00-00000" 실제 번호로 교체
9. **카카오 알림톡**: Kakao Developers 앱 등록 → 템플릿 심사 → KAKAO_* 환경변수 등록
10. **pg_cron 설정**: Supabase SQL Editor에서 `18:00 KST auto-outcome` 크론 등록

## CORE 1 알고리즘 메모
- 낙찰률(sucsfbidRate) 소수점 이하 3자리(millidigit) 추출
- 0~999 범위 빈도맵 구성 → 상위 30% 고빈도 제거
- 나머지 저빈도 구간을 3개 존으로 분리해 combo 추천
- DB 데이터 30건 미만이면 통계 추정값(estimated-v1) 반환
- freqMap을 프론트로 전달 → 히트맵 시각화
