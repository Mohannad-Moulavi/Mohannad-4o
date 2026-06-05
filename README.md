# Mohannad 4o

ابزار تولید محتوای محصول و سئو برای وردپرس با OpenRouter.

## اجرای لوکال

**پیش‌نیاز:** Node.js

1. نصب پکیج‌ها:

```bash
npm install
```

2. فایل `.env.local` بسازید و کلید OpenRouter را داخل آن بگذارید:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
APP_URL=http://localhost:3000
```

3. اجرا:

```bash
npm run dev
```

## تنظیم روی Vercel

در Vercel وارد Project Settings → Environment Variables شوید و این متغیر را اضافه کنید:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

اختیاری:

```env
APP_URL=https://your-vercel-domain.vercel.app
```

## مدل‌های استفاده‌شده

- `google/gemma-4-31b-it:free` برای عکس + متن
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` برای fallback تصویری
- `qwen/qwen3-next-80b-a3b-instruct:free` برای تولید متن سئوی قوی
- `openai/gpt-oss-120b:free`
- `meta-llama/llama-3.3-70b-instruct:free`
- `z-ai/glm-4.5-air:free`

کلید API داخل پروژه ذخیره نشده است تا روی GitHub یا Vercel لو نرود.


## Vercel Environment Variable

Set `OPENROUTER_API_KEY` in Vercel Project Settings → Environment Variables.

