// A page left open across an update still points at the previous build's chunk
// names, which the new service worker has removed. When such a chunk fails to
// load, reload once so the page picks up the current build. The flag keeps a
// genuinely broken chunk from causing a reload loop; the route's error page
// shows instead.
const RELOAD_FLAG = 'hamsokhan.chunkReload';
const RELOAD_WINDOW_MS = 30_000;

function readFlag(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_FLAG)) || 0;
  } catch {
    return 0;
  }
}

function writeFlag(at: number) {
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(at));
  } catch {
    // Without sessionStorage there is no loop guard, so do not reload.
  }
}

export async function loadChunk<T>(load: () => Promise<T>, reload: () => void = () => window.location.reload()): Promise<T> {
  try {
    return await load();
  } catch (err) {
    const now = Date.now();
    if (navigator.onLine !== false && now - readFlag() > RELOAD_WINDOW_MS) {
      writeFlag(now);
      if (readFlag() === now) {
        reload();
        // Keep the router waiting while the page reloads.
        return new Promise<T>(() => {});
      }
    }
    throw err;
  }
}
