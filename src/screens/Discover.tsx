import { Link, useNavigate } from 'react-router';
import garden from '../assets/garden.jpg';
import { BottomNav, Icon, IconButton } from '../components/ui';
import { libraryPoem, POETS } from '../data/library';
import { faNum } from '../lib/format';
import { lastRead, useQuery } from '../lib/store';

const SUGGESTIONS = [
  { poemId: 'saadi-golestan-1-10', icon: 'feather-pointed', title: 'چند بیت برای مکث و تأمل', text: 'سه بیت کوتاه از گلستان سعدی دربارهٔ پیوند آدم‌ها با یکدیگر؛ آغازی ساده برای خواندن بیت‌به‌بیت.' },
  { poemId: 'hafez-ghazal-255', icon: 'book-open', title: 'آشنایی با زبان حافظ', text: 'غزل «یوسف گم‌گشته» با ردیف «غم مخور»؛ زبانی روشن‌تر برای شروع دوستی با حافظ.' },
];

export default function Discover() {
  const navigate = useNavigate();
  const last = useQuery(lastRead, []);

  return (
    <div className="min-h-dvh pb-28">
      <header className="flex items-center justify-between px-6 py-4 sticky top-0 bg-paper/90 backdrop-blur-sm z-10">
        <div className="text-2xl font-bold text-green tracking-tight">هم‌سخن</div>
        <IconButton icon="gear" label="تنظیمات" onClick={() => navigate('/settings')} />
      </header>

      <div className="max-w-3xl mx-auto">
        <section className="px-6 mb-8">
          <div className="w-full h-48 sm:h-64 rounded-2xl overflow-hidden bg-card editorial-shadow border border-line/50">
            <img src={garden} alt="" className="w-full h-full object-cover opacity-90 dark:opacity-75" />
          </div>
        </section>

        <section className="px-6 mb-10" aria-labelledby="continue-title">
          <div className="flex items-center justify-between mb-4">
            <h2 id="continue-title" className="text-lg font-bold text-green">ادامه خواندن</h2>
            {last.status === 'ready' && last.value && (
              <span className="text-xs text-muted">بیت {faNum(last.value.n)} از {faNum(last.value.poem.verses.length)}</span>
            )}
          </div>
          {last.status === 'ready' && (
            <div className="bg-card p-6 rounded-2xl editorial-shadow border border-line/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10" aria-hidden="true">
                <Icon name="leaf" className="text-green text-4xl" />
              </div>
              {last.value ? (
                <>
                  <p className="text-muted text-sm mb-2">{last.value.poem.poetName ?? 'شاعر نامشخص'}</p>
                  <p className="text-lg leading-relaxed mb-6 font-medium">
                    {last.value.poem.verses[last.value.n - 1].misras.map((m, i) => <span key={i} className="misra">{m}</span>)}
                  </p>
                  <button type="button" onClick={() => navigate(`/poem/${last.value!.poem.id}?v=${last.value!.n}`)} className="w-full py-3 bg-green text-on-green rounded-xl font-medium hover:bg-green-deep transition-colors flex items-center justify-center gap-2">
                    ادامه شعر
                    <Icon name="arrow-left" className="text-sm" />
                  </button>
                </>
              ) : (
                <>
                  <p className="text-base leading-relaxed mb-6 font-medium">هنوز شعری را شروع نکرده‌اید. یکی از پیشنهادهای زیر یا کتابخانه، جای خوبی برای آغاز است.</p>
                  <button type="button" onClick={() => navigate('/library')} className="w-full py-3 bg-green text-on-green rounded-xl font-medium hover:bg-green-deep transition-colors flex items-center justify-center gap-2">
                    رفتن به کتابخانه
                    <Icon name="arrow-left" className="text-sm" />
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <section className="px-6 mb-10" aria-labelledby="start-title">
          <h2 id="start-title" className="text-lg font-bold text-green mb-4">از اینجا آغاز کن</h2>
          <div className="space-y-4">
            {SUGGESTIONS.filter((s) => libraryPoem(s.poemId)).map((s) => (
              <Link key={s.poemId} to={`/poem/${s.poemId}`} className="bg-card p-5 rounded-2xl border border-line/50 flex gap-4 items-start hover:border-green/30 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-paper flex items-center justify-center shrink-0 text-green">
                  <Icon name={s.icon} className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-base mb-1">{s.title}</h3>
                  <p className="text-sm text-muted leading-relaxed line-clamp-2">{s.text}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="px-6 mb-12" aria-label="شاعران">
          <div className="grid grid-cols-2 gap-4">
            {POETS.map((p) => (
              <Link key={p.id} to={`/poet/${p.id}`} className="flex flex-col items-center justify-center p-6 bg-card rounded-2xl border border-line/50 gap-3 hover:border-green/30 transition-all">
                <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center text-green">
                  <Icon name={p.id === 'saadi' ? 'feather-pointed' : 'book-open'} className="text-lg" />
                </div>
                <span className="text-sm font-medium">{p.fullName}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="px-6 mb-8 text-center">
          <Link to="/import" className="text-green text-sm font-medium underline underline-offset-4 decoration-green/30 hover:decoration-green transition-all">
            شعر خودت را وارد کن
          </Link>
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
