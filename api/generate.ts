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
const DUCKDUCKGO_HTML_URL = 'https://duckduckgo.com/html/';
const CURRENT_YEAR = new Date().getFullYear();
const WEB_SEARCH_TIMEOUT_MS = Number(process.env.WEB_SEARCH_TIMEOUT_MS || 700);
const WEB_SEARCH_TOTAL_TIMEOUT_MS = Number(process.env.WEB_SEARCH_TOTAL_TIMEOUT_MS || 950);
const AI_MODEL_TIMEOUT_MS = Number(process.env.AI_MODEL_TIMEOUT_MS || 16000);

const MODELS: OpenRouterModel[] = [
  // Fast professional vision first. Gemini Flash-Lite is much faster for reading product images/labels.
  // It is paid/very cheap on OpenRouter; if the account has no credit, the free fallbacks below will be tried.
  { id: process.env.PRIMARY_VISION_MODEL || 'google/gemini-2.5-flash-lite', vision: true },

  // Free vision fallbacks. openrouter/free routes to an available free model matching image support when possible.
  { id: 'openrouter/free', vision: true },
  { id: 'google/gemma-4-31b-it:free', vision: true },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', vision: true },

  // Strong text fallbacks. They preserve the SEO/product template if vision models are limited.
  { id: 'openai/gpt-oss-120b:free', vision: false },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', vision: false },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', vision: false },
  { id: 'z-ai/glm-4.5-air:free', vision: false },
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
      description: 'موجودیت‌های معنایی کلیدی مانند برند، دسته‌بندی محصول، ویژگی‌های اصلی، تعداد، حجم، وزن، مدل، کشور مبدأ برند یا کشور سازنده.',
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
        'نام فارسی صحیح، کامل و فروشگاهی محصول. نام خام کاربر را اصلاح کن، غلط املایی/ترجمه‌ای را درست کن و اگر از تصویر یا توضیح اولیه مشخص است، برند، مدل، تعداد، وزن، حجم، رنگ، رایحه، طعم، سری یا ویژگی مهم را به نام اضافه کن. اگر مطمئن نیستی، اطلاعات نامطمئن اختراع نکن.',
    },
    englishProductName: {
      type: 'string',
      description: 'نام انگلیسی دقیق و طبیعی محصول، شامل برند/مدل/تعداد یا ویژگی مهم در صورت تشخیص از تصویر یا توضیح.',
    },
    fullDescription: {
      type: 'string',
      description:
        'توضیحات کامل محصول با فرمت HTML دقیقاً طبق قالب تعیین‌شده. باید با پاراگراف مقدمه شروع شود و سپس بخش‌های h5، ایموجی، ul/li، p و hr داشته باشد. اطلاعات قطعی مثل برند، مدل، حجم/وزن و کشور مبدأ برند باید در بخش مشخصات محصول حفظ شود.',
    },
    shortDescription: {
      type: 'string',
      description:
        'یک جمله کوتاه، خلاصه و جذاب برای توضیحات کوتاه محصول (بین ۲۰ تا ۳۰ کلمه). از هیچ‌گونه HTML، bold یا strong استفاده نکن.',
    },
    seoTitle: {
      type: 'string',
      description: "عنوان سئو جذاب و بهینه (حداکثر ۶۰ کاراکتر) شامل کلیدواژه کانونی و کلمات کلیدی مانند 'خرید' یا 'قیمت'.",
    },
    slug: {
      type: 'string',
      description: 'نامک سئو شده، کوتاه و تمیز فقط به زبان انگلیسی برای URL. فقط حروف کوچک انگلیسی، عدد و خط تیره.',
    },
    focusKeyword: {
      type: 'string',
      description: 'کلیدواژه کانونی اصلی محصول به فارسی. بهتر است نسخه کوتاه‌شده correctedProductName باشد.',
    },
    metaDescription: {
      type: 'string',
      description:
        'توضیحات متا جذاب برای گوگل (بین ۱۲۰ تا ۱۵۵ کاراکتر) شامل کلیدواژه کانونی، یک مزیت کلیدی و دعوت به خرید. از HTML یا bold استفاده نکن.',
    },
    altImageText: {
      type: 'string',
      description: 'متن جایگزین تصویر محصول، توصیفی و بهینه، حداکثر ۱۰ کلمه، شامل کلیدواژه کانونی.',
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
تو یک متخصص ارشد سئو (SEO) و تولید محتوا برای فروشگاه‌های اینترنتی در ایران هستی. خروجی باید مناسب صفحه محصول وردپرس و مطابق اصول Yoast SEO باشد.

قانون‌های حیاتی:
1. خروجی فقط یک آبجکت JSON معتبر باشد؛ هیچ متن، توضیح، مارک‌داون یا کدبلاک خارج از JSON ننویس.
2. زبان همه فیلدهای فارسی باید روان، فروشگاهی، طبیعی، یونیک و قابل انتشار باشد. از جمله‌های مصنوعی، تبلیغ اغراق‌آمیز، ترکیب‌های نامأنوس و وعده‌های غیرواقعی پرهیز کن. متن باید مثل توضیح محصول واقعی فروشگاه نوشته شود، نه متن ماشینی.
3. نام خام محصول را اصلاح کن. اگر کاربر نام ناقص، غلط، انگلیسی/فارسی مخلوط یا بدون جزئیات داد، نام صحیح و کامل فروشگاهی بساز.
4. اگر تصویر ارسال شده، متن روی تصویر، برند، تعداد، وزن، حجم، رنگ، رایحه، طعم، مدل، کشور سازنده/کشور مبدأ برند و ویژگی‌های روی بسته‌بندی را بخوان و در correctedProductName، مشخصات و متن لحاظ کن. اگر تصویر واضح است، اطلاعات روی تصویر از حدس ذهنی مهم‌تر است.
4.1. هر اطلاعات قطعی که کاربر در نام یا توضیحات اولیه داده، مثل «برند»، «مدل»، «حجم»، «وزن»، «کشور مبدأ برند»، «کشور سازنده» و «نوع محصول»، باید بدون حذف و بدون تغییر معنی در fullDescription و مخصوصاً بخش «📦 مشخصات محصول» بیاید.
4.2. اگر کاربر نوشته «کشور مبدأ برند: کره جنوبی»، همین مفهوم را با برچسب «کشور مبدأ برند: کره جنوبی» بنویس؛ آن را به «کشور سازنده» تبدیل نکن، مگر خود ورودی چنین گفته باشد.
5. اگر چیزی از تصویر یا توضیحات مشخص نیست، حدس خطرناک نزن؛ اما ویژگی‌های عمومی و رایج همان دسته محصول را طبیعی اضافه کن.
6. ساختار پایه fullDescription را با الهام از قالب اصلی Mohannad SEO حفظ کن، اما بخش‌ها را پویا و متناسب با نوع همان محصول انتخاب کن. برای همه محصولات تیترهای نامناسب و تکراری مثل «چرا انتخاب هوشمندانه است» ننویس.
7. در fullDescription از Markdown، علامت ---، تیترهای h2/h3، جدول، JSON داخلی یا متن بیرون از HTML استفاده نکن.
7.1. در fullDescription دقیقاً ۱ لینک داخلی قابل ویرایش با تگ <a href="#">متن لینک مرتبط</a> قرار بده. لینک باید داخل یک جمله طبیعی و واقع‌گرایانه باشد، نه به شکل باکس جدا یا راهنمای ویرایش. اگر جمله لینک‌دار مصنوعی شد، جمله را بازنویسی کن تا منطقی شود؛ href همیشه باید # باشد.
8. اگر بخش «اطلاعات تازه از جستجوی وب» در پیام کاربر وجود داشت، آن را منبع تازه‌تر از دانش داخلی خودت بدان و برای محصولاتی مثل موبایل، مدل‌های جدید، محصولات ترند و کالاهای وابسته به سال/نسخه، حتماً از همان اطلاعات استفاده کن.
9. نام مدل/نسخه محصول را به مدل قدیمی‌تر تبدیل نکن. اگر کاربر iPhone 17، Galaxy S26 یا هر مدل جدیدی نوشت، مجاز نیستی آن را با iPhone 13، iPhone 15 یا مدل قدیمی جایگزین کنی؛ مگر اینکه جستجوی وب صراحتاً نشان دهد نام واردشده اشتباه است.
10. اگر جستجوی وب اطلاعات قطعی کافی نداد، با همان نام کاربر محتوا بساز و از حدس زدن مشخصات فنی عددی، قیمت، تاریخ عرضه یا ویژگی‌های قطعی خودداری کن.
11. برای امتیاز بهتر Yoast SEO، کلیدواژه کانونی باید در پاراگراف اول، حداقل یک تیتر فرعی، metaDescription، seoTitle، altImageText و به صورت طبیعی چند بار در fullDescription استفاده شود.
12. shortDescription و metaDescription باید کاملاً انسانی و طبیعی باشند؛ جمله‌های کلیشه‌ای مثل «تجربه‌ای بی‌نظیر» یا «بهترین انتخاب برای همه» را استفاده نکن.
13. قبل از نوشتن هر جمله، آن را با عقل محصولی بررسی کن: آیا این محصول واقعاً چنین کاربرد، مزیت یا نتیجه‌ای دارد؟ اگر نه، آن جمله را ننویس.
14. از ترکیب‌های غیرطبیعی و بی‌معنی پرهیز کن؛ نمونه ممنوع: «همراه با انواع قهوه استفاده کنید»، «تجربه طعم‌های متنوع‌تر با این محصول»، «تجربه‌ای نوین را کشف کنید»، «نتیجه بی‌نظیر تضمینی»، «بهترین گزینه برای همه».
15. متن باید شبیه توضیح واقعی فروشگاه باشد: مشخص، ساده، قابل اعتماد و متناسب با همان دسته محصول. برای خوراکی‌ها پیشنهاد مصرف واقعی بده؛ برای شوینده‌ها روش استفاده واقعی؛ برای آرایشی/بهداشتی کاربرد و احتیاط واقعی؛ برای دیجیتال فقط مشخصات مطمئن.
16. ادعای پزشکی، درمانی، تضمینی، قطعی یا اغراق‌آمیز ننویس. اگر اطلاعات قطعی نیست، با جمله عمومی و امن بنویس یا حذف کن.
`;

const nutsDescriptionPrompt = `
برای فیلد 'fullDescription'، یک متن کامل و تخصصی با فرمت HTML تولید کن که تمام ساختار و قوانین زیر را دقیق و کامل برای محصولات دسته آجیل و خشکبار رعایت کند:

# 1. قوانین کلی محتوا (Yoast SEO)
- طول متن: کل توضیحات باید بین ۲۲۰ تا ۳۰۰ کلمه باشد.
- خوانایی: جملات باید کوتاه و روان باشند. حداقل در ۲۵٪ جملات از کلمات انتقالی استفاده کن و میزان استفاده از صدای مجهول را به کمتر از ۱۰٪ محدود کن.
- استفاده از کلیدواژه کانونی: کلیدواژه باید در پاراگراف اول بیاید و به طور طبیعی ۳ تا ۴ بار در کل متن تکرار شود.
- دقیقاً ۱ لینک داخلی قابل ویرایش با href="#" داخل یک جمله طبیعی و مرتبط قرار بده؛ جمله باید با کاربرد واقعی محصول هماهنگ باشد.

# 2. ساختار و فرمت متن بسیار مهم
خروجی fullDescription باید دقیقاً با این ترتیب باشد:

<p>یک پاراگراف مقدمه جذاب با طول ۳۰ تا ۴۰ کلمه که شامل کلیدواژه کانونی و نام اصلاح‌شده محصول است.</p>
<hr class="mohannad-divider">

<h5>✅ مشخصات کلی و مبدأ تولید</h5>
<ul>
  <li>شهر/منطقه کشت یا مبدأ احتمالی، فقط اگر از نام/تصویر/توضیح مشخص است</li>
  <li>نوع فرآوری: خام، بو داده، نمکی یا بدون نمک</li>
  <li>ویژگی ظاهری یا کیفیت محصول</li>
</ul>
<hr class="mohannad-divider">

<h5>🥗 خواص و ارزش تغذیه‌ای</h5>
<p>در ۲ تا ۳ جمله ساده و علمی، به خواص اصلی مانند پروتئین، فیبر، چربی مفید و فواید رایج اشاره کن.</p>
<hr class="mohannad-divider">

<h5>⭐ نکات ویژه / تمایزها</h5>
<ul>
  <li>طعم و تازگی خاص</li>
  <li>بدون افزودنی، بسته‌بندی مناسب یا ویژگی رقابتی مرتبط</li>
  <li>هر مزیت رقابتی دیگر در یک خط</li>
</ul>
<hr class="mohannad-divider">

<h5>🍽️ پیشنهاد مصرف</h5>
<p>موارد مصرف را پیشنهاد بده؛ مانند میان‌وعده، همراه چای، پذیرایی، صبحانه، سالاد یا دسر.</p>
<hr class="mohannad-divider">

<h5>🧊 روش نگهداری</h5>
<ul>
  <li>در جای خشک و خنک و دور از نور مستقیم نگهداری شود</li>
  <li>پس از باز کردن، در ظرف درب‌دار یا یخچال قرار گیرد</li>
  <li>از تماس با رطوبت و گرمای زیاد جلوگیری شود</li>
</ul>
<hr class="mohannad-divider">

<h5>📦 مشخصات محصول</h5>
<ul>
  <li>نوع محصول: بر اساس نام اصلاح‌شده</li>
  <li>فرآوری: بر اساس اطلاعات موجود</li>
  <li>وزن/بسته‌بندی/برند: اگر از تصویر یا توضیح مشخص است</li>
  <li>کشور مبدأ برند: اگر از نام، تصویر، توضیح یا وب‌سرچ مشخص است، حتماً بیاور</li>
  <li>کشور مبدأ/مبدأ تولید/کشور سازنده: فقط اگر مشخص است</li>
</ul>
<hr class="mohannad-divider">

<h5>⚠️ نکات مهم / هشدارها</h5>
<p>به هشدار آلرژی، حساسیت غذایی یا توصیه مصرف متعادل اشاره کن.</p>
<hr class="mohannad-divider">

# 3. لحن
لحن متن باید دوستانه، حرفه‌ای و متقاعدکننده باشد و حس کیفیت و اعتماد را منتقل کند.
`;

const standardDescriptionPrompt = `
برای فیلد 'fullDescription'، یک متن کامل با فرمت HTML تولید کن که تمام ساختار و قوانین زیر را **دقیقاً مطابق سبک اصلی Mohannad SEO** برای محصولات غیر از آجیل و خشکبار رعایت کند. این قانون برای همه خروجی‌های سئو، توضیح کوتاه، توضیح کامل، عنوان و متا باید مبنا باشد: متن طبیعی، دقیق، قابل انتشار، بدون اغراق و مخصوص همان محصول باشد.

# 1. قوانین کلی محتوا (Yoast SEO)
- **طول متن:** کل توضیحات کامل باید بین ۲۵۰ تا ۳۵۰ کلمه باشد.
- **پاراگراف‌ها:** یک پاراگراف مقدمه طبیعی با طول ۳۰ تا ۴۰ کلمه بنویس. سایر پاراگراف‌ها بین ۴۰ تا ۶۰ کلمه باشند.
- **خوانایی:** جملات کوتاه و روان باشند. از جمله‌های مصنوعی، ترجمه‌ای، اغراق‌آمیز و نامرتبط استفاده نکن.
- **استفاده از کلیدواژه کانونی:** کلیدواژه باید در پاراگراف اول بیاید و طبیعی ۳ تا ۴ بار در کل متن تکرار شود.
- **لینک‌سازی داخلی:** در متن کامل، دقیقاً یک عبارت مرتبط را با تگ \`<a href="#">عبارت مرتبط</a>\` لینک کن. جمله لینک‌دار باید طبیعی و منطقی باشد. لینک را به صورت باکس جدا یا راهنمای ویرایش ننویس.
- **واقع‌گرایی:** هر جمله باید با کاربرد واقعی محصول جور باشد. مزایا، روش مصرف، ترکیبات، هشدارها و مشخصات را بر اساس نوع همان محصول بنویس.

# 2. ساختار و فرمت متن (ساختار اصلی Mohannad SEO)
- توضیحات باید با یک پاراگراف مقدمه بدون تیتر شروع شود:
<p>مقدمه طبیعی، فروشگاهی و مخصوص محصول که نام محصول و کلیدواژه کانونی را دارد.</p>
<hr />

- سپس بخش‌ها باید با \`<h5>\` همراه ایموجی باشند و بعد از هر بخش دقیقاً \`<hr />\` بیاید.
- بخش‌ها باید **پویا و متناسب با نوع محصول** باشند؛ بخش نامرتبط را ننویس.
- برای ویژگی‌ها و مشخصات از \`<ul>\` و \`<li>\` استفاده کن.
- از Markdown، علامت ---، جدول، h2، h3 یا متن خارج از HTML استفاده نکن.

# 3. بخش‌های پایه پیشنهادی
برای بیشتر محصولات این بخش‌ها را با همین سبک بساز، اما بخش تکمیلی را متناسب با نوع محصول انتخاب کن:

<p>مقدمه...</p>
<hr />
<h5>✅ ویژگی‌های اصلی:</h5>
<ul>
  <li>ویژگی واقعی و مخصوص محصول</li>
  <li>ویژگی واقعی و مخصوص محصول</li>
</ul>
<hr />
<h5>✨ مزایای استفاده:</h5>
<p>مزایای واقعی و قابل اعتماد محصول برای خریدار.</p>
<hr />
<h5>بخش تکمیلی متناسب با محصول</h5>
<p>یا لیست تخصصی لازم برای همان دسته محصول.</p>
<hr />
<h5>📦 مشخصات محصول:</h5>
<ul>
  <li>برند: اگر از نام، تصویر، توضیح یا وب‌سرچ مشخص است</li>
  <li>مدل: اگر مشخص است</li>
  <li>نوع محصول: دسته‌بندی دقیق محصول</li>
  <li>حجم/وزن/تعداد/رنگ/رایحه/طعم: فقط موارد قطعی</li>
  <li>کشور مبدأ برند: اگر کاربر، تصویر یا وب‌سرچ مشخص کرده، **حتماً** با همین برچسب بیاور</li>
  <li>کشور مبدأ: اگر مبدأ محصول مشخص است ولی برند نیست، با همین برچسب بیاور</li>
  <li>کشور سازنده: فقط اگر مشخص است و با کشور مبدأ برند فرق دارد</li>
  <li>کاربرد: کاربرد اصلی محصول</li>
</ul>
<hr />

# 4. راهنمای انتخاب بخش تکمیلی بر اساس نوع محصول
- **غذا و نوشیدنی:** «🍽️ پیشنهاد مصرف:» | «🧊 روش نگهداری:» | «🌿 ترکیبات:»
- **آرایشی و بهداشتی / مراقبت مو و پوست:** «📌 طریقه مصرف:» | «🌿 ترکیبات مؤثر:» | «🟢 نکات مهم:»
- **شوینده و نظافت:** «🧴 راهنمای کاربردی استفاده:» | «⚠️ نکات ایمنی و نگهداری صحیح:»
- **لوازم الکترونیکی:** «⚙️ مشخصات فنی:» | «🔌 راهنمای استفاده:» | «🛡️ نکات گارانتی و نگهداری:»
- **اسباب‌بازی:** «👶 رده سنی:» | «⚠️ نکات ایمنی:» | «🎓 ارزش آموزشی:»
- **پوشاک و اکسسوری:** «🧵 جنس و نگهداری:» | «📏 راهنمای سایز:» | «👕 نکات استایل:»
- **کتاب و نوشت‌افزار:** «📚 مناسب چه کسانی است؟» | «✍️ کاربرد آموزشی:»

# 5. قوانین مهم مشخصات محصول
- اگر کاربر اطلاعات ساختاری داد، مثل:
  برند: Elizavecca
  مدل: CER-100 Collagen Ceramide Coating Protein Treatment
  حجم: ۱۰۰ میلی‌لیتر
  کشور مبدا برند: کره جنوبی
  نوع محصول: ماسک پروتئین مو برای ترمیم و احیا
  باید همه این موارد **بدون حذف** در بخش «📦 مشخصات محصول» بیایند.
- اگر کاربر نوشته «کشور مبدا برند»، آن را به «کشور سازنده» تبدیل نکن. دقیقاً با برچسب «کشور مبدأ برند» بنویس.
- اگر فقط «کشور مبدا» نوشته، با برچسب «کشور مبدأ» بنویس.
- «نامشخص» ننویس؛ اگر اطلاعاتی مشخص نیست، آن خط را حذف کن.

# 6. کنترل کیفیت متن
- متن باید مثل توضیح واقعی فروشگاه باشد، نه متن ماشینی.
- جمله‌های ممنوع: «تجربه‌ای نوین را کشف کنید»، «بهترین انتخاب برای همه»، «نتیجه تضمینی»، «بی‌نظیر و فوق‌العاده» مگر واقعاً طبیعی و کم‌اغراق باشد.
- برای محصولات مراقبت مو/پوست، ادعای درمان قطعی ننویس؛ فقط درباره کمک به نرمی، مراقبت، رطوبت، ترمیم ظاهری یا استفاده صحیح بنویس.
- برای خوراکی‌ها، پیشنهاد مصرف واقعی بده؛ جمله‌ای مثل «همراه با انواع قهوه استفاده کنید» ننویس مگر واقعاً محصول مکمل قهوه باشد.

# 7. نمونه فرمت کلی، فقط برای الهام
<p>با کرم دور چشم کلینیک آل ابوت آیز ریچ، رطوبت عمقی پوست حساس اطراف چشم را تامین کرده و ظاهر پف و تیرگی را کاهش دهید.</p>
<hr />
<h5>✅ ویژگی‌های اصلی:</h5>
<ul>
  <li>فرمولاسیون غنی برای آبرسانی</li>
  <li>مناسب پوست حساس اطراف چشم</li>
</ul>
<hr />
<h5>✨ مزایای استفاده:</h5>
<p>این کرم به نرم‌تر شدن پوست اطراف چشم کمک می‌کند و برای استفاده روزانه گزینه‌ای کاربردی است.</p>
<hr />
<h5>📌 طریقه مصرف:</h5>
<p>صبح و شب مقدار کمی از محصول را با ضربات ملایم روی پوست اطراف چشم پخش کنید.</p>
<hr />
<h5>📦 مشخصات محصول:</h5>
<ul>
  <li>برند: کلینیک</li>
  <li>حجم: ۱۵ میلی‌لیتر</li>
  <li>کشور مبدأ برند: آمریکا</li>
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


function decodeHtmlEntities(input: string): string {
  return String(input || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function cleanSearchText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function withFallbackTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function extractDuckDuckGoResults(html: string): string[] {
  const results: string[] = [];
  const blocks = html.match(/<div[^>]+class="[^"]*result[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*result[^"]*"|<\/body>)/gi) || [];

  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const urlMatch = block.match(/<a[^>]+class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<span[^>]+class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/span>/i);

    const title = cleanSearchText(titleMatch?.[1] || '');
    const snippet = cleanSearchText(snippetMatch?.[1] || '');
    const url = cleanSearchText(urlMatch?.[1] || '');

    if (title || snippet) {
      results.push([title, snippet, url ? `منبع: ${url}` : ''].filter(Boolean).join(' — '));
    }

    if (results.length >= 5) break;
  }

  return results;
}

function shouldSearchWeb(productName: string, briefDescription: string): boolean {
  const text = `${productName} ${briefDescription}`.toLowerCase();
  const modernSignals = [
    'iphone', 'آیفون', 'ایفون', 'samsung', 'galaxy', 'xiaomi', 'شیائومی', 'playstation', 'ps5', 'ps6',
    'macbook', 'ipad', 'airpods', 'گوشی', 'موبایل', 'لپ تاپ', 'لپ‌تاپ', 'تلویزیون', 'هدفون', 'ساعت هوشمند',
    '2024', '2025', '2026', '2027', 'جدید', 'مدل جدید', 'نسخه جدید', 'پرو مکس', 'pro max', 'ultra', 'هوشمند'
  ];

  return modernSignals.some((signal) => text.includes(signal));
}

async function searchWebForProduct(productName: string, briefDescription: string, isNutsOrDriedFruit: boolean): Promise<string> {
  const normalizedName = productName.trim();
  if (!normalizedName) return '';

  // Fast-search mode: search is enabled for every product category, but only one lightweight query is used.
  // This keeps product facts fresher without making the user wait for slow crawling.
  const contextWords = String(briefDescription || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  const query = `${normalizedName} ${contextWords} مشخصات ویژگی کشور مبدا برند`.trim();
  const collected: string[] = [];

  try {
    const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}&kl=wt-wt`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Mohannad4oBot/1.0; +https://mohannad-4o.vercel.app)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, WEB_SEARCH_TIMEOUT_MS);

    if (response.ok) {
      const html = await response.text();
      const results = extractDuckDuckGoResults(html);
      for (const result of results) {
        if (!collected.includes(result)) collected.push(result);
        if (collected.length >= 3) break;
      }
    }
  } catch (error) {
    console.warn(`Fast web search failed for query "${query}":`, error);
  }

  if (collected.length === 0) return '';

  return [
    `تاریخ امروز برای تشخیص تازگی اطلاعات: ${new Date().toISOString().slice(0, 10)}`,
    `عبارت جستجو شده: ${normalizedName}`,
    ...collected.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}


