// Local mock of the Hooshvare function, for UI development and tests only.
// Every response carries meta.demo = true, which the app labels «پاسخ نمونه».
// Special inputs: a chat message containing «خطا» returns an error; «کند»
// waits 8 seconds (to test cancel / late responses).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const library = JSON.parse(readFileSync(new URL('../src/data/library.json', import.meta.url), 'utf8')).poems;

const PORT = 8787;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokens = (s) => s.split(/\s+/).filter(Boolean);

function demoSection(section, misras) {
  const t0 = tokens(misras[0] ?? '');
  const t1 = tokens(misras[1] ?? '');
  const ref = (m, i) => ({ quote: (m ? t1 : t0)[i] ?? '', anchor: (m ? t1 : t0)[i] ? { misra: m, from: i, to: i } : null });
  switch (section) {
    case 'simple':
      return { meaning: 'این یک معنی نمونه است که سرور آزمایشی ساخته؛ معنی واقعی بیت نیست.', feeling: 'حس نمونه برای آزمودن نمایش.', textNotes: [], unsure: false };
    case 'words':
      return { items: [{ ref: ref(0, 0), meaningHere: 'معنی نمونهٔ واژهٔ اول', note: null, alternatives: [{ meaning: 'معنای دیگر نمونه', why: 'برای آزمودن فهرست احتمال‌ها' }] }, { ref: ref(1, 1), meaningHere: 'معنی نمونهٔ واژهٔ دوم', note: 'یادداشت نمونه', alternatives: [] }] };
    case 'structure':
      return { prose: `${t0.slice().reverse().join(' ')} [بخش افزوده] ${t1.join(' ')}`, additions: [{ text: 'بخش افزوده', why: 'نمونهٔ بخش حذف‌شده' }], note: null };
    case 'grammar':
      return { rows: [{ ref: ref(0, 0), type: 'اسم (نمونه)', role: 'نهاد (نمونه)', why: 'دلیل نمونه', certain: true }, { ref: ref(1, 0), type: 'حرف (نمونه)', role: 'پیوند (نمونه)', why: 'دلیل نمونه', certain: false }] };
    case 'devices':
      return { items: [{ name: 'تشبیه (نمونه)', ref: ref(0, 1), explanation: 'توضیح نمونه', effect: 'اثر نمونه' }] };
    case 'deeper':
      return { readings: [{ kind: 'برداشت نمونه', text: 'متن برداشت نمونه', fit: 'چرا با شعر سازگار است (نمونه)' }], culturalNotes: ['اشارهٔ فرهنگی نمونه'], contextNote: null, caution: 'این‌ها پاسخ نمونه‌اند.' };
  }
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  let body = '';
  for await (const c of req) body += c;
  const send = (obj, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  let r;
  try {
    r = JSON.parse(body);
  } catch {
    return send({ ok: false, error: { code: 'invalid_request', message: 'bad json' } }, 400);
  }
  const meta = { model: 'mock', promptVersion: 'p1', cached: false, usage: { inputTokens: 0, outputTokens: 0 }, demo: true };
  await sleep(700);
  const misras = r.poem?.kind === 'user' ? r.poem.verses[r.verse - 1] ?? [] : library.find((p) => p.id === r.poem?.id)?.verses[r.verse - 1]?.misras ?? [];
  if (r.type === 'explain') return send({ ok: true, data: demoSection(r.section, misras), meta });
  if (r.type === 'chat') {
    if (r.message.includes('خطا')) return send({ ok: false, error: { code: 'upstream_unavailable', message: 'mock error' } }, 503);
    if (r.message.includes('کند')) await sleep(8000);
    return send({ ok: true, data: { reply: `پاسخ نمونه به «${r.message}». این پاسخ از سرور آزمایشی است.`, canContinue: true }, meta });
  }
  if (r.type === 'reflect') return send({ ok: true, data: { whatIsRight: 'بخش درست برداشت شما (نمونه).', corrections: ['نکتهٔ نمونه'], defensible: true, note: null }, meta });
  if (r.type === 'report') return send({ ok: true, data: { received: true }, meta });
  send({ ok: false, error: { code: 'invalid_request', message: 'unknown type' } }, 400);
}).listen(PORT, '127.0.0.1', () => console.log(`mock hooshvare on http://127.0.0.1:${PORT}/hooshvare (demo responses only)`));
