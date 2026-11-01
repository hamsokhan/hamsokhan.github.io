import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router';

// ---- Icons (Font Awesome Free, bundled locally) ----

export function Icon({ name, style = 'solid', className = '' }: { name: string; style?: 'solid' | 'regular'; className?: string }) {
  return <i className={`fa-${style} fa-${name} ${className}`} aria-hidden="true" />;
}

export function IconButton({ icon, label, onClick, style, className = '', pressed }: { icon: string; label: string; onClick: () => void; style?: 'solid' | 'regular'; className?: string; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} className={`w-11 h-11 flex items-center justify-center rounded-full hover:bg-line/30 transition-colors shrink-0 ${className}`}>
      <Icon name={icon} style={style} className="text-lg" />
    </button>
  );
}

// ---- Navigation helpers ----

/** Goes back in real history when there is somewhere to go, otherwise to `fallback`. */
export function useGoBack() {
  const navigate = useNavigate();
  return useCallback(
    (fallback: string) => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigate(-1);
      else navigate(fallback, { replace: true });
    },
    [navigate],
  );
}

/**
 * An overlay (sheet/dialog) whose open state lives in the URL, so the system
 * back button closes it before leaving the page.
 */
export function useOverlay(name: string) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const open = params.get('o') === name;
  const show = useCallback(() => {
    const p = new URLSearchParams(location.search);
    p.set('o', name);
    navigate({ search: p.toString() }, { state: { ...(location.state as object), overlay: true } });
  }, [location, name, navigate]);
  const hide = useCallback(() => {
    if ((location.state as { overlay?: boolean } | null)?.overlay) navigate(-1);
    else {
      const p = new URLSearchParams(location.search);
      p.delete('o');
      navigate({ search: p.toString() }, { replace: true });
    }
  }, [location, navigate]);
  return { open, show, hide };
}

// ---- Sheet / dialog ----

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative w-full sm:max-w-md max-h-[85dvh] overflow-y-auto bg-card border border-line rounded-t-3xl sm:rounded-3xl p-6 safe-bottom animate-slide-up outline-none">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-green">{title}</h2>
          <IconButton icon="xmark" label="بستن" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Toasts ----

interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.action ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-24 inset-x-0 z-[60] flex flex-col items-center gap-2 px-6 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto max-w-md w-full bg-ink text-paper rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3 shadow-lg animate-slide-up">
            <span>{t.text}</span>
            {t.action && (
              <button type="button" className="font-bold underline underline-offset-4 shrink-0" onClick={() => { t.action!.run(); setToasts((all) => all.filter((x) => x.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- Bottom navigation (Discover / Library / Saved) ----

export function BottomNav() {
  const item = (to: string, icon: string, label: string) => (
    <NavLink to={to} end className={({ isActive }) => `flex flex-col items-center gap-1 min-w-16 py-1 transition-colors ${isActive ? 'text-green' : 'text-muted hover:text-green'}`}>
      {({ isActive }) => (
        <>
          <Icon name={icon} style={isActive || icon === 'book' ? 'solid' : 'regular'} className="text-xl" />
          <span className={`text-[10px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
  return (
    <nav aria-label="بخش‌های اصلی" className="fixed bottom-0 left-0 right-0 bg-card border-t border-line z-20 safe-bottom">
      <div className="flex justify-around items-center py-3 px-2 max-w-3xl mx-auto">
        {item('/', 'compass', 'کشف شعر')}
        {item('/library', 'book', 'کتابخانه')}
        {item('/saved', 'bookmark', 'ذخیره‌ها')}
      </div>
    </nav>
  );
}

// ---- Small shared pieces ----

export function AiBadge({ demo }: { demo?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[10px] text-muted">{demo ? 'پاسخ نمونه — هوشوارهٔ واقعی نیست' : 'توضیح هوشواره'}</span>
      <span className={`text-[0.65rem] font-bold px-[0.4rem] py-[0.1rem] rounded ${demo ? 'bg-danger text-card' : 'bg-green text-on-green'}`}>{demo ? 'نمونه' : 'AI'}</span>
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted py-2">
      <span className="w-4 h-4 rounded-full border-2 border-line border-t-green animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ text, onRetry, settingsLink }: { text: string; onRetry?: () => void; settingsLink?: boolean }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm leading-relaxed">
      <p className="flex items-start gap-2"><Icon name="triangle-exclamation" className="text-danger mt-1" />{text}</p>
      <div className="flex gap-5">
        {settingsLink && (
          <NavLink to="/settings" className="mt-3 text-green font-bold underline underline-offset-4">رفتن به تنظیمات</NavLink>
        )}
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 text-green font-bold underline underline-offset-4">
            تلاش دوباره
          </button>
        )}
      </div>
    </div>
  );
}

export function PageHeader({ start, title, subtitle, end, sticky = true }: { start?: ReactNode; title: ReactNode; subtitle?: ReactNode; end?: ReactNode; sticky?: boolean }) {
  return (
    <header className={`flex items-center px-6 py-4 ${sticky ? 'sticky top-0' : ''} bg-paper/95 backdrop-blur-sm z-20 border-b border-line/30`}>
      {start ?? <div className="w-11" />}
      <div className="flex-1 text-center min-w-0 px-2">
        <h1 className="text-base font-bold text-green truncate">{title}</h1>
        {subtitle}
      </div>
      {end ?? <div className="w-11" />}
    </header>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
