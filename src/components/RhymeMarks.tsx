import { tokenize } from '../../shared/text';
import type { MisraRhyme, RhymeScheme } from '../lib/rhyme';
import { updateSettings } from '../lib/settings';
import { Icon } from './ui';

/** Punctuation after a word stays outside its highlight («گلستان،» → «گلستان» + «،»). */
const splitPunct = (w: string) => {
  const m = /^(.*?)([.,،؛;:!?؟»"]*)$/u.exec(w)!;
  return [m[1], m[2]] as const;
};

/** A misra with its rhyme word underlined and its radif tinted. The text itself is unchanged. */
export function RhymedMisra({ text, rhyme }: { text: string; rhyme?: MisraRhyme }) {
  if (!rhyme) return <span className="misra">{text}</span>;
  const tokens = tokenize(text);
  const parts: React.ReactNode[] = [];
  let at = 0;
  const radifStart = rhyme.radifFrom === null ? null : tokens[rhyme.radifFrom].start;
  tokens.forEach((t, i) => {
    if (radifStart !== null && t.start >= radifStart) return;
    if (i !== rhyme.rhyme) return;
    const [word, punct] = splitPunct(t.text);
    parts.push(text.slice(at, t.start), <span key="q" className="rhyme-word">{word}</span>, punct);
    at = t.end;
  });
  if (radifStart !== null) {
    const [radif, punct] = splitPunct(text.slice(radifStart));
    parts.push(text.slice(at, radifStart), <span key="r" className="radif">{radif}</span>, punct);
  } else parts.push(text.slice(at));
  return <span className="misra">{parts}</span>;
}

/** Toggle and legend shown above a mono-rhymed poem. */
export function RhymeLegend({ scheme, on }: { scheme: RhymeScheme; on: boolean }) {
  return (
    <div className="mb-6">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => updateSettings({ showRhyme: !on })}
        className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition-all ${on ? 'bg-green text-on-green border-green' : 'border-line text-muted hover:text-green hover:border-green'}`}
      >
        <Icon name="music" />
        ردیف و قافیه
      </button>
      {on && (
        <div className="mt-3 rounded-xl border border-line bg-card p-4 text-sm leading-relaxed space-y-2">
          {scheme.radif ? (
            <p>
              <span className="radif">ردیف</span>: «{scheme.radif}»؛ واژه یا واژه‌هایی که پایان بیت‌ها عیناً تکرار می‌شوند.
            </p>
          ) : (
            <p>این شعر ردیف ندارد و هر بیت با واژهٔ قافیه تمام می‌شود.</p>
          )}
          <p>
            <span className="rhyme-word">واژهٔ قافیه</span>: واژهٔ هم‌آوای {scheme.radif ? 'پیش از ردیف' : 'پایان بیت'}. در غزل و قصیده مصرع نخستِ بیت اول هم قافیه دارد.
          </p>
          <p className="text-xs text-muted">این نشانه‌ها خودکار و فقط از روی حروف پیدا شده‌اند و ممکن است در چند بیت دقیق نباشند.</p>
        </div>
      )}
    </div>
  );
}
