# 입찰자 전체 투찰가 로컬 수집 + 등수 ML 플랜 (2026-06-05)

박상빈님 명시: "신규 플랜 작성하고 시작". 입찰자 전체 투찰가를 **E드라이브 로컬**에 수집 → 등수 ML → 관리자 "-N등" 표시. **Supabase 무영향, 비용 0.**

## 목표
- 관리자 정확도 페이지: "낙찰하한선 미달(이진)" → **"-N등(순위)"**
- 등수 기반 ML: 부적격(−등) ↓ + 1위 ↑ 동시 최적화 (궁극 목표)

## Phase 1 — 수집 (E드라이브)  ★ 지금 착수
- **소스**: `getDataSetOpnStdScsbidInfo` (PubDataOpnStdService 표준서비스)
- **파라미터**: `bsnsDivCd=3`(공사), `opengBgnDt`/`opengEndDt`(개찰일 1주씩, G2B 1주 제한), `numOfRows=999`
- **저장**: `E:\naktal-bidder\cnstwk\{YYYYMMDD}.jsonl` (주 시작일 기준 파일)
- **방식**: 주별 루프, 페이지 batch 30 + 실패 retry(1회), nohup+disown
- **검증**: 페이지마다 NULL(bidNtceNo/bidprcAmt) 즉시 stdout 보고 + 주별 행수 로그
- **범위**: 전구간(2002~현재) 공사 **전수**. 완료 후 용역(2)·물품(1)·외자(5)도 전수
- **ETA**: 약 45~60h (동시성 30 실측 한계 — numOfRows 999 max / 동시성 60+ G2B 거부 / worker 다중도 G2B 키 동시 한계, 전부 실측 완료)
- **비용 0, Supabase 안 건드림, 2026-05-13 사고 없음**

## Phase 2 — 데이터셋 (수집 후)
- JSONL → 공고별 [입찰자 투찰가 분포 + 낙찰하한가(sucsfLwstlmtRt·bssAmt) + 등수]
- 등수 라벨: 낙찰하한가 기준 **+N등(적격) / −N등(부적격)** (dqlfctnRsn 활용)

## Phase 3 — 등수 ML (★ 박상빈님 동의 후에만)
- 부적격(−등) 거리 + 1위 근접 직접 최적화 모델 + 백테스트
- ⚠️ ML 학습/가중치 변경 = `feedback_ml_change_user_consent_required` 동의 필수

## Phase 4 — "-N등" 표시
- 관리자 정확도 페이지 미달→등수 / 분석 공고 등수 계산(소량)

## 룰 (메모리 반영)
- 전수 100%, 범위 축소 X / 즉시 DB 적재 X → **파일만** / COUNT 아닌 표본 검증
- 가속 의무(동시성 30 + batch 30 + retry) / 로컬 nohup+disown / 미루기 X
- 30분마다 표 진행 보고(Monitor) / ML은 동의 필수

## 응답 필드 (저장 대상, 생략 금지)
bidNtceNo, bidNtceOrd, bidNtceNm, opengRank, bidprcCorpNm, bidprcCorpBizno, bidprcCorpCeoNm, bidprcAmt, bidprcRt, sucsfYn, dqlfctnRsn, sucsfLwstlmtRt, bssAmt, presmptPrce, rsrvtnPrce, opengDate, opengTm, fnlSucsfAmt, fnlSucsfRt, fnlSucsfCorpNm, dataBssDate (= 표준서비스 전체 필드 그대로)
