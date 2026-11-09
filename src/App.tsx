import type React from 'react';
import { createHashRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { AiGateProvider } from './ai/useAi';
import { ToastProvider } from './components/ui';
import { loadChunk } from './lib/chunks';
import Discover from './screens/Discover';

// Every screen except the home page is its own chunk, so the first paint parses
// only what the home page needs. The service worker precaches all chunks, so
// opening another screen offline still works.
type Mod = { default: React.ComponentType };
const page = (load: () => Promise<Mod>) => async () => ({ Component: (await loadChunk(load)).default });
const editPoem = async () => ({ Component: (await loadChunk(() => import('./screens/ImportPoem'))).EditPoem });

function Root() {
  return (
    <ToastProvider>
      <AiGateProvider>
        <Outlet />
        <ScrollRestoration />
      </AiGateProvider>
    </ToastProvider>
  );
}

function RouteLoading() {
  return <div className="min-h-dvh" aria-busy="true" />;
}

function CrashPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-base font-bold text-green">مشکلی در نمایش این صفحه پیش آمد.</p>
      <p className="text-sm text-muted">داده‌های ذخیره‌شدهٔ شما سالم است.</p>
      <div className="flex gap-4">
        <button type="button" className="text-green underline underline-offset-4" onClick={() => window.location.reload()}>بارگذاری دوباره</button>
        <a href="#/" className="text-green underline underline-offset-4">صفحهٔ اصلی</a>
        <a href="./fix.html" className="text-green underline underline-offset-4">صفحهٔ تعمیر</a>
      </div>
    </div>
  );
}

// Hash routing keeps every route working on static hosting (GitHub Pages).
const router = createHashRouter([
  {
    element: <Root />,
    errorElement: <CrashPage />,
    hydrateFallbackElement: <RouteLoading />,
    children: [
      { path: '/', element: <Discover /> },
      { path: '/library', lazy: page(() => import('./screens/Library')) },
      { path: '/saved', lazy: page(() => import('./screens/Saved')) },
      { path: '/settings', lazy: page(() => import('./screens/Settings')) },
      { path: '/import', lazy: page(() => import('./screens/ImportPoem')) },
      { path: '/poet/:poetId', lazy: page(() => import('./screens/PoetDetail')) },
      { path: '/poem/:poemId', lazy: page(() => import('./screens/PoemPage')) },
      { path: '/poem/:poemId/edit', lazy: editPoem },
      { path: '/poem/:poemId/memorize', lazy: page(() => import('./screens/Memorize')) },
      { path: '/poem/:poemId/v/:n', lazy: page(() => import('./screens/PoemPage')) },
      { path: '/poem/:poemId/v/:n/chat', lazy: page(() => import('./screens/Chat')) },
      { path: '/poem/:poemId/v/:n/reflect', lazy: page(() => import('./screens/Reflect')) },
      { path: '*', lazy: page(() => import('./screens/NotFound')) },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
