import { useRef, useState } from 'react';
import { getAiSettings, MOCK, type UsageTotals } from '../ai/client';
import { AiSettingsCard } from '../components/AiSettings';
import { ReadingControls } from '../components/ReadingControls';
import { ErrorBox, Icon, IconButton, Sheet, useGoBack, useOverlay, useToast } from '../components/ui';
import { exportBackup, mergeBackup, parseBackupFile, type Backup, type MergePlan } from '../lib/backup';
import { getMeta } from '../lib/db';
import { faAgo, faNum } from '../lib/format';
import { updateSettings, useSettings, type Theme } from '../lib/settings';
import { notifyChange, useQuery } from '../lib/store';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'روشن' },
  { id: 'dark', label: 'تاریک' },
  { id: 'system', label: 'همراه دستگاه' },
];

export default function Settings() {
  const goBack = useGoBack();
  const settings = useSettings();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const restore = useOverlay('restore');
  const about = useOverlay('about');
  const [pendingImport, setPendingImport] = useState<{ backup: Backup; plan: MergePlan } | { error: string } | null>(null);
  const usage = useQuery(() => getMeta<UsageTotals>('usage'), []);
  const ai = useQuery(getAiSettings, []);

  const doExport = async () => {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `hamsokhan-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast({ text: 'فایل پشتیبان ساخته شد' });
    } catch {
      toast({ text: 'ساخت پشتیبان ممکن نشد' });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = await parseBackupFile(file);
    if (!parsed.ok) setPendingImport({ error: parsed.reason });
    else setPendingImport({ backup: parsed.backup, plan: await mergeBackup(parsed.backup, false) });
    restore.show();
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyImport = async () => {
    if (!pendingImport || 'error' in pendingImport) return;
    try {
      await mergeBackup(pendingImport.backup, true);
      notifyChange();
      toast({ text: 'بازیابی انجام شد' });
      restore.hide();
    } catch {
      setPendingImport({ error: 'بازیابی کامل نشد و هیچ تغییری اعمال نشد. دوباره امتحان کنید.' });
    }
  };

  return (
    <div className="min-h-dvh pb-12">
      <header className="px-4 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 flex items-center justify-between">
        <IconButton icon="arrow-right" label="برگشت" onClick={() => goBack('/')} />
        <h1 className="text-sm font-bold text-green">تنظیمات</h1>
        <div className="w-11" />
      </header>

      <main className="px-6 pt-6 max-w-2xl mx-auto">
        <section className="bg-card border border-line rounded-3xl p-6 mb-6" aria-label="اندازه و فاصلهٔ متن">
          <ReadingControls />
        </section>

        <section className="bg-card border border-line rounded-3xl p-6 mb-6" aria-labelledby="theme-title">
          <h2 id="theme-title" className="text-xs font-bold text-muted mb-6 flex items-center gap-2"><Icon name="circle-half-stroke" />پوسته برنامه</h2>
          <div className="flex gap-3" role="radiogroup" aria-labelledby="theme-title">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={settings.theme === t.id} onClick={() => updateSettings({ theme: t.id })} className={`flex-1 p-3 text-center rounded-xl border transition-all ${t.id === 'system' ? 'text-xs' : 'text-sm'} ${settings.theme === t.id ? 'bg-green text-on-green border-green' : 'border-line'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <AiSettingsCard />

        <section className="bg-card border border-line rounded-3xl p-6 mb-6" aria-labelledby="data-title">
          <h2 id="data-title" className="text-xs font-bold text-muted mb-4 flex items-center gap-2"><Icon name="database" />داده‌ها و ذخیره‌سازی</h2>
          <p className="text-xs text-muted leading-relaxed mb-6">
            شعرها، ذخیره‌ها، توضیح‌ها و گفت‌وگوها فقط در حافظهٔ همین مرورگر نگهداری می‌شوند و بدون اینترنت در دسترس‌اند. همگام‌سازی بین دستگاه‌ها وجود ندارد؛ پاک‌کردن دادهٔ مرورگر آن‌ها را حذف می‌کند، پس گاهی خروجی پشتیبان بگیرید.
          </p>
          <div className="space-y-3">
            <button type="button" onClick={doExport} className="w-full text-right py-3 px-4 rounded-xl border border-line text-sm flex items-center justify-between">
              <span>خروجی از ذخیره‌ها (فایل JSON)</span>
              <Icon name="chevron-left" className="text-xs text-muted" />
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="w-full text-right py-3 px-4 rounded-xl border border-line text-sm flex items-center justify-between">
              <span>بازیابی ذخیره‌ها از فایل</span>
              <Icon name="chevron-left" className="text-xs text-muted" />
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        </section>

        <section className="px-2 mb-6">
          <button type="button" onClick={about.show} className="flex items-start gap-4 text-right">
            <div className="w-8 h-8 rounded-full bg-green/5 flex items-center justify-center text-green shrink-0">
              <Icon name="wand-magic-sparkles" className="text-xs" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-green mb-1">دربارهٔ توضیح‌های هوشواره</h3>
              <p className="text-xs text-muted leading-relaxed">
                این توضیح‌ها را هوش مصنوعی می‌سازد و بازبینی انسانی نشده‌اند. متن اصلی شعر، توضیح هوشواره و برداشت شخصی شما همیشه جدا از هم نمایش داده می‌شوند.
              </p>
            </div>
          </button>
        </section>

        <div className="mt-12 text-center">
          <a href="./fix.html" className="block text-xs text-muted underline underline-offset-4 mb-3">صفحهٔ تعمیر اپ (اگر گیر کرد یا به‌روز نشد)</a>
          <p className="text-xs text-muted">هم‌سخن نسخه {faNum(__APP_VERSION__)} · ساخت <span dir="ltr">{__BUILD_ID__}</span></p>
        </div>
      </main>

      <Sheet open={restore.open} onClose={restore.hide} title="بازیابی ذخیره‌ها">
        {!pendingImport ? null : 'error' in pendingImport ? (
          <ErrorBox text={`${pendingImport.error} داده‌های فعلی دست‌نخورده ماند.`} />
        ) : (
          <div className="text-sm leading-relaxed space-y-3">
            <p>پشتیبان تاریخ <span dir="ltr">{pendingImport.backup.exportedAt.slice(0, 10)}</span> خوانده شد.</p>
            <ul className="list-disc pr-5 text-muted">
              <li>{faNum(pendingImport.plan.added)} مورد تازه افزوده می‌شود</li>
              <li>{faNum(pendingImport.plan.updated)} مورد با نسخهٔ تازه‌ترِ فایل به‌روز می‌شود</li>
              <li>{faNum(pendingImport.plan.unchanged)} مورد تکراری یا قدیمی‌تر کنار گذاشته می‌شود</li>
            </ul>
            <p className="text-xs text-muted">هیچ داده‌ای حذف نمی‌شود. گفت‌وگوها پیام‌به‌پیام ادغام می‌شوند.</p>
            <button type="button" onClick={applyImport} className="w-full bg-green text-on-green py-3 rounded-xl font-medium mt-2">ادغام با داده‌های فعلی</button>
          </div>
        )}
      </Sheet>

      <Sheet open={about.open} onClose={about.hide} title="دربارهٔ هوشواره">
        <div className="text-sm leading-relaxed space-y-3">
          <p>هوشواره با کلید خودتان مستقیم به مدل Claude شرکت Anthropic وصل می‌شود؛ سرور واسطه‌ای در کار نیست. فقط وقتی دکمهٔ توضیح، پرسش یا ثبت برداشت را بزنید، متن بیت و شعر و نوشتهٔ شما فرستاده می‌شود.</p>
          <p className="text-muted">وضعیت: {MOCK ? 'حالت آزمایشی (پاسخ‌های نمونه)' : ai.status === 'ready' && ai.value.apiKey ? `کلید ذخیره شده است؛ مدل ${ai.value.model}` : 'کلیدی وارد نشده؛ توضیح تازه ساخته نمی‌شود.'}</p>
          <p className="text-muted">
            مصرف ثبت‌شده در این دستگاه
            {usage.status === 'ready' && usage.value ? (
              <> از {faAgo(usage.value.since)}: {faNum(usage.value.requests)} درخواست (امروز {faNum(usage.value.dayRequests ?? 0)})، {faNum(usage.value.inputTokens.toLocaleString('en'))} توکن ورودی و {faNum(usage.value.outputTokens.toLocaleString('en'))} توکن خروجی. </>
            ) : ': هنوز درخواستی فرستاده نشده است. '}
            توکن‌ها گزارش خود سرویس‌اند؛ هزینهٔ واقعی را باید در کنسول Anthropic دید.
          </p>
          <p className="text-muted">برچسب «پاسخ نمونه» یعنی پاسخ از حالت آزمایشی آمده و هوشوارهٔ واقعی نیست.</p>
        </div>
      </Sheet>
    </div>
  );
}
