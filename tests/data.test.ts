import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, mergeBackup, parseBackupFile } from '../src/lib/backup';
import { db } from '../src/lib/db';
import { draftFromText, draftProblems, setVerseStart, versesFromDraft } from '../src/lib/importPoem';
import { addUserPoem, conversationList, deleteAnalyses, deleteUserPoem, explainedList, getPoem, glossary, lastRead, libraryMarks, poemMarks, putConversation, putReflection, reflectionList, restoreAnalyses, savedLists, setPoemSaved, setProgress, setVerseSaved, updateUserPoem, verseReflections } from '../src/lib/store';
import { PROMPT_VERSION } from '../shared/contract';
import type { AnalysisRecord } from '../src/lib/db';

async function wipe() {
  const d = await db();
  for (const s of ['userPoems', 'savedPoems', 'savedVerses', 'analyses', 'progress', 'conversations', 'reflections', 'meta'] as const) await d.clear(s);
}
const file = (text: string) => new File([text], 'b.json', { type: 'application/json' });

describe('pasted poem splitting', () => {
  it('pairs lines into verses and keeps text exactly', () => {
    const d = draftFromText('  الف ب  \n\nپ ت\nث ج\nچ ح\n');
    expect(d.map((l) => l.text)).toEqual(['الف ب', 'پ ت', 'ث ج', 'چ ح']);
    expect(versesFromDraft(d).map((v) => v.misras)).toEqual([['الف ب', 'پ ت'], ['ث ج', 'چ ح']]);
  });
  it('splits two misras written on one line with a slash', () => {
    expect(versesFromDraft(draftFromText('مصرع یک / مصرع دو')).map((v) => v.misras)).toEqual([['مصرع یک', 'مصرع دو']]);
  });
  it('keeps a slash line as one verse even after a lone misra', () => {
    expect(versesFromDraft(draftFromText('الف\nب\nپ\nت / ث\nج\nچ')).map((v) => v.misras)).toEqual([['الف', 'ب'], ['پ'], ['ت', 'ث'], ['ج', 'چ']]);
  });
  it('lets the user move verse boundaries, including single-misra verses', () => {
    const d = setVerseStart(draftFromText('a\nb\nc\nd'), 1, true);
    expect(versesFromDraft(d).map((v) => v.misras)).toEqual([['a'], ['b', 'c'], ['d']]);
  });
  it('reports empty and over-long input', () => {
    expect(draftProblems(draftFromText('   '))).toContain('empty');
    expect(draftProblems(draftFromText('x'.repeat(300)))).toContain('line_too_long');
  });
});

describe('local data', () => {
  beforeEach(wipe);

  it('keeps saved items and progress, and lists them', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses: [{ n: 1, misras: ['a', 'b'] }, { n: 2, misras: ['c', 'd'] }] });
    await setPoemSaved('hafez-ghazal-1', true);
    await setVerseSaved(id, 2, true);
    await setProgress(id, 2);
    const lists = await savedLists();
    expect(lists.poems.map((p) => p.poem.id)).toEqual(['hafez-ghazal-1']);
    expect(lists.verses.map((v) => [v.poem.id, v.n])).toEqual([[id, 2]]);
    expect((await lastRead())?.n).toBe(2);
  });

  it('deleting a pasted poem removes what belongs to it only', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses: [{ n: 1, misras: ['a', 'b'] }] });
    await setVerseSaved(id, 1, true);
    await setVerseSaved('hafez-ghazal-1', 1, true);
    await deleteUserPoem(id);
    const lists = await savedLists();
    expect(lists.verses.map((v) => v.poem.id)).toEqual(['hafez-ghazal-1']);
  });
});

