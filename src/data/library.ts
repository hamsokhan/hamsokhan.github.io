import raw from './library.json';

export interface Verse {
  n: number;
  misras: string[];
}

export interface PoemSource {
  name: string;
  url: string;
  ganjoorId: number;
  fullTitle: string;
  excerpt: { fromCouplet: number; toCouplet: number } | null;
  fetchedAt: string;
}

export interface Poem {
  id: string;
  /** 'library' poems come from a recorded source; 'user' poems were pasted by the user and are unverified. */
  origin: 'library' | 'user';
  poetId: string | null;
  poetName: string | null;
  title: string | null;
  form: string | null;
  note: string | null;
  textVersion: string;
  source: PoemSource | null;
  verses: Verse[];
  createdAt?: number;
}

export interface Poet {
  id: string;
  name: string;
  fullName: string;
  intro: string;
  starterPoemId: string;
  starterWhy: string;
}

export const POETS: Poet[] = [
  {
    id: 'saadi',
    name: 'سعدی',
    fullName: 'سعدی شیرازی',
    intro: 'شاعر و نویسندهٔ شیرازی قرن هفتم هجری، سرایندهٔ بوستان و نویسندهٔ گلستان و صاحب غزل‌هایی که به روانی و سادگی زبان شهره‌اند.',
    starterPoemId: 'saadi-golestan-1-10',
    starterWhy: 'سه بیت کوتاه با زبانی روشن؛ جای خوبی برای آشنایی با شیوهٔ توضیح لایه‌لایه.',
  },
  {
    id: 'hafez',
    name: 'حافظ',
    fullName: 'حافظ شیرازی',
    intro: 'شمس‌الدین محمد حافظ، غزل‌سرای شیرازی قرن هشتم هجری. غزل‌هایش فشرده و چندلایه‌اند و یک بیت او را اغلب می‌توان به چند شیوه خواند.',
    starterPoemId: 'hafez-ghazal-255',
    starterWhy: 'غزلی امیدبخش با ردیف تکرارشوندهٔ «غم مخور» که زبانش از بسیاری غزل‌های دیگر حافظ ساده‌تر است.',
  },
];

export const poetById = (id: string | null) => POETS.find((p) => p.id === id) ?? null;

export const LIBRARY: Poem[] = raw.poems.map((p) => ({
  id: p.id,
  origin: 'library',
  poetId: p.poetId,
  poetName: poetById(p.poetId)?.name ?? null,
  title: p.title,
  form: p.form,
  note: p.note,
  textVersion: p.textVersion,
  source: p.source,
  verses: p.verses.map((v) => ({ n: v.n, misras: v.misras })),
}));

export const libraryPoem = (id: string) => LIBRARY.find((p) => p.id === id) ?? null;

/** Short descriptor for lists, built from recorded source data only. */
export function sourceLine(p: Poem): string {
  if (p.origin === 'user') return 'متن واردشده توسط شما — بررسی‌نشده';
  const parts = p.source!.fullTitle.split('»').map((s) => s.trim());
  return parts.slice(1).join('، ');
}
