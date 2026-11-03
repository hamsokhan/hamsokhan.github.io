import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LIMITS } from '../../shared/contract';
import { versesFingerprint } from '../../shared/text';
import { ErrorBox, Icon, IconButton, LoadError, Spinner, useGoBack } from '../components/ui';
import type { Poem } from '../data/library';
import { faNum } from '../lib/format';
import { draftFromText, draftProblems, setVerseStart, versesFromDraft, type DraftLine } from '../lib/importPoem';
import { addUserPoem, getPoem, updateUserPoem, useQuery } from '../lib/store';
import NotFound from './NotFound';

const PROBLEM_TEXT = {
  empty: 'متنی برای واردکردن پیدا نشد.',
  too_many_verses: `در این نسخه حداکثر ${faNum(LIMITS.maxVerses)} بیت پذیرفته می‌شود. بخشی از شعر را وارد کنید.`,
  line_too_long: `دست‌کم یک مصرع بیش از ${faNum(LIMITS.maxMisraChars)} نویسه دارد؛ شاید چند مصرع در یک سطر آمده‌اند. سطرها را جدا کنید.`,
} as const;

export default function ImportPoem() {
  return <PoemForm />;
}

export function EditPoem() {
  const { poemId = '' } = useParams();
  const poem = useQuery(() => getPoem(poemId), [poemId]);
  if (poem.status === 'loading') return <div className="p-6"><Spinner label="در حال بارگذاری شعر…" /></div>;
  if (poem.status === 'error') return <LoadError />;
  // Library poems are verified source text and stay as they are.
  if (!poem.value || poem.value.origin !== 'user') return <NotFound text="این شعر پیدا نشد." />;
  return <PoemForm key={poem.value.id} existing={poem.value} />;
}

