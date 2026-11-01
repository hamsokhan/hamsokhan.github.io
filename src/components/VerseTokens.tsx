import { tokenize } from '../../shared/text';
import type { AnchorT } from '../../shared/contract';

export const inAnchor = (a: AnchorT | null, misra: number, i: number) => !!a && a.misra === misra && i >= a.from && i <= a.to;

/**
 * Renders a verse word by word without altering the text. Annotated words are
 * buttons (dotted underline, not colour alone), and the highlighted span gets a
 * background plus a solid underline.
 */
export function VerseTokens({
  misras,
  annotated = [],
  highlight = null,
  onToken,
  className = 'text-xl leading-relaxed',
}: {
  misras: string[];
  annotated?: (AnchorT | null)[];
  highlight?: AnchorT | null;
  onToken?: (misra: number, i: number) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {misras.map((m, mi) => (
        <span key={mi} className="misra">
          {tokenize(m).map((t, ti) => {
            const isAnn = annotated.some((a) => inAnchor(a, mi, ti));
            const isHi = inAnchor(highlight, mi, ti);
            const cls = `${isHi ? 'bg-selected underline decoration-2 decoration-green underline-offset-8 rounded' : isAnn ? 'underline decoration-dotted decoration-green/60 underline-offset-8' : ''}`;
            return (
              <span key={ti}>
                {ti > 0 && ' '}
                {isAnn && onToken ? (
                  <button type="button" aria-pressed={isHi} onClick={() => onToken(mi, ti)} className={`${cls} px-0.5 -mx-0.5`}>
                    {t.text}
                  </button>
                ) : (
                  <span className={cls}>{t.text}</span>
                )}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
