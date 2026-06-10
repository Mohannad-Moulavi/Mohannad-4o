# Mohannad 4o - GitHub Models Vision 100

این نسخه به GitHub Models وصل است و برای هدف «حداقل حدود 100 درخواست در روز» مدل اصلی را روی مدل کوچک‌تر و کم‌مصرف‌تر گذاشته است:

```env
GITHUB_MODEL=openai/gpt-4o-mini
```

## چرا GPT-4o mini؟

- برای عکس محصول و متن سئو از مدل vision استفاده می‌کند.
- نسبت به GPT-4o کامل، سهمیه روزانه بهتری می‌دهد اگر در GitHub Marketplace به عنوان Low tier نمایش داده شود.
- GPT-4o کامل هنوز به عنوان fallback وجود دارد، اما مدل اصلی نیست.

## Environment Variables در Vercel

```env
GITHUB_TOKEN=your_github_token
GITHUB_MODEL=openai/gpt-4o-mini
APP_URL=https://your-vercel-domain.vercel.app
WEB_SEARCH_TIMEOUT_MS=10000
WEB_SEARCH_TOTAL_TIMEOUT_MS=24000
AI_MODEL_TIMEOUT_MS=55000
MAX_OUTPUT_TOKENS=3600
```

اگر `openai/gpt-4o-mini` خطا داد، در Vercel مقدار مدل را از تب Code همان صفحه GitHub Models بردار. گزینه‌های جایگزین:

```env
GITHUB_MODEL=azure-openai/gpt-4o-mini
```

یا برای کیفیت بالاتر ولی سهمیه کمتر:

```env
GITHUB_MODEL=openai/gpt-4o
```

## نکته امنیتی

توکن GitHub را داخل فایل‌ها نگذار. فقط در Vercel Environment Variables ذخیره کن.