function buildUserPrompt(
  productName: string,
  briefDescription: string,
  productImage: ImageFile | null,
  imageAttachedForThisModel: boolean,
  isNutsOrDriedFruit: boolean,
  webSearchContext: string,
) {
  let userPrompt = `اطلاعات محصول برای تولید محتوای وردپرس:\n- نام خام محصول واردشده توسط کاربر: "${productName}"`;

  if (briefDescription && briefDescription.trim()) {
    userPrompt += `\n- توضیحات اولیه کاربر: "${briefDescription.trim()}"`;
  }

  userPrompt += `\n- دسته خروجی: ${isNutsOrDriedFruit ? 'آجیل یا خشکبار' : 'محصول عمومی/غیرخشکبار'}`;
  userPrompt += `\n\nوظیفه تو:\n1. نام محصول را اصلاح و کامل کن. correctedProductName باید بهترین نام فروشگاهی فارسی باشد، نه فقط تکرار نام خام کاربر.\n2. اگر محصول تعداد، وزن، حجم، مدل، برند، سری، رنگ، رایحه یا طعم دارد و از نام/عکس/توضیح مشخص است، آن را به نام و مشخصات اضافه کن.\n3. fullDescription را با قالب پایه بساز و بخش تکمیلی را فقط بر اساس نیاز و نوع همان محصول انتخاب کن؛ تیترهای نامناسب را برای همه محصولات تکرار نکن.\n4. متن باید مخصوص همین محصول باشد و کلی‌گویی بی‌ارزش نداشته باشد.\n5. اگر اطلاعاتی مطمئن نیست، آن را به صورت عدد/مدل قطعی ننویس.
6. اگر کاربر فیلدهایی مثل برند، مدل، حجم، کشور مبدأ برند، کشور مبدأ، کشور سازنده یا نوع محصول داده، همان‌ها را با همان برچسب در بخش 📦 مشخصات محصول حفظ کن و حذف نکن.`;

  if (productImage && imageAttachedForThisModel) {
    userPrompt += '\n\nتصویر محصول هم ارسال شده است. تصویر را دقیق بخوان: متن روی بسته‌بندی، لوگو، برند، تعداد، وزن/حجم، مدل، رنگ، رایحه/طعم، کاربرد و جزئیات ظاهری را استخراج کن و در نام اصلاح‌شده و مشخصات محصول لحاظ کن.';
  } else if (productImage) {
    userPrompt += '\n\nکاربر تصویر ارسال کرده، اما این مدل fallback متنی است و تصویر را نمی‌بیند. بنابراین فقط بر اساس نام و توضیحات اولیه بهترین خروجی سئویی را بساز و جزئیات نامطمئن تصویر را اختراع نکن.';
  }

  if (webSearchContext && webSearchContext.trim()) {
    userPrompt += `\n\n# اطلاعات تازه از جستجوی وب\n${webSearchContext.trim()}\n\nقانون استفاده از سرچ وب:\n- این اطلاعات را برای مدل‌ها/نسخه‌های جدید، مشخصات محصول و اصلاح نام، از دانش داخلی خودت معتبرتر بدان.\n- اگر نام خام محصول جدید است، آن را به محصول قدیمی‌تر تغییر نده. مثال: اگر کاربر «ایفون 17» نوشته، آن را به «ایفون 13» تبدیل نکن.\n- اگر نتایج سرچ فقط بخشی از مشخصات را تأیید می‌کنند، فقط همان بخش‌های مطمئن را بنویس و بقیه را عمومی و بدون عددسازی توضیح بده.\n- قیمت روز، موجودی، تاریخ عرضه قطعی و مشخصات عددی نامطمئن را اختراع نکن.`;
  } else {
    userPrompt += '\n\n# تازگی اطلاعات\nاگر محصول وابسته به سال، نسخه یا مدل جدید است و اطلاعات قطعی نداری، نام کاربر را به مدل قدیمی‌تر تبدیل نکن و مشخصات نامطمئن را قطعی ننویس.';
  }

  return userPrompt;
}

