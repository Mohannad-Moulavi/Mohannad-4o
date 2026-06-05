import type { ProductData, ImageFile } from '../types';

interface VercelRequest {
  method?: string;
  body: {
    productName: string;
    productImage: ImageFile | null;
    briefDescription: string;
    isNutsOrDriedFruit: boolean;
  };
}

interface VercelResponse {
  setHeader: (name: string, value: string | string[]) => void;
  status: (code: number) => VercelResponse;
  json: (body: any) => void;
  end: (body?: string) => void;
}

type OpenRouterModel = {
  id: string;
  vision: boolean;
};

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MODELS: OpenRouterModel[] = [
  // Best free vision model from OpenRouter list. Reads product images and text.
  { id: 'google/gemma-4-31b-it:free', vision: true },
  // Extra vision fallback from the user's free model list.
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', vision: true },
  // Strong text fallbacks for SEO generation if vision models are busy/limited.
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', vision: false },
  { id: 'openai/gpt-oss-120b:free', vision: false },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', vision: false },
  { id: 'z-ai/glm-4.5-air:free', vision: false },
  { id: 'google/gemma-4-31b-it:free', vision: true },
];

const advancedSeoAnalysisSchema = {
  type: 'object',
  properties: {
    keyphraseSynonyms: {
      type: 'array',
      items: { type: 'string' },
      description: 'آرایه‌ای از حداقل ۳ عبارت کلیدی مترادف یا مرتبط.',
    },
    lsiKeywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'آرایه‌ای از کلیدواژه‌های معنایی مرتبط (LSI).',
    },
    longTailKeywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'آرایه‌ای از ۲ تا ۳ عبارت کلیدی دم‌بلند و دقیق‌تر.',
    },
    semanticEntities: {
      type: 'array',
      items: { type: 'string' },
      description: 'موجودیت‌های معنایی کلیدی مانند برند، دسته‌بندی محصول، و ویژگی‌های اصلی.',
    },
    searchIntent: {
      type: 'string',
      description: 'هدف جستجوی کاربر (مثلاً: خرید، مقایسه، اطلاعاتی).',
    },
    internalLinkingSuggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'کلمات یا عبارات پیشنهادی برای لینک‌دهی داخلی به صفحات مرتبط.',
    },
  },
  required: [
    'keyphraseSynonyms',
    'lsiKeywords',
    'longTailKeywords',
    'semanticEntities',
    'searchIntent',
    'internalLinkingSuggestions',
  ],
  additionalProperties: false,
};

const productSchema = {
  type: 'object',
  properties: {
    correctedProductName: {
      type: 'string',
      description:
        'نام فارسی صحیح و کامل محصول که از روی تصویر تشخیص داده شده است. اگر نام ورودی کاربر صحیح بود، همان نام را برگردان. در صورت عدم وجود تصویر، بر اساس نام ورودی، نام کامل را حدس بزن.',
    },
    englishProductName: {
      type: 'string',
      description: 'نام انگلیسی دقیق محصول که از روی تصویر تشخیص داده شده یا بر اساس دانش عمومی حدس زده شده است.',
    },
    fullDescription: {
      type: 'string',
      description:
        'توضیحات کامل محصول با فرمت HTML. این توضیحات باید با یک پاراگراف مقدمه جذاب شروع شود که شامل نام محصول به صورت <strong>bold</strong> است. بخش‌های مختلف باید با تیترهای مشخص از هم جدا شوند.',
    },
    shortDescription: {
      type: 'string',
      description:
        'یک جمله کوتاه، خلاصه و جذاب برای توضیحات کوتاه محصول (بین ۲۰ تا ۳۰ کلمه). از هیچ‌گونه قالب‌بندی مانند bold یا strong استفاده نکن.',
    },
    seoTitle: {
      type: 'string',
      description: "عنوان سئو جذاب و بهینه (حداکثر ۶۰ کاراکتر) شامل کلیدواژه کانونی و کلمات کلیدی مانند 'خرید' یا 'قیمت'.",
    },
    slug: {
      type: 'string',
      description: 'نامک (slug) سئو شده و تمیز فقط به زبان انگلیسی برای URL.',
    },
    focusKeyword: {
      type: 'string',
      description: 'کلیدواژه کانونی اصلی محصول (به فارسی).',
    },
    metaDescription: {
      type: 'string',
      description:
        'توضیحات متا جذاب برای گوگل (بین ۱۲۰ تا ۱۵۵ کاراکتر) که شامل کلیدواژه کانونی، یک مزیت کلیدی و یک فراخوان به اقدام (CTA) باشد. از هیچ‌گونه قالب‌بندی مانند bold یا strong استفاده نکن.',
    },
    altImageText: {
      type: 'string',
      description: 'متن جایگزین (alt text) توصیفی و بهینه برای تصویر محصول (حداکثر ۱۰ کلمه) که شامل کلیدواژه کانونی باشد.',
    },
    advancedSeoAnalysis: advancedSeoAnalysisSchema,
  },
  required: [
    'correctedProductName',
    'englishProductName',
    'fullDescription',
    'shortDescription',
    'seoTitle',
    'slug',
    'focusKeyword',
    'metaDescription',
    'altImageText',
    'advancedSeoAnalysis',
  ],
  additionalProperties: false,
};

