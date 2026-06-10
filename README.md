# Mohannad 4o - Country Series Fix

این نسخه قانون کشور را مطابق خواسته جدید تنظیم می‌کند:

- «کشور مبدأ برند» در مشخصات محصول نمایش داده نمی‌شود.
- فقط «کشور سازنده» نمایش داده می‌شود.
- اگر کشور سازنده قطعی باشد، همان کشور نوشته می‌شود.
- اگر کشور سازنده مشخص/قطعی نباشد، نوشته می‌شود:
  «کشور سازنده: بسته به سری ساخت ممکن است متفاوت باشد»
- مقدارهای «نامشخص»، «نامعلوم»، `unknown` و مشابه آن نمایش داده نمی‌شوند.
- ساختار کامل Mohannad SEO حفظ شده است.

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
