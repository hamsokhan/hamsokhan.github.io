import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { DAILY_CAPS, getAiSettings, MODELS, setAiSettings } from '../ai/client';
import { deleteRelaxed, withDb } from '../lib/db';
import { faAgo, faNum } from '../lib/format';
import { allPoems, notifyChange, useQuery } from '../lib/store';
import { Icon, Sheet, useOverlay, useToast } from './ui';

const SECTION_LABEL: Record<string, string> = { simple: 'معنی ساده', words: 'واژه‌ها', structure: 'ساختار جمله', grammar: 'دستور زبان', devices: 'آرایه‌ها', deeper: 'برداشت عمیق‌تر' };

/** Key, model and daily cap for Hooshvare. The key stays on this device only. */
export function AiSettingsCard() {
  const ai = useQuery(getAiSettings, []);
  const reports = useQuery(() => withDb((d) => d.getAll('reports')), []);
  const poems = useQuery(allPoems, []);
  const reportsSheet = useOverlay('reports');
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<null | 'checking' | 'ok' | 'bad_key' | 'bad_model' | 'network'>(null);

  const keyAndModel = ai.status === 'ready' ? `${ai.value.apiKey}|${ai.value.model}` : '';
  useEffect(() => {
    setCheck(null);
  }, [keyAndModel]);
  if (ai.status !== 'ready') return null;
  const s = ai.value;

  const saveKey = async () => {
    const key = draft.trim();
    if (!key) return;
    try {
      await setAiSettings({ apiKey: key });
    } catch {
      toast({ text: 'ذخیرهٔ کلید ممکن نشد. دوباره امتحان کنید.' });
      return;
    }
    setDraft('');
    setShow(false);
    toast({ text: 'کلید روی این دستگاه ذخیره شد' });
  };
  const runCheck = async () => {
    if (!s.apiKey) return;
    setCheck('checking');
    const { checkKey } = await import('../ai/engine');
    setCheck(await checkKey(s.apiKey, s.model));
  };
  const masked = s.apiKey ? `${s.apiKey.slice(0, 7)}…${s.apiKey.slice(-4)}` : null;

  return (
    <section className="bg-card border border-line rounded-3xl p-6 mb-6" aria-labelledby="ai-title">
      <h2 id="ai-title" className="text-xs font-bold text-muted mb-4 flex items-center gap-2"><Icon name="wand-magic-sparkles" />هوشواره (Claude)</h2>

      {s.apiKey ? (
        <div className="space-y-3">
          <p className="text-sm">کلید ذخیره‌شده: <span dir="ltr" className="font-mono text-xs">{masked}</span></p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={runCheck} disabled={check === 'checking'} className="py-2 px-4 rounded-xl border border-line text-sm disabled:opacity-60">
              {check === 'checking' ? 'در حال بررسی…' : 'بررسی اتصال'}
            </button>
            <button type="button" onClick={async () => { await setAiSettings({ apiKey: null }); toast({ text: 'کلید از این دستگاه پاک شد' }); }} className="py-2 px-4 rounded-xl border border-danger/40 text-danger text-sm">
              پاک‌کردن کلید
            </button>
          </div>
          {check && check !== 'checking' && (
            <p role="status" className={`text-xs ${check === 'ok' ? 'text-green' : 'text-danger'}`}>
              {check === 'ok' && 'کلید و مدل معتبرند. (این بررسی توکنی مصرف نمی‌کند.)'}
              {check === 'bad_key' && 'کلید پذیرفته نشد. کلید تازه‌ای وارد کنید.'}
              {check === 'bad_model' && 'این مدل برای کلید شما در دسترس نیست؛ مدل دیگری انتخاب کنید.'}
              {check === 'network' && 'ارتباط برقرار نشد؛ اینترنت را بررسی کنید.'}
            </p>
          )}
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveKey(); }}>
          <label htmlFor="api-key" className="text-xs font-bold text-green block">کلید API شما از <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" dir="ltr" className="underline underline-offset-4">console.anthropic.com</a></label>
          <div className="relative">
            <input
              id="api-key"
              type={show ? 'text' : 'password'}
              dir="ltr"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              className="w-full bg-paper border border-line rounded-xl py-3 pl-12 pr-4 text-sm font-mono focus:outline-none focus:border-green"
            />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'پنهان کردن کلید' : 'نمایش کلید'} aria-pressed={show} className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-muted">
              <Icon name={show ? 'eye-slash' : 'eye'} style="regular" />
            </button>
          </div>
          <button type="submit" disabled={!draft.trim()} className="w-full bg-green text-on-green py-3 rounded-xl font-medium disabled:opacity-50">ذخیرهٔ کلید روی این دستگاه</button>
        </form>
      )}
      <p className="text-xs text-muted leading-relaxed mt-3">
        کلید فقط در حافظهٔ همین مرورگر می‌ماند، فقط به api.anthropic.com فرستاده می‌شود و در فایل پشتیبان نمی‌آید. برای امنیت بیشتر، در کنسول Anthropic برای این کلید سقف هزینهٔ ماهانه بگذارید.
      </p>

      <fieldset className="mt-6">
        <legend className="text-xs font-bold text-muted mb-3">مدل</legend>
        <div className="space-y-2">
          {MODELS.map((m) => (
            <label key={m.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${s.model === m.id ? 'border-green bg-selected/50' : 'border-line'}`}>
              <input type="radio" name="model" checked={s.model === m.id} onChange={() => void setAiSettings({ model: m.id })} className="mt-1 accent-[var(--color-green)]" />
              <span>
                <span className="block text-sm" dir="ltr">{m.label}</span>
                <span className="block text-xs text-muted">{m.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <label htmlFor="daily-cap" className="text-xs font-bold text-muted mb-2 block">سقف درخواست روزانه روی این دستگاه</label>
        <select id="daily-cap" value={s.dailyCap} onChange={(e) => void setAiSettings({ dailyCap: Number(e.target.value) })} className="w-full bg-paper border border-line rounded-xl py-3 px-4 text-sm">
          {DAILY_CAPS.map((c) => <option key={c} value={c}>{faNum(c)} درخواست در روز</option>)}
        </select>
        <p className="text-xs text-muted mt-2">هر بخش توضیح، هر پیام گفت‌وگو و هر ثبت برداشت یک درخواست است. باز کردن دوبارهٔ توضیح ذخیره‌شده درخواست حساب نمی‌شود.</p>
      </div>

      <button type="button" onClick={reportsSheet.show} className="w-full text-right mt-6 py-3 px-4 rounded-xl border border-line text-sm flex items-center justify-between">
        <span>گزارش‌های اشکال ثبت‌شده ({faNum(reports.status === 'ready' ? reports.value.length : 0)})</span>
        <Icon name="chevron-left" className="text-xs text-muted" />
      </button>

      <Sheet open={reportsSheet.open} onClose={reportsSheet.hide} title="گزارش‌های اشکال">
        {reports.status === 'ready' && reports.value.length === 0 && <p className="text-sm text-muted">گزارشی ثبت نشده است.</p>}
        <ul className="space-y-4">
          {reports.status === 'ready' && [...reports.value].sort((a, b) => b.createdAt - a.createdAt).map((r) => (
            <li key={r.id} className="text-sm border-b border-line/50 pb-3">
              <p className="text-xs text-muted">
                <Link to={`/poem/${r.poemId}/v/${r.n}`} className="text-green underline underline-offset-4">{(poems.status === 'ready' && poems.value.find((p) => p.id === r.poemId)?.title) || 'شعر'} · بیت {faNum(r.n)}</Link>
                {' '}· {SECTION_LABEL[r.section]} · {faAgo(r.createdAt)}
              </p>
              <p className="mt-1">{r.message || 'بدون توضیح'}</p>
              <button type="button" className="text-xs text-danger mt-1 py-1" onClick={async () => { await deleteRelaxed('reports', r.id); notifyChange(); }}>حذف این گزارش</button>
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  );
}
