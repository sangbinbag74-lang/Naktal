# 🎨 Claude Design 프롬프트 — naktal.me 메인 페이지 리디자인

> 사용법: claude.ai → Design 메뉴 → 아래 전체 블록 복사-붙여넣기

---

## CONTEXT

You are redesigning the **landing page** for **Naktal.ai (낙찰AI)**, a Korean government procurement (나라장터/G2B) bid-price AI analysis service.

**Current state (April 2026):**
- Live at https://naktal.me
- Active beta service, paying customers
- Currently running Next.js 16 App Router + inline styles (NOT TailwindCSS)
- Fully collected ~6.6M public bid announcements + 7.1M opening results
- Main target: Korean construction/service/goods bidders (SME ~ mid-size)

**My founder situation:** Heavy personal debt, 4th data crawl iteration just finished. Current site is visually outdated and contains claims that don't match the actual product anymore. Need a **bold, credible, conversion-focused** redesign.

---

## PRODUCT TRUTH (facts to reflect accurately)

### 4 Core Engines (current truth — CLAUDE.md aligned)

| # | Engine | What it does | Plan |
|---|---|---|---|
| CORE 1 | **사정율 기반 최적 투찰가 예측** | Predicts optimal bid price via 발주처×업종×예산×지역 사정율 statistics. Monte Carlo 5,000 simulation for win probability. | 무료 3회/월, 스탠다드 30회, 프로 무제한 |
| CORE 2 | **복수예가 번호 역이용 AI** | For multi-reserve-price bids: learns which numbers get picked (from 7.1M historical 개찰 records), recommends low-frequency combos. | Same tiered access |
| CORE 3 | **실시간 참여자 수 예측** | From 3h before deadline, crawls live 나라장터 participant count. Updates number recommendations live. | **Pro only** |
| CORE 4 | **적격심사 통과 계산기** | Evaluates company eligibility by 실적/업종 automatically. | Basic: free, Full: 스탠다드+ |

### Real stats to feature (updated 2026-04-21)

- **6,651,568** cumulative announcements analyzed
- **7,171,237** opening results (복수예가 15개 데이터) for CORE 2
- **1,231,795** pre-announcement records (사전규격)
- **438,009** announcement changes tracked
- Data range: **2002-01 ~ 2026-04** (24+ years)
- 17 G2B OpenAPI endpoints integrated

### Existing design system (MUST preserve)

```
Primary:   #1B3A6B (navy-800)
Sidebar:   #0F1E3C (navy-900)
Background: #F0F2F5
Card:      #fff / border #E8ECF2 / radius 12~14px
Accent:    #60A5FA (blue-400)
Success:   #059669
Warning:   #D97706
Danger:    #DC2626
Font:      Pretendard (CDN)
CTA Button: 50px height, radius 12px, bg #1B3A6B → hover #152E58
```

D-day badges: D-1~2 #DC2626 / D-3~5 #C2410C / D-6~10 #1E40AF / D-11+ #475569

---

## PROBLEMS WITH CURRENT LANDING PAGE (what to fix)

### 1. **Feature presentation inaccuracy**
- Shows only 3 cards labeled "CORE 1" / "CORE 2" → confusing (actually has 4 cores)
- Badge "CORE 1" used for both 사정율 예측 AND 낙찰 확률 시뮬 → same engine, looks duplicated
- **CORE 3 (실시간 참여자) and CORE 4 (적격심사) completely absent from hero**

### 2. **Outdated statistics**
- Current: "누적 분석 공고 42,000+건" → **actual: 6.65M**
- Current: "평균 예측 오차 ±0.8%p" → unverified, remove or replace with verified metric
- Footer: "© 2025" → should be 2026

### 3. **Competitor comparison has legal risk**
- Table directly names 인포21C, 고비드 with ❌ marks
- No legal basis → replace with differentiation story (not head-to-head names)

### 4. **Weak interactive demo**
- Right-side demo uses fixed sajung=98.9%, std=0.8 → feels canned
- Sliders exist but initial wow-factor limited
- Shows "0%" too easily → discourages

### 5. **No social proof / real usage signals**
- No customer logos, no testimonials
- No live counter of today's analyzed announcements
- No scrolling ticker of recent 공고 being analyzed

### 6. **Design is visually dated**
- Heavy inline styles, no motion, no hover depth
- Gradient hero feels 2020-era
- No micro-interactions

### 7. **Missing segmented CTA**
- Only generic "무료 시작하기"
- Should offer paths: 공사 / 용역 / 물품 / 외자 업종별

### 8. **Dashboard preview absent**
- Landing doesn't show what the product actually looks like inside
- Need screenshot/mock of announcements list or analysis result

---

## DESIGN REQUIREMENTS

### Tone & Aesthetics
- **한국 B2B 프리미엄 SaaS** (Toss, 센드버드, 채널톡 수준)
- Credible, data-driven, trustworthy (this handles real money decisions)
- Modern 2026 — subtle motion, generous whitespace, clear typographic hierarchy
- **Not flashy** — founders are dealing with real debt, customers are dealing with real bids