const systemInstruction = `
تو یک متخصص ارشد سئو (SEO) و تولید محتوا برای فروشگاه‌های اینترنتی در ایران هستی. وظیفه تو تولید محتوای کامل و بهینه برای صفحه محصول وردپرس، مطابق با سخت‌گیرانه‌ترین اصول افزونه Yoast SEO است.
تمام خروجی‌ها باید به زبان فارسی روان، جذاب و کاملاً یونیک (غیرکپی) باشد.
داده‌های خروجی باید فقط یک آبجکت JSON معتبر و مطابق با اسکیمای ارائه‌شده باشد. هیچ متن، توضیح، مارک‌داون یا کدبلاک خارج از JSON برنگردان.
`;

const nutsDescriptionPrompt = `
برای فیلد 'fullDescription'، یک متن کامل و تخصصی با فرمت HTML تولید کن که تمام ساختار و قوانین زیر را دقیق و کامل برای محصولات دسته آجیل و خشکبار رعایت کند:

# 1. قوانین کلی محتوا (Yoast SEO)
- طول متن: کل توضیحات باید بین ۲۲۰ تا ۳۰۰ کلمه باشد.
- خوانایی: جملات باید کوتاه و روان باشند. حداقل در ۲۵٪ جملات از کلمات انتقالی استفاده کن و میزان استفاده از صدای مجهول را به کمتر از ۱۰٪ محدود کن.
- استفاده از کلیدواژه کانونی: کلیدواژه باید در پاراگراف اول بیاید و به طور طبیعی ۳ تا ۴ بار در کل متن تکرار شود.
- لینک‌سازی داخلی: در متن، یک عبارت کلیدی مناسب را به یک محصول یا دسته‌بندی مرتبط لینک بده. این لینک باید به صورت یک تگ <a> با href="#" و متنی توصیفی باشد.

# 2. ساختار و فرمت متن
- توضیحات باید با یک پاراگراف مقدمه جذاب با طول ۳۰ تا ۴۰ کلمه شروع شود. این پاراگراف نباید هیچ تیتری داشته باشد.
- سایر بخش‌ها باید دقیقاً به ترتیب زیر باشند. هر بخش با یک تیتر <h5> که شامل ایموجی و متن است شروع می‌شود و با یک جداکننده <hr class="mohannad-divider"> به پایان می‌رسد.

<p>یک پاراگراف مقدمه جذاب با طول ۳۰ تا ۴۰ کلمه که شامل کلیدواژه کانونی است.</p>
<hr class="mohannad-divider">

<h5>✅ مشخصات کلی و مبدأ تولید</h5>
<ul>
  <li>شهر/منطقه کشت</li>
  <li>نوع فرآوری</li>
</ul>
<hr class="mohannad-divider">

<h5>🥗 خواص و ارزش تغذیه‌ای</h5>
<p>در ۲ تا ۳ جمله ساده و علمی، به خواص اصلی مانند پروتئین، فیبر، و فواید اثبات‌شده اشاره کن.</p>
<hr class="mohannad-divider">

<h5>⭐ نکات ویژه / تمایزها</h5>
<ul>
  <li>طعم و تازگی خاص</li>
  <li>بدون افزودنی، ارگانیک، یا بسته‌بندی ویژه</li>
  <li>هر مزیت رقابتی دیگر در یک خط</li>
</ul>
<hr class="mohannad-divider">

<h5>🍽️ پیشنهاد مصرف</h5>
<p>موارد مصرف را پیشنهاد بده.</p>
<hr class="mohannad-divider">

<h5>🧊 روش نگهداری</h5>
<ul>
  <li>محل نگهداری: خشک و خنک، دور از نور</li>
  <li>پس از باز کردن: در ظرف درب‌دار یا یخچال</li>
  <li>زمان ماندگاری پیشنهادی</li>
</ul>
<hr class="mohannad-divider">

<h5>📦 مشخصات محصول</h5>
<ul>
  <li>نوع</li>
  <li>مبدأ</li>
</ul>
<hr class="mohannad-divider">

<h5>⚠️ نکات مهم / هشدارها</h5>
<p>در صورت نیاز، به هشدار آلرژی یا توصیه‌هایی برای افراد با فشار خون بالا اشاره کن.</p>
<hr class="mohannad-divider">

# 3. لحن
لحن متن باید دوستانه، حرفه‌ای و متقاعدکننده باشد و حس کیفیت و اعتماد را منتقل کند.
`;

