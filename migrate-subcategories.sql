-- ============================================================
-- 부종공종(subCategories) 마이그레이션 SQL
-- Supabase SQL Editor에서 실행 (timeout 없음)
-- ============================================================

UPDATE "Announcement" a
SET "subCategories" = (
  SELECT COALESCE(
    array_agg(DISTINCT cat) FILTER (WHERE cat IS NOT NULL AND cat != ''),
    '{}'
  )
  FROM (
    SELECT CASE sub_raw
      WHEN '건축공사업'                               THEN '건축공사'
      WHEN '토건공사업'                               THEN '토건공사'
      WHEN '토목공사업'                               THEN '토목공사'
      WHEN '조경공사업'                               THEN '조경공사'
      WHEN '산업환경설비공사업'                       THEN '산업환경공사'
      WHEN '전기공사업'                               THEN '전기공사'
      WHEN '정보통신공사업'                           THEN '통신공사'
      WHEN '전문소방시설공사업'                       THEN '소방시설공사'
      WHEN '일반소방시설공사업(기계)'                 THEN '소방시설공사'
      WHEN '일반소방시설공사업(전기)'                 THEN '소방시설공사'
      WHEN '전문소방공사감리업'                       THEN '소방시설공사'
      WHEN '지반조성ㆍ포장공사업'                     THEN '지반조성포장공사'
      WHEN '포장공사업'                               THEN '지반조성포장공사'
      WHEN '보링ㆍ그라우팅ㆍ파일공사업'               THEN '지반조성포장공사'
      WHEN '실내건축공사업'                           THEN '실내건축공사'
      WHEN '금속창호ㆍ지붕건축물조립공사업'           THEN '실내건축공사'
      WHEN '금속구조물ㆍ창호ㆍ온실공사업'             THEN '실내건축공사'
      WHEN '철근ㆍ콘크리트공사업'                     THEN '철근콘크리트공사'
      WHEN '구조물해체ㆍ비계공사업'                   THEN '구조물해체비계공사'
      WHEN '석면해체.제거업'                          THEN '구조물해체비계공사'
      WHEN '상ㆍ하수도설비공사업'                     THEN '상하수도설비공사'
      WHEN '도장ㆍ습식ㆍ방수ㆍ석공사업'               THEN '도장습식방수석공사'
      WHEN '조경식재공사업'                           THEN '조경식재공사'
      WHEN '조경시설물설치공사업'                     THEN '조경시설물공사'
      WHEN '조경식재ㆍ시설물공사업'                   THEN '조경식재공사'
      WHEN '철강구조물공사업'                         THEN '철강재설치공사'
      WHEN '강구조물공사업'                           THEN '철강재설치공사'
      WHEN '기계설비ㆍ가스공사업'                     THEN '기계설비공사'
      WHEN '기계설비공사업'                           THEN '기계설비공사'
      WHEN '삭도ㆍ승강기ㆍ기계설비공사업'             THEN '기계설비공사'
      WHEN '승강기ㆍ삭도공사업'                       THEN '기계설비공사'
      WHEN '가스난방공사업'                           THEN '기계설비공사'
      WHEN '수중ㆍ준설공사업'                         THEN '수중공사'
      WHEN '수중공사업'                               THEN '수중공사'
      WHEN '준설공사업'                               THEN '준설공사'
      WHEN '철도ㆍ궤도공사업'                         THEN '철도궤도공사'
      WHEN '종합국가유산수리업(보수단청업)'           THEN '문화재수리공사'
      WHEN '전문국가유산수리업(보존과학업)'           THEN '문화재수리공사'
      WHEN '전문국가유산수리업(식물보호업)'           THEN '문화재수리공사'
      ELSE NULL
    END AS cat
    FROM (VALUES
      (a."rawJson"->>'subsiCnsttyNm1'),
      (a."rawJson"->>'subsiCnsttyNm2'),
      (a."rawJson"->>'subsiCnsttyNm3'),
      (a."rawJson"->>'subsiCnsttyNm4'),
      (a."rawJson"->>'subsiCnsttyNm5')
    ) AS t(sub_raw)
    WHERE sub_raw IS NOT NULL AND sub_raw != ''
  ) mapped
)
WHERE "rawJson" IS NOT NULL
  AND "rawJson"->>'subsiCnsttyNm1' IS NOT NULL
  AND "rawJson"->>'subsiCnsttyNm1' != '';
