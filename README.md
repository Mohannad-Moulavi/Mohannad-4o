# Mohannad 4o - GitHub Models Vision 100 - Full Mohannad SEO Output

این نسخه برای مشکل کوتاه بودن توضیحات کامل و کلیدواژه‌ها فیکس شده است.

## تغییرات این نسخه

- fullDescription دیگر نباید فقط ۳ بخش کوتاه بدهد.
- برای محصولات عمومی حداقل چند بخش کامل Mohannad SEO اجباری شده است.
- برای محصولات آرایشی/بهداشتی مثل لوسیون، سرم، کرم، شامپو و ماسک مو بخش‌های زیر اضافه/اجباری شده‌اند:
  - ✅ ویژگی‌های اصلی
  - ✨ مزایای استفاده
  - 📌 طریقه مصرف
  - 🌿 ترکیبات یا فرمولاسیون
  - 🟢 مناسب چه کسانی است؟
  - 🧊 روش نگهداری و نکات مهم
  - 📦 مشخصات محصول
- اگر مدل خروجی کوتاه بدهد، سرور بخش‌های ضروری Mohannad SEO را کامل‌تر می‌کند.
- اعتبارسنجی سخت‌تر شده تا توضیح خیلی کوتاه قبول نشود.

## Vercel Environment Variables پیشنهادی

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

اگر هنوز خروجی کوتاه بود، مقدار زیر را بیشتر کن:

```env
MAX_OUTPUT_TOKENS=4000
```

برای کیفیت بالاتر ولی درخواست روزانه کمتر:

```env
GITHUB_MODEL=openai/gpt-4o
```