/** Design 07 plus a verse-splitting preview (required before analysis). Also edits a pasted poem. */
function PoemForm({ existing }: { existing?: Poem }) {
  const goBack = useGoBack();
  const navigate = useNavigate();
  const [text, setText] = useState(existing ? existing.verses.map((v) => v.misras.join(' / ')).join('\n') : '');
  const [poet, setPoet] = useState(existing?.poetName ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [lines, setLines] = useState<DraftLine[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = () => {
    const d = draftFromText(text);
    const probs = draftProblems(d);
    if (probs.includes('empty')) return setError(PROBLEM_TEXT.empty);
    setError(null);
    setLines(d);
  };

  if (lines) {
    const verses = versesFromDraft(lines);
    const problems = draftProblems(lines);
    const textChanged = !!existing && versesFingerprint(verses) !== existing.textVersion;
    const save = async () => {
      setSaving(true);
      try {
        const input = { title: title.trim() || null, poet: poet.trim() || null, verses };
        const id = existing ? existing.id : await addUserPoem(input);
        if (existing) await updateUserPoem(id, input);
        navigate(`/poem/${id}`, { replace: true });
      } catch {
        setError('ذخیرهٔ شعر روی دستگاه ممکن نشد. فضای ذخیره‌سازی مرورگر را بررسی کنید و دوباره امتحان کنید.');
        setSaving(false);
      }
    };
    return (
      <div className="min-h-dvh pb-12">
        <header className="px-6 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 flex items-center justify-between">
          <IconButton icon="arrow-right" label="برگشت به ویرایش متن" onClick={() => setLines(null)} />
          <h1 className="text-sm font-bold text-green">پیش‌نمایش بیت‌ها</h1>
          <div className="w-11" />
        </header>
        <main className="px-6 pt-4 max-w-2xl mx-auto">
          <p className="text-sm text-muted leading-relaxed mb-2">
            {faNum(verses.length)} بیت تشخیص داده شد. اگر جای شروع بیت‌ها درست نیست، با کلید کنار هر سطر آن را اصلاح کنید. متن سطرها تغییر نمی‌کند.
          </p>
          <p className="text-xs text-muted mb-6">شاعر: {poet.trim() || 'نامشخص'} · عنوان: {title.trim() || 'بی‌عنوان'}</p>

          <ol className="space-y-1">
            {lines.map((l, i) => {
              const verseNo = versesFromDraft(lines.slice(0, i + 1)).length;
              const starts = i === 0 || versesFromDraft(lines.slice(0, i)).length < verseNo;
              return (
                <li key={i} className={`flex items-start gap-3 rounded-xl px-3 py-2 ${starts && i > 0 ? 'mt-4' : ''} ${verseNo % 2 ? 'bg-card' : 'bg-selected/50'}`}>
                  <span className="text-xs text-muted w-6 shrink-0 pt-1">{starts ? faNum(verseNo) : ''}</span>
                  <span className="flex-1 text-base leading-relaxed misra">{l.text}</span>
                  {i > 0 && (
                    <label className="flex items-center gap-1 text-xs text-muted shrink-0 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={l.startsVerse}
                        onChange={(e) => setLines(setVerseStart(lines, i, e.target.checked))}
                        className="accent-[var(--color-green)] w-4 h-4"
                      />
                      آغاز بیت
                    </label>
                  )}
                </li>
              );
            })}
          </ol>
          {verses.some((v) => v.misras.length === 1) && (
            <p className="text-xs text-muted mt-4">بیت‌های تک‌مصرعی هم پذیرفته می‌شوند؛ اگر اشتباه است، تیک «آغاز بیت» را بردارید.</p>
          )}
          {problems.filter((p) => p !== 'empty').map((p) => <div key={p} className="mt-4"><ErrorBox text={PROBLEM_TEXT[p]} /></div>)}
          {error && <div className="mt-4"><ErrorBox text={error} /></div>}
          {textChanged && (
            <p className="mt-4 rounded-xl border border-line p-3 text-xs leading-relaxed">
              متن شعر تغییر کرده است. توضیح‌ها و گفت‌وگوهای متن قبلی دیگر نمایش داده نمی‌شوند و برای متن تازه باید دوباره درخواست شوند. بیت‌های ذخیره‌شده با شمارهٔ بیت نگه داشته می‌شوند.
            </p>
          )}

          <button type="button" disabled={saving || problems.length > 0} onClick={save} className="w-full mt-8 bg-green text-on-green py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 font-medium disabled:opacity-50">
            {saving ? 'در حال ذخیره…' : existing ? 'ذخیرهٔ تغییرات' : 'ذخیره و بازکردن شعر'}
            <Icon name="arrow-left" className="text-sm" />
          </button>
          <p className="mt-6 text-xs text-muted text-center leading-relaxed px-4">
            شعر فقط روی همین دستگاه ذخیره می‌شود و «متن بررسی‌نشده» نشان داده می‌شود. تحلیلی خودکار انجام نمی‌شود؛ هر توضیح را خودتان با انتخاب بیت درخواست می‌کنید.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-12">
      <header className="px-6 py-4 sticky top-0 bg-paper/95 backdrop-blur-sm z-20 flex items-center justify-between">
        <IconButton icon="xmark" label="بستن" onClick={() => (existing ? navigate(`/poem/${existing.id}`, { replace: true }) : goBack('/library'))} />
        <h1 className="text-sm font-bold text-green">{existing ? 'ویرایش شعر' : 'واردکردن شعر'}</h1>
        <div className="w-11" />
      </header>

      <main className="px-6 pt-6 max-w-2xl mx-auto">
        {!existing && <div className="mb-10 text-center">
          <div className="w-12 h-12 bg-green/5 rounded-2xl flex items-center justify-center text-green mx-auto mb-4">
            <Icon name="paste" style="regular" className="text-xl" />
          </div>
          <h2 className="text-lg font-bold text-green mb-2">شعر دلخواهتان را بخوانید</h2>
          <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">متن شعر را اینجا بچسبانید تا هم‌سخن در درک و تفسیر آن به شما کمک کند.</p>
        </div>}

        <div className="bg-card border border-line rounded-3xl p-6 shadow-[0_4px_24px_rgba(33,77,59,0.04)] space-y-6">
          <div>
            <label htmlFor="poem-text" className="text-xs font-bold text-green mb-2 block">متن شعر</label>
            <textarea id="poem-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="متن شعر را اینجا بچسبان..." className="w-full bg-paper border border-line rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-green resize-none leading-relaxed" />
            <p className="text-xs text-muted mt-2">هر مصرع در یک سطر، یا دو مصرع یک بیت با «/» جدا شوند.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="poem-poet" className="text-xs font-bold text-green mb-2 block">نام شاعر (اختیاری)</label>
              <input id="poem-poet" type="text" maxLength={LIMITS.maxTitleChars} value={poet} onChange={(e) => setPoet(e.target.value)} placeholder="مثلاً: حافظ" className="w-full bg-paper border border-line rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-green" />
            </div>
            <div>
              <label htmlFor="poem-title" className="text-xs font-bold text-green mb-2 block">عنوان (اختیاری)</label>
              <input id="poem-title" type="text" maxLength={LIMITS.maxTitleChars} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="نام شعر" className="w-full bg-paper border border-line rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-green" />
            </div>
          </div>
        </div>
        {error && <div className="mt-4"><ErrorBox text={error} /></div>}

        <div className="mt-10">
          <button type="button" onClick={preview} disabled={!text.trim()} className="w-full bg-green text-on-green py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 font-medium transition-transform active:scale-95 disabled:opacity-50">
            پیش‌نمایش شعر
            <Icon name="arrow-left" className="text-sm" />
          </button>
        </div>
        <p className="mt-8 text-xs text-muted text-center leading-relaxed px-4">
          نام شاعری که وارد می‌کنید بررسی نمی‌شود و انتساب «اعلام‌شده توسط شما» نشان داده می‌شود.
        </p>
      </main>
    </div>
  );
}
