# v2 완료 후 실행 계획

**v2 완료 예상: 2026-04-22 04:00~06:00 KST**

---

## 🔴 1순위: reparse v7 (자동 시작)

**목적:** 7개 rawJson 필드를 Announcement 컬럼으로 승격
- sucsfbidLwltRate (낙찰하한율) — 현재 3.97% → **목표 95%+**
- bidNtceDtlUrl — 6.26% → 95%+
- ntceInsttOfclTelNo — 5.95% → 95%+
- jntcontrctDutyRgnNm — 0% → 95%+
- ciblAplYn — 2.24% → 95%+
- mtltyAdvcPsblYn — 2.24% → 95%+
- prtcptPsblRgnNm — 실측 rawJson 0% (제외)

**스크립트:** `apps/crawler/src/scripts/reparse-rawjson.ts` v7 (이미 작성됨)

**실행:**
```bash
pnpm ts-node src/scripts/reparse-rawjson.ts
```

**ETA: 5~10시간** (Large 등급이라 단독 단일월 HOT 패턴 빠름)

---

## 🟠 2순위: 누락 월 재실행 (29건)

### 문제
`audit-missing-data.ts` 결과 29개월에 **150페이지 초과 중단** 발생. 주로 **ChgHstryServc/Thng** 변경공고 일부 누락.

### 수정 필요
**파일:** `apps/crawler/src/bulk-import-extras-v2.ts` + `apps/crawler/src/bulk-missing-apis.ts`  
**수정:** `fetchAll` 함수의 `if (pageNo > 150)` → `if (pageNo > 500)`

### 재실행 목록

**missing (2002~2014)** — 5개월:
```bash
pnpm ts-node src/bulk-missing-apis.ts --from=201012 --to=201012
pnpm ts-node src/bulk-missing-apis.ts --from=201112 --to=201112
pnpm ts-node src/bulk-missing-apis.ts --from=201212 --to=201212
pnpm ts-node src/bulk-missing-apis.ts --from=201312 --to=201312
pnpm ts-node src/bulk-missing-apis.ts --from=201412 --to=201412
```

**v2 (2015~2021)** — 24개월:
```bash
for ym in 201511 201601 201602 201611 201701 201702 201711 201911 \
          202001 202002 202003 202004 202005 202006 202007 202009 202010 202011 202101; do
  pnpm ts-node src/bulk-import-extras-v2.ts --from=$ym --to=$ym
done
```

**ETA: 2~3시간** (월당 5분 × 29)

---

## 🟡 3순위: 타임아웃 월 재확인

- 2009-06, 2009-07 (v1 bulk-extras): 이미 v1/v2가 처리했으나 timeout 1회 발생 → check-progress 확인 후 필요 시 재실행
- 2016-03, 2016-04 (v2): v2 첫 시도에서 timeout → v2 재시작 시 성공 여부 확인

**체크:**
```bash
pnpm ts-node src/scripts/audit-missing-data.ts
```

---

## 🟢 4순위: 최종 검증

### DB 채움율 확인
```bash
pnpm ts-node src/scripts/check-progress-full.ts
pnpm ts-node src/scripts/plan-vs-actual.ts
pnpm ts-node src/scripts/check-avalue-years.ts
```

### 플랜 목표 달성 여부
- [ ] subCategories ≥ 60% (플랜 95%는 G2B 물품 API 한계로 불가능)
- [ ] bsisAmt ≥ 85%
- [ ] sucsfbidLwltRate ≥ 95% (reparse v7 후)
- [ ] bidNtceDtlUrl ≥ 95%
- [ ] aValueTotal ≥ 2% (G2B 한계)
- [ ] BidOpeningDetail ≥ 700만 (이미 달성)
- [ ] AnnouncementChgHst ≥ 500K (재실행 후)
- [ ] PreStdrd ≥ 1M (이미 달성)

### UI 실제 동작 검증
- [ ] naktal.me 공고 목록 업종 필터 — "조경식재공사" 등 결과 반환 확인
- [ ] SIMILAR_CATEGORIES 확장 OR 쿼리 정상 작동
- [ ] 공고 상세 페이지 A값/기초금액 표시
- [ ] CORE 1 사정율 엔진 동작

---

## 🔵 5순위: Supabase 다운그레이드

**비용 현황:**
- Large 사용: 약 50시간 (Apr 19 ~ Apr 22 예상)
- 시간당 $0.1517 × 50h = **$7.59**
- 총 이번달 청구 예상: **$13.68 (Micro 기본) + $7.59 = ~$21**

**다운그레이드:**
1. Supabase Dashboard → Project Settings → Compute and Disk
2. **Micro** 선택 → 확인
3. 즉시 적용 (다운타임 없음)

⚠️ **주의:** 다운그레이드 후 reparse v7/누락 재실행이 다시 느려질 수 있음 → **모든 DB 작업 완료 후에만 다운그레이드**

---

## 🟣 6순위: Claude Design 리디자인 (선택)

**준비:** `docs/claude-design-prompt.md` 작성 완료

**절차:**
1. claude.ai → Design 메뉴
2. 프롬프트 전체 복사 → 실행
3. 결과 "Send to Claude Code" → handoff bundle 획득
4. `apps/web/app/landing-page.tsx` 교체
5. git commit + push → Vercel 자동 배포

---

## 🟣 7순위: 증분 크롤러 검증

**sync-g2b (일일 cron):** 
- 파일: `apps/web/app/api/cron/sync-g2b/route.ts`
- 현재 g2b-announcement.ts의 7필드 승격이 자동 되는지 확인
- **개선:** 새 공고 저장 후 자동으로 11개 보조 API(v2 대상) 실행 추가

**수정:** `apps/crawler/src/fetchers/g2b-announcement.ts`의 parseSubCategories를 **용역/물품** 공고에도 적용하도록 확장

---

## 📋 실행 순서 (체인)

```
[0:00] v2 완료 자동 감지
  ↓
[0:05] PG 세션 정리 + Node 좀비 kill
  ↓
[0:10] audit-missing-data.ts → 최종 누락 리스트
  ↓
[0:15] fetchAll pageNo 150 → 500 수정 + 커밋
  ↓
[0:20] reparse v7 시작 (백그라운드)
  ↓ (동시 병렬 가능)
[0:20] 누락 29월 재실행 (순차)
  ↓
[3:00] 누락 재실행 완료
  ↓
[8:00] reparse v7 완료
  ↓
[8:10] check-progress-full + plan-vs-actual 최종 확인
  ↓
[8:15] UI 수동 검증 (사용자)
  ↓
[8:30] Supabase Micro 다운그레이드 (사용자)
```

**총 예상: v2 완료 후 8~10시간** → 2026-04-22 12:00~16:00 최종 완료

---

## 🤖 자동 실행 준비

v2 완료 감지 wakeup 예약 + 완료 시 자동으로:
1. 좀비 정리
2. audit 실행
3. pageNo 수정
4. reparse v7 시작
5. 누락 재실행 체인

에러 발생 시에만 사용자 알림.

---

## ⚠️ 주의 사항

- **reparse v7 + 누락 재실행 동시 실행 시 IO 경합 가능** — Large 등급이라 괜찮지만 모니터링
- **reparse v7이 ChgHstryServc의 새로운 데이터를 덮어쓰지 않도록** 주의 (reparse는 Announcement만 건드림, 안전)
- **누락 재실행은 ON CONFLICT DO UPDATE로 안전** (ChgHst annId+chgNtceSeq UNIQUE)
