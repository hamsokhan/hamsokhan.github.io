# هم‌سخن

وب‌اپ فارسی (PWA) برای خواندن و فهم شعر کلاسیک: شعر را بخوان، روی بیت بزن، ساده بفهم و هرجا خواستی عمیق‌تر یاد بگیر.

- **اپ:** React + Vite + TypeScript، ذخیرهٔ محلی با IndexedDB، قابل نصب روی اندروید، کارکرد آفلاین برای متن‌ها و توضیح‌های ذخیره‌شده.
- **هوشواره:** یک تابع Firebase (`functions/`) که کلید Anthropic را نگه می‌دارد و مدل Claude را صدا می‌زند. مرورگر هیچ کلیدی ندارد.
- **میزبانی پیشنهادی:** خود اپ روی GitHub Pages و سرور هوشواره روی Firebase Cloud Functions.

## اجرا روی رایانه

```bash
npm install
npm --prefix functions install
```

با سرور آزمایشی؛ پاسخ‌ها برچسب «پاسخ نمونه» دارند و هوشوارهٔ واقعی نیستند:

```bash
npm run dev:mock
```

بدون سرور (توضیح تازه ساخته نمی‌شود و اپ این را صریح می‌گوید):

```bash
npm run dev
```

بررسی‌ها:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

```bash
npm --prefix functions run build
```

## راه‌اندازی هوشوارهٔ واقعی (Firebase + Claude)

این مراحل به حساب‌های شما نیاز دارند و هزینه ایجاد می‌کنند، پس باید خودتان انجامشان دهید.

۱. **پروژهٔ Firebase:** در [console.firebase.google.com](https://console.firebase.google.com) یک پروژه بسازید. Cloud Functions به پلن **Blaze** (پرداخت به‌اندازهٔ مصرف) نیاز دارد. در Google Cloud Billing یک **Budget alert** هم تنظیم کنید.
۲. **Firestore:** در همان پروژه Firestore را فعال کنید. شمارنده‌های سقف مصرف و حافظهٔ مشترک توضیح‌ها آنجا نگهداری می‌شوند. قانون‌های `firestore.rules` هر دسترسی مستقیم از مرورگر را می‌بندند. برای پاک شدن خودکار شمارنده‌های قدیمی می‌توانید روی گروه `hooshvareRate` و فیلد `expireAt` یک **TTL policy** بسازید (اختیاری).
۳. **ابزار Firebase** را نصب کنید و وارد حساب شوید:

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

```bash
firebase use --add
```

۴. **کلید Anthropic** را از [console.anthropic.com](https://console.anthropic.com) بگیرید. برای این کلید در کنسول Anthropic **سقف هزینهٔ ماهانه** بگذارید. بعد آن را فقط در Secret Manager وارد کنید؛ فرمان زیر کلید را از شما می‌پرسد و آن را جایی در پروژه ذخیره نمی‌کند:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

۵. فایل `functions/.env.example` را به `functions/.env` کپی کنید. در `ALLOWED_ORIGINS` نشانی GitHub Pages خود را بنویسید، مثلاً `https://USERNAME.github.io`، بدون مسیر.
۶. انتشار تابع:

```bash
firebase deploy --only functions,firestore:rules
```

۷. نشانی تابع را که در خروجی آمده است (مثل `https://us-central1-PROJECT.cloudfunctions.net/hooshvare`) در `.env.local` بگذارید:

```
VITE_HOOSHVARE_URL=https://us-central1-PROJECT.cloudfunctions.net/hooshvare
```

این نشانی محرمانه نیست. محافظت از هزینه با سقف‌های سمت سرور است.

### سقف‌ها و هزینه

در `functions/.env` تنظیم می‌شوند. هر افزایشی تصمیم هزینه‌ای است.

| تنظیم | پیش‌فرض | معنی |
|---|---|---|
| `HOOSHVARE_MODEL` | `claude-sonnet-5-5` | مدل؛ برای هزینهٔ کمتر `claude-haiku-5-5` را بیازمایید |
| `DAILY_REQUEST_CAP` | ۳۰۰ | حداکثر فراخوانی مدل در روز برای همهٔ کاربران |
| `DAILY_OUTPUT_TOKEN_CAP` | ۳۰۰٬۰۰۰ | حداکثر توکن خروجی در روز |
| `IP_HOURLY_CAP` / `IP_DAILY_CAP` | ۳۰ / ۱۲۰ | سقف درخواست هر IP |

- روز در منطقهٔ زمانی Asia/Baghdad تمام می‌شود.
- مصرف واقعی (توکن‌ها) در Firestore، در `hooshvareUsage/<تاریخ>` ثبت می‌شود. هزینهٔ واقعی را فقط کنسول Anthropic نشان می‌دهد.
- با نرخ‌های اعلام‌شده در آبان ۱۴۰۵، Sonnet 5.5 برای هر میلیون توکن ورودی ۲ دلار و برای هر میلیون توکن خروجی ۱۰ دلار است. پس سقف پیش‌فرض خروجی در بدترین حالت حدود ۳ دلار در روز به‌علاوهٔ هزینهٔ ورودی است. این عدد فقط **برآورد** است.
- برای حفاظت بیشتر در برابر سوءاستفاده، [Firebase App Check](https://firebase.google.com/docs/app-check) را بعداً اضافه کنید. بررسی Origin جلوی اسکریپت‌های خارج از مرورگر را نمی‌گیرد؛ نگهبان اصلی هزینه همین سقف‌ها هستند.

## انتشار اپ روی GitHub Pages

۱. یک مخزن GitHub بسازید و کد را push کنید. GitHub Pages در پلن رایگان فقط برای مخزن **عمومی** فعال است. عمومی کردن مخزن تصمیم شماست؛ هیچ کلیدی در کد نیست.
۲. در Settings → Pages، گزینهٔ Source را «GitHub Actions» بگذارید.
۳. در Settings → Secrets and variables → Actions → Variables، متغیر `VITE_HOOSHVARE_URL` را تعریف کنید.
۴. workflow آماده در `.github/workflows/deploy.yml` با هر push به `main` آزمون‌ها را اجرا و اپ را منتشر می‌کند.

## نصب روی گوشی (Galaxy Z Fold 7)

نشانی GitHub Pages را در Chrome یا Samsung Internet باز کنید و از منو «افزودن به صفحهٔ اصلی» یا «نصب برنامه» را بزنید. با تاشدن و بازشدن صفحه، چیدمان بین حالت تک‌ستونی و دوستونی (شعر کنار توضیح) عوض می‌شود. بیت انتخاب‌شده در نشانی صفحه نگه داشته می‌شود و از دست نمی‌رود.

## سند پروژه

- [docs/PROJECT.md](docs/PROJECT.md): معماری، مدل داده، تصمیم‌ها، محدودیت‌ها و کارهای باقی.
- [docs/SOURCES.md](docs/SOURCES.md): منبع شعرها و روش افزودن شعر تازه.
- [docs/standing-instructions.fa.md](docs/standing-instructions.fa.md): دستور دائمی ساخت و نگهداری.
- [docs/product-brief.fa.md](docs/product-brief.fa.md): پرامپت محصول.
- [design-reference/](design-reference/): بستهٔ طراحی UX Pilot.