const standardDescriptionPrompt = `
برای فیلد 'fullDescription'، یک متن کامل با فرمت HTML تولید کن که تمام ساختار و قوانین زیر را دقیق و کامل برای محصولات غیر از آجیل و خشکبار رعایت کند:

# 1. قوانین کلی محتوا (Yoast SEO)
- طول متن: کل توضیحات باید بین ۲۵۰ تا ۳۵۰ کلمه باشد.
- پاراگراف‌ها: یک پاراگراف مقدمه جذاب با طول ۳۰ تا ۴۰ کلمه بنویس. سایر پاراگراف‌ها باید بین ۴۰ تا ۶۰ کلمه باشند.
- خوانایی: جملات باید کوتاه باشند. حداقل در ۲۵٪ جملات از کلمات انتقالی استفاده کن و میزان استفاده از صدای مجهول را به کمتر از ۱۰٪ محدود کن.
- استفاده از کلیدواژه کانونی: کلیدواژه باید در پاراگراف اول بیاید و به طور طبیعی ۳ تا ۴ بار در کل متن تکرار شود.
- لینک‌سازی داخلی: در متن، یک عبارت کلیدی مناسب را به یک محصول یا دسته‌بندی مرتبط لینک بده. این لینک باید به صورت یک تگ <a> با href="#" و متنی توصیفی باشد.

# 2. ساختار و فرمت متن
- بخش‌های تطبیقی: ساختار بخش‌ها باید بر اساس نوع محصول هوشمندانه انتخاب شود. هر بخش باید با یک تیتر <h5> همراه با ایموجی مناسب شروع شود. بخش‌های نامرتبط را حذف کن.
- مثال بخش‌ها:
  - غذا و نوشیدنی: پیشنهاد مصرف، ترکیبات، روش نگهداری
  - لوازم الکترونیکی: مشخصات فنی، ویژگی‌ها، راهنمای استفاده، گارانتی
  - اسباب‌بازی: رده سنی، نکات ایمنی، ارزش آموزشی، جنس و مراقبت
  - پوشاک و اکسسوری: جنس و نگهداری، راهنمای سایز، نکات استایل
  - لوازم آرایشی: ترکیبات، طریقه مصرف، مزایا، هشدارها
- جداکننده: بعد از هر بخش، حتماً از یک تگ <hr /> برای جداسازی استفاده کن. از جداکننده متنی --- استفاده نکن.
- لیست‌ها: برای لیست کردن ویژگی‌ها یا مشخصات، از تگ <ul> و <li> استفاده کن.
- لحن: دوستانه، حرفه‌ای و متقاعدکننده.

# 3. مثال فرمت کلی
<p>یک مقدمه جذاب و کوتاه که کلیدواژه کانونی را طبیعی وارد می‌کند.</p>
<hr />
<h5>✅ ویژگی‌های اصلی:</h5>
<ul>
  <li>ویژگی اول</li>
  <li>ویژگی دوم</li>
</ul>
<hr />
<h5>✨ مزایای استفاده:</h5>
<p>توضیح مزایا به زبان ساده و فروشگاهی.</p>
<hr />
<h5>📦 مشخصات محصول:</h5>
<ul>
  <li>برند یا نوع محصول</li>
  <li>ویژگی مهم</li>
</ul>
<hr />
`;

const schemaInstruction = `
خروجی JSON باید دقیقاً این کلیدها را داشته باشد:
{
  "correctedProductName": "string",
  "englishProductName": "string",
  "fullDescription": "HTML string",
  "shortDescription": "string",
  "seoTitle": "string",
  "slug": "english-url-slug",
  "focusKeyword": "string",
  "metaDescription": "string",
  "altImageText": "string",
  "advancedSeoAnalysis": {
    "keyphraseSynonyms": ["string"],
    "lsiKeywords": ["string"],
    "longTailKeywords": ["string"],
    "semanticEntities": ["string"],
    "searchIntent": "string",
    "internalLinkingSuggestions": ["string"]
  }
}
هیچ کلید اضافه‌ای تولید نکن.
`;

