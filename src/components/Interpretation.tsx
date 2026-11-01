import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Explained } from '../../shared/anchor';
import type { AnchorT, Section } from '../../shared/contract';
import { errorMessage, sendReport } from '../ai/client';
import { useSection, type SectionState } from '../ai/useAi';
import type { Poem } from '../data/library';
import type { AnalysisRecord } from '../lib/db';
import { AiBadge, copyText, ErrorBox, Icon, Sheet, Spinner, useOverlay, useToast } from './ui';
import { VerseTokens } from './VerseTokens';

const DETAIL: { id: Exclude<Section, 'simple'>; label: string; icon: string; style?: 'regular' }[] = [
  { id: 'words', label: 'واژه‌ها', icon: 'spell-check' },
  { id: 'structure', label: 'ساختار جمله', icon: 'arrow-right-arrow-left' },
  { id: 'grammar', label: 'دستور زبان', icon: 'sitemap' },
  { id: 'devices', label: 'آرایه‌ها', icon: 'wand-magic-sparkles' },
  { id: 'deeper', label: 'برداشت عمیق‌تر', icon: 'lightbulb', style: 'regular' },
];

const LABEL: Record<Section, string> = { simple: 'معنی ساده', words: 'واژه‌ها', structure: 'ساختار جمله', grammar: 'دستور زبان', devices: 'آرایه‌ها', deeper: 'برداشت عمیق‌تر' };

