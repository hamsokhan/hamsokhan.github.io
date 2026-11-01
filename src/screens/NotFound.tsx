import { Link } from 'react-router';

export default function NotFound({ text = 'این صفحه یا شعر پیدا نشد.' }: { text?: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-base font-bold text-green">{text}</p>
      <Link to="/" className="text-sm text-green underline underline-offset-4">بازگشت به صفحهٔ اصلی</Link>
    </div>
  );
}
