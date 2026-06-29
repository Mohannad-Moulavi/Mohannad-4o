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

type GitHubModel = {
  id: string;
  vision: boolean;
};

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const GITHUB_MODELS_API_URL = 'https://models.github.ai/inference/chat/completions';
const DUCKDUCKGO_HTML_URL = 'https://duckduckgo.com/html/';
const BING_SEARCH_URL = 'https://www.bing.com/search';
const CURRENT_YEAR = new Date().getFullYear();
const WEB_SEARCH_TIMEOUT_MS = Number(process.env.WEB_SEARCH_TIMEOUT_MS || 10000);
const WEB_SEARCH_TOTAL_TIMEOUT_MS = Number(process.env.WEB_SEARCH_TOTAL_TIMEOUT_MS || 24000);
const AI_MODEL_TIMEOUT_MS = Number(process.env.AI_MODEL_TIMEOUT_MS || 55000);

const MODELS: GitHubModel[] = [
  // Best quality mode: full GPT-4o first for better image understanding + Persian SEO writing.
  { id: process.env.GITHUB_MODEL || 'openai/gpt-4o', vision: true },
  { id: 'azure-openai/gpt-4o', vision: true },

  // GPT-4.1 can be strong for instruction-following/text structure; kept as fallback.
  { id: 'openai/gpt-4.1', vision: true },

  // Mini models are only fallback now, not the main quality model.
  { id: 'openai/gpt-4o-mini', vision: true },
  { id: 'openai/gpt-4.1-mini', vision: false },
];

