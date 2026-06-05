import type { ProductData, ImageFile, RelatedInternalLink } from '../types';

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
const DEFAULT_INTERNAL_SITE_URL = 'https://noon-valqalam.ir';
const CURRENT_YEAR = new Date().getFullYear();

const MODELS: OpenRouterModel[] = [
  // Vision first: reads product photo, label, brand, size/count, color and package text.
  { id: 'google/gemma-4-31b-it:free', vision: true },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', vision: true },

  // Strong text fallbacks. They preserve the SEO/product template if vision models are limited.
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', vision: false },
  { id: 'openai/gpt-oss-120b:free', vision: false },
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
      description: 'موجودیت‌های معنایی کلیدی مانند برند، دسته‌بندی محصول، ویژگی‌های اصلی، تعداد، حجم، وزن یا مدل.',
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
        'توضیحات کامل محصول با فرمت HTML دقیقاً طبق قالب تعیین‌شده. باید با پاراگراف مقدمه شروع شود و سپس بخش‌های ثابت با h5، ایموجی، ul/li، p و hr داشته باشد.',
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
2. زبان همه فیلدهای فارسی باید روان، فروشگاهی، طبیعی، یونیک و قابل انتشار باشد.
3. نام خام محصول را اصلاح کن. اگر کاربر نام ناقص، غلط، انگلیسی/فارسی مخلوط یا بدون جزئیات داد، نام صحیح و کامل فروشگاهی بساز.
4. اگر تصویر ارسال شده، متن روی تصویر، برند، تعداد، وزن، حجم، رنگ، رایحه، طعم، مدل و ویژگی‌های روی بسته‌بندی را بخوان و در correctedProductName، مشخصات و متن لحاظ کن.
5. اگر چیزی از تصویر یا توضیحات مشخص نیست، حدس خطرناک نزن؛ اما ویژگی‌های عمومی و رایج همان دسته محصول را طبیعی اضافه کن.
6. ساختار پایه fullDescription را حفظ کن، اما بخش تکمیلی را فقط متناسب با نوع همان محصول انتخاب کن. برای همه محصولات تیترهای نامناسب و تکراری مثل «چرا انتخاب هوشمندانه است» ننویس.
7. در fullDescription از Markdown، علامت ---، تیترهای h2/h3، جدول، JSON داخلی یا متن بیرون از HTML استفاده نکن.
7.1. هیچ لینک داخلی، تگ <a> یا URL داخل fullDescription قرار نده. لینک‌های داخلی باید فقط در باکس جداگانه «لینک‌های داخلی مرتبط» نمایش داده شوند.
8. اگر بخش «اطلاعات تازه از جستجوی وب» در پیام کاربر وجود داشت، آن را منبع تازه‌تر از دانش داخلی خودت بدان و برای محصولاتی مثل موبایل، مدل‌های جدید، محصولات ترند و کالاهای وابسته به سال/نسخه، حتماً از همان اطلاعات استفاده کن.
9. نام مدل/نسخه محصول را به مدل قدیمی‌تر تبدیل نکن. اگر کاربر iPhone 17، Galaxy S26 یا هر مدل جدیدی نوشت، مجاز نیستی آن را با iPhone 13، iPhone 15 یا مدل قدیمی جایگزین کنی؛ مگر اینکه جستجوی وب صراحتاً نشان دهد نام واردشده اشتباه است.
10. اگر جستجوی وب اطلاعات قطعی کافی نداد، با همان نام کاربر محتوا بساز و از حدس زدن مشخصات فنی عددی، قیمت، تاریخ عرضه یا ویژگی‌های قطعی خودداری کن.
`;

const nutsDescriptionPrompt = `
برای فیلد 'fullDescription'، یک متن کامل و تخصصی با فرمت HTML تولید کن که تمام ساختار و قوانین زیر را دقیق و کامل برای محصولات دسته آجیل و خشکبار رعایت کند:

# 1. قوانین کلی محتوا (Yoast SEO)
- طول متن: کل توضیحات باید بین ۲۲۰ تا ۳۰۰ کلمه باشد.
- خوانایی: جملات باید کوتاه و روان باشند. حداقل در ۲۵٪ جملات از کلمات انتقالی استفاده کن و میزان استفاده از صدای مجهول را به کمتر از ۱۰٪ محدود کن.
- استفاده از کلیدواژه کانونی: کلیدواژه باید در پاراگراف اول بیاید و به طور طبیعی ۳ تا ۴ بار در کل متن تکرار شود.
- لینک‌سازی داخلی داخل متن ممنوع است: در fullDescription هیچ تگ <a>، href یا URL ننویس. لینک‌های داخلی به صورت جداگانه در باکس «لینک‌های داخلی مرتبط» ساخته می‌شوند.

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
</ul>
<hr class="mohannad-divider">

<h5>⚠️ نکات مهم / هشدارها</h5>
<p>به هشدار آلرژی، حساسیت غذایی یا توصیه مصرف متعادل اشاره کن.</p>
<hr class="mohannad-divider">

# 3. لحن
لحن متن باید دوستانه، حرفه‌ای و متقاعدکننده باشد و حس کیفیت و اعتماد را منتقل کند.
`;

const standardDescriptionPrompt = `
برای فیلد 'fullDescription'، یک متن کامل با فرمت HTML تولید کن که قالب پایه Mohannad SEO را حفظ کند، اما بخش تکمیلی را بر اساس نوع محصول هوشمندانه انتخاب کند. تیترها نباید برای همه محصولات یکسان و نامناسب باشند.

# قانون‌های بسیار مهم
- متن باید بین ۲۵۰ تا ۳۸۰ کلمه باشد.
- پاراگراف اول باید ۳۰ تا ۵۰ کلمه باشد و نام اصلاح‌شده محصول + کلیدواژه کانونی را طبیعی بیاورد.
- نام محصول را کامل و اصلاح‌شده استفاده کن؛ اگر کاربر نام ناقص داد، برند/مدل/تعداد/حجم/وزن/ویژگی را از تصویر یا توضیح به نام اضافه کن.
- اگر محصول ویژگی رایج و قابل انتظار دارد، آن را در متن اضافه کن؛ اما مشخصات عددی نامطمئن را اختراع نکن.
- برای تیترها فقط از <h5> استفاده کن.
- بعد از مقدمه و بعد از هر بخش، از <hr /> استفاده کن.
- برای ویژگی‌ها و مشخصات از <ul> و <li> استفاده کن.
- از Markdown، علامت ---، جدول و تیترهای h2/h3 استفاده نکن.
- هیچ لینک، تگ <a>، href یا URL داخل fullDescription نگذار؛ لینک‌های داخلی فقط در باکس جداگانه نمایش داده می‌شوند.
- تیتر «💡 چرا این محصول انتخاب هوشمندانه‌ای است؟» را برای همه محصولات ننویس. فقط وقتی محصول واقعاً نیاز به توضیح ارزش خرید/انتخاب دارد، آن هم با متن مخصوص همان محصول استفاده شود.
- در هر خروجی دقیقاً یک «بخش تکمیلی متناسب با محصول» اضافه کن. این بخش باید با نوع محصول سازگار باشد و جایگزین تیترهای نامناسب عمومی شود.

# قالب پایه اجباری fullDescription
<p>مقدمه‌ای جذاب و فروشگاهی درباره محصول، شامل correctedProductName و کلیدواژه کانونی. این پاراگراف باید حس نیاز، کیفیت و کاربرد محصول را منتقل کند.</p>
<hr />

<h5>✅ ویژگی‌های اصلی:</h5>
<ul>
  <li>۴ تا ۶ ویژگی اصلی و واقعی محصول را بنویس.</li>
  <li>ویژگی‌ها باید دقیق، فروشگاهی و مخصوص همان محصول باشند.</li>
  <li>اگر از تصویر تعداد، حجم، مدل، رایحه، طعم یا برند مشخص است، حتماً بیاور.</li>
</ul>
<hr />

<h5>✨ مزایای استفاده:</h5>
<p>در یک پاراگراف کامل توضیح بده این محصول چه مزیتی برای خریدار دارد؛ مثل کیفیت بهتر، استفاده آسان، دوام، تمیزی، زیبایی، سلامت، راحتی، تازگی یا نتیجه بهتر. مزایا باید مخصوص همین محصول باشد.</p>
<hr />

<!-- بخش تکمیلی متناسب با محصول: دقیقاً یکی از الگوهای زیر یا یک تیتر مشابهِ دقیق‌تر را انتخاب کن -->
<h5>تیتر تکمیلی مناسب محصول</h5>
<p>یا <ul><li>...</li></ul> محتوای تخصصی و لازم برای همان دسته محصول.</p>
<hr />

<h5>⚠️ نکات ایمنی و نگهداری صحیح:</h5>
<p>نکات مهم نگهداری، هشدارها، شرایط مصرف یا مراقبت را متناسب با همان محصول توضیح بده. اگر محصول خطر خاصی ندارد، نکات عمومی نگهداری و استفاده صحیح را بنویس.</p>
<hr />

<h5>📦 مشخصات محصول:</h5>
<ul>
  <li>برند: اگر مشخص است، نام برند؛ اگر مشخص نیست، این خط را کامل حذف کن و «نامشخص» ننویس.</li>
  <li>نوع محصول: دسته‌بندی دقیق محصول</li>
  <li>تعداد/وزن/حجم/مدل/رنگ/رایحه/طعم: فقط مواردی که از نام، تصویر یا توضیح مشخص است.</li>
  <li>کاربرد: کاربرد اصلی محصول</li>
  <li>ویژگی شاخص: مهم‌ترین مزیت محصول</li>
</ul>
<hr />

# راهنمای انتخاب تیتر تکمیلی بر اساس نوع محصول
- شوینده، بهداشتی، آرایشی، ابزار، لوازم خانه یا کالاهایی که روش مصرف مهم دارند: «🧴 راهنمای کاربردی استفاده:»
- خوراکی و نوشیدنی غیرخشکبار: «🍽️ پیشنهاد مصرف:» یا «🥗 ارزش غذایی و کاربرد روزانه:»
- پوشاک، کیف، کفش و اکسسوری: «👕 راهنمای انتخاب و ست کردن:» یا «🧵 نکات جنس و دوخت:»
- موبایل، لوازم دیجیتال و برقی: «🔌 راه‌اندازی و نکات فنی:» یا «⚙️ کارایی و سازگاری:»
- لوازم کودک و مادر: «👶 نکات استفاده برای کودک:»
- کتاب، نوشت‌افزار و محصولات آموزشی: «📚 مناسب چه کسانی است؟»
- کادو، دکور و محصولات مناسبتی: «🎁 مناسب برای هدیه و استفاده:»
- وقتی واقعاً ارزش خرید/مقایسه مهم است: «💡 چرا این محصول انتخاب مناسبی است؟»؛ اما فقط برای همان دسته و با متن غیرکلیشه‌ای.

# نمونه سبک خروجی برای شوینده؛ فقط برای فهم سبک است و نباید برای همه محصولات کپی شود
<p>با پاد لباسشویی اکتیو هوم ۴ در ۱، ۱۵ عددی، تجربه‌ای ساده‌تر و مؤثرتر از شستشوی لباس‌ها داشته باشید.</p>
<hr />
<h5>✅ ویژگی‌های اصلی:</h5>
<ul>
  <li>پاک‌کنندگی چندکاره با عملکرد شوینده و لکه‌بر</li>
  <li>استفاده آسان بدون نیاز به اندازه‌گیری دستی</li>
</ul>
<hr />
<h5>✨ مزایای استفاده:</h5>
<p>این محصول علاوه بر تمیزی بهتر، استفاده روزانه را ساده‌تر می‌کند و نتیجه شستشو را قابل اعتمادتر می‌سازد.</p>
<hr />
<h5>🧴 راهنمای کاربردی استفاده:</h5>
<p>یک عدد پاد را داخل درام ماشین لباسشویی قرار دهید و سپس لباس‌ها را اضافه کنید.</p>
<hr />
<h5>⚠️ نکات ایمنی و نگهداری صحیح:</h5>
<p>در جای خشک، خنک و دور از دسترس کودکان نگهداری شود.</p>
<hr />
<h5>📦 مشخصات محصول:</h5>
<ul>
  <li>نوع محصول: پاد لباسشویی</li>
  <li>کاربرد: شستشوی لباس</li>
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
  if (!normalizedName || isNutsOrDriedFruit) return '';

  // To keep the app fast and avoid unnecessary external calls, always search for modern/technical products;
  // for normal products, search only when the name/description suggests recency-sensitive information.
  if (!shouldSearchWeb(normalizedName, briefDescription)) return '';

  const queries = [
    `${normalizedName} مشخصات محصول ${CURRENT_YEAR}`,
    `${normalizedName} official specs ${CURRENT_YEAR}`,
  ];

  const collected: string[] = [];

  for (const query of queries) {
    try {
      const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}&kl=wt-wt`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Mohannad4oBot/1.0; +https://mohannad-4o.vercel.app)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) continue;
      const html = await response.text();
      const results = extractDuckDuckGoResults(html);
      for (const result of results) {
        if (!collected.includes(result)) collected.push(result);
        if (collected.length >= 6) break;
      }
    } catch (error) {
      console.warn(`Web search failed for query "${query}":`, error);
    }

    if (collected.length >= 4) break;
  }

  if (collected.length === 0) return '';

  return [
    `تاریخ امروز برای تشخیص تازگی اطلاعات: ${new Date().toISOString().slice(0, 10)}`,
    `عبارت جستجو شده: ${normalizedName}`,
    ...collected.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}


function getInternalSiteBaseUrl(): string {
  const raw = (process.env.INTERNAL_SITE_URL || DEFAULT_INTERNAL_SITE_URL).trim().replace(/\/+$/, '');
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

type InternalLinkCandidate = RelatedInternalLink & { score: number; source: string };

function normalizePersianText(input: string): string {
  return decodeHtmlEntities(String(input || ''))
    .toLowerCase()
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[‌ـ]/g, ' ')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'و', 'در', 'از', 'به', 'با', 'برای', 'یک', 'این', 'آن', 'های', 'ها', 'مدل', 'اصل', 'خرید', 'قیمت',
  'بسته', 'عددی', 'گرمی', 'گرم', 'لیتری', 'لیتر', 'حجم', 'وزن', 'محصول', 'فروشگاه', 'the', 'of', 'and', 'for', 'with'
]);

function keywordTokens(input: string): string[] {
  return normalizePersianText(input)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function uniqueStrings(items: string[], limit = 16): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    const cleaned = String(item || '').trim();
    const key = normalizePersianText(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
    if (output.length >= limit) break;
  }

  return output;
}

function buildInternalLinkQueries(productName: string, generatedData: ProductData, briefDescription: string): string[] {
  const rawTerms = [
    productName,
    generatedData.correctedProductName,
    generatedData.focusKeyword,
    briefDescription,
    ...(generatedData.advancedSeoAnalysis?.semanticEntities || []),
    ...(generatedData.advancedSeoAnalysis?.internalLinkingSuggestions || []),
    ...(generatedData.advancedSeoAnalysis?.keyphraseSynonyms || []),
  ].filter(Boolean);

  const tokens = keywordTokens(rawTerms.join(' '));
  const importantSingleTokens = tokens.filter((token) => token.length >= 3);

  const categoryHintMap: Array<{ when: string[]; add: string[] }> = [
    { when: ['شامپو', 'کلیر', 'clear', 'مو'], add: ['شامپو', 'مراقبت از مو', 'مراقبت و زیبایی مو', 'زیبایی مو'] },
    { when: ['نرم', 'لباس', 'پاد', 'لباسشویی', 'شوینده', 'مایع'], add: ['مواد شوینده', 'شوینده', 'پاک کننده و شوینده', 'خوشبو کننده لباس'] },
    { when: ['کرم', 'لوسیون', 'پوست', 'ضدافتاب', 'ضد', 'آفتاب'], add: ['مراقبت پوست', 'مراقبت صورت', 'زیبایی پوست', 'ضد آفتاب', 'لوازم آرایشی بهداشتی'] },
    { when: ['عطر', 'اسپری', 'ادکلن', 'دئودرانت'], add: ['عطر و اسپری', 'عطر و ادکلن', 'دئودرانت و ضد تعریق', 'اسپری بدن'] },
    { when: ['پسته', 'بادام', 'گردو', 'فندق', 'آجیل', 'تخمه'], add: ['آجیل', 'پسته ها', 'بادام', 'بادام هندی', 'گردو', 'تخمه', 'فندق'] },
    { when: ['کشمش', 'خرما', 'انجیر', 'میوه', 'خشکبار', 'توت', 'زرشک'], add: ['خشکبار', 'کشمش', 'خرما', 'انجیر خشک', 'میوه خشک', 'توت', 'زرشک'] },
    { when: ['زعفران'], add: ['زعفران', 'زعفران یک گرمی', 'زعفران نیم مثقالی', 'زعفران یک مثقالی'] },
    { when: ['قهوه', 'نسکافه', 'کافی', 'کافه', 'چای'], add: ['قهوه', 'قهوه فوری', 'کافی شاپ', 'چای', 'نسکافه'] },
    { when: ['شکلات', 'ویفر', 'آبنبات', 'تنقلات', 'چیپس'], add: ['تنقلات', 'شکلات', 'ویفر شکلات', 'آبنبات', 'چیپس'] },
    { when: ['نودل', 'سوپ', 'ماجی'], add: ['نودل', 'جو و ماجی', 'هایپرمارکت'] },
  ];

  const normalizedAll = normalizePersianText(rawTerms.join(' '));
  const hints = categoryHintMap
    .filter((entry) => entry.when.some((word) => normalizedAll.includes(normalizePersianText(word))))
    .flatMap((entry) => entry.add);

  return uniqueStrings([
    generatedData.focusKeyword,
    generatedData.correctedProductName,
    productName,
    ...hints,
    ...importantSingleTokens,
  ], 18);
}

function absoluteInternalUrl(baseUrl: string, href: string): string | null {
  const cleaned = decodeHtmlEntities(href || '').trim();
  if (!cleaned || cleaned.startsWith('#') || cleaned.startsWith('mailto:') || cleaned.startsWith('tel:') || cleaned.startsWith('javascript:')) return null;

  try {
    const url = new URL(cleaned, `${baseUrl}/`);
    const base = new URL(baseUrl);
    if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return null;
    url.hash = '';
    return url.toString();
  } catch (_error) {
    return null;
  }
}

function detectInternalLinkType(url: string): RelatedInternalLink['type'] {
  if (url.includes('/product-category/')) return 'category';
  if (url.includes('/product/')) return 'product';
  if (url.includes('?s=') || url.includes('&s=')) return 'search';
  return 'page';
}

function parseInternalAnchors(html: string, baseUrl: string, source: string): InternalLinkCandidate[] {
  const links: InternalLinkCandidate[] = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const url = absoluteInternalUrl(baseUrl, match[1]);
    const title = cleanSearchText(match[2]);
    if (!url || !title || title.length < 2) continue;

    const type = detectInternalLinkType(url);
    if (type === 'page' && !url.includes('/shop/')) continue;
    if (/افزودن به سبد|مشاهده سریع|انتخاب گزینه|اطلاعات بیشتر|ورود|ثبت نام|سبد خرید|فیلتر|محصولات موجود/i.test(title)) continue;

    links.push({
      title,
      url,
      type,
      reason: type === 'category' ? 'دسته‌بندی مرتبط در سایت شما' : type === 'product' ? 'محصول مرتبط در سایت شما' : 'صفحه مرتبط در سایت شما',
      score: 0,
      source,
    });
  }

  return links;
}

async function fetchTextFromInternalSite(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Mohannad4oInternalLinkBot/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) throw new Error(`Internal site fetch failed: ${response.status}`);
  return response.text();
}

async function collectInternalLinksFromSite(baseUrl: string, queries: string[]): Promise<InternalLinkCandidate[]> {
  const candidates: InternalLinkCandidate[] = [];
  const pagesToScan = uniqueStrings([
    `${baseUrl}/`,
    `${baseUrl}/shop/`,
    `${baseUrl}/product-category/cosmetics/`,
    `${baseUrl}/product-category/hypermarket/`,
  ], 8);

  for (const url of pagesToScan) {
    try {
      const html = await fetchTextFromInternalSite(url);
      candidates.push(...parseInternalAnchors(html, baseUrl, url));
    } catch (error) {
      console.warn(`Internal navigation scan failed for ${url}:`, error);
    }
  }

  for (const query of queries.slice(0, 5)) {
    try {
      const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}&post_type=product`;
      const html = await fetchTextFromInternalSite(searchUrl);
      candidates.push(...parseInternalAnchors(html, baseUrl, searchUrl));
    } catch (error) {
      console.warn(`Internal product search failed for ${query}:`, error);
    }
  }

  return candidates;
}

