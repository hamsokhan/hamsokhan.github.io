import { beforeEach, describe, expect, it } from 'vitest';
import { getAiSettings, HooshvareError, requestAnalysis, sendChat, setAiSettings } from '../src/ai/client';
import { libraryPoem } from '../src/data/library';
import { exportBackup } from '../src/lib/backup';
import { db, getMeta, setMeta } from '../src/lib/db';

const poem = libraryPoem('hafez-ghazal-1')!;

beforeEach(async () => {
  const d = await db();
  await d.clear('meta');
  await d.clear('analyses');
});

describe('Hooshvare calls on this device', () => {
  it('without a key, nothing is sent and the user is told to add one', async () => {
    await expect(requestAnalysis(poem, 1, 'simple')).rejects.toMatchObject({ code: 'no_key' });
    expect(await getMeta('usage')).toBeUndefined();
  });

  it('enforces the daily cap before any request leaves the device', async () => {
    await setAiSettings({ apiKey: 'test-key-not-real', dailyCap: 30 });
    const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    await setMeta('usage', { requests: 30, inputTokens: 0, outputTokens: 0, since: 0, day, dayRequests: 30 });
    const err = await sendChat(poem, 1, [], 'سلام', new AbortController().signal).catch((e) => e);
    expect(err).toBeInstanceOf(HooshvareError);
    expect(err.code).toBe('quota_exceeded');
  });

  it('keeps the API key out of backups', async () => {
    await setAiSettings({ apiKey: 'sk-ant-should-never-be-exported' });
    expect((await getAiSettings()).apiKey).toBe('sk-ant-should-never-be-exported');
    expect(JSON.stringify(await exportBackup())).not.toContain('sk-ant-should-never-be-exported');
  });
});