const advancedSeoAnalysisSchema = {
  type: 'object',
  properties: {
    keyphraseSynonyms: {
      type: 'array',
      items: { type: 'string' },
      minItems: 8,
      description: 'عبارت‌های مترادف و نزدیک به نام محصول؛ این‌ها جدا نمایش داده نمی‌شوند و داخل لیست ترکیبی کلیدواژه‌های مرتبط، مترادف و LSI ادغام می‌شوند.',
    },
    lsiKeywords: {
      type: 'array',
      items: { type: 'string' },
      minItems: 10,
      description: 'عبارت‌های LSI و معنایی مرتبط با محصول؛ این‌ها جدا نمایش داده نمی‌شوند و داخل همان لیست ترکیبی ادغام می‌شوند.',
    },
    longTailKeywords: {
      type: 'array',
      items: { type: 'string' },
      minItems: 8,
      description: 'عبارت‌های خرید، قیمت و long-tail مرتبط؛ این‌ها جدا نمایش داده نمی‌شوند و داخل همان لیست ترکیبی ادغام می‌شوند.',
    },
    semanticEntities: {
      type: 'array',
      items: { type: 'string' },
      minItems: 8,
      description: 'حداقل ۸ موجودیت معنایی کلیدی مانند برند، مدل، دسته‌بندی محصول، ویژگی‌های اصلی، تعداد، حجم، وزن،  کاربرد و مخاطب محصول.',
    },
    searchIntent: {
      type: 'string',
      description: 'هدف جستجوی کاربر (مثلاً: خرید، مقایسه، اطلاعاتی).',
    },
    internalLinkingSuggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 5,
      description: 'حداقل ۵ عبارت پیشنهادی برای لینک‌دهی داخلی به صفحات مرتبط و دسته‌بندی‌های دقیق.',
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
3.1. اصلاح نام یعنی بهتر و کامل‌تر کردن همان محصول، نه تبدیل آن به محصول دیگر. اگر نام محصول نامفهوم یا سرچ ناقص بود، همان محصول خام را حفظ کن و فقط غلط املایی/ترجمه‌ای را اصلاح کن. هیچ‌وقت محصول دیگری را جایگزین نکن. حداقل یکی از کلمات هویتی نام خام محصول باید در correctedProductName و focusKeyword باقی بماند، مگر اینکه تصویر یا توضیح کاربر خلاف آن را صریحاً نشان دهد.
4. اگر تصویر ارسال شده، متن روی تصویر، برند، تعداد، وزن، حجم، رنگ، رایحه، طعم، مدل، کشور سازنده و ویژگی‌های روی بسته‌بندی را بخوان و در correctedProductName، مشخصات و متن لحاظ کن. اگر تصویر واضح است، اطلاعات روی تصویر از حدس ذهنی مهم‌تر است.
4.1. هر اطلاعات قطعی که کاربر در نام یا توضیحات اولیه داده، مثل «برند»، «مدل»، «حجم»، «وزن»،  «کشور سازنده» و «نوع محصول»، باید بدون حذف و بدون تغییر معنی در fullDescription و مخصوصاً بخش «📦 مشخصات محصول» بیاید.
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
  <li>کشور سازنده: اگر کشور واقعی مشخص است همان کشور را بنویس؛ اگر مشخص نیست دقیقاً بنویس «بستگی به سری ساخت دارد»</li>
  <li>کشور سازنده: اگر کشور واقعی مشخص است همان کشور را بنویس؛ اگر مشخص نیست دقیقاً بنویس «بستگی به سری ساخت دارد»</li>
</ul>
<hr class="mohannad-divider">

<h5>⚠️ نکات مهم / هشدارها</h5>
<p>به هشدار آلرژی، حساسیت غذایی یا توصیه مصرف متعادل اشاره کن.</p>
<hr class="mohannad-divider">

# 3. لحن
لحن متن باید دوستانه، حرفه‌ای و متقاعدکننده باشد و حس کیفیت و اعتماد را منتقل کند.
`;

const standardDescriptionPrompt = `
برای فیلد fullDescription باید خروجی دقیقاً شبیه ساختار کامل Mohannad SEO باشد، نه خلاصه محصول. همچنین shortDescription، seoTitle، focusKeyword، metaDescription و altImageText باید دقیقاً بر اساس قوانین Yoast SEO تولید شوند.

قانون حیاتی:
اگر fullDescription کمتر از ۶ بخش h5، کمتر از ۱۲ آیتم li یا کمتر از ۲۲۰ کلمه باشد، خروجی نامعتبر است.
هیچ‌وقت فقط «ویژگی‌ها، مزایا، مشخصات» ننویس و تمام نکن. برای محصولات آرایشی/بهداشتی مثل لوسیون، شامپو، کرم، سرم و ماسک مو باید حتماً بخش‌های روش استفاده، ترکیبات/فرمول، مناسب چه نوع پوست یا مو، نکات مهم و نگهداری را اضافه کنی.

# طول و عمق محتوا
- توضیحات کامل باید بین ۲۵۰ تا ۴۲۰ کلمه باشد.
- پاراگراف اول ۳۰ تا ۵۰ کلمه باشد و نام محصول + کلیدواژه کانونی را طبیعی داشته باشد.
- بخش «ویژگی‌های اصلی» حداقل ۵ آیتم li داشته باشد.
- بخش «مشخصات محصول» حداقل ۵ آیتم li داشته باشد، مگر اطلاعات قطعی کمتر باشد؛ اما نوع محصول و کاربرد را حتماً بنویس.
- حداقل ۶ تیتر h5 لازم است.
- برای محصولات مراقبت پوست و مو حداقل ۷ تیتر h5 لازم است.

# ساختار اجباری برای محصولات عمومی
<p>مقدمه طبیعی، فروشگاهی و مخصوص محصول؛ شامل نام محصول، کلیدواژه کانونی، کاربرد اصلی و حس واقعی خرید.</p>
<hr />
<h5>✅ ویژگی‌های اصلی:</h5>
<ul>
<li>ویژگی واقعی و مخصوص محصول</li>
<li>ویژگی واقعی و مخصوص محصول</li>
<li>ویژگی واقعی و مخصوص محصول</li>
<li>ویژگی واقعی و مخصوص محصول</li>
<li>ویژگی واقعی و مخصوص محصول</li>
</ul>
<hr />
<h5>✨ مزایای استفاده:</h5>
<p>مزایا را در ۳ تا ۴ جمله کامل توضیح بده. فقط یک جمله کوتاه ننویس.</p>
<hr />
<h5>📌 طریقه مصرف:</h5>
<p>روش استفاده واقعی محصول را مرحله‌ای اما در قالب متن روان توضیح بده.</p>
<hr />
<h5>🌿 ترکیبات یا فرمولاسیون:</h5>
<p>اگر ترکیبات دقیق مشخص است همان را بگو. اگر مشخص نیست، فقط درباره نوع فرمول، بافت، رایحه یا کاربرد محصول بدون ادعای ساختگی توضیح بده.</p>
<hr />
<h5>🟢 مناسب چه کسانی است؟</h5>
<p>برای چه نوع مصرف‌کننده، پوست، مو، سن، موقعیت یا نیاز روزانه مناسب است. ادعای درمان قطعی نکن.</p>
<hr />
<h5>🧊 روش نگهداری و نکات مهم:</h5>
<ul>
<li>روش نگهداری واقعی و منطقی</li>
<li>نکته ایمنی یا احتیاط مصرف</li>
<li>نکته کاربردی برای مصرف بهتر</li>
</ul>
<hr />
<h5>📦 مشخصات محصول:</h5>
<ul>
<li>برند: اگر مشخص است</li>
<li>مدل: اگر مشخص است</li>
<li>نوع محصول: دسته‌بندی دقیق محصول</li>
<li>حجم/وزن/تعداد/رنگ/رایحه/طعم: فقط موارد قطعی</li>
<li>کشور سازنده: اگر کشور واقعی مشخص است همان کشور را بنویس؛ اگر مشخص نیست دقیقاً بنویس «بستگی به سری ساخت دارد»</li>
<li>کاربرد: کاربرد اصلی محصول</li>
</ul>
<hr />

# انتخاب بخش‌ها بر اساس دسته
- آرایشی/بهداشتی و مراقبت پوست/مو: حتماً «📌 طریقه مصرف»، «🌿 ترکیبات یا فرمولاسیون»، «🟢 مناسب چه کسانی است؟»، «🧊 روش نگهداری و نکات مهم» را بنویس.
- غذا و نوشیدنی: «🍽️ پیشنهاد مصرف»، «🌿 ترکیبات»، «🧊 روش نگهداری»، «📦 مشخصات محصول» را بنویس.
- شوینده: «🧴 راهنمای استفاده»، «⚠️ نکات ایمنی»، «🧊 روش نگهداری»، «📦 مشخصات محصول» را بنویس.
- دیجیتال: «⚙️ مشخصات فنی»، «🔌 کاربرد و راهنمای استفاده»، «🛡️ نکات خرید و نگهداری»، «📦 مشخصات محصول» را بنویس.
- پوشاک: «🧵 جنس و طراحی»، «📏 راهنمای سایز»، «🧺 روش شستشو و نگهداری»، «📦 مشخصات محصول» را بنویس.

# قوانین مهم
- متن باید طبیعی، فروشگاهی و قابل انتشار باشد.
- جمله‌های تکراری، هوش مصنوعی، اغراق‌آمیز یا بی‌ربط ننویس.
- در بخش مشخصات محصول، کشور را فقط با برچسب «کشور سازنده» بنویس. اگر کشور واقعی مشخص است، همان کشور را بنویس؛ اگر مشخص نیست، دقیقاً بنویس: «کشور سازنده: بستگی به سری ساخت دارد».
- «کشور مبدأ برند» را در خروجی مشخصات محصول ننویس. عبارت‌های «اگر مشخص است»، «نامشخص»، «نامعلوم» یا متن دستورالعمل را هرگز داخل خروجی نیاور.
- از Markdown، جدول، h2 و h3 استفاده نکن.
- فقط تگ‌های مجاز: <p>، <strong>، <h5>، <ul>، <li>، <a>، <hr />
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
برای advancedSeoAnalysis فقط روی کلیدواژه‌های مرتبط تمرکز کن.
UI فقط یک خروجی نشان می‌دهد: «کلیدواژه‌های مرتبط، مترادف و LSI». این خروجی باید ترکیبی باشد.
بنابراین آرایه‌های keyphraseSynonyms، lsiKeywords، longTailKeywords و semanticEntities را مثل یک مخزن واحد پر کن تا در UI یک لیست ترکیبی از کلیدواژه‌های مرتبط، مترادف و LSI نمایش داده شود.
برچسب‌های جدا مثل «کلیدواژه‌های مترادف»، «LSI»، «دم‌بلند» یا «موجودیت» در خروجی نهایی نمایش داده نشوند؛ فقط خود عبارت‌ها داخل یک لیست ترکیبی بیایند.
در مجموع حداقل ۴۰ عبارت کلیدی یکتا بده.
عبارت‌ها باید طبیعی، فروشگاهی و مرتبط باشند؛ موارد بی‌ربط مثل «محصول مراقبتی» برای خوراکی‌ها ننویس.
internalLinkingSuggestions و searchIntent را فقط برای سازگاری JSON پر کن، اما در UI نمایش داده نمی‌شوند.
هیچ کلید اضافه‌ای تولید نکن.

قوانین اجباری Yoast SEO برای فیلدهای اصلی:
- focusKeyword باید عبارت اصلی محصول باشد؛ کوتاه، طبیعی و قابل جستجو. آن را در پاراگراف اول fullDescription، عنوان سئو، متا و متن جایگزین تصویر بیاور.
- seoTitle باید طبیعی، فروشگاهی، شامل focusKeyword و حدود ۴۵ تا ۶۵ کاراکتر باشد.
- metaDescription باید شامل focusKeyword، دعوت به خرید/بررسی و حدود ۱۲۰ تا ۱۵۵ کاراکتر باشد.
- shortDescription باید یک متن کوتاه فروشگاهی، طبیعی و مخصوص همان محصول باشد؛ نه جمله عمومی و نه کپی از متا.
- altImageText باید شامل نام محصول/focusKeyword باشد و برای تصویر محصول مناسب باشد.
- هیچ‌کدام از این فیلدها نباید با متن‌های عمومی مثل «محصول با کیفیت»، «محصول مراقبتی» یا جمله‌های مصنوعی پر شوند.
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


function extractBingResults(html: string): string[] {
  const results: string[] = [];
  const blocks = html.match(/<li[^>]+class="[^"]*b_algo[^"]*"[\s\S]*?(?=<li[^>]+class="[^"]*b_algo[^"]*"|<\/ol>|<\/body>)/gi) || [];

  for (const block of blocks) {
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const citeMatch = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);

    const title = cleanSearchText(titleMatch?.[1] || '');
    const snippet = cleanSearchText(snippetMatch?.[1] || '');
    const url = cleanSearchText(citeMatch?.[1] || '');

    if (title || snippet) {
      results.push([title, snippet, url ? `منبع: ${url}` : ''].filter(Boolean).join(' — '));
    }

    if (results.length >= 5) break;
  }

  return results;
}

function normalizeSearchTokenText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/آ/g, 'ا')
    .replace(/[إأٱ]/g, 'ا')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProductIdentityTokens(productName: string): string[] {
  const stopWords = new Set([
    'خرید', 'قیمت', 'فروش', 'محصول', 'اورجینال', 'اصل', 'جدید', 'مدل', 'حجم', 'وزن', 'عدد', 'عددی',
    'بسته', 'گرم', 'کیلو', 'کیلویی', 'میلی', 'لیتر', 'میل', 'مخصوص', 'برای', 'با', 'و', 'در', 'از', 'the',
    'and', 'with', 'original', 'new', 'model', 'ml', 'g', 'kg', 'pcs'
  ]);

  const normalized = normalizeSearchTokenText(productName);
  const tokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));

  return Array.from(new Set(tokens)).slice(0, 8);
}