function scoreInternalLink(candidate: InternalLinkCandidate, queries: string[], generatedData: ProductData): InternalLinkCandidate {
  const titleNorm = normalizePersianText(candidate.title);
  const urlNorm = normalizePersianText(decodeURIComponent(candidate.url));
  const focusNorm = normalizePersianText(generatedData.focusKeyword || generatedData.correctedProductName || '');
  const allTokens = uniqueStrings(queries.flatMap(keywordTokens), 40).map(normalizePersianText);

  let score = 0;

  for (const query of queries) {
    const q = normalizePersianText(query);
    if (!q) continue;
    if (titleNorm === q) score += 120;
    else if (titleNorm.includes(q)) score += 80;
    else if (q.includes(titleNorm) && titleNorm.length >= 3) score += 45;
    if (urlNorm.includes(q)) score += 12;
  }

  for (const token of allTokens) {
    if (!token) continue;
    if (titleNorm.split(' ').includes(token)) score += 14;
    else if (titleNorm.includes(token)) score += 8;
    if (urlNorm.includes(token)) score += 3;
  }

  if (focusNorm && titleNorm.includes(focusNorm)) score += 50;
  if (candidate.type === 'category') score += 25;
  if (candidate.type === 'product') score += 12;
  if (candidate.type === 'search') score -= 15;
  if (candidate.title.length > 80) score -= 10;

  const reason = candidate.type === 'category'
    ? `دسته‌بندی مرتبط با «${generatedData.focusKeyword || queries[0]}»`
    : candidate.type === 'product'
      ? `محصول نزدیک به «${generatedData.focusKeyword || queries[0]}»`
      : `صفحه مرتبط با «${generatedData.focusKeyword || queries[0]}»`;

  return { ...candidate, score, reason };
}

