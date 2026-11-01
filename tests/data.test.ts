import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, mergeBackup, parseBackupFile } from '../src/lib/backup';
import { db } from '../src/lib/db';
import { draftFromText, draftProblems, setVerseStart, versesFromDraft } from '../src/lib/importPoem';
import { addUserPoem, deleteUserPoem, lastRead, savedLists, setPoemSaved, setProgress, setVerseSaved } from '../src/lib/store';

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
