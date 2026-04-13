const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8');
const get = k => { const m = env.match(new RegExp(k+'=["\'"]?([^"\'"\n]+)')); return m?m[1].trim():''; };
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
(async () => {
  const cats = ['조경식재공사'];
  
  const [mainRes, subRes] = await Promise.all([
    sb.from('Announcement').select('id').in('category', cats).limit(5000),
    sb.from('Announcement').select('id').overlaps('subCategories', cats).limit(5000),
  ]);
  
  console.log('mainRes:', mainRes.error?.message ?? 'ok', '건수:', mainRes.data?.length ?? 0);
  console.log('subRes:', subRes.error?.message ?? 'ok', '건수:', subRes.data?.length ?? 0);
  
  const allIds = Array.from(new Set([
    ...(mainRes.data ?? []).map(d => d.id),
    ...(subRes.data ?? []).map(d => d.id),
  ]));
  console.log('allIds 총:', allIds.length);
  
  if (allIds.length > 0) {
    const { data, error } = await sb.from('Announcement')
      .select('id,konepsId,category,subCategories')
      .in('id', allIds)
      .limit(5);
    console.log('최종 결과:', error?.message ?? 'ok', '건수:', data?.length);
    data?.forEach(x => console.log(x.konepsId, x.category, JSON.stringify(x.subCategories)));
  }
})();