/** The selected verse plus the layered explanation card (design 03). */
export function Interpretation({ poem, n, autoRequest }: { poem: Poem; n: number; autoRequest?: boolean }) {
  const verse = poem.verses[n - 1];
  const simple = useSection(poem, n, 'simple');
  const [open, setOpen] = useState<Section | null>(null);
  const [focus, setFocus] = useState<{ annotated: (AnchorT | null)[]; highlight: AnchorT | null; onToken?: (m: number, i: number) => void }>({ annotated: [], highlight: null });
  const report = useOverlay('report');
  const [reportTarget, setReportTarget] = useState<{ section: Section; rec: AnalysisRecord } | null>(null);

  useEffect(() => {
    setOpen(null);
  }, [poem.id, n]);
  useEffect(() => {
    if (autoRequest && simple.state.status === 'idle') void simple.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest, simple.state.status]);
  useEffect(() => {
    setFocus({ annotated: [], highlight: null });
  }, [open, poem.id, n]);

  const onReport = (section: Section, rec: AnalysisRecord) => {
    setReportTarget({ section, rec });
    report.show();
  };

  return (
    <div className="p-4 rounded-xl bg-selected border-r-[3px] border-green">
      <VerseTokens misras={verse.misras} className="text-xl leading-relaxed text-green font-medium" annotated={focus.annotated} highlight={focus.highlight} onToken={focus.onToken} />

      <div className="bg-card border border-line rounded-3xl mt-6 overflow-hidden shadow-[0_4px_24px_rgba(33,77,59,0.06)]">
        <div className="p-6">
          <h3 className="text-xs font-bold text-muted mb-3 flex items-center gap-2">
            <Icon name="quote-right" className="text-green" />
            معنی ساده
          </h3>
          <SimpleBody poem={poem} state={simple.state} onRequest={simple.request} onReport={(rec) => onReport('simple', rec)} />
        </div>

        <div className="border-t border-line/30">
          {DETAIL.map((d) => (
            <DetailRow key={d.id} poem={poem} n={n} def={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} setFocus={setFocus} onReport={onReport} />
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 justify-center text-sm">
        <Link to={`/poem/${poem.id}/v/${n}/reflect`} className="text-green font-medium underline underline-offset-4 decoration-green/30 py-2">
          برداشت خودم را می‌نویسم
        </Link>
      </div>

      <ReportSheet open={report.open} onClose={report.hide} poem={poem} n={n} target={reportTarget} />
    </div>
  );
}

function SimpleBody({ poem, state, onRequest, onReport }: { poem: Poem; state: SectionState; onRequest: () => void; onReport: (rec: AnalysisRecord) => void }) {
  if (state.status === 'checking') return <Spinner label="در حال بررسی توضیح‌های ذخیره‌شده…" />;
  if (state.status === 'idle')
    return (
      <div>
        <p className="text-sm text-muted leading-relaxed mb-4">برای این بیت هنوز توضیحی ساخته نشده است.</p>
        <button type="button" onClick={onRequest} className="w-full bg-green text-on-green py-3 rounded-2xl flex items-center justify-center gap-3 font-medium">
          <Icon name="wand-magic-sparkles" />
          این بیت را توضیح بده
        </button>
      </div>
    );
  if (state.status === 'loading') return <Spinner label="هوشواره در حال نوشتن معنی ساده است…" />;
  if (state.status === 'error') return <ErrorBox text={state.message} onRetry={onRequest} />;
  const d = state.rec.data as Explained['simple'];
  return (
    <div>
      <p className="text-base leading-relaxed">{d.meaning}</p>
      {d.feeling && <p className="text-sm text-muted leading-relaxed mt-3">{d.feeling}</p>}
      {d.unsure && <p className="text-xs text-muted mt-3">هوشواره دربارهٔ این معنی مطمئن نیست؛ آن را یک خوانش احتمالی بدانید.</p>}
      {poem.origin === 'user' && d.textNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-line p-3 text-xs leading-relaxed">
          <p className="font-bold text-green mb-1">نکته‌های احتمالی دربارهٔ متن (متن شما تغییر نکرده است)</p>
          <ul className="list-disc pr-4 space-y-1 text-muted">{d.textNotes.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      <SectionFooter rec={state.rec} text={[d.meaning, d.feeling].filter(Boolean).join('\n')} onReport={() => onReport(state.rec)} />
    </div>
  );
}

function SectionFooter({ rec, text, onReport }: { rec: AnalysisRecord; text: string; onReport: () => void }) {
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-5 pt-3 border-t border-line/40">
      <AiBadge demo={rec.demo} />
      <div className="flex gap-4 text-xs text-muted">
        <button type="button" className="py-2 hover:text-green" onClick={async () => toast({ text: (await copyText(text)) ? 'کپی شد' : 'کپی ممکن نشد' })}>
          <Icon name="copy" style="regular" className="ml-1" />کپی
        </button>
        <button type="button" className="py-2 hover:text-green" onClick={onReport}>
          <Icon name="flag" style="regular" className="ml-1" />گزارش اشکال
        </button>
      </div>
    </div>
  );
}

type FocusSetter = (f: { annotated: (AnchorT | null)[]; highlight: AnchorT | null; onToken?: (m: number, i: number) => void }) => void;

function DetailRow({ poem, n, def, open, onToggle, setFocus, onReport }: {
  poem: Poem; n: number; def: (typeof DETAIL)[number]; open: boolean; onToggle: () => void; setFocus: FocusSetter; onReport: (s: Section, rec: AnalysisRecord) => void;
}) {
  const { state, request } = useSection(poem, n, def.id);
  const panelId = `sec-${def.id}`;
  const toggle = () => {
    onToggle();
    // Opening a section is the explicit request for it; cached sections cost nothing.
    if (!open && (state.status === 'idle' || state.status === 'error')) void request();
  };
  return (
    <div className="border-b border-paper last:border-b-0">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle} className="w-full flex items-center justify-between px-6 py-4 hover:bg-paper transition-colors text-right">
        <span className="flex items-center gap-3">
          <Icon name={def.icon} style={def.style} className="text-muted w-5 text-center" />
          <span className="text-sm font-medium">{def.label}</span>
          {state.status === 'ready' && !open && <span className="text-[10px] text-green bg-green/5 px-2 py-0.5 rounded">آماده</span>}
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} className="text-xs text-line" />
      </button>
      {open && (
        <div id={panelId} className="px-6 pb-6">
          {state.status === 'checking' && <Spinner label="در حال بررسی…" />}
          {state.status === 'loading' && <Spinner label={`هوشواره در حال آماده‌کردن «${def.label}» است…`} />}
          {state.status === 'error' && <ErrorBox text={state.message} onRetry={request} />}
          {state.status === 'idle' && (
            <button type="button" onClick={request} className="text-green font-bold underline underline-offset-4 py-2">دریافت توضیح «{def.label}»</button>
          )}
          {state.status === 'ready' && <SectionBody section={def.id} rec={state.rec} setFocus={setFocus} onReport={() => onReport(def.id, state.rec)} />}
        </div>
      )}
    </div>
  );
}

const Certainty = ({ certain }: { certain: boolean }) =>
  certain ? null : <span className="text-[10px] text-muted border border-line rounded px-1 mr-1 whitespace-nowrap">محتمل</span>;

function Quote({ r, onClick, active }: { r: { quote: string; anchor: AnchorT | null }; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`font-bold text-green text-right ${active ? 'underline decoration-2 underline-offset-8' : ''}`} title={r.anchor ? 'نشان دادن در بیت' : 'جای دقیق این عبارت در بیت پیدا نشد'}>
      «{r.quote}»{!r.anchor && <span className="text-[10px] font-normal text-muted mr-1">(جای دقیق نامعلوم)</span>}
    </button>
  );
}

function SectionBody({ section, rec, setFocus, onReport }: { section: Exclude<Section, 'simple'>; rec: AnalysisRecord; setFocus: FocusSetter; onReport: () => void }) {
  const [active, setActive] = useState<number | null>(null);
  let body: ReactNode = null;
  let copy = '';

  const anchors = (() => {
    if (section === 'words') return (rec.data as Explained['words']).items.map((x) => x.ref.anchor);
    if (section === 'grammar') return (rec.data as Explained['grammar']).rows.map((x) => x.ref.anchor);
    if (section === 'devices') return (rec.data as Explained['devices']).items.map((x) => x.ref.anchor);
    return [];
  })();

  useEffect(() => {
    if (!anchors.length) return;
    setFocus({
      annotated: anchors,
      highlight: active === null ? null : anchors[active],
      onToken: (m, i) => {
        const idx = anchors.findIndex((a) => a && a.misra === m && i >= a.from && i <= a.to);
        if (idx >= 0) setActive(idx);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rec.key]);

  const pick = (i: number) => setActive(active === i ? null : i);

  if (section === 'words') {
    const d = rec.data as Explained['words'];
    copy = d.items.map((w) => `${w.ref.quote}: ${w.meaningHere}`).join('\n');
    body = d.items.length === 0 ? <p className="text-sm text-muted">در این بیت واژهٔ دشواری که نیاز به توضیح داشته باشد پیدا نشد.</p> : (
      <>
        <p className="text-xs text-muted mb-3">روی واژه‌های نقطه‌چین در بیت بزنید یا از فهرست زیر انتخاب کنید.</p>
        <ul className="space-y-4">
          {d.items.map((w, i) => (
            <li key={i} className={`text-sm leading-relaxed rounded-xl p-3 ${active === i ? 'bg-paper' : ''}`}>
              <Quote r={w.ref} active={active === i} onClick={() => pick(i)} />
              <p className="mt-1">{w.meaningHere}</p>
              {w.note && <p className="text-xs text-muted mt-1">{w.note}</p>}
              {w.alternatives.length > 0 && (
                <div className="mt-2 text-xs">
                  <p className="text-muted mb-1">معناهای ممکن دیگر:</p>
                  <ul className="list-disc pr-4 space-y-1">{w.alternatives.map((a, j) => <li key={j}><span className="font-medium">{a.meaning}</span> — <span className="text-muted">{a.why}</span></li>)}</ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  } else if (section === 'structure') {
    const d = rec.data as Explained['structure'];
    copy = d.prose;
    body = (
      <>
        <p className="text-base leading-relaxed">
          {d.prose.split(/(\[[^\]]*\])/g).map((part, i) =>
            part.startsWith('[') ? <span key={i} className="text-muted border-b border-dashed border-muted mx-0.5">{part}</span> : <span key={i}>{part}</span>,
          )}
        </p>
        <p className="text-xs text-muted mt-3">بخش‌های داخل [ ] در متن اصلی نیامده‌اند و برای روشن شدن جمله پیشنهاد شده‌اند. متن اصلی بیت بالا بی‌تغییر است.</p>
        {d.additions.length > 0 && <ul className="mt-3 space-y-1 text-xs list-disc pr-4">{d.additions.map((a, i) => <li key={i}><span className="font-medium">[{a.text}]</span> — {a.why}</li>)}</ul>}
        {d.note && <p className="text-sm text-muted mt-3">{d.note}</p>}
      </>
    );
  } else if (section === 'grammar') {
    const d = rec.data as Explained['grammar'];
    copy = d.rows.map((r) => `${r.ref.quote} | ${r.type} | ${r.role} | ${r.why}`).join('\n');
    body = (
      <>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm text-right min-w-[30rem]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 px-2 font-medium">واژه یا گروه</th>
                <th scope="col" className="py-2 px-2 font-medium">نوع</th>
                <th scope="col" className="py-2 px-2 font-medium">نقش در جمله</th>
                <th scope="col" className="py-2 px-2 font-medium">دلیل ساده</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={i} className={`border-b border-line/50 align-top ${active === i ? 'bg-paper' : ''}`}>
                  <td className="py-2 px-2"><Quote r={r.ref} active={active === i} onClick={() => pick(i)} /></td>
                  <td className="py-2 px-2">{r.type}</td>
                  <td className="py-2 px-2">{r.role}<Certainty certain={r.certain} /></td>
                  <td className="py-2 px-2 text-muted text-xs leading-relaxed">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.note && <p className="text-sm text-muted mt-3">{d.note}</p>}
      </>
    );
  } else if (section === 'devices') {
    const d = rec.data as Explained['devices'];
    copy = d.items.map((x) => `${x.name} («${x.ref.quote}»): ${x.explanation}`).join('\n');
    body = d.items.length === 0 ? <p className="text-sm text-muted">آرایهٔ قابل دفاعی در این بیت شناسایی نشد.</p> : (
      <ul className="space-y-4">
        {d.items.map((x, i) => (
          <li key={i} className={`text-sm leading-relaxed rounded-xl p-3 ${active === i ? 'bg-paper' : ''}`}>
            <p className="font-bold">{x.name} <span className="font-normal text-muted">در</span> <Quote r={x.ref} active={active === i} onClick={() => pick(i)} /></p>
            <p className="mt-1">{x.explanation}</p>
            <p className="text-xs text-muted mt-1">اثر: {x.effect}</p>
          </li>
        ))}
      </ul>
    );
  } else {
    const d = rec.data as Explained['deeper'];
    copy = d.readings.map((r) => `${r.kind}: ${r.text}`).join('\n');
    body = (
      <div className="space-y-4 text-sm leading-relaxed">
        {d.contextNote && <p>{d.contextNote}</p>}
        {d.readings.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted mb-2">برداشت‌های احتمالی</p>
            <ul className="space-y-3">{d.readings.map((r, i) => <li key={i}><span className="font-bold">{r.kind}:</span> {r.text}<span className="block text-xs text-muted mt-1">{r.fit}</span></li>)}</ul>
          </div>
        )}
        {d.culturalNotes.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted mb-2">اشاره‌های فرهنگی (بدون منبع ثبت‌شده؛ برای اطمینان به شرح‌های معتبر رجوع کنید)</p>
            <ul className="list-disc pr-4 space-y-1">{d.culturalNotes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}
        {d.caution && <p className="text-xs text-muted">{d.caution}</p>}
      </div>
    );
  }
  return (
    <div>
      {body}
      <SectionFooter rec={rec} text={copy} onReport={onReport} />
    </div>
  );
}

function ReportSheet({ open, onClose, poem, n, target }: { open: boolean; onClose: () => void; poem: Poem; n: number; target: { section: Section; rec: AnalysisRecord } | null }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: string }>('idle');
  const toast = useToast();
  useEffect(() => {
    if (open) {
      setText('');
      setState('idle');
    }
  }, [open]);
  if (!target) return null;
  const send = async () => {
    setState('sending');
    try {
      await sendReport(poem, n, target.section, target.rec.model, target.rec.data, text.trim());
      setState('sent');
      toast({ text: 'گزارش فرستاده شد. سپاس!' });
      onClose();
    } catch (e) {
      setState({ error: errorMessage(e) });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`گزارش اشکال در «${LABEL[target.section]}»`}>
      <label htmlFor="report-text" className="text-xs font-bold text-green mb-2 block">چه چیزی نادرست یا گمراه‌کننده است؟ (اختیاری)</label>
      <textarea id="report-text" rows={4} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} className="w-full bg-paper border border-line rounded-xl p-3 text-sm focus:outline-none focus:border-green resize-none" />
      <p className="text-[11px] text-muted leading-relaxed mt-2">
        همراه گزارش، همین توضیح، شمارهٔ بیت و نام مدل فرستاده می‌شود
        {poem.origin === 'user' ? '؛ چون این شعر را خودتان وارد کرده‌اید، عبارت‌های نقل‌شده از آن هم در توضیح هست.' : '.'}
      </p>
      {typeof state === 'object' && <div className="mt-3"><ErrorBox text={state.error} /></div>}
      <button type="button" disabled={state === 'sending'} onClick={send} className="w-full mt-4 bg-green text-on-green py-3 rounded-xl font-medium disabled:opacity-60">
        {state === 'sending' ? 'در حال فرستادن…' : 'فرستادن گزارش'}
      </button>
    </Sheet>
  );
}
