const fs = require('fs'), path = require('path');
function loadEnv() {
  const env = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf-8');
  const result = {};
  for (const l of env.split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (v.startsWith('"') || v.startsWith("'")) {
      const q = v[0]; const end = v.indexOf(q, 1);
      v = end > 0 ? v.slice(1, end) : v.slice(1);
    } else { const ci = v.indexOf(' #'); if (ci > 0) v = v.slice(0, ci); v = v.trim(); }
    result[k] = v;
  }
  return result;
}
const ENV = loadEnv();
const KEY = ENV.G2B_ANNOUNCE_KEY;
console.log('API KEY (first 10):', KEY.slice(0, 10));

const url = new URL('https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk');
url.searchParams.set('serviceKey', KEY);
url.searchParams.set('numOfRows', '5');
url.searchParams.set('pageNo', '1');
url.searchParams.set('type', 'json');
url.searchParams.set('inqryDiv', '1');
url.searchParams.set('inqryBgnDt', '202603010000');
url.searchParams.set('inqryEndDt', '202604042359');

console.log('URL:', url.toString().slice(0, 200));

fetch(url.toString()).then(async res => {
  console.log('HTTP status:', res.status);
  const text = await res.text();
  console.log('Response (first 500):', text.slice(0, 500));
}).catch(e => console.error('Error:', e.message));
