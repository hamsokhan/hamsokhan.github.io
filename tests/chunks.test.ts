import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadChunk } from '../src/lib/chunks';

describe('loadChunk', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns the module when it loads', async () => {
    const reload = vi.fn();
    await expect(loadChunk(async () => 'ok', reload)).resolves.toBe('ok');
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when a chunk is missing, then lets the error through', async () => {
    const reload = vi.fn();
    const fail = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    void loadChunk(fail, reload);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    // A second failure right after the reload must not reload again.
    await expect(loadChunk(fail, reload)).rejects.toThrow('Failed to fetch');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
