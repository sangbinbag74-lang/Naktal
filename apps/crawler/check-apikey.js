const fs = require('fs');
const env = fs.readFileSync('../../.env', 'utf-8');
for (const l of env.split('\n')) {
  const t = l.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  const k = t.slice(0, i).trim();
  const v = t.slice(i+1).trim().replace(/^["']|["']$/g,'').trim();
  if (k === 'G2B_ANNOUNCE_KEY' || k === 'G2B_API_KEY') {
    console.log(k + ':', JSON.stringify(v));
    console.log('encoded:', encodeURIComponent(v));
  }
}
