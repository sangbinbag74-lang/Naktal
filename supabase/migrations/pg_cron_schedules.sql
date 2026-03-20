-- pg_cron 스케줄 등록
-- ⚠️  {SUPABASE_PROJECT_REF} 및 {SUPABASE_ANON_KEY} 를 실제 값으로 교체 후 실행
-- Supabase Dashboard → SQL Editor 에서 실행

-- pg_cron 확장 활성화 (이미 활성화된 경우 무시)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 기존 스케줄 제거 (재등록 시)
SELECT cron.unschedule('crawl-announcements') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'crawl-announcements'
);
SELECT cron.unschedule('retrain-model') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'retrain-model'
);

-- 1일 3회 크롤링 (06:00 / 12:00 / 18:00 KST = 21:00 / 03:00 / 09:00 UTC)
SELECT cron.schedule(
  'crawl-announcements',
  '0 21,3,9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://{SUPABASE_PROJECT_REF}.supabase.co/functions/v1/trigger-crawl',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 주간 ML 모델 재학습 (금요일 02:00 KST = 목요일 17:00 UTC)
SELECT cron.schedule(
  'retrain-model',
  '0 17 * * 4',
  $$
  SELECT net.http_post(
    url := 'https://{SUPABASE_PROJECT_REF}.supabase.co/functions/v1/trigger-crawl',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{"action": "retrain"}'::jsonb
  );
  $$
);

-- 등록 확인
SELECT jobname, schedule, command FROM cron.job;
