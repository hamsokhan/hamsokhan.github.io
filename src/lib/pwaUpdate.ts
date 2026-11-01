// Service-worker registration and updates. A new release activates as soon as it
// is downloaded (skipWaiting + clientsClaim in vite.config.ts); the page then
// reloads into it right away, unless the user is typing, has a sheet open or is
// waiting for a response — in that case it reloads the next time the app goes
// to the background. A plain refresh therefore always shows the latest version.

/** True while reloading would lose something the user is doing. */
function busy(): boolean {
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  if (document.querySelector('[role="dialog"]')) return true;
  return !!document.querySelector('[role="status"]'); // a request in progress
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = !!navigator.serviceWorker.controller;
  let pending = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pending) return; // first install: nothing old on screen
    pending = true;
    if (!busy()) window.location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pending) window.location.reload();
    // An installed app can stay open for days; look for a new release when it comes back.
    if (document.visibilityState === 'visible') void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.error('SW register failed', e));
  });
}
