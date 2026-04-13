const r = require('C:/01 Ai/23 Naktal/naktal/result.json');
const items = r.data || [];
// subCategories에 조경식재공사가 있는 공고 (부종 매칭)
const subMatch = items.filter(x => Array.isArray(x.subCategories) && x.subCategories.includes('조경식재공사'));
// 주종이 조경식재공사가 아니지만 부종에 있는 공고
const subOnly = subMatch.filter(x => !x.category?.includes('조경식재공사'));
console.log('전체:', r.total, '건 | 샘플', items.length, '건');
console.log('부종 매칭(subCategories에 조경식재공사):', subMatch.length, '건');
console.log('부종 전용(주종≠조경식재공사):', subOnly.length, '건');
subOnly.slice(0, 5).forEach(x => console.log(' -', x.konepsId, '주종:', x.category, '부종:', x.subCategories));
// subCategories 샘플 확인
console.log('\n--- subCategories 샘플 (처음 3건) ---');
items.slice(0, 3).forEach(x => console.log(' -', x.konepsId, 'subCategories:', x.subCategories));
