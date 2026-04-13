const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8');
const get = k => { const m = env.match(new RegExp(k+'=["\'"]?([^"\'"\n]+)')); return m?m[1].trim():''; };
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
(async () => {
  // contains 테스트
  const { data, error } = await sb.from('Announcement')
    .select('id,konepsId,category,subCategories')
    .contains('subCategories', ['조경식재공사'])
    .limit(5);
  console.log('contains 결과:', error?.message ?? 'ok', '건수:', data?.length);
  console.log(JSON.stringify(data?.slice(0,2), null, 2));

  // overlaps 테스트
  const { data: d2, error: e2 } = await sb.from('Announcement')
    .select('id,konepsId,subCategories')
    .overlaps('subCategories', ['조경식재공사'])
    .limit(5);
  console.log('\noverlaps 결과:', e2?.message ?? 'ok', '건수:', d2?.length);
  console.log(JSON.stringify(d2?.slice(0,2), null, 2));

  // 아무 subCategories나 있는 공고
  const { data: d3 } = await sb.from('Announcement')
    .select('id,konepsId,subCategories')
    .not('subCategories', 'eq', '{}')
    .gte('deadline', new Date().toISOString())
    .limit(3);
  console.log('\n부종 있는 진행공고 샘플:', JSON.stringify(d3, null, 2));
})();