function buildMessages(
  model: OpenRouterModel,
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  fullSystemInstruction: string,
  isNutsOrDriedFruit: boolean,
  webSearchContext: string,
) {
  const imageAttachedForThisModel = Boolean(productImage && model.vision);
  const content: ChatContentPart[] = [
    { type: 'text', text: buildUserPrompt(productName, briefDescription, productImage, imageAttachedForThisModel, isNutsOrDriedFruit, webSearchContext) },
  ];

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


function normalizeInlineLinksInHtml(html: string): string {
  let output = String(html || '')
    // لینک‌های واقعی یا خارجی نباید وارد توضیحات شوند؛ فقط جایگاه قابل ویرایش با href="#" بماند.
    .replace(/<a\b([^>]*)href=["'][^"']*["']([^>]*)>/gi, '<a href="#">')
    .replace(/<a\b(?![^>]*href=)([^>]*)>/gi, '<a href="#">')
    .replace(/https?:\/\/[^\s<"']+/gi, '#')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return output;
}

function normalizeSlug(slug: string): string {
  return String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}


function escapeHtmlText(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type InputDetail = { label: string; value: string };

function normalizeDetailValue(value: string): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[؛;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractStructuredInputDetails(rawProductName: string, briefDescription: string): InputDetail[] {
  const source = `${rawProductName || ''}\n${briefDescription || ''}`;
  const details: InputDetail[] = [];
  const seen = new Set<string>();

  const addDetail = (label: string, rawValue: string) => {
    const value = normalizeDetailValue(rawValue);
    if (!value) return;
    const key = `${label}:${value}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    details.push({ label, value });
  };

  const patterns: Array<{ label: string; regex: RegExp }> = [
    { label: 'برند', regex: /^\s*برند\s*[:：\-]\s*(.+)$/i },
    { label: 'مدل', regex: /^\s*مدل\s*[:：\-]\s*(.+)$/i },
    { label: 'حجم', regex: /^\s*حجم\s*[:：\-]\s*(.+)$/i },
    { label: 'وزن', regex: /^\s*وزن\s*[:：\-]\s*(.+)$/i },
    { label: 'تعداد', regex: /^\s*تعداد\s*[:：\-]\s*(.+)$/i },
    { label: 'رنگ', regex: /^\s*رنگ\s*[:：\-]\s*(.+)$/i },
    { label: 'رایحه', regex: /^\s*رایحه\s*[:：\-]\s*(.+)$/i },
    { label: 'طعم', regex: /^\s*طعم\s*[:：\-]\s*(.+)$/i },
    { label: 'نوع محصول', regex: /^\s*نوع\s*محصول\s*[:：\-]\s*(.+)$/i },
    { label: 'کشور مبدأ برند', regex: /^\s*کشور\s*مب[ددا][أا]?\s*برند\s*[:：\-]\s*(.+)$/i },
    { label: 'کشور مبدأ برند', regex: /^\s*کشور\s*مبدا\s*برند\s*[:：\-]\s*(.+)$/i },
    { label: 'کشور مبدأ برند', regex: /^\s*مب[ددا][أا]?\s*برند\s*[:：\-]\s*(.+)$/i },
    { label: 'کشور مبدأ', regex: /^\s*کشور\s*مب[ددا][أا]?\s*[:：\-]\s*(.+)$/i },
    { label: 'کشور مبدأ', regex: /^\s*مب[ددا][أا]?\s*[:：\-]\s*(.+)$/i },
    { label: 'کشور سازنده', regex: /^\s*کشور\s*(?:سازنده|تولید|ساخت)\s*[:：\-]\s*(.+)$/i },
  ];

  for (const rawLine of source.split(/\n|\r|\u2028|\u2029/)) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const item of patterns) {
      const match = line.match(item.regex);
      if (!match) continue;
      addDetail(item.label, match[1]);
      break;
    }
  }

  // A small safe fallback for the sample/problem case: Elizavecca is a Korean beauty brand.
  // This only runs when the user did not explicitly provide country origin and the product text clearly contains the brand.
  const hasCountryOrigin = details.some((detail) => /کشور\s*مبدأ/.test(detail.label) || /کشور\s*سازنده/.test(detail.label));
  if (!hasCountryOrigin && /\bElizavecca\b|الیزاوکا|الیزاوکا|الیزاوکا|الیزاوزکا/i.test(source)) {
    addDetail('کشور مبدأ برند', 'کره جنوبی');
  }

  return details;
}

function hasExactDetailPair(output: string, detail: InputDetail): boolean {
  const labelPattern = escapeRegExp(detail.label).replace(/مبدأ/g, 'مب(?:دأ|دا|داء|داء|دأ|دا)');
  const valuePattern = escapeRegExp(detail.value).replace(/\s+/g, '\\s*');
  const pairRegex = new RegExp(`${labelPattern}\\s*[:：-]\\s*${valuePattern}`, 'i');
  return pairRegex.test(output);
}

function ensureKnownDetailsInDescription(
  html: string,
  rawProductName: string,
  briefDescription: string,
): string {
  const details = extractStructuredInputDetails(rawProductName, briefDescription);
  if (details.length === 0) return html;

  let output = String(html || '').trim();
  if (!output) return output;

  // These details are source-of-truth fields. They must appear in the specs list with their label,
  // even if the model mentioned the value somewhere else in prose.
  const missingDetails = details.filter((detail) => !hasExactDetailPair(output, detail));

  if (missingDetails.length === 0) return output;

  const detailItems = missingDetails
    .map((detail) => `  <li>${escapeHtmlText(detail.label)}: ${escapeHtmlText(detail.value)}</li>`)
    .join('\n');

  const specsPattern = /(<h5>\s*📦\s*مشخصات\s*محصول\s*:?\s*<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/i;
  if (specsPattern.test(output)) {
    return output.replace(specsPattern, (_match, open, body, close) => `${open}${String(body).trimEnd()}\n${detailItems}\n${close}`);
  }

  const fallbackSection = `\n<hr />\n<h5>📦 مشخصات محصول:</h5>\n<ul>\n${detailItems}\n</ul>\n<hr />`;
  return `${output}${fallbackSection}`;
}

function getNaturalInlineLinkSentence(
  rawProductName: string,
  data: ProductData,
  isNutsOrDriedFruit: boolean,
): string {
  const text = [
    rawProductName,
    data.correctedProductName,
    data.focusKeyword,
    data.englishProductName,
    ...(data.advancedSeoAnalysis?.semanticEntities || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

  if (isNutsOrDriedFruit || has([/آجیل|خشکبار|پسته|بادام|گردو|فندق|کشمش|خرما|انجیر|توت خشک|مویز|تخمه|cashew|pistachio|almond|walnut|date/])) {
    return 'اگر قصد خرید چند محصول پذیرایی دارید، بخش <a href="#">آجیل و خشکبار</a> می‌تواند گزینه‌های مکمل مناسبی را پیش روی شما بگذارد.';
  }

  if (has([/کافی\s*میت|coffee\s*mate|creamer|پودر خامه|قهوه|کافی|نسکافه|کاپوچینو|coffee|nescafe/])) {
    return 'اگر در کنار این محصول به نوشیدنی‌های گرم یا مکمل‌های کافی‌شاپی نیاز دارید، بخش <a href="#">انواع قهوه</a> می‌تواند گزینه‌های مرتبط‌تری نشان دهد.';
  }

  if (has([/شامپو|ماسک مو|نرم.?کننده مو|سرم مو|تقویت مو|مو\b|hair|shampoo|clear|کلیر|هد اند شولدرز|head\s*&?\s*shoulders|pantene|پنتن/])) {
    return 'برای کامل‌تر شدن روتین مراقبت مو، می‌توانید محصولات مرتبط در بخش <a href="#">مراقبت و زیبایی مو</a> را هم بررسی کنید.';
  }

  if (has([/خمیر دندان|مسواک|دهان|دندان|نخ دندان|دهانشویه|tooth|toothpaste|oral|mouth/])) {
    return 'برای تکمیل مراقبت روزانه دهان، محصولات بخش <a href="#">بهداشت دهان و دندان</a> انتخاب‌های مرتبط‌تری در اختیار شما می‌گذارند.';
  }

  if (has([/کرم|لوسیون|ضد آفتاب|آبرسان|مرطوب.?کننده|پوست|آرایشی|بهداشتی|ریمل|رژ|پنکک|کازمتیک|cosmetic|cream|lotion|sunscreen|skin/])) {
    return 'اگر به دنبال محصولات مکمل هستید، دسته <a href="#">لوازم آرایشی و بهداشتی</a> گزینه‌های مرتبط بیشتری دارد.';
  }

  if (has([/پاد لباسشویی|مایع لباسشویی|پودر لباسشویی|نرم کننده لباس|مایع ظرفشویی|قرص ظرفشویی|جرم.?گیر|شوینده|پاک.?کننده|لباسشویی|ظرفشویی|detergent|cleaner|dishwasher/])) {
    return 'برای خرید کامل‌تر محصولات نظافت منزل، بخش <a href="#">مواد شوینده</a> گزینه‌های مرتبط دیگری هم دارد.';
  }

  if (has([/موبایل|گوشی|آیفون|iphone|samsung|سامسونگ|شیائومی|xiaomi|لپ.?تاپ|تبلت|هدفون|هندزفری|شارژر|دیجیتال|galaxy|airpods/])) {
    return 'اگر به لوازم جانبی یا محصولات مشابه نیاز دارید، بخش <a href="#">کالای دیجیتال</a> می‌تواند انتخاب‌های مرتبط‌تری ارائه دهد.';
  }

  if (has([/برنج|روغن|چای|نوشیدنی|شکلات|بیسکویت|خوراکی|غذایی|رب|تن ماهی|ماکارونی|زعفران|rice|tea|food/])) {
    return 'برای تکمیل سبد خرید روزانه، بخش <a href="#">هایپرمارکت و مواد غذایی</a> محصولات مرتبط بیشتری دارد.';
  }

  return 'برای مقایسه و انتخاب بهتر، می‌توانید گزینه‌های مشابه در بخش <a href="#">محصولات مرتبط</a> را هم ببینید.';
}

function injectNaturalInlineInternalLink(html: string, sentence: string): string {
  const cleanHtml = normalizeInlineLinksInHtml(html);
  if (!cleanHtml) return cleanHtml;
  if (/<a\b[^>]*href=["']#["'][^>]*>/i.test(cleanHtml)) {
    return cleanHtml;
  }

  const benefitsPattern = /(<h5>\s*✨\s*مزایای استفاده:\s*<\/h5>\s*<p>)([\s\S]*?)(<\/p>)/i;
  if (benefitsPattern.test(cleanHtml)) {
    return cleanHtml.replace(benefitsPattern, (_match, open, body, close) => `${open}${String(body).trim()} ${sentence}${close}`);
  }

  const firstParagraphPattern = /(<p>)([\s\S]*?)(<\/p>)/i;
  if (firstParagraphPattern.test(cleanHtml)) {
    return cleanHtml.replace(firstParagraphPattern, (_match, open, body, close) => `${open}${String(body).trim()} ${sentence}${close}`);
  }

  return `${cleanHtml}\n<p>${sentence}</p>`;
}

function ensureNaturalInlineInternalLink(
  data: ProductData,
  rawProductName: string,
  isNutsOrDriedFruit: boolean,
): ProductData {
  const sentence = getNaturalInlineLinkSentence(rawProductName, data, isNutsOrDriedFruit);
  return {
    ...data,
    fullDescription: injectNaturalInlineInternalLink(data.fullDescription, sentence),
  };
}

function getManualInternalLinkAdvice(
  rawProductName: string,
  data: ProductData,
  isNutsOrDriedFruit: boolean,
): { target: string; anchor: string } {
  const text = [
    rawProductName,
    data.correctedProductName,
    data.focusKeyword,
    data.englishProductName,
    ...(data.advancedSeoAnalysis?.semanticEntities || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

  if (isNutsOrDriedFruit || has([/آجیل|خشکبار|پسته|بادام|گردو|فندق|کشمش|خرما|انجیر|توت خشک|مویز|تخمه|cashew|pistachio|almond|walnut|date/])) {
    return {
      target: 'دسته‌بندی آجیل و خشکبار، یا دسته دقیق همان محصول مثل پسته، بادام، گردو یا خرما',
      anchor: data.focusKeyword || data.correctedProductName || 'خرید آجیل و خشکبار',
    };
  }

  if (has([/شامپو|ماسک مو|نرم.?کننده مو|سرم مو|تقویت مو|مو\b|hair|shampoo|clear|کلیر|هد اند شولدرز|head\s*&?\s*shoulders|pantene|پنتن/])) {
    return {
      target: 'دسته‌بندی شامپو؛ اگر نبود، دسته‌بندی مراقبت و زیبایی مو؛ اگر برند در سایت هست، صفحه یا جستجوی برند',
      anchor: data.focusKeyword || data.correctedProductName || 'خرید شامپو',
    };
  }

  if (has([/خمیر دندان|مسواک|دهان|دندان|نخ دندان|دهانشویه|tooth|toothpaste|oral|mouth/])) {
    return {
      target: 'دسته‌بندی بهداشت دهان و دندان؛ اگر نبود، دسته‌بندی مادر لوازم آرایشی و بهداشتی',
      anchor: data.focusKeyword || data.correctedProductName || 'خرید محصولات بهداشت دهان و دندان',
    };
  }

  if (has([/کرم|لوسیون|ضد آفتاب|آبرسان|مرطوب.?کننده|پوست|آرایشی|بهداشتی|ریمل|رژ|پنکک|کازمتیک|cosmetic|cream|lotion|sunscreen|skin/])) {
    return {
      target: 'دسته‌بندی دقیق محصول در لوازم آرایشی و بهداشتی؛ اگر نبود، دسته‌بندی مادر لوازم آرایشی و بهداشتی',
      anchor: data.focusKeyword || data.correctedProductName || 'خرید لوازم آرایشی و بهداشتی',
    };
  }

  if (has([/پاد لباسشویی|مایع لباسشویی|پودر لباسشویی|نرم کننده لباس|مایع ظرفشویی|قرص ظرفشویی|جرم.?گیر|شوینده|پاک.?کننده|لباسشویی|ظرفشویی|detergent|cleaner|dishwasher/])) {
    return {
      target: 'دسته‌بندی مواد شوینده یا دسته دقیق محصول مثل شوینده لباس، ظرفشویی یا پاک‌کننده سطوح',
      anchor: data.focusKeyword || data.correctedProductName || 'خرید مواد شوینده',
    };
  }

  if (has([/موبایل|گوشی|آیفون|iphone|samsung|سامسونگ|شیائومی|xiaomi|لپ.?تاپ|تبلت|هدفون|هندزفری|شارژر|دیجیتال|galaxy|airpods/])) {
    return {
      target: 'دسته‌بندی موبایل و کالای دیجیتال، یا صفحه برند/مدل مرتبط در سایت',
      anchor: data.focusKeyword || data.correctedProductName || 'خرید کالای دیجیتال',
    };
  }

  if (has([/برنج|روغن|چای|قهوه|نوشیدنی|شکلات|بیسکویت|خوراکی|غذایی|رب|تن ماهی|ماکارونی|زعفران|rice|tea|coffee|food/])) {
    return {
      target: 'دسته‌بندی خوراکی و هایپرمارکت، یا دسته دقیق‌تر همان محصول',
      anchor: data.focusKeyword || data.correctedProductName || 'خرید محصولات خوراکی',
    };
  }

  return {
    target: 'دسته‌بندی اصلی همین محصول؛ اگر دسته دقیق وجود ندارد، دسته مادر مرتبط یا صفحه جستجوی برند/مدل در سایت',
    anchor: data.focusKeyword || data.correctedProductName || 'مشاهده محصولات مرتبط',
  };
}

function appendManualInternalLinkMarker(
  html: string,
  rawProductName: string,
  data: ProductData,
  isNutsOrDriedFruit: boolean,
): string {
  const cleanHtml = String(html || '').trim();
  if (!cleanHtml || cleanHtml.includes('جایگاه پیشنهادی لینک داخلی')) {
    return cleanHtml;
  }

  const advice = getManualInternalLinkAdvice(rawProductName, data, isNutsOrDriedFruit);
  const marker = `\n<hr />\n<h5>🔗 جایگاه پیشنهادی لینک داخلی:</h5>\n<p><strong>راهنمای ویرایش:</strong> این بخش لینک اتوماتیک نمی‌سازد تا سرعت و پایداری سایت حفظ شود. اینجا یک لینک داخلی مرتبط اضافه کنید. بهترین مقصد پیشنهادی: <strong>${escapeHtmlText(advice.target)}</strong>. متن لینک پیشنهادی: <strong>${escapeHtmlText(advice.anchor)}</strong>.</p>\n<hr />`;

  return `${cleanHtml}${marker}`;
}

function addManualInternalLinkMarkerToProductData(
  data: ProductData,
  rawProductName: string,
  isNutsOrDriedFruit: boolean,
): ProductData {
  return {
    ...data,
    fullDescription: appendManualInternalLinkMarker(
      data.fullDescription,
      rawProductName,
      data,
      isNutsOrDriedFruit,
    ),
  };
}


function improvePersianNaturalness(text: string): string {
  return String(text || '')
    .replace(/همچنین\s*برای\s*تجربه[^.؟<]*(?:،|,)\s*می‌توانید\s*آن\s*را\s*همراه\s*با\s*(<a href="#">[^<]+<\/a>|[^.؟]+)\s*استفاده\s*کنید\.?/g,
      'همچنین این محصول برای آماده‌سازی نوشیدنی‌های گرم روزانه کاربرد دارد.')
    .replace(/برای\s*تجربه\s*طعم‌های\s*متنوع‌تر[^.؟]*\.?/g, '')
    .replace(/قطعاً\s*از\s*طعم\s*بی‌نظیر\s*آن\s*لذت\s*خواهید\s*برد\.?/g, 'این محصول می‌تواند طعم نوشیدنی را نرم‌تر و دلپذیرتر کند.')
    .replace(/تجربه‌ای\s*نوین\s*از/g, 'استفاده‌ای ساده‌تر از')
    .replace(/تجربه‌ای\s*بی‌نظیر/g, 'تجربه‌ای دلپذیر')
    .replace(/بی‌نهایت/g, 'کاملاً')
    .replace(/بهترین\s*انتخاب\s*برای\s*همه/g, 'گزینه‌ای کاربردی برای مصرف روزانه')
    .replace(/تضمین\s*می‌کند/g, 'کمک می‌کند')
    .replace(/کشف\s*کنید/g, 'امتحان کنید')
    .replace(/\s+([،.!؟])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

function normalizeProductData(data: ProductData): ProductData {
  return {
    ...data,
    correctedProductName: String(data.correctedProductName || '').trim(),
    englishProductName: String(data.englishProductName || '').trim(),
    fullDescription: improvePersianNaturalness(normalizeInlineLinksInHtml(String(data.fullDescription || '')).trim()),
    shortDescription: improvePersianNaturalness(String(data.shortDescription || '').replace(/<[^>]*>/g, '').trim()),
    seoTitle: String(data.seoTitle || '').replace(/<[^>]*>/g, '').trim(),
    slug: normalizeSlug(data.slug || data.englishProductName || data.correctedProductName),
    focusKeyword: String(data.focusKeyword || '').replace(/<[^>]*>/g, '').trim(),
    metaDescription: improvePersianNaturalness(String(data.metaDescription || '').replace(/<[^>]*>/g, '').trim()),
    altImageText: String(data.altImageText || '').replace(/<[^>]*>/g, '').trim(),
  };
}

function validateProductData(data: ProductData, isNutsOrDriedFruit: boolean) {
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
    if (!(field in data) || data[field] === null || data[field] === undefined || data[field] === '') {
      throw new Error(`AI response is missing field: ${String(field)}`);
    }
  }

  const analysis = data.advancedSeoAnalysis;
  if (!analysis || !Array.isArray(analysis.keyphraseSynonyms) || !Array.isArray(analysis.internalLinkingSuggestions)) {
    throw new Error('AI response has invalid advancedSeoAnalysis.');
  }

  const description = data.fullDescription || '';
  if (!description.includes('<p>') || !description.includes('<h5>') || !description.includes('<hr')) {
    throw new Error('AI response did not preserve the HTML product description template.');
  }

  const requiredStandardSections = [
    '✅ ویژگی‌های اصلی',
    '✨ مزایای استفاده',
    '📦 مشخصات محصول',
  ];

  const requiredNutsSections = [
    '✅ مشخصات کلی و مبدأ تولید',
    '🥗 خواص و ارزش تغذیه‌ای',
    '⭐ نکات ویژه / تمایزها',
    '🍽️ پیشنهاد مصرف',
    '🧊 روش نگهداری',
    '📦 مشخصات محصول',
    '⚠️ نکات مهم / هشدارها',
  ];

  const sections = isNutsOrDriedFruit ? requiredNutsSections : requiredStandardSections;
  const missingSections = sections.filter((section) => !description.includes(section));
  if (missingSections.length > 0) {
    throw new Error(`AI response missed required template sections: ${missingSections.join(', ')}`);
  }

  // Keep validation light for speed: base Mohannad SEO sections are required,
  // but do not trigger expensive model fallbacks only because one optional extra section differs.
  if (!isNutsOrDriedFruit && description.includes('تیتر تکمیلی مناسب محصول')) {
    throw new Error('AI response kept the placeholder extra-section heading.');
  }
}

async function requestOpenRouter(
  model: OpenRouterModel,
  apiKey: string,
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  fullSystemInstruction: string,
  isNutsOrDriedFruit: boolean,
  useJsonMode: boolean,
  webSearchContext: string,
) {
  const body: Record<string, any> = {
    model: model.id,
    messages: buildMessages(model, productName, productImage, briefDescription, fullSystemInstruction, isNutsOrDriedFruit, webSearchContext),
    temperature: 0.35,
    top_p: 0.9,
    max_tokens: Number(process.env.MAX_OUTPUT_TOKENS || 3400),
  };

  if (useJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetchWithTimeout(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://mohannad-4o.vercel.app',
      'X-Title': 'Mohannad 4o',
    },
    body: JSON.stringify(body),
  }, AI_MODEL_TIMEOUT_MS);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText || 'OpenRouter request failed.';
    throw new Error(`${model.id}: ${message}`);
  }

  return data;
}

async function callOpenRouter(
  model: OpenRouterModel,
  apiKey: string,
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  fullSystemInstruction: string,
  isNutsOrDriedFruit: boolean,
  webSearchContext: string,
): Promise<ProductData> {
  let lastError: unknown = null;

  for (const useJsonMode of [true, false]) {
    try {
      const data = await requestOpenRouter(
        model,
        apiKey,
        productName,
        productImage,
        briefDescription,
        fullSystemInstruction,
        isNutsOrDriedFruit,
        useJsonMode,
        webSearchContext,
      );

      const text = getTextFromOpenRouterResponse(data);
      if (!text) {
        throw new Error(`${model.id}: empty response from AI model.`);
      }

      const generatedData = normalizeProductData(extractJson(text));
      validateProductData(generatedData, isNutsOrDriedFruit);
      return generatedData;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      // If JSON mode is unsupported, retry without it. For other errors, move to next model.
      if (useJsonMode && (message.includes('response_format') || message.includes('json') || message.includes('schema'))) {
        continue;
      }
      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

    const webSearchContext = await withFallbackTimeout(
      searchWebForProduct(productName, briefDescription || '', Boolean(isNutsOrDriedFruit)).catch((error) => {
        console.warn('Web search failed safely:', error);
        return '';
      }),
      WEB_SEARCH_TOTAL_TIMEOUT_MS,
      '',
    );

    const descriptionGenerationInstruction = isNutsOrDriedFruit ? nutsDescriptionPrompt : standardDescriptionPrompt;
    const fullSystemInstruction = `${systemInstruction}\n\n# قوانین قطعی برای فیلد fullDescription:\n${descriptionGenerationInstruction}`;

    const modelErrors: string[] = [];
    const uniqueModels = MODELS.filter((model, index, arr) => arr.findIndex((item) => item.id === model.id && item.vision === model.vision) === index);

    for (const model of uniqueModels) {
      try {
        const generatedData = await callOpenRouter(
          model,
          apiKey,
          productName,
          productImage,
          briefDescription || '',
          fullSystemInstruction,
          Boolean(isNutsOrDriedFruit),
          webSearchContext,
        );
        const linkedData: ProductData = ensureNaturalInlineInternalLink(
          generatedData,
          productName,
          Boolean(isNutsOrDriedFruit),
        );
        const responseData: ProductData = {
          ...linkedData,
          fullDescription: ensureKnownDetailsInDescription(
            linkedData.fullDescription,
            productName,
            briefDescription || '',
          ),
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Mohannad-Model', model.id);
        return res.status(200).json(responseData);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Model failed: ${message}`);
        modelErrors.push(message);
      }
    }

    return res.status(502).json({
      message: 'همه مدل‌های رایگان فعلاً خطا یا لیمیت دادند یا قالب خروجی را درست رعایت نکردند. چند دقیقه بعد دوباره تست کنید.',
      details: modelErrors.slice(-4),
    });
  } catch (error) {
    console.error('Error in Vercel function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ message: `Internal Server Error: ${errorMessage}` });
  }
}