describe('backup', () => {
  beforeEach(wipe);

  it('round-trips and merges without deleting local data', async () => {
    await setPoemSaved('hafez-ghazal-1', true, 1000);
    const backup = await exportBackup();
    await wipe();
    await setPoemSaved('saadi-ghazal-402', true, 2000); // exists only locally
    const parsed = await parseBackupFile(file(JSON.stringify(backup)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = await mergeBackup(parsed.backup, false);
    expect(plan).toEqual({ added: 1, updated: 0, unchanged: 0 });
    await mergeBackup(parsed.backup, true);
    const ids = (await savedLists()).poems.map((p) => p.poem.id).sort();
    expect(ids).toEqual(['hafez-ghazal-1', 'saadi-ghazal-402']);
  });

  it('merges conversations message by message', async () => {
    const d = await db();
    const base = { key: 'p#1', poemId: 'p', textVersion: 't', n: 1 };
    await d.put('conversations', { ...base, messages: [{ role: 'user', text: 'local', at: 1 }], updatedAt: 5 });
    const backup = await exportBackup();
    backup.data.conversations = [{ ...base, messages: [{ role: 'user', text: 'remote', at: 2 }], updatedAt: 3 }];
    await mergeBackup(backup, true);
    expect((await d.get('conversations', 'p#1'))!.messages.map((m) => m.text)).toEqual(['local', 'remote']);
  });

  it('rejects corrupt, foreign or newer-schema files and changes nothing', async () => {
    await setPoemSaved('hafez-ghazal-1', true);
    for (const bad of ['{not json', JSON.stringify({ app: 'other' }), JSON.stringify({ app: 'hamsokhan', schema: 99, exportedAt: '', data: {} }), JSON.stringify({ app: 'hamsokhan', schema: 1, exportedAt: '', data: { savedPoems: [{ poemId: 5 }] } })]) {
      const r = await parseBackupFile(file(bad));
      expect(r.ok).toBe(false);
    }
    expect((await savedLists()).poems.length).toBe(1);
  });

  it('never contains secrets', async () => {
    const text = JSON.stringify(await exportBackup());
    expect(text).not.toMatch(/sk-ant|api[_-]?key/i);
  });
});

describe('reviewing and editing local data', () => {
  beforeEach(wipe);

  const verses = [{ n: 1, misras: ['a', 'b'] }, { n: 2, misras: ['c', 'd'] }];
  const analysis = (poemId: string, textVersion: string, n: number, promptVersion = PROMPT_VERSION): AnalysisRecord => ({
    key: `${poemId}|${textVersion}|${n}|simple|${promptVersion}`, poemId, textVersion, n, section: 'simple', data: {}, model: 'm', promptVersion, createdAt: 1,
  });

  it('marks verses with their saved, explained and chat state, ignoring stale explanations', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses });
    const poem = (await getPoem(id))!;
    await setVerseSaved(id, 1, true);
    await restoreAnalyses([analysis(id, poem.textVersion, 2), analysis(id, poem.textVersion, 1, 'old-prompt')]);
    await putConversation({ key: `${id}#2`, poemId: id, textVersion: poem.textVersion, n: 2, messages: [{ role: 'user', text: 'x', at: 1 }], updatedAt: 1 });
    const marks = await poemMarks(poem);
    expect(marks[1]).toEqual({ saved: true, explained: false, simple: false, chat: false });
    expect(marks[2]).toEqual({ saved: false, explained: true, simple: true, chat: true });
  });

  it('groups explanations by verse and restores them after delete', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses });
    const poem = (await getPoem(id))!;
    const rec = analysis(id, poem.textVersion, 1);
    await restoreAnalyses([rec]);
    expect((await explainedList()).map((e) => [e.n, e.sections])).toEqual([[1, ['simple']]]);
    await deleteAnalyses([rec]);
    expect(await explainedList()).toEqual([]);
    await restoreAnalyses([rec]);
    expect(await explainedList()).toHaveLength(1);
  });

  it('builds a glossary from stored word explanations, keeping each verse meaning', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses });
    const poem = (await getPoem(id))!;
    const words = (n: number, quote: string, meaningHere: string): AnalysisRecord => ({
      ...analysis(id, poem.textVersion, n), key: `${id}|${poem.textVersion}|${n}|words|${PROMPT_VERSION}`, section: 'words',
      data: { items: [{ ref: { quote, anchor: null }, meaningHere, note: null, alternatives: [] }] },
    });
    await restoreAnalyses([words(1, 'می', 'شراب'), words(2, 'مي', 'عشق'), analysis(id, poem.textVersion, 1)]);
    const g = await glossary();
    expect(g).toHaveLength(1); // ی/ي count as one word
    expect(g[0].uses.map((u) => [u.n, u.meaning]).sort()).toEqual([[1, 'شراب'], [2, 'عشق']]);
  });

  it('lists only non-empty conversations of the current text', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses });
    const poem = (await getPoem(id))!;
    await putConversation({ key: `${id}#1`, poemId: id, textVersion: poem.textVersion, n: 1, messages: [], updatedAt: 1 });
    await putConversation({ key: `${id}#2`, poemId: id, textVersion: 'old', n: 2, messages: [{ role: 'user', text: 'x', at: 1 }], updatedAt: 1 });
    expect(await conversationList()).toEqual([]);
  });

  it('lists reflections for reading back, per verse and overall', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses });
    await putReflection({ id: 'r1', poemId: id, n: 1, text: 'یک', feedback: null, createdAt: 1 });
    await putReflection({ id: 'r2', poemId: id, n: 2, text: 'دو', feedback: null, createdAt: 2 });
    expect((await verseReflections(id, 2)).map((r) => r.id)).toEqual(['r2']);
    expect((await reflectionList()).map((r) => r.record.id)).toEqual(['r2', 'r1']);
  });

  it('edits a pasted poem; a text change hides explanations of the old text but keeps them', async () => {
    const id = await addUserPoem({ title: 'قدیم', poet: null, verses });
    const before = (await getPoem(id))!;
    await restoreAnalyses([analysis(id, before.textVersion, 1)]);

    await updateUserPoem(id, { title: 'تازه', poet: 'شاعر', verses });
    let after = (await getPoem(id))!;
    expect([after.title, after.poetName, after.textVersion]).toEqual(['تازه', 'شاعر', before.textVersion]);
    expect(await explainedList()).toHaveLength(1);

    await updateUserPoem(id, { title: 'تازه', poet: 'شاعر', verses: [{ n: 1, misras: ['e', 'f'] }] });
    after = (await getPoem(id))!;
    expect(after.textVersion).not.toBe(before.textVersion);
    expect(await explainedList()).toEqual([]);
    const d = await db();
    expect(await d.getAll('analyses')).toHaveLength(1);
  });

  it('reports saved poems and reached verses for the library list', async () => {
    const id = await addUserPoem({ title: null, poet: null, verses });
    await setPoemSaved(id, true);
    await setProgress(id, 2);
    const m = await libraryMarks();
    expect(m.saved.has(id)).toBe(true);
    expect(m.progress.get(id)).toBe(2);
  });
});
