const fs = require('fs');
const env = fs.readFileSync('../../.env', 'utf-8');
let KEY = '';
for (const l of env.split('\n')) {
  const t = l.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (v.startsWith('"')) { const end = v.indexOf('"', 1); v = end > 0 ? v.slice(1, end) : v.slice(1); }
  if (k === 'G2B_ANNOUNCE_KEY') KEY = v;
}
console.log('KEY ok:', KEY.length > 10);

// 3일치 조회
const url = new URL('https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk');
url.searchParams.set('serviceKey', KEY);
url.searchParams.set('numOfRows', '3');
url.searchParams.set('pageNo', '1');
url.searchParams.set('type', 'json');
url.searchParams.set('inqryDiv', '1');
url.searchParams.set('inqryBgnDt', '202604010000');
url.searchParams.set('inqryEndDt', '202604042359');

fetch(url.toString()).then(async r => {
  console.log('status:', r.status);
  const t = await r.text();
  console.log(t.slice(0, 1000));
}).catch(e => console.error(e.message));
