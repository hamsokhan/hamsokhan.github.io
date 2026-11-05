// Fetches the library poems from the Ganjoor API and writes src/data/library.json.
// Usage: node scripts/fetch-ganjoor.mjs            fetches only poems not yet in library.json
//        node scripts/fetch-ganjoor.mjs --refresh  fetches every poem again
// A refresh can change a poem's textVersion if Ganjoor edited its text, which hides
// the explanations stored for it, so adding a poem must never touch the others.
// Only the poem text is taken; Ganjoor's couplet summaries and comments are NOT
// copied (they are contemporary commentary with their own rights).
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../src/data/library-manifest.json', import.meta.url), 'utf8'));
const Q = 'catInfo=false&rhymes=false&recitations=false&images=false&songs=false&comments=false&verseDetails=true&navigation=false&relatedpoems=false';
const libraryUrl = new URL('../src/data/library.json', import.meta.url);
const stored = process.argv.includes('--refresh') ? [] : JSON.parse(readFileSync(libraryUrl, 'utf8')).poems;

const poems = [];
for (const entry of manifest.poems) {
  const existing = stored.find((p) => p.id === entry.id);
  if (existing) {
    poems.push(existing);
    continue;
  }
  const res = await fetch(`https://api.ganjoor.net/api/ganjoor/poem?url=${encodeURIComponent(entry.ganjoorPath)}&${Q}`);
  if (!res.ok) throw new Error(`${entry.ganjoorPath}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.fullUrl !== entry.ganjoorPath) throw new Error(`${entry.ganjoorPath}: unexpected ${data.fullUrl}`);

  const couplets = new Map();
  for (const v of data.verses) {
    if (v.versePosition !== 0 && v.versePosition !== 1) continue; // prose and other positions are skipped
    if (entry.couplets && (v.coupletIndex < entry.couplets[0] || v.coupletIndex > entry.couplets[1])) continue;
    const list = couplets.get(v.coupletIndex) ?? [];
    list[v.versePosition] = v.text.trim();
    couplets.set(v.coupletIndex, list);
  }
  const verses = [...couplets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([coupletIndex, misras], i) => {
      if (misras.length !== 2 || !misras[0] || !misras[1]) throw new Error(`${entry.id}: incomplete couplet ${coupletIndex}`);
      return { n: i + 1, sourceCoupletIndex: coupletIndex, misras };
    });
  if (!verses.length) throw new Error(`${entry.id}: no verses`);

  const textVersion = createHash('sha256').update(verses.map((v) => v.misras.join('\n')).join('\n\n')).digest('hex').slice(0, 16);
  poems.push({
    id: entry.id,
    poetId: entry.poetId,
    title: entry.title,
    form: entry.form,
    note: entry.note ?? null,
    textVersion,
    source: {
      name: 'گنجور',
      url: `https://ganjoor.net${data.fullUrl}`,
      ganjoorId: data.id,
      fullTitle: data.fullTitle.replace(/\s+/g, ' '),
      excerpt: entry.couplets ? { fromCouplet: entry.couplets[0], toCouplet: entry.couplets[1] } : null,
      fetchedAt: new Date().toISOString().slice(0, 10),
    },
    verses,
  });
  console.log(`${entry.id}: ${verses.length} verses, ${textVersion}`);
}

writeFileSync(libraryUrl, JSON.stringify({ generatedBy: 'scripts/fetch-ganjoor.mjs', poems }, null, 2) + '\n');
