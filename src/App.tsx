import { createHashRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { AiGateProvider } from './ai/useAi';
import { ToastProvider } from './components/ui';
import ChatScreen from './screens/Chat';
import Discover from './screens/Discover';
import ImportPoem, { EditPoem } from './screens/ImportPoem';
import Library from './screens/Library';
import NotFound from './screens/NotFound';
import MemorizeScreen from './screens/Memorize';
import PoemPage from './screens/PoemPage';
import PoetDetail from './screens/PoetDetail';
import ReflectScreen from './screens/Reflect';
import Saved from './screens/Saved';
import Settings from './screens/Settings';

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
    children: [
      { path: '/', element: <Discover /> },
      { path: '/library', element: <Library /> },
      { path: '/saved', element: <Saved /> },
      { path: '/settings', element: <Settings /> },
      { path: '/import', element: <ImportPoem /> },
      { path: '/poet/:poetId', element: <PoetDetail /> },
      { path: '/poem/:poemId', element: <PoemPage /> },
      { path: '/poem/:poemId/edit', element: <EditPoem /> },
      { path: '/poem/:poemId/memorize', element: <MemorizeScreen /> },
      { path: '/poem/:poemId/v/:n', element: <PoemPage /> },
      { path: '/poem/:poemId/v/:n/chat', element: <ChatScreen /> },
      { path: '/poem/:poemId/v/:n/reflect', element: <ReflectScreen /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
