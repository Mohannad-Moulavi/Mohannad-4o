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



## Accurate Web Search Mode

This build keeps web search enabled for all product categories and gives search up to 10 seconds by default. It is designed to avoid replacing the user's product with another product when search results are weak or unrelated.

Recommended Vercel env values:

```
WEB_SEARCH_TIMEOUT_MS=10000
WEB_SEARCH_TOTAL_TIMEOUT_MS=12000
AI_MODEL_TIMEOUT_MS=36000
MAX_OUTPUT_TOKENS=4800
```


## Patch notes

- Accurate web search for every product category, with DuckDuckGo + Bing fallback.
- Search results are filtered by product identity tokens so unrelated results are not sent to the model.
- Primary model is `google/gemini-2.5-flash` for better vision and product understanding; Flash Lite remains as fallback.
- If search cannot confirm a product, the app keeps the user's original product name instead of inventing another product.
- Mohannad SEO HTML structure, Yoast fields, inline `<a href="#">...</a>` and origin/country fields are preserved.
