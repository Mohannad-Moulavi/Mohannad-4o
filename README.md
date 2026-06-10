# Mohannad 4o - Combined Related + Synonym + LSI Keywords FIX

این نسخه دقیقاً طبق درخواست جدید تنظیم شده است:

- فقط یک باکس در خروجی نمایش داده می‌شود:
  «کلیدواژه‌های مرتبط، مترادف و LSI»
- کلیدواژه‌های مرتبط، مترادف، LSI/معنایی، عبارت‌های خرید و قیمت همگی در همان یک باکس ترکیب می‌شوند.
- هیچ بخش جداگانه‌ای با عنوان‌های زیر نمایش داده نمی‌شود:
  - کلیدواژه‌های مترادف
  - کلیدواژه‌های LSI / معنایی
  - عبارت‌های دم‌بلند
  - موجودیت‌های معنایی
  - هدف جستجو
  - لینک داخلی
- خروجی یک لیست بلند، یک‌خطی و قابل کپی است.
- ساختار کامل Mohannad SEO، کشور سازنده بسته به سری ساخت، و GitHub Models Vision 100 حفظ شده است.

## Vercel Env پیشنهادی

```env
GITHUB_TOKEN=your_github_token
GITHUB_MODEL=openai/gpt-4o-mini
MAX_OUTPUT_TOKENS=3600
AI_MODEL_TIMEOUT_MS=55000
WEB_SEARCH_TOTAL_TIMEOUT_MS=24000
WEB_SEARCH_TIMEOUT_MS=10000
APP_URL=https://your-vercel-domain.vercel.app
INTERNAL_SITE_URL=https://noon-valqalam.ir
```
