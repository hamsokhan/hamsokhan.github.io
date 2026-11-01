// Development-only stand-in for the model (npm run dev:mock). Every answer is
// marked demo and labelled «پاسخ نمونه» in the UI. Special chat inputs: a
// message containing «خطا» fails; «کند» waits 8 seconds (to test cancel).
import type { ModelOutputs, Section } from '../../shared/contract';
import { tokenize } from '../../shared/text';
import { EngineError } from './engine';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new EngineError('aborted'));
    });
  });

export async function mockSection(section: Section, misras: string[], signal?: AbortSignal): Promise<ModelOutputs[Section]> {
  await sleep(700, signal);
  const t = misras.map((m) => tokenize(m).map((x) => x.text));
  const ref = (m: number, i: number) => ({ misra: m, from: i, to: i, quote: t[m]?.[i] ?? '' });
  switch (section) {
    case 'simple':
      return { meaning: 'این یک معنی نمونه است که حالت آزمایشی ساخته؛ معنی واقعی بیت نیست.', feeling: 'حس نمونه برای آزمودن نمایش.', textNotes: [], unsure: false };
    case 'words':
      return { items: [{ ref: ref(0, 0), meaningHere: 'معنی نمونهٔ واژهٔ اول', note: null, alternatives: [{ meaning: 'معنای دیگر نمونه', why: 'برای آزمودن فهرست احتمال‌ها' }] }, { ref: ref(1, 1), meaningHere: 'معنی نمونهٔ واژهٔ دوم', note: 'یادداشت نمونه', alternatives: [] }] };
    case 'structure':
      return { prose: `${(t[0] ?? []).join(' ')} [بخش افزوده] ${(t[1] ?? []).join(' ')}`, additions: [{ text: 'بخش افزوده', why: 'نمونهٔ بخش حذف‌شده' }], note: null };
    case 'grammar':
      return { rows: [{ ref: ref(0, 0), type: 'اسم (نمونه)', role: 'نهاد (نمونه)', why: 'دلیل نمونه', certain: true }, { ref: ref(1, 0), type: 'حرف (نمونه)', role: 'پیوند (نمونه)', why: 'دلیل نمونه', certain: false }], note: null };
    case 'devices':
      return { items: [{ name: 'تشبیه (نمونه)', ref: ref(0, 1), explanation: 'توضیح نمونه', effect: 'اثر نمونه' }] };
    case 'deeper':
      return { readings: [{ kind: 'برداشت نمونه', text: 'متن برداشت نمونه', fit: 'چرا با شعر سازگار است (نمونه)' }], culturalNotes: ['اشارهٔ فرهنگی نمونه'], contextNote: null, caution: 'این‌ها پاسخ نمونه‌اند.' };
  }
}

export async function mockChat(message: string, signal?: AbortSignal): Promise<ModelOutputs['chat']> {
  await sleep(message.includes('کند') ? 8000 : 700, signal);
  if (message.includes('خطا')) throw new EngineError('upstream_unavailable');
  return { reply: `پاسخ نمونه به «${message}». این پاسخ از حالت آزمایشی است.`, canContinue: true };
}

export async function mockReflect(signal?: AbortSignal): Promise<ModelOutputs['reflect']> {
  await sleep(700, signal);
  return { whatIsRight: 'بخش درست برداشت شما (نمونه).', corrections: ['نکتهٔ نمونه'], defensible: true, note: null };
}