function getProductAliases(tokens: string[]): string[] {
  const aliases: string[] = [];
  const joined = tokens.join(' ');

  const add = (value: string) => {
    const clean = normalizeSearchTokenText(value);
    if (clean && !tokens.includes(clean) && !aliases.includes(clean)) aliases.push(clean);
  };

  for (const token of tokens) {
    if (token === 'پنیر') add('cheese');
    if (token === 'پوک' || token === 'پاک' || token === 'پک') add('puck');
    if (token === 'کافی') add('coffee');
    if (token === 'قهوه') add('coffee');
    if (token === 'شامپو') add('shampoo');
    if (token === 'خمیر') add('toothpaste');
    if (token === 'دندان') add('toothpaste');
    if (token === 'آیفون' || token === 'ایفون') add('iphone');
  }

  if (/پنیر/.test(joined) && /پوک|پاک|پک/.test(joined)) {
    add('puck cheese');
    add('puck cream cheese');
  }

  return aliases;
}

function scoreSearchResultRelevance(result: string, productName: string): number {
  const normalizedResult = normalizeSearchTokenText(result);
  const normalizedProduct = normalizeSearchTokenText(productName);
  const tokens = getProductIdentityTokens(productName);
  const aliases = getProductAliases(tokens);

  let score = 0;
  if (normalizedProduct && normalizedResult.includes(normalizedProduct)) score += 5;

  for (const token of tokens) {
    if (normalizedResult.includes(token)) score += token.length >= 4 ? 2 : 1;
  }

  for (const alias of aliases) {
    if (normalizedResult.includes(alias)) score += alias.includes(' ') ? 3 : 2;
  }

  // Penalize obviously unrelated marketplace/category-only snippets that only match a generic word like cheese/shampoo.
  const matchedStrongTokens = tokens.filter((token) => token.length >= 3 && normalizedResult.includes(token)).length;
  const matchedAliases = aliases.filter((alias) => normalizedResult.includes(alias)).length;
  if (tokens.length >= 2 && matchedStrongTokens === 0 && matchedAliases === 0) score -= 3;

  return score;
}

function filterRelevantSearchResults(results: string[], productName: string): string[] {
  return results
    .map((result) => ({ result, score: scoreSearchResultRelevance(result, productName) }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.result)
    .slice(0, 8);
}

async function runDuckDuckGoSearch(query: string): Promise<string[]> {
  const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}&kl=wt-wt`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Mohannad4oBot/1.0; +https://mohannad-4o.vercel.app)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }, WEB_SEARCH_TIMEOUT_MS);

  if (!response.ok) return [];
  return extractDuckDuckGoResults(await response.text());
}

async function runBingSearch(query: string): Promise<string[]> {
  const url = `${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&setlang=fa-IR&cc=IR`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }, WEB_SEARCH_TIMEOUT_MS);

  if (!response.ok) return [];
  return extractBingResults(await response.text());
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

  const contextWords = String(briefDescription || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

  const tokens = getProductIdentityTokens(normalizedName);
  const aliases = getProductAliases(tokens);
  const aliasQuery = aliases.length ? aliases.slice(0, 3).join(' ') : '';

  const queries = [
    `"${normalizedName}"`,
    `"${normalizedName}" مشخصات ویژگی ترکیبات حجم مدل کشور مبدا برند`,
    `${normalizedName} ${aliasQuery} ${contextWords} محصول مشخصات کاربرد`,
    `${normalizedName} قیمت خرید مشخصات محصول`,
  ]
    .map((query) => query.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((query, index, arr) => arr.indexOf(query) === index)
    .slice(0, 4);

  const rawResults: string[] = [];

  await Promise.allSettled(queries.map(async (query) => {
    const sourceResults = await Promise.allSettled([
      runDuckDuckGoSearch(query),
      runBingSearch(query),
    ]);

    for (const result of sourceResults) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        if (!rawResults.includes(item)) rawResults.push(item);
      }
    }
  }));

  const relevantResults = filterRelevantSearchResults(rawResults, normalizedName);

  if (relevantResults.length === 0) {
    return [
      `تاریخ امروز برای تشخیص تازگی اطلاعات: ${new Date().toISOString().slice(0, 10)}`,
      `نام دقیق واردشده توسط کاربر: ${normalizedName}`,
      `وضعیت سرچ: نتیجه دقیق و قابل اتکا برای همین نام پیدا نشد یا نتایج نامرتبط بودند.`,
      `قانون سخت‌گیرانه: محصول را تغییر نده، برند/مدل/نوع جدید اختراع نکن، و فقط با همان نام کاربر یک متن فروشگاهی عمومی اما امن و واقع‌گرایانه بساز.`,
      `توکن‌های هویتی محصول که باید حفظ شوند: ${tokens.join('، ') || normalizedName}`,
    ].join('\n');
  }

  return [
    `تاریخ امروز برای تشخیص تازگی اطلاعات: ${new Date().toISOString().slice(0, 10)}`,
    `نام دقیق واردشده توسط کاربر: ${normalizedName}`,
    `توکن‌های هویتی محصول که باید در نام و متن حفظ شوند: ${tokens.join('، ') || normalizedName}`,
    `قانون دقت: فقط نتایجی را استفاده کن که واقعاً درباره همین نام/برند/مدل هستند. اگر بخشی از نتیجه درباره محصول مشابه یا مدل دیگر است، آن بخش را نادیده بگیر.`,
    `قانون ضدکپی: از نتایج فقط برای فهم مشخصات و ویژگی‌ها الهام بگیر؛ هیچ جمله‌ای را عیناً کپی نکن.`,
    ...relevantResults.slice(0, 8).map((item, index) => `${index + 1}. ${item}`),
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
  userPrompt += `\n\nوظیفه تو:\n1. نام محصول را اصلاح و کامل کن. correctedProductName باید بهترین نام فروشگاهی فارسی باشد، نه فقط تکرار نام خام کاربر.
1.1. correctedProductName باید همان محصولی باشد که کاربر نوشته؛ اگر سرچ نتیجه نامرتبط آورد، به سرچ اعتماد نکن و محصول را عوض نکن. اگر کاربر نوشته «پنیر پوک»، نباید آن را به پنیر دیگری، خامه، نوشیدنی یا محصول ساختگی تبدیل کنی؛ فقط همان پنیر/برند/نام را با احتیاط اصلاح کن.\n2. اگر محصول تعداد، وزن، حجم، مدل، برند، سری، رنگ، رایحه یا طعم دارد و از نام/عکس/توضیح مشخص است، آن را به نام و مشخصات اضافه کن.\n3. fullDescription را با قالب پایه بساز و بخش تکمیلی را فقط بر اساس نیاز و نوع همان محصول انتخاب کن؛ تیترهای نامناسب را برای همه محصولات تکرار نکن.\n4. متن باید مخصوص همین محصول باشد و کلی‌گویی بی‌ارزش نداشته باشد.\n5. اگر اطلاعاتی مطمئن نیست، آن را به صورت عدد/مدل قطعی ننویس.
6. اگر کاربر فیلدهایی مثل برند، مدل، حجم،  کشور مبدأ، کشور سازنده یا نوع محصول داده، همان‌ها را با همان برچسب در بخش 📦 مشخصات محصول حفظ کن و حذف نکن.`;

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
  model: GitHubModel,
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  fullSystemInstruction: string,
  isNutsOrDriedFruit: boolean,
  webSearchContext: string,
) {
  const imageAttachedForThisModel = Boolean(productImage && model.vision);
  const userPrompt = buildUserPrompt(productName, briefDescription, productImage, imageAttachedForThisModel, isNutsOrDriedFruit, webSearchContext);

  const userMessage: Record<string, any> = {
    role: 'user',
    content: userPrompt,
  };

  // GitHub Models supports different providers behind one endpoint. Some accept OpenAI-style multimodal
  // content arrays, while some text-only or REST variants reject them. This build tries image input first
  // for vision-capable models, then falls back to text-only models in MODELS if GitHub rejects the image.
  if (imageAttachedForThisModel) {
    userMessage.content = [
      { type: 'text', text: userPrompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${productImage.mimeType};base64,${productImage.base64}`,
        },
      },
    ];
  }

  return [
    {
      role: 'system',
      content: `${fullSystemInstruction}

${schemaInstruction}`,
    },
    userMessage,
  ];
}

