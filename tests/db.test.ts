import { describe, expect, it } from 'vitest';
import { closeDb, DbStuckError, getMeta, setMeta, withDb } from '../src/lib/db';

describe('database guard', () => {
  it('gives up on a stuck operation instead of waiting forever', async () => {
    const started = Date.now();
    await expect(withDb(() => new Promise(() => {}), 200)).rejects.toBeInstanceOf(DbStuckError);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('keeps working after the connection was closed (app sent to the background)', async () => {
    await setMeta('probe', 1);
    closeDb();
    expect(await getMeta('probe')).toBe(1);
  });

  it('retries once when the connection closes under an operation', async () => {
    let calls = 0;
    const out = await withDb(async (d) => {
      calls++;
      if (calls === 1) {
        const e = new Error('closing');
        e.name = 'InvalidStateError';
        throw e;
      }
      return d.name;
    });
    expect(out).toBe('hamsokhan');
    expect(calls).toBe(2);
  });
});
