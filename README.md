# Mohannad 4o - GitHub Models GPT-4o

این نسخه OpenRouter را حذف کرده و API را به GitHub Models / Azure OpenAI GPT-4o وصل می‌کند.

## Vercel Environment Variables

در Vercel → Project Settings → Environment Variables اضافه کنید:

```env
GITHUB_TOKEN=github_pat_your_token_here
GITHUB_MODEL=azure-openai/gpt-4o
APP_URL=https://your-vercel-domain.vercel.app
```

کلید GitHub را داخل فایل‌های پروژه نگذارید.

## اجرای لوکال

```bash
npm install
npm run dev
```

## نکات

- endpoint استفاده‌شده: `https://models.github.ai/inference/chat/completions`
- مدل پیش‌فرض: `azure-openai/gpt-4o`
- اگر در صفحه GitHub Models تب Code مدل ID دیگری نشان داد، مقدار `GITHUB_MODEL` را همان قرار بدهید.
- Web Search، خواندن عکس، ساختار Mohannad SEO، کشور مبدأ برند و خروجی Yoast حفظ شده‌اند.