function dedupeAndRankInternalLinks(candidates: InternalLinkCandidate[], queries: string[], generatedData: ProductData): RelatedInternalLink[] {
  const byUrl = new Map<string, InternalLinkCandidate>();

  for (const candidate of candidates) {
    const scored = scoreInternalLink(candidate, queries, generatedData);
    if (scored.score < 18) continue;
    const existing = byUrl.get(scored.url);
    if (!existing || scored.score > existing.score) byUrl.set(scored.url, scored);
  }

  const ranked = Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ title, url, type, reason }) => ({ title, url, type, reason }));

  return ranked;
}

function buildInternalFallbackLinks(baseUrl: string, queries: string[], generatedData: ProductData): RelatedInternalLink[] {
  const q = queries[0] || generatedData.focusKeyword || generatedData.correctedProductName;
  if (!q) return [];

  return [
    {
      title: `جستجوی «${q}» در نون والقلم`,
      url: `${baseUrl}/?s=${encodeURIComponent(q)}&post_type=product`,
      type: 'search',
      reason: 'وقتی دسته‌بندی یا محصول دقیق پیدا نشد، این لینک جستجوی داخلی سایت خودتان است.',
    },
    {
      title: 'فروشگاه نون والقلم',
      url: `${baseUrl}/shop/`,
      type: 'page',
      reason: 'صفحه فروشگاه برای پیدا کردن محصولات مرتبط و دسته‌بندی‌های نزدیک.',
    },
  ];
}

