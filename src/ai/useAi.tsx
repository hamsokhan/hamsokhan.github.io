import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Section } from '../../shared/contract';
import { Sheet } from '../components/ui';
import type { Poem } from '../data/library';
import type { AnalysisRecord } from '../lib/db';
import { cachedAnalysis, errorMessage, HooshvareError, getAiSettings, giveConsent, hasConsent, MOCK, requestAnalysis } from './client';

// ---- One-time notice before the first request to the AI service ----

const GateCtx = createContext<() => Promise<boolean>>(async () => true);
export const useAiGate = () => useContext(GateCtx);

export function AiGateProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<((ok: boolean) => void) | null>(null);
  const gate = useCallback(async () => {
    if (MOCK || !(await getAiSettings()).apiKey) return true; // nothing is sent; the call explains that a key is needed
    if (await hasConsent()) return true;
    return new Promise<boolean>((resolve) => setPending(() => resolve));
  }, []);
  const close = (ok: boolean) => {
    if (ok) void giveConsent();
    pending?.(ok);
    setPending(null);
  };
  return (
    <GateCtx.Provider value={gate}>
      {children}
      <Sheet open={!!pending} onClose={() => close(false)} title="پیش از اولین توضیح">
        <div className="space-y-3 text-sm leading-relaxed">
          <p>برای ساختن توضیح، این موارد با کلید خودتان مستقیم به سرویس Claude (شرکت Anthropic) فرستاده می‌شود:</p>
          <ul className="list-disc pr-5 space-y-1 text-muted">
            <li>متن بیت انتخاب‌شده و بیت‌های همان شعر برای فهم بافت</li>
            <li>نام شاعر و عنوان شعر، اگر ثبت شده باشد</li>
            <li>پرسش یا برداشتی که خودتان می‌نویسید</li>
          </ul>
          <p className="text-muted">ذخیره‌ها، فهرست شعرها و دیگر داده‌های شما فرستاده نمی‌شوند. هر توضیح فقط با زدن دکمه درخواست می‌شود و هزینه‌اش از حساب Anthropic شما کم می‌شود. پاسخ‌ها را هوش مصنوعی می‌سازد و ممکن است خطا داشته باشند.</p>
        </div>
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={() => close(true)} className="flex-1 bg-green text-on-green py-3 rounded-xl font-medium">متوجه شدم، ادامه</button>
          <button type="button" onClick={() => close(false)} className="flex-1 border border-line py-3 rounded-xl">فعلاً نه</button>
        </div>
      </Sheet>
    </GateCtx.Provider>
  );
}

// ---- One explanation section for one verse ----

export type SectionState =
  | { status: 'checking' }
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rec: AnalysisRecord }
  | { status: 'error'; message: string; needsKey: boolean };

export function useSection(poem: Poem, n: number, section: Section) {
  const [state, setState] = useState<SectionState>({ status: 'checking' });
  const key = `${poem.id}|${poem.textVersion}|${n}|${section}`;
  const current = useRef(key);
  current.current = key;
  const gate = useAiGate();

  useEffect(() => {
    setState({ status: 'checking' });
    cachedAnalysis(poem, n, section).then(
      (rec) => current.current === key && setState(rec ? { status: 'ready', rec } : { status: 'idle' }),
      () => current.current === key && setState({ status: 'idle' }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const request = useCallback(async () => {
    if (!(await gate())) return;
    const mine = key;
    setState({ status: 'loading' });
    try {
      const rec = await requestAnalysis(poem, n, section);
      // A late answer for another poem/verse is stored but never shown here.
      if (current.current === mine) setState({ status: 'ready', rec });
    } catch (e) {
      if (current.current === mine) setState({ status: 'error', message: errorMessage(e), needsKey: e instanceof HooshvareError && (e.code === 'no_key' || e.code === 'upstream_auth') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gate]);

  return { state, request };
}
