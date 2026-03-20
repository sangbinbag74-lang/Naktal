# Naktal.ai — Project Context (B안: 번호 전략 특화)

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
  번호 전략       → /strategy          ★ 메인 진입점
  적격심사 계산기 → /qualification
  실시간 모니터   → /realtime          (Pro 전용)

[보조 기능]
  공고 목록       → /announcements
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
NEXT_PUBLIC_SITE_URL=https://naktal.ai
G2B_API_KEY=

## 컨벤션
- 파일명: kebab-case / 컴포넌트: PascalCase
- API Route: apps/web/app/api/ 하위
- 에러: console.error만 사용, alert 금지
- 금액 단위: 항상 원(KRW), 소수점 없음
- shadcn/ui 컴포넌트 원본 수정 금지 → 래핑

## 현재 스프린트: B안 Step 1 — 번호 전략 특화 전환
- [x] Prisma 스키마 B안 확장 (CompanyProfile, NumberRecommendation, ParticipantSnapshot)
- [x] CLAUDE.md B안 전면 재작성
- [x] plan-guard.ts B안 Feature enum 업데이트
- [x] 사이드바 네비게이션 B안 재편
- [x] 대시보드 B안 지표·섹션 교체
- [x] /strategy 번호 전략 페이지 (Mock API)
- [x] /qualification 적격심사 계산기 (Mock API)
- [x] /profile 내 업체 정보 페이지
- [x] /realtime 실시간 모니터 UI (Pro 배너)
- [x] 공고 목록 "번호 전략" 버튼 교체
- [x] apps/ml XGBoost 삭제
- [x] analysis/ 투찰 분석 페이지 삭제

## ⚠️ B안 Step 2 예정
- 번호 역이용 ML 모델 실제 구현 (apps/ml 재구축)
- 실시간 참여자 수 크롤러 구현
- 적격심사 로직 실제 구현 (CompanyProfile 연동)