### Sections to design (new structure)

**1. Sticky Header**
- Logo (낙찰AI) + 4 nav: 기능 / 요금제 / FAQ / 로그인
- Right: "무료 시작하기" primary button
- Height 60-64px, subtle shadow on scroll

**2. Hero**
- Headline: "이 공고, 얼마에 넣어야 낙찰될까요?" (keep — it works)
- Sub: Live counter — "오늘 {X}건의 공고가 분석되고 있습니다" (live-feel)
- Bold stat badges (single row): `6,651,568 공고` / `7,171,237 개찰 데이터` / `24년치 누적`
- Right side: Redesigned interactive demo OR dashboard screenshot mockup
- Primary CTA: "무료로 시작하기" + Secondary "데모 보기" (scroll to demo section)
- Keep the disclaimer bar right below hero ("AI 분석 결과는 참고용...")

**3. 4 CORE Engines (not 3)**
- Grid of 4 cards, 2×2 on desktop / stacked on mobile
- Each card: icon, badge (CORE 1-4), title, short description, micro-diagram or key metric
- Card 1 CORE 1: 사정율 예측 (→ Monte Carlo viz)
- Card 2 CORE 2: 복수예가 번호 AI (→ 15개 번호 회피 viz)
- Card 3 CORE 3: 실시간 참여자 모니터 (→ "Pro 전용" badge, live graph mini)
- Card 4 CORE 4: 적격심사 계산기 (→ 체크리스트 mini)

**4. How it works (3-step)**
- Step 1: 공고 선택 (naktal.me에서 발주처·업종·예산 조건으로 공고 탐색)
- Step 2: AI 분석 (4개 엔진이 투찰가·확률·번호·적격 계산)
- Step 3: 투찰 결정 (근거 데이터와 함께 최종 결정)

**5. Live stats block**
- Real-time counters (can use static numbers but animate on scroll)
- "오늘 분석된 공고" / "이번 주 낙찰자 데이터 학습" / "서비스 중 업종 150+"
- Source footnote: "2026-04 나라장터 공공데이터 기준"

**6. Dashboard preview**
- Realistic mockup of /announcements page (공고 목록) with D-day badges
- Or /announcements/[id] 상세 3탭 구조 (투찰전략/경쟁분석/참여적합성)
- Annotated (화살표 + 설명) — "사정율", "예상 낙찰률", "번호 전략 버튼"

**7. Pricing (light version — full on /pricing)**
- 3 columns: 무료 / 스탠다드 / 프로
- Show main differentiator per plan (e.g., Pro: CORE 3 실시간)
- CTA: "자세히 보기 →" links to /pricing

**8. FAQ teaser**
- 3-4 most common questions (accordion)
- Link to full /faq

**9. CTA section**
- Big "지금 무료로 시작하기" with free plan benefits
- Secondary: "문의하기" (mailto or form)

**10. Footer**
- 사업자 정보: 주식회사 호라이즌 / 박상빈 / 398-87-03453
- 주소: 대전광역시 유성구 장대로 106, 2층 제이321호
- Links: 개인정보처리방침 / 이용약관 / FAQ / support@naktal.me
- © 2026 낙찰AI

---

## HARD CONSTRAINTS (must not violate)

1. **⚠️ Never use the phrase "낙찰 보장"** anywhere (illegal/misleading)
2. **Disclaimer visible on every conversion point**: "AI 분석 결과는 참고용이며 낙찰을 보장하지 않습니다"
3. **Keep existing brand navy (#1B3A6B)** as primary — don't suggest purple/teal rebrand
4. **Pretendard font** only (CDN)
5. **사업자등록번호 기반 가입** — signup flow stays the same (no social login)
6. **No competitor product names** (인포21C, 고비드) in final design — use generic "기존 서비스" if comparing
7. **Mobile-first responsive** — 375px, 768px, 1024px, 1440px breakpoints
8. **Accessibility**: WCAG AA color contrast, alt text, aria-labels, keyboard nav

---

## OUTPUT I NEED

Please produce:

1. **High-fidelity mockup** (desktop + mobile) of all 10 sections
2. **Design tokens** reusable across the product (colors, spacing, typography, shadows, radii)
3. **Component library** extracted: Header, Hero, FeatureCard, StatCounter, DashboardPreview, PricingCard, FAQItem, FooterLink
4. **Production-ready handoff bundle** for Claude Code — target file: `apps/web/app/landing-page.tsx` (rewrite entirely, using either inline styles OR migrate to TailwindCSS v4 — your recommendation)
5. **Micro-interactions**: scroll animations, hover states, counter animations
6. **Copy recommendations** if any current Korean copy can be improved (keep tone: 신뢰감, 팩트 중심, 과장 금지)

Reference aesthetic: **Toss (toss.im), 채널톡 (channel.io), Linear (linear.app)** — clean B2B SaaS with data-density.

Let's make naktal.me look as trustworthy as the data behind it deserves.