function getTextFromGitHubModelsResponse(data: any): string {
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


function restoreRawIdentityIfModelSwappedProduct(data: ProductData, rawProductName: string): ProductData {
  const rawTokens = getProductIdentityTokens(rawProductName);
  if (rawTokens.length === 0) return data;

  const correctedNormalized = normalizeSearchTokenText(data.correctedProductName || '');
  const focusNormalized = normalizeSearchTokenText(data.focusKeyword || '');
  const combined = `${correctedNormalized} ${focusNormalized}`;
  const hasRawIdentity = rawTokens.some((token) => combined.includes(token));

  if (hasRawIdentity) return data;

  const safeName = rawProductName.trim();
  if (!safeName) return data;

  return {
    ...data,
    correctedProductName: safeName,
    focusKeyword: safeName,
    seoTitle: `خرید ${safeName}`.slice(0, 60),
    metaDescription: `خرید ${safeName} با توضیحات کامل، مشخصات محصول و راهنمای انتخاب برای ثبت سفارش مطمئن‌تر.`,
    altImageText: safeName,
  };
}


function uniqueSeoItems(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of items) {
    const item = String(raw || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[،,\s]+|[،,\s]+$/g, '')
      .trim();
    if (!item || item.length < 2) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}


function detectKeywordCategoryText(data: ProductData): string {
  const text = [
    data.correctedProductName,
    data.focusKeyword,
    data.englishProductName,
    data.shortDescription,
    data.metaDescription,
    data.fullDescription,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/قهوه|کافی|نسکافه|کاپوچینو|لاته|اسپرسو|coffee|nescafe|creamer|mate|کافی\s*میت|کافی\s*مت/.test(text)) {
    return 'coffee';
  }
  if (/لوسیون|وازلین|gluta|hya|سرم|کرم|پوست|آبرسان|مرطوب|ضد\s*آفتاب|شامپو|ماسک\s*مو|نرم.?کننده\s*مو|آرایشی|بهداشتی|مو\b|hair|skin|lotion|serum|cream|vaseline/.test(text)) {
    return 'beauty';
  }
  if (/پنیر|لبنیات|شیر|ماست|کره|خامه|دوغ|cheese|dairy/.test(text)) {
    return 'dairy';
  }
  if (/آجیل|خشکبار|پسته|بادام|گردو|فندق|کشمش|خرما|انجیر|تخمه|cashew|pistachio|almond|walnut/.test(text)) {
    return 'nuts';
  }
  if (/شوینده|لباسشویی|ظرفشویی|پاک.?کننده|جرم.?گیر|مایع|پودر\s*لباس|detergent|cleaner/.test(text)) {
    return 'detergent';
  }
  if (/برنج|روغن|چای|نوشیدنی|شکلات|بیسکویت|خوراکی|غذایی|رب|تن ماهی|ماکارونی|زعفران|food|tea/.test(text)) {
    return 'food';
  }
  return 'general';
}

function relatedKeywordExtrasByCategory(category: string, shortProduct: string, brand: string, product: string): string[] {
  const s = shortProduct || product;
  const b = brand || '';
  const common = [
    s,
    product,
    `خرید ${s}`,
    `قیمت ${s}`,
    `خرید آنلاین ${s}`,
    `خرید اینترنتی ${s}`,
    `${s} اصل`,
    `${s} با کیفیت`,
    `مشخصات ${s}`,
    `ویژگی‌های ${s}`,
    `کاربرد ${s}`,
    `راهنمای خرید ${s}`,
    `قیمت روز ${s}`,
    `بهترین ${s}`,
    `${s} فروشگاهی`,
    `خرید ${s} اصل`,
    `قیمت ${s} اصل`,
    `خرید ${s} با قیمت مناسب`,
    `مشخصات و خرید ${s}`,
  ];

  if (category === 'coffee') {
    return [
      ...common,
      b && `خرید ${b}`,
      b && `قیمت ${b}`,
      'قهوه فوری',
      'قهوه آماده',
      'پودر قهوه فوری',
      'نوشیدنی گرم',
      'نوشیدنی فوری قهوه',
      'کافی میت',
      'کافی مت',
      'کرمر قهوه',
      'پودر کافی میت',
      'طعم‌دهنده قهوه',
      'مکمل قهوه',
      'قهوه فوری نستله',
      'کافی میت نستله',
      'پودر کرمر قهوه',
      'کرمر قهوه نستله',
      'خرید قهوه فوری',
      'قیمت قهوه فوری',
      'خرید پودر کافی میت',
      'قیمت کافی میت نستله',
      'قهوه برای صبحانه',
      'قهوه محل کار',
      'نوشیدنی گرم روزانه',
      'قهوه فوری برای مصرف روزانه',
      'پودر نوشیدنی قهوه',
      'محصولات قهوه نستله',
      'قهوه فوری اصل',
      'خرید آنلاین قهوه فوری',
      'قیمت پودر قهوه فوری',
      'بهترین کرمر قهوه',
      'خرید کرمر قهوه',
      'قیمت کرمر قهوه',
    ].filter(Boolean);
  }

  if (category === 'beauty') {
    return [
      ...common,
      b && `خرید ${b}`,
      b && `قیمت ${b}`,
      'مراقبت پوست',
      'آبرسان پوست',
      'نرم کننده پوست',
      'لوسیون بدن',
      'لوسیون آبرسان',
      'لوسیون مرطوب کننده',
      'سرم پوست',
      'روتین مراقبت پوست',
      'محصولات مراقبت بدن',
      'پوست خشک',
      'نرمی و لطافت پوست',
      'خرید لوسیون بدن',
      'قیمت لوسیون بدن',
      'خرید لوسیون آبرسان',
      'لوسیون بدن اصل',
      'محصولات آرایشی بهداشتی',
      'کرم و لوسیون بدن',
      'بهترین لوسیون بدن',
      'لوسیون مناسب استفاده روزانه',
      'مرطوب کننده بدن',
      'خرید محصولات مراقبت پوست',
      'قیمت محصولات مراقبت پوست',
    ].filter(Boolean);
  }

  if (category === 'dairy') {
    return [
      ...common,
      'پنیر',
      'لبنیات',
      'پنیر صبحانه',
      'محصولات لبنی',
      'پنیر خوراکی',
      'پنیر مناسب صبحانه',
      'خرید پنیر',
      'قیمت پنیر',
      'خرید آنلاین پنیر',
      'پنیر بسته بندی',
      'پنیر برای صبحانه',
      'پنیر برای میان وعده',
      'خرید لبنیات',
      'قیمت محصولات لبنی',
    ];
  }

  if (category === 'nuts') {
    return [
      ...common,
      'آجیل',
      'خشکبار',
      'آجیل و خشکبار',
      'مغزهای خوراکی',
      'تنقلات سالم',
      'آجیل پذیرایی',
      'خرید آجیل',
      'قیمت آجیل',
      'خرید خشکبار',
      'قیمت خشکبار',
      'خرید آنلاین آجیل و خشکبار',
      'آجیل تازه',
      'خشکبار تازه',
      'آجیل مناسب پذیرایی',
    ];
  }

  if (category === 'detergent') {
    return [
      ...common,
      'مواد شوینده',
      'شوینده خانگی',
      'نظافت منزل',
      'پاک کننده',
      'شوینده لباس',
      'شوینده ظرف',
      'خرید مواد شوینده',
      'قیمت مواد شوینده',
      'خرید شوینده اصل',
      'محصولات نظافت منزل',
      'پاک کننده قوی',
    ];
  }

  if (category === 'food') {
    return [
      ...common,
      'مواد غذایی',
      'خوراکی',
      'هایپرمارکت',
      'محصولات غذایی',
      'خرید مواد غذایی',
      'قیمت مواد غذایی',
      'خرید آنلاین خوراکی',
      'سبد خرید روزانه',
      'محصولات مصرفی روزانه',
    ];
  }

  return [
    ...common,
    'خرید محصول',
    'قیمت محصول',
    'محصول اصل',
    'محصول فروشگاهی',
    'خرید آنلاین محصول',
    'مشخصات محصول',
    'راهنمای خرید محصول',
  ];
}

function getLikelyBrand(data: ProductData): string {
  const text = [
    data.correctedProductName,
    data.englishProductName,
    data.focusKeyword,
  ].filter(Boolean).join(' ');

  const knownBrands = ['نستله', 'وازلین', 'کلیر', 'سنسوداین', 'الیزاوکا', 'Elizavecca', 'Vaseline', 'Nestle', 'Nescafe'];
  return knownBrands.find((brand) => text.toLowerCase().includes(brand.toLowerCase())) || '';
}

function enrichAdvancedSeoAnalysis(data: ProductData): ProductData {
  const analysis = data.advancedSeoAnalysis || {
    keyphraseSynonyms: [],
    lsiKeywords: [],
    longTailKeywords: [],
    semanticEntities: [],
    searchIntent: 'خرید محصول',
    internalLinkingSuggestions: [],
  };

  const product = String(data.correctedProductName || '').trim();
  const focus = String(data.focusKeyword || product).trim();
  const english = String(data.englishProductName || '').trim();
  const shortProduct = focus || product;
  const brand = getLikelyBrand(data);
  const category = detectKeywordCategoryText(data);

  const relatedKeywords = uniqueSeoItems([
    product,
    focus,
    english,
    brand,
    ...(analysis.keyphraseSynonyms || []),
    ...(analysis.lsiKeywords || []),
    ...(analysis.longTailKeywords || []),
    ...(analysis.semanticEntities || []),
    ...relatedKeywordExtrasByCategory(category, shortProduct, brand, product),
  ])
    .filter((item) => item && item.length > 1)
    .filter((item) => {
      const normalized = item.toLowerCase().trim();
      const banned = [
        'محصول مراقبتی',
        'محصول فروشگاهی',
        'برند محصول',
        'دسته‌بندی محصول',
        'موجودیت معنایی',
        'lsi',
        'long-tail',
        'دم بلند',
        'دم‌بلند',
      ];
      return !banned.includes(normalized);
    })
    .slice(0, 55);

  // Keep the old JSON shape for TypeScript/UI compatibility, but the UI displays ONLY the merged related keyword list.
  // Split the long list across arrays so the final merged output is long, without showing separate groups.
  return {
    ...data,
    advancedSeoAnalysis: {
      keyphraseSynonyms: relatedKeywords.slice(0, 18),
      lsiKeywords: relatedKeywords.slice(18, 36),
      longTailKeywords: relatedKeywords.slice(36, 50),
      semanticEntities: relatedKeywords.slice(50, 55),
      searchIntent: analysis.searchIntent || 'خرید محصول؛ بررسی قیمت، مشخصات، کاربرد و انتخاب گزینه مناسب برای خرید اینترنتی.',
      internalLinkingSuggestions: uniqueSeoItems([
        ...(analysis.internalLinkingSuggestions || []),
        focus,
        product,
        `دسته‌بندی ${shortProduct}`,
        `خرید ${shortProduct}`,
      ]).slice(0, 5),
    },
  };
}


function normalizePlainText(input: string): string {
  return improvePersianNaturalness(String(input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function truncateAtWord(input: string, maxLength: number): string {
  const text = normalizePlainText(input);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut.slice(0, maxLength)).trim().replace(/[،,.؛:]+$/g, '');
}

function makeSentence(input: string): string {
  const text = normalizePlainText(input).replace(/[.]+$/g, '').trim();
  return text ? `${text}.` : '';
}

function getPrimaryProductPhrase(data: ProductData): string {
  const candidate = normalizePlainText(data.focusKeyword || data.correctedProductName || data.englishProductName);
  if (!candidate) return 'محصول';
  // Keep full branded phrase if it is reasonable; otherwise shorten safely.
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length <= 7) return candidate;
  return words.slice(0, 7).join(' ');
}

function detectYoastCategory(data: ProductData): 'beauty' | 'coffee' | 'food' | 'detergent' | 'general' {
  const text = [
    data.correctedProductName,
    data.englishProductName,
    data.focusKeyword,
    data.shortDescription,
    data.metaDescription,
    data.fullDescription,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/قهوه|کافی|نسکافه|کاپوچینو|لاته|اسپرسو|coffee|nescafe|creamer|mate|کافی\s*میت|کافی\s*مت/.test(text)) return 'coffee';
  if (/لوسیون|وازلین|gluta|hya|سرم|کرم|پوست|آبرسان|مرطوب|ضد\s*آفتاب|شامپو|ماسک\s*مو|نرم.?کننده\s*مو|آرایشی|بهداشتی|مو\b|hair|skin|lotion|serum|cream|vaseline/.test(text)) return 'beauty';
  if (/شوینده|لباسشویی|ظرفشویی|پاک.?کننده|جرم.?گیر|مایع|پودر\s*لباس|detergent|cleaner/.test(text)) return 'detergent';
  if (/برنج|روغن|چای|نوشیدنی|شکلات|بیسکویت|خوراکی|غذایی|پنیر|لبنیات|food|tea/.test(text)) return 'food';
  return 'general';
}

function buildYoastShortDescription(focus: string, category: string): string {
  if (category === 'beauty') {
    return makeSentence(`${focus} انتخابی مناسب برای مراقبت روزانه، کمک به نرمی و لطافت پوست یا مو و تکمیل روتین بهداشتی است`);
  }
  if (category === 'coffee') {
    return makeSentence(`${focus} گزینه‌ای کاربردی برای آماده‌سازی سریع نوشیدنی گرم، استفاده روزانه و لذت بردن از طعم قهوه در خانه یا محل کار است`);
  }
  if (category === 'detergent') {
    return makeSentence(`${focus} محصولی کاربردی برای نظافت بهتر، مصرف روزانه و تکمیل سبد شوینده‌های خانگی است`);
  }
  if (category === 'food') {
    return makeSentence(`${focus} محصولی مناسب برای مصرف روزانه، تکمیل سبد غذایی و خرید اینترنتی آسان با بررسی مشخصات و قیمت است`);
  }
  return makeSentence(`${focus} محصولی کاربردی برای خرید اینترنتی، بررسی مشخصات، مقایسه قیمت و انتخاب مطمئن‌تر است`);
}

function buildYoastMetaDescription(focus: string, category: string): string {
  if (category === 'beauty') {
    return makeSentence(`خرید ${focus} با بررسی مشخصات، کاربرد، روش مصرف و قیمت؛ مناسب برای مراقبت روزانه و کمک به نرمی و لطافت پوست یا مو`);
  }
  if (category === 'coffee') {
    return makeSentence(`خرید ${focus} با قیمت مناسب و بررسی مشخصات، طعم، کاربرد و روش مصرف؛ انتخابی کاربردی برای نوشیدنی گرم روزانه`);
  }
  if (category === 'detergent') {
    return makeSentence(`خرید ${focus} با بررسی قیمت، مشخصات، کاربرد و روش مصرف؛ مناسب برای نظافت روزانه و تکمیل سبد شوینده منزل`);
  }
  if (category === 'food') {
    return makeSentence(`خرید ${focus} با قیمت مناسب و بررسی مشخصات، ترکیبات، کاربرد و شرایط نگهداری؛ مناسب برای مصرف روزانه`);
  }
  return makeSentence(`خرید ${focus} با بررسی قیمت، مشخصات، کاربرد و توضیحات کامل؛ انتخابی مناسب برای خرید اینترنتی مطمئن`);
}

function ensureMetaLength(meta: string, focus: string, category: string): string {
  let value = normalizePlainText(meta);
  const hasFocus = focus && value.includes(focus);

  if (!value || value.length < 115 || value.length > 160 || !hasFocus) {
    value = buildYoastMetaDescription(focus, category);
  }

  if (value.length > 155) {
    value = truncateAtWord(value, 152);
  }

  if (value.length < 115) {
    const suffix = category === 'beauty'
      ? ' همراه با توضیحات کامل و نکات مصرف.'
      : ' همراه با توضیحات کامل و امکان انتخاب بهتر.';
    value = truncateAtWord(`${value.replace(/[.]+$/g, '')}${suffix}`, 155);
  }

  return makeSentence(value).replace('..', '.');
}

function ensureSeoTitle(title: string, focus: string): string {
  let value = normalizePlainText(title);
  if (!value || !value.includes(focus) || value.length > 70) {
    value = `${focus} | خرید و قیمت`;
  }
  if (value.length > 70) {
    value = truncateAtWord(value, 68);
  }
  return value;
}

function ensureFocusInFirstParagraph(html: string, focus: string): string {
  if (!focus || !html) return html;
  return html.replace(/<p>([\s\S]*?)<\/p>/i, (match, body) => {
    const text = String(body || '');
    if (text.includes(focus)) return match;
    return `<p>${focus}؛ ${text}</p>`;
  });
}

function ensureYoastSeoFields(data: ProductData): ProductData {
  const focus = getPrimaryProductPhrase(data);
  const category = detectYoastCategory({ ...data, focusKeyword: focus });

  let shortDescription = normalizePlainText(data.shortDescription);
  if (!shortDescription || shortDescription.length < 90 || shortDescription.length > 260 || !shortDescription.includes(focus)) {
    shortDescription = buildYoastShortDescription(focus, category);
  }
  shortDescription = truncateAtWord(shortDescription, 260);

  const seoTitle = ensureSeoTitle(data.seoTitle, focus);
  const metaDescription = ensureMetaLength(data.metaDescription, focus, category);

  let altImageText = normalizePlainText(data.altImageText);
  if (!altImageText || !altImageText.includes(focus) || altImageText.length > 120) {
    altImageText = truncateAtWord(`تصویر ${focus} برای معرفی محصول و خرید اینترنتی`, 115);
  }

  const fullDescription = ensureFocusInFirstParagraph(data.fullDescription, focus);

  return {
    ...data,
    focusKeyword: focus,
    shortDescription,
    seoTitle,
    metaDescription,
    altImageText,
    fullDescription,
  };
}

function normalizeProductData(data: ProductData): ProductData {
  const cleanedData: ProductData = {
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

  return enrichAdvancedSeoAnalysis(ensureYoastSeoFields(cleanedData));
}


function stripHtmlForWordCount(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWordsInHtml(html: string): number {
  const text = stripHtmlForWordCount(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function countMatches(input: string, pattern: RegExp): number {
  return (String(input || '').match(pattern) || []).length;
}

function detectProductContentType(data: ProductData, rawProductName: string, briefDescription: string): 'beauty' | 'food' | 'detergent' | 'digital' | 'clothing' | 'general' {
  const text = [
    rawProductName,
    briefDescription,
    data.correctedProductName,
    data.focusKeyword,
    data.englishProductName,
    ...(data.advancedSeoAnalysis?.semanticEntities || []),
  ].filter(Boolean).join(' ').toLowerCase();

  if (/لوسیون|وازلین|gluta|hya|سرم|کرم|پوست|آبرسان|مرطوب|ضد\s*آفتاب|شامپو|ماسک\s*مو|نرم.?کننده\s*مو|آرایشی|بهداشتی|مو\b|hair|skin|lotion|serum|cream|vaseline/.test(text)) return 'beauty';
  if (/شوینده|لباسشویی|ظرفشویی|پاک.?کننده|جرم.?گیر|مایع|پودر\s*لباس|detergent|cleaner/.test(text)) return 'detergent';
  if (/برنج|روغن|چای|قهوه|نوشیدنی|شکلات|بیسکویت|خوراکی|غذایی|پنیر|لبنیات|food|coffee|tea/.test(text)) return 'food';
  if (/موبایل|گوشی|آیفون|سامسونگ|شیائومی|لپ.?تاپ|تبلت|هدفون|شارژر|دیجیتال|iphone|samsung|xiaomi/.test(text)) return 'digital';
  if (/لباس|پوشاک|کفش|کیف|شلوار|پیراهن|مانتو|clothing|shirt|shoe/.test(text)) return 'clothing';
  return 'general';
}

function insertBeforeSpecsOrAppend(html: string, extraSections: string): string {
  const cleanExtra = extraSections.trim();
  if (!cleanExtra) return html;

  const specsPattern = /(<h5>\s*📦\s*مشخصات\s*محصول\s*:?\s*<\/h5>)/i;
  if (specsPattern.test(html)) {
    return html.replace(specsPattern, `${cleanExtra}\n$1`);
  }

  return `${html.trim()}\n${cleanExtra}`;
}

function ensureMinimumFeatureItems(html: string, type: string): string {
  const featureItemsByType: Record<string, string[]> = {
    beauty: [
      'فرمول مناسب برای استفاده روزانه و مراقبت منظم از پوست یا مو',
      'کمک به حفظ رطوبت و نرمی در استفاده مداوم',
      'بافت کاربردی و مناسب برای قرار گرفتن در روتین مراقبتی',
      'قابل استفاده برای کاهش حس خشکی و زبری سطح پوست یا مو',
      'انتخاب مناسب برای تکمیل محصولات مراقبت شخصی'
    ],
    food: [
      'مناسب برای مصرف روزانه یا پذیرایی',
      'قابل استفاده در ترکیب با وعده‌ها یا میان‌وعده‌های مختلف',
      'بسته‌بندی کاربردی برای نگهداری بهتر محصول',
      'انتخاب مناسب برای تکمیل سبد خرید خوراکی',
      'کاربردی برای مصرف خانگی یا محل کار'
    ],
    detergent: [
      'مناسب برای نظافت روزانه و استفاده خانگی',
      'کمک به پاک‌کنندگی بهتر در کاربرد مشخص محصول',
      'قابل استفاده طبق دستور مصرف روی بسته‌بندی',
      'بسته‌بندی کاربردی برای استفاده آسان‌تر',
      'مناسب برای تکمیل محصولات شوینده و نظافت منزل'
    ],
    general: [
      'طراحی کاربردی متناسب با مصرف روزانه',
      'کیفیت مناسب برای استفاده خانگی یا فروشگاهی',
      'قابل استفاده برای نیازهای رایج خریداران',
      'انتخابی مناسب برای تکمیل سبد خرید',
      'دارای مشخصات کاربردی متناسب با نوع محصول'
    ],
  };

  const extras = featureItemsByType[type] || featureItemsByType.general;

  return html.replace(/(<h5>\s*✅\s*ویژگی‌های\s*اصلی\s*:?\s*<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/i, (_match, open, body, close) => {
    const existingCount = countMatches(body, /<li\b/gi);
    if (existingCount >= 5) return `${open}${body}${close}`;

    const missing = extras.slice(0, 5 - existingCount)
      .map((item) => `<li>${escapeHtmlText(item)}</li>`)
      .join('');
    return `${open}${String(body).trim()}${missing}${close}`;
  });
}

function ensureMohannadFullDescriptionDepth(
  data: ProductData,
  rawProductName: string,
  briefDescription: string,
  isNutsOrDriedFruit: boolean,
): ProductData {
  if (isNutsOrDriedFruit) return data;

  let html = String(data.fullDescription || '').trim();
  if (!html) return data;

  const type = detectProductContentType(data, rawProductName, briefDescription);
  html = ensureMinimumFeatureItems(html, type);

  const h5Count = countMatches(html, /<h5\b/gi);
  const liCount = countMatches(html, /<li\b/gi);
  const wordCount = countWordsInHtml(html);

  if (h5Count >= 6 && liCount >= 12 && wordCount >= 210) {
    return { ...data, fullDescription: html };
  }

  const focus = escapeHtmlText(data.focusKeyword || data.correctedProductName || rawProductName || 'این محصول');
  const name = escapeHtmlText(data.correctedProductName || rawProductName || data.focusKeyword || 'این محصول');

  const sections: string[] = [];

  if (type === 'beauty') {
    if (!/طریقه\s*مصرف|روش\s*استفاده/i.test(html)) {
      sections.push(`<h5>📌 طریقه مصرف:</h5>
<p>برای استفاده بهتر از ${name}، مقدار مناسبی از محصول را روی پوست تمیز یا ناحیه مورد نظر پخش کنید و با حرکت ملایم ماساژ دهید تا جذب شود. اگر محصول برای بدن است، استفاده پس از حمام یا زمانی که پوست کمی رطوبت دارد می‌تواند حس نرمی و لطافت بیشتری ایجاد کند.</p>
<hr />`);
    }
    if (!/ترکیبات|فرمولاسیون|فرمول/i.test(html)) {
      sections.push(`<h5>🌿 ترکیبات یا فرمولاسیون:</h5>
<p>${focus} با تمرکز بر رطوبت‌رسانی، نرمی و مراقبت روزانه طراحی می‌شود. اگر ترکیباتی مانند هیالورونیک اسید، گلیسیرین، ویتامین‌ها یا مواد نرم‌کننده روی بسته‌بندی محصول درج شده باشد، این مواد می‌توانند به کاهش حس خشکی و بهبود لطافت سطح پوست کمک کنند.</p>
<hr />`);
    }
    if (!/مناسب\s*چه\s*کسانی|مناسب\s*برای|چه\s*نوع\s*پوست|چه\s*نوع\s*مو/i.test(html)) {
      sections.push(`<h5>🟢 مناسب چه کسانی است؟</h5>
<p>این محصول برای افرادی مناسب است که به دنبال یک گزینه روزانه برای مراقبت، نرمی و آبرسانی بهتر هستند. برای پوست‌های خیلی حساس یا دارای التهاب، بهتر است ابتدا مقدار کمی از محصول روی بخش کوچکی از پوست تست شود و سپس استفاده منظم انجام گیرد.</p>
<hr />`);
    }
    if (!/نگهداری|نکات\s*مهم|احتیاط/i.test(html)) {
      sections.push(`<h5>🧊 روش نگهداری و نکات مهم:</h5>
<ul>
<li>محصول را در جای خشک و خنک و دور از نور مستقیم آفتاب نگهداری کنید.</li>
<li>از تماس مستقیم محصول با چشم، زخم باز یا پوست تحریک‌شده خودداری شود.</li>
<li>برای نتیجه بهتر، استفاده منظم و متناسب با دستور مصرف روی بسته‌بندی توصیه می‌شود.</li>
</ul>
<hr />`);
    }
  } else if (type === 'food') {
    if (!/پیشنهاد\s*مصرف/i.test(html)) {
      sections.push(`<h5>🍽️ پیشنهاد مصرف:</h5>
<p>${name} را می‌توان متناسب با نوع محصول در وعده‌های روزانه، میان‌وعده، پذیرایی یا کنار نوشیدنی و غذا استفاده کرد. برای حفظ کیفیت، مقدار مورد نیاز را درست پیش از مصرف آماده کنید و باقی‌مانده محصول را در شرایط مناسب نگهداری کنید.</p>
<hr />`);
    }
    if (!/ترکیبات/i.test(html)) {
      sections.push(`<h5>🌿 ترکیبات:</h5>
<p>ترکیبات دقیق باید بر اساس اطلاعات درج‌شده روی بسته‌بندی بررسی شود. اگر ترکیبات کامل در دسترس نیست، بهتر است در صفحه محصول از درج مواد تشکیل‌دهنده حدسی خودداری شود و فقط ویژگی‌های قطعی محصول نوشته شود.</p>
<hr />`);
    }
    if (!/نگهداری/i.test(html)) {
      sections.push(`<h5>🧊 روش نگهداری:</h5>
<ul>
<li>در جای خشک، خنک و دور از نور مستقیم نگهداری شود.</li>
<li>پس از باز شدن بسته‌بندی، درب آن را کاملاً ببندید.</li>
<li>از قرار دادن محصول در معرض رطوبت، گرمای زیاد یا آلودگی محیطی خودداری کنید.</li>
</ul>
<hr />`);
    }
  } else if (type === 'detergent') {
    sections.push(`<h5>🧴 راهنمای کاربردی استفاده:</h5>
<p>${name} را طبق دستور مصرف درج‌شده روی بسته‌بندی و متناسب با سطح یا نوع استفاده به کار ببرید. مصرف بیش از مقدار لازم معمولاً نتیجه بهتری ایجاد نمی‌کند و بهتر است مقدار استفاده با نوع آلودگی و کاربرد محصول هماهنگ باشد.</p>
<hr />
<h5>⚠️ نکات ایمنی و نگهداری صحیح:</h5>
<ul>
<li>دور از دسترس کودکان نگهداری شود.</li>
<li>از تماس مستقیم با چشم و پوست حساس خودداری کنید.</li>
<li>در جای خشک، خنک و دور از تابش مستقیم آفتاب قرار گیرد.</li>
</ul>
<hr />`);
  } else {
    if (!/روش\s*استفاده|راهنمای\s*استفاده|پیشنهاد\s*مصرف/i.test(html)) {
      sections.push(`<h5>📌 راهنمای استفاده:</h5>
<p>${name} را متناسب با کاربرد اصلی محصول و طبق اطلاعات درج‌شده روی بسته‌بندی استفاده کنید. پیش از خرید، توجه به نوع محصول، حجم، مدل، برند و نیاز مصرفی کمک می‌کند انتخاب دقیق‌تری داشته باشید.</p>
<hr />`);
    }
    if (!/نگهداری|نکات\s*مهم/i.test(html)) {
      sections.push(`<h5>🧊 نکات نگهداری و استفاده بهتر:</h5>
<ul>
<li>محصول را در شرایط مناسب و دور از آسیب، رطوبت یا گرمای غیرضروری نگهداری کنید.</li>
<li>پیش از استفاده، توضیحات و هشدارهای درج‌شده روی بسته‌بندی را بررسی کنید.</li>
<li>برای انتخاب بهتر، مشخصات محصول را با نیاز مصرفی خود مقایسه کنید.</li>
</ul>
<hr />`);
    }
  }

  if (sections.length > 0) {
    html = insertBeforeSpecsOrAppend(html, sections.join('\n'));
  }

  return { ...data, fullDescription: html };
}


function sanitizeCountryFieldsInDescription(html: string): string {
  let output = String(html || '');
  const seriesCountryText = 'بستگی به سری ساخت دارد';
  const seriesCountryItem = `<li>کشور سازنده: ${seriesCountryText}</li>`;

  // Never show country of brand origin. User wants only "کشور سازنده".
  output = output.replace(
    /<li>\s*کشور\s*مب[ددا][أا]?\s*برند\s*[:：][\s\S]*?<\/li>/gi,
    ''
  );

  // Remove generic origin country labels to avoid duplicated/contradictory country fields.
  output = output.replace(
    /<li>\s*کشور\s*مب[ددا][أا]?\s*[:：][\s\S]*?<\/li>/gi,
    ''
  );
  output = output.replace(
    /<li>\s*مب[ددا][أا]?\s*تولید\s*[:：][\s\S]*?<\/li>/gi,
    ''
  );

  // If the model leaked instruction text or unknown values, replace with the exact user-approved phrase.
  output = output.replace(
    /<li>\s*کشور\s*سازنده\s*[:：]\s*(?:اگر\s*مشخص\s*است|اگر\s*قطعی\s*و\s*مشخص\s*است|فقط\s*اگر\s*قطعی\s*و\s*مشخص\s*است|اگر\s*کشور\s*واقعی\s*مشخص\s*است[\s\S]*?|نامشخص|نامعلوم|مشخص\s*نیست|ذکر\s*نشده|ندارد|n\/a|unknown|not\s*specified|null|undefined)\s*<\/li>/gi,
    seriesCountryItem
  );

  // Remove other unknown values in specs; country has its special series/build fallback.
  output = output.replace(
    /<li>\s*(?!کشور\s*سازنده\s*[:：])[^<:：]*[:：]\s*(?:اگر\s*مشخص\s*است|نامشخص|نامعلوم|مشخص\s*نیست|ذکر\s*نشده|ندارد|n\/a|unknown|not\s*specified|null|undefined)\s*<\/li>/gi,
    ''
  );

  // If specs section exists and has no country manufacturer line, add the safe series/build note.
  const specsPattern = /(<h5>\s*📦\s*مشخصات\s*محصول\s*:?\s*<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/i;
  output = output.replace(specsPattern, (_match, open, body, close) => {
    const bodyText = String(body || '');
    if (/کشور\s*سازنده\s*[:：]/i.test(bodyText)) {
      return `${open}${bodyText}${close}`;
    }
    return `${open}${bodyText.trimEnd()}\n${seriesCountryItem}\n${close}`;
  });

  // Deduplicate country manufacturer list items.
  let seenCountry = false;
  output = output.replace(/<li>\s*کشور\s*سازنده\s*[:：][\s\S]*?<\/li>/gi, (item) => {
    if (seenCountry) return '';
    seenCountry = true;
    // Keep real country if it is not instruction/unknown text; otherwise use series fallback.
    if (/اگر\s*مشخص\s*است|نامشخص|نامعلوم|unknown|not\s*specified|undefined|null/i.test(item)) {
      return seriesCountryItem;
    }
    return item;
  });

  output = output
    .replace(/<ul>\s*<\/ul>/gi, '')
    .replace(/\n{3,}/g, '\n')
    .replace(/>\s+</g, '><')
    .trim();

  return output;
}

function sanitizeCountryFieldsInProductData(data: ProductData): ProductData {
  return {
    ...data,
    fullDescription: sanitizeCountryFieldsInDescription(data.fullDescription),
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

  const description = String(data.fullDescription || '');
  if (!description.includes('<p>') || !description.includes('<h5>') || !description.includes('<hr')) {
    throw new Error('AI response did not preserve the Mohannad SEO HTML product description template.');
  }

  if (!isNutsOrDriedFruit) {
    const h5Count = countMatches(description, /<h5\b/gi);
    const liCount = countMatches(description, /<li\b/gi);
    const wordCount = countWordsInHtml(description);

    if (h5Count < 5) {
      throw new Error(`AI response fullDescription is too short: only ${h5Count} h5 sections.`);
    }

    if (liCount < 9) {
      throw new Error(`AI response fullDescription is too thin: only ${liCount} list items.`);
    }

    if (wordCount < 170) {
      throw new Error(`AI response fullDescription is too short: only ${wordCount} words.`);
    }
  }
}

async function requestGitHubModel(
  model: GitHubModel,
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
    temperature: 0.25,
    top_p: 0.85,
    max_tokens: Number(process.env.MAX_OUTPUT_TOKENS || 4000),
  };

  if (useJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetchWithTimeout(GITHUB_MODELS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    body: JSON.stringify(body),
  }, AI_MODEL_TIMEOUT_MS);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText || 'GitHub Models request failed.';
    throw new Error(`${model.id}: ${message}`);
  }

  return data;
}

async function callGitHubModel(
  model: GitHubModel,
  apiKey: string,
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  fullSystemInstruction: string,
  isNutsOrDriedFruit: boolean,
  webSearchContext: string,
): Promise<ProductData> {
  let lastError: unknown = null;

  // GitHub Models may reject or ignore JSON mode for some models, so try plain prompt-first.
  // The prompt still demands valid JSON and extractJson() can read JSON from a text response.
  for (const useJsonMode of [false, true]) {
    try {
      const data = await requestGitHubModel(
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

      const text = getTextFromGitHubModelsResponse(data);
      if (!text) {
        throw new Error(`${model.id}: empty response from AI model.`);
      }

      const rawGeneratedData = restoreRawIdentityIfModelSwappedProduct(normalizeProductData(extractJson(text)), productName);
      const generatedData = sanitizeCountryFieldsInProductData(ensureMohannadFullDescriptionDepth(
        rawGeneratedData,
        productName,
        briefDescription,
        isNutsOrDriedFruit,
      ));
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

    const apiKey = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GITHUB_TOKEN در تنظیمات Vercel تعریف نشده است. توکن را فقط در Environment Variables بگذارید.' });
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
        const generatedData = await callGitHubModel(
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
        const responseData: ProductData = sanitizeCountryFieldsInProductData({
          ...linkedData,
          fullDescription: ensureKnownDetailsInDescription(
            linkedData.fullDescription,
            productName,
            briefDescription || '',
          ),
        });

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
      message: 'مدل GitHub Models خطا داد. details را ببینید: اگر 401/403 بود، GITHUB_TOKEN یا دسترسی models:read مشکل دارد؛ اگر 404/422 بود، مقدار GITHUB_MODEL را روی openai/gpt-4o یا openai/gpt-4.1 بگذارید؛ اگر rate limit بود، چند دقیقه بعد تست کنید.',
      details: modelErrors.slice(-4),
    });
  } catch (error) {
    console.error('Error in Vercel function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return res.status(500).json({ message: `Internal Server Error: ${errorMessage}` });
  }
}
