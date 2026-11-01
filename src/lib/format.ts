const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const faNum = (n: number | string) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

const ORDINALS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم'];
export const faOrdinal = (n: number) => ORDINALS[n - 1] ?? `${faNum(n)}م`;

/** Relative time in Persian; older dates are shown in the Solar Hijri calendar. */
export function faAgo(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return 'همین حالا';
  if (min < 60) return `${faNum(min)} دقیقه پیش`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${faNum(h)} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${faNum(d)} روز پیش`;
  if (d < 30) return `${faNum(Math.floor(d / 7))} هفته پیش`;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Baghdad' }).format(ts);
}

/** Persian digits → ASCII, for any numeric input. */
export const toAsciiDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