function buildUserPrompt(productName: string, briefDescription: string, productImage: ImageFile | null, imageAttachedForThisModel: boolean) {
  let userPrompt = `بر اساس اطلاعات زیر، محتوای صفحه محصول را تولید کن:\n- نام محصول: "${productName}"`;

  if (briefDescription) {
    userPrompt += `\n- توضیحات اولیه: "${briefDescription}"`;
  }

  if (productImage && imageAttachedForThisModel) {
    userPrompt += '\n- تصویر محصول هم ارسال شده است. از تصویر برای تشخیص نام دقیق فارسی، نام انگلیسی، برند، رنگ، مدل، جنس، جزئیات ظاهری، متن روی بسته‌بندی و Alt Text استفاده کن.';
  } else if (productImage) {
    userPrompt += '\n- کاربر تصویر محصول ارسال کرده بود، اما این مدل پشتیبان متنی است. اگر جزئیات تصویر لازم بود، از نام محصول و توضیحات اولیه بهترین حدس سئویی را بزن.';
  }

  return userPrompt;
}

function buildMessages(
  model: OpenRouterModel,
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  fullSystemInstruction: string,
) {
  const imageAttachedForThisModel = Boolean(productImage && model.vision);
  const content: ChatContentPart[] = [{ type: 'text', text: buildUserPrompt(productName, briefDescription, productImage, imageAttachedForThisModel) }];

  if (productImage && model.vision) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${productImage.mimeType};base64,${productImage.base64}`,
      },
    });
  }

  return [
    {
      role: 'system',
      content: `${fullSystemInstruction}\n\n${schemaInstruction}`,
    },
    {
      role: 'user',
      content,
    },
  ];
}

function getTextFromOpenRouterResponse(data: any): string {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function extractJson(text: string): ProductData {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as ProductData;
  } catch (_error) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as ProductData;
    }

    throw new Error('AI response was not valid JSON.');
  }
}

function validateProductData(data: ProductData) {
  const requiredFields: Array<keyof ProductData> = [
    'correctedProductName',
    'englishProductName',
    'fullDescription',
    'shortDescription',
    'seoTitle',
    'slug',
    'focusKeyword',
    'metaDescription',
    'altImageText',
    'advancedSeoAnalysis',
  ];

  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`AI response is missing field: ${String(field)}`);
    }
  }

  const analysis = data.advancedSeoAnalysis;
  if (!analysis || !Array.isArray(analysis.keyphraseSynonyms) || !Array.isArray(analysis.internalLinkingSuggestions)) {
    throw new Error('AI response has invalid advancedSeoAnalysis.');
  }
}

async function callOpenRouter(
  model: OpenRouterModel,
  apiKey: string,
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  fullSystemInstruction: string,
): Promise<ProductData> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://mohannad-4o.vercel.app',
      'X-Title': 'Mohannad 4o',
    },
    body: JSON.stringify({
      model: model.id,
      messages: buildMessages(model, productName, productImage, briefDescription, fullSystemInstruction),
      temperature: 0.45,
      top_p: 0.9,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText || 'OpenRouter request failed.';
    throw new Error(`${model.id}: ${message}`);
  }

  const text = getTextFromOpenRouterResponse(data);
  if (!text) {
    throw new Error(`${model.id}: empty response from AI model.`);
  }

  const generatedData = extractJson(text);
  validateProductData(generatedData);
  return generatedData;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { productName, productImage, briefDescription, isNutsOrDriedFruit } = req.body;

    if (!productName || typeof productName !== 'string') {
      return res.status(400).json({ message: 'نام محصول الزامی است.' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'OPENROUTER_API_KEY در تنظیمات Vercel تعریف نشده است.' });
    }

    const descriptionGenerationInstruction = isNutsOrDriedFruit ? nutsDescriptionPrompt : standardDescriptionPrompt;
    const fullSystemInstruction = `${systemInstruction}\n\n# Rules for 'fullDescription' field:\n${descriptionGenerationInstruction}`;

    const modelErrors: string[] = [];
    const uniqueModels = MODELS.filter((model, index, arr) => arr.findIndex((item) => item.id === model.id && item.vision === model.vision) === index);

    for (const model of uniqueModels) {
      try {
        const generatedData = await callOpenRouter(model, apiKey, productName, productImage, briefDescription || '', fullSystemInstruction);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Mohannad-Model', model.id);
        return res.status(200).json(generatedData);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Model failed: ${message}`);
        modelErrors.push(message);
      }
    }

    return res.status(502).json({
      message: 'همه مدل‌های رایگان فعلاً خطا یا لیمیت دادند. چند دقیقه بعد دوباره تست کنید یا یک مدل دیگر در api/generate.ts اضافه کنید.',
      details: modelErrors.slice(-3),
    });
  } catch (error) {
    console.error('Error in Vercel function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ message: `Internal Server Error: ${errorMessage}` });
  }
}
