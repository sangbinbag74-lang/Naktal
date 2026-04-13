const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('apps/crawler/../../.env','utf8');
const getEnv = k => { const m = env.match(new RegExp(k+"=[\"']?([^\"'\\n]+)")); return m?m[1].trim():''; };
const sb = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));
(async () => {
  const now = new Date().toISOString();
  const { data: active } = await sb.from('Announcement').select('rawJson').eq('category','시설공사').gte('deadline',now).limit(1);
  const { data: closed } = await sb.from('Announcement').select('rawJson').not('subCategories','eq','{}').lt('deadline',now).limit(1);
  const activeKeys = new Set(Object.keys(active?.[0]?.rawJson ?? {}));
  const closedKeys = new Set(Object.keys(closed?.[0]?.rawJson ?? {}));
  const onlyInClosed = Array.from(closedKeys).filter(k => activeKeys.has(k) === false);
  const onlyInActive = Array.from(activeKeys).filter(k => closedKeys.has(k) === false);
  console.log('active 키 수:', activeKeys.size, '| closed 키 수:', closedKeys.size);
  console.log('closed에만 있는 키:', onlyInClosed.sort().join(', '));
  console.log('active에만 있는 키:', onlyInActive.sort().join(', '));
  // 마감 공고의 mainCnsttyNm, subsiCnsttyNm1 값 직접 확인
  console.log('\n마감 공고 mainCnsttyNm:', closed?.[0]?.rawJson?.mainCnsttyNm);
  console.log('마감 공고 subsiCnsttyNm1:', closed?.[0]?.rawJson?.subsiCnsttyNm1);
  console.log('진행 공고 mainCnsttyNm:', active?.[0]?.rawJson?.mainCnsttyNm);
  console.log('진행 공고 subsiCnsttyNm1:', active?.[0]?.rawJson?.subsiCnsttyNm1);
})();
