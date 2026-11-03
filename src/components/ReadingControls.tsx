import { FONT_SCALES, LINE_HEIGHTS, updateSettings, useSettings } from '../lib/settings';
import { Icon } from './ui';

const SIZE_NAMES = ['کوچک', 'معمولی', 'بزرگ', 'بزرگ‌تر', 'خیلی بزرگ'];
const LEADING_NAMES = ['فشرده', 'معمولی', 'باز', 'خیلی باز'];

/** Text size and line spacing, used in Settings and from the reader's menu. */
export function ReadingControls() {
  const settings = useSettings();
  const scaleIdx = Math.max(0, FONT_SCALES.indexOf(settings.fontScale as (typeof FONT_SCALES)[number]));
  return (
    <div>
      <div className="bg-paper p-5 rounded-xl text-center mb-6 text-lg text-green font-medium">
        <span className="misra">بنی آدم اعضای یکدیگرند</span>
        <span className="misra">که در آفرینش ز یک گوهرند</span>
      </div>
      <h3 className="text-xs font-bold text-muted mb-3 flex items-center gap-2"><Icon name="text-height" />اندازهٔ متن</h3>
      <div className="flex items-center gap-4 px-2 mb-6">
        <span className="text-xs" aria-hidden="true">ک</span>
        <input
          type="range"
          min={0}
          max={FONT_SCALES.length - 1}
          step={1}
          value={scaleIdx}
          aria-label="اندازهٔ متن"
          aria-valuetext={SIZE_NAMES[scaleIdx]}
          onChange={(e) => updateSettings({ fontScale: FONT_SCALES[Number(e.target.value)] })}
          className="flex-1 accent-[var(--color-green)] h-1"
        />
        <span className="text-lg" aria-hidden="true">ب</span>
      </div>
      <h3 id="leading-title" className="text-xs font-bold text-muted mb-3 flex items-center gap-2"><Icon name="arrows-up-down" />فاصلهٔ خطوط</h3>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby="leading-title">
        {LINE_HEIGHTS.map((h, i) => (
          <button key={h} type="button" role="radio" aria-checked={settings.lineHeight === h} onClick={() => updateSettings({ lineHeight: h })} className={`min-h-11 px-1 py-2 text-xs text-center rounded-xl border transition-all ${settings.lineHeight === h ? 'bg-green text-on-green border-green' : 'border-line'}`}>
            {LEADING_NAMES[i]}
          </button>
        ))}
      </div>
    </div>
  );
}