async function findRelatedInternalLinks(productName: string, briefDescription: string, generatedData: ProductData): Promise<RelatedInternalLink[]> {
  const baseUrl = getInternalSiteBaseUrl();
  const queries = buildInternalLinkQueries(productName, generatedData, briefDescription);

  if (queries.length === 0) return [];

  try {
    const candidates = await collectInternalLinksFromSite(baseUrl, queries);
    const ranked = dedupeAndRankInternalLinks(candidates, queries, generatedData);
    if (ranked.length > 0) return ranked;
  } catch (error) {
    console.warn('Internal link discovery failed:', error);
  }

  return buildInternalFallbackLinks(baseUrl, queries, generatedData);
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
  userPrompt += `\n\nوظیفه تو:\n1. نام محصول را اصلاح و کامل کن. correctedProductName باید بهترین نام فروشگاهی فارسی باشد، نه فقط تکرار نام خام کاربر.\n2. اگر محصول تعداد، وزن، حجم، مدل، برند، سری، رنگ، رایحه یا طعم دارد و از نام/عکس/توضیح مشخص است، آن را به نام و مشخصات اضافه کن.\n3. fullDescription را با قالب پایه بساز و بخش تکمیلی را فقط بر اساس نیاز و نوع همان محصول انتخاب کن؛ تیترهای نامناسب را برای همه محصولات تکرار نکن.\n4. متن باید مخصوص همین محصول باشد و کلی‌گویی بی‌ارزش نداشته باشد.\n5. اگر اطلاعاتی مطمئن نیست، آن را به صورت عدد/مدل قطعی ننویس.`;

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


function stripInlineLinksFromHtml(html: string): string {
  return String(html || '')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/https?:\/\/[^\s<"']+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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

function normalizeProductData(data: ProductData): ProductData {
  return {
    ...data,
    correctedProductName: String(data.correctedProductName || '').trim(),
    englishProductName: String(data.englishProductName || '').trim(),
    fullDescription: stripInlineLinksFromHtml(String(data.fullDescription || '')).trim(),
    shortDescription: String(data.shortDescription || '').replace(/<[^>]*>/g, '').trim(),
    seoTitle: String(data.seoTitle || '').replace(/<[^>]*>/g, '').trim(),
    slug: normalizeSlug(data.slug || data.englishProductName || data.correctedProductName),
    focusKeyword: String(data.focusKeyword || '').replace(/<[^>]*>/g, '').trim(),
    metaDescription: String(data.metaDescription || '').replace(/<[^>]*>/g, '').trim(),
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
    '⚠️ نکات ایمنی و نگهداری صحیح',
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

  if (!isNutsOrDriedFruit) {
    const headingMatches = description.match(/<h5>/g) || [];
    if (headingMatches.length < 5) {
      throw new Error('AI response did not include a product-specific extra section.');
    }
    if (description.includes('تیتر تکمیلی مناسب محصول')) {
      throw new Error('AI response kept the placeholder extra-section heading.');
    }
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
    max_tokens: 6500,
  };

  if (useJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://mohannad-4o.vercel.app',
      'X-Title': 'Mohannad 4o',
    },
    body: JSON.stringify(body),
  });

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

    const webSearchContext = await searchWebForProduct(productName, briefDescription || '', Boolean(isNutsOrDriedFruit));

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
        const relatedInternalLinks = await findRelatedInternalLinks(productName, briefDescription || '', generatedData);
        const responseData: ProductData = {
          ...generatedData,
          relatedInternalLinks,
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
