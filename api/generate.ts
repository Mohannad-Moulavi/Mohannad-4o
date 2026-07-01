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
        'توضیحات کامل محصول با فرمت HTML دقیقاً طبق قالب تعیین‌شده. باید با پاراگراف مقدمه شروع شود و سپس بخش‌های h5، ایموجی، ul/li، p و hr داشته باشد. اطلاعات قطعی مثل برند، مدل، حجم/وزن، oz/ml/g، SPF، PA، شماره رنگ، رایحه، طعم و نوع پوست/مو باید در بخش مشخصات محصول حفظ شود؛ کشور به هیچ شکل نوشته نشود.',
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
4.1. هر اطلاعات قطعی که کاربر در نام یا توضیحات اولیه داده، مثل «برند»، «مدل»، «حجم»، «وزن» و «نوع محصول»، باید بدون حذف و بدون تغییر معنی در fullDescription و مخصوصاً بخش «📦 مشخصات محصول» بیاید؛ اما کشور را ننویس.
5. اگر چیزی از تصویر یا توضیحات مشخص نیست، حدس خطرناک نزن؛ اما ویژگی‌های عمومی و رایج همان دسته محصول را طبیعی اضافه کن.
6. ساختار پایه fullDescription را با الهام از قالب اصلی Mohannad SEO حفظ کن، اما بخش‌ها را پویا و متناسب با نوع همان محصول انتخاب کن. برای همه محصولات تیترهای نامناسب و تکراری مثل «چرا انتخاب هوشمندانه است» ننویس.
7. در fullDescription از Markdown، علامت ---، تیترهای h2/h3، جدول، JSON داخلی یا متن بیرون از HTML استفاده نکن.
7.1. در fullDescription دقیقاً ۱ لینک داخلی قابل ویرایش با تگ <a href="https://noon-valqalam.ir/product-category/hypermarket/">متن لینک مرتبط</a> قرار بده. لینک باید داخل یک جمله طبیعی و واقع‌گرایانه باشد، نه به شکل باکس جدا یا راهنمای ویرایش. اگر جمله لینک‌دار مصنوعی شد، جمله را بازنویسی کن تا منطقی شود؛ href همیشه باید # باشد.
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
- دقیقاً ۱ لینک داخلی واقعی از دسته‌بندی‌های سایت noon-valqalam.ir داخل یک جمله طبیعی و مرتبط قرار بده؛ href="#" ننویس.

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
<li>SPF/PA/UVA/UVB/شماره رنگ/نوع پوست یا مو: فقط اگر روی عکس یا ورودی مشخص است</li>
<li>واحدهای روی بسته‌بندی مثل oz/ml/g: فقط اگر مشخص است</li>
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
- اگر روی عکس یا ورودی کاربر جزئیاتی مثل SPF، PA، UVA/UVB، 10.4 oz، ml، g، شماره رنگ، رایحه، نوع پوست/مو یا ترکیبات شاخص وجود دارد، باید در نام محصول، توضیحات و مشخصات محصول بیاید؛ اما اگر وجود ندارد، اجباری یا ساختگی ننویس.
- حجم را فقط در بخش «📦 مشخصات محصول» بنویس و در ویژگی‌ها/مزایا تکرار نکن. اما SPF، PA، UVA/UVB، شماره رنگ، مدل، سری، رایحه یا ویژگی‌های واقعی محصول اگر کاربردی و مهم هستند، می‌توانند در ویژگی‌ها هم بیایند.
- متن باید طبیعی، فروشگاهی و قابل انتشار باشد.
- جمله‌های تکراری، هوش مصنوعی، اغراق‌آمیز یا بی‌ربط ننویس.
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
  userPrompt += `\n\nقانون بسیار مهم تشخیص محصول:
- correctedProductName باید نام اصلاح‌شده و واقعی محصول باشد، نه تکرار کورکورانه نام خام کاربر.
- اگر تصویر محصول ارسال شده و متن/لوگو/ظاهر بسته‌بندی با نام خام کاربر فرق دارد، تصویر و متن روی بسته‌بندی منبع اصلی است.
- نام خام کاربر فقط راهنماست و ممکن است غلط، تستی یا کاملاً نامرتبط باشد.
- کشور را به هیچ شکل در خروجی ننویس؛ حتی اگر روی بسته‌بندی مشخص باشد.
- جزئیات قابل مشاهده روی عکس مثل حجم، وزن، اونس، میلی‌لیتر، گرم، SPF، PA+/PA++/PA+++، UVA/UVB، شماره رنگ، سری، مدل، رایحه، طعم، نوع پوست/مو، ترکیبات شاخص و ویژگی‌های روی بسته‌بندی را حتماً بخوان.
- این جزئیات را فقط اگر واقعاً روی عکس یا در متن کاربر مشخص بود بنویس؛ برای محصولی که این موارد را ندارد، اجباری یا ساختگی اضافه نکن.
- اگر یک مقدار هم به فارسی و هم به انگلیسی/اختصاری نوشته شده بود، فقط یک‌بار بنویس. مثال: «حجم 300 میلی‌لیتر 300 ml» غلط است و باید «حجم 300 میلی‌لیتر» شود. برای متن فارسی، واحد فارسی را ترجیح بده: «300 میلی‌لیتر» نه «300 میلی‌لیتر 300 ml»، «250 گرم» نه «250 گرم 250 g».
- اگر فقط واحد انگلیسی روی عکس بود و معادل فارسی در ورودی نبود، همان را نگه دار؛ مثل «10.4 oz». اما اگر معادل فارسی و انگلیسی یک عدد کنار هم بودند، تکراری ننویس.
- برای محصولات آرایشی/بهداشتی اگر روی بسته‌بندی SPF، حجم مثل 10.4 oz، 300 ml، شماره رنگ، نوع پوست یا ترکیب شاخص نوشته شده، باید در correctedProductName، fullDescription و بخش 📦 مشخصات محصول بیاید.
- برای محصولات غیرآرایشی هم همین قانون برقرار است: هر عدد/واحد/ویژگی مهم روی بسته‌بندی، اگر قابل خواندن بود، در مشخصات و توضیحات ذکر شود؛ اما اگر نبود، حدس نزن.
- اگر کاربر نام الکی نوشته اما تصویر محصول واضح است، محصول را بر اساس تصویر تشخیص بده و نام را اصلاح کن.
- مثال: اگر نام خام هر چیزی بود ولی تصویر آب زمزم بود، خروجی باید آب زمزم/نوشیدنی/مواد غذایی باشد، نه آرایشی یا نام خام کاربر.
- دسته‌بندی، توضیحات، کلیدواژه‌ها و لینک داخلی باید بر اساس محصول واقعیِ تشخیص‌داده‌شده از تصویر/بسته‌بندی باشد.`;

  if (briefDescription && briefDescription.trim()) {
    userPrompt += `\n- توضیحات اولیه کاربر: "${briefDescription.trim()}"`;
  }

  userPrompt += `\n- دسته خروجی: ${isNutsOrDriedFruit ? 'آجیل یا خشکبار' : 'محصول عمومی/غیرخشکبار'}`;
  userPrompt += `\n\nوظیفه تو:\n1. نام محصول را اصلاح و کامل کن. correctedProductName باید بهترین نام فروشگاهی فارسی و واقعی محصول باشد، نه فقط تکرار نام خام کاربر.
1.1. اگر تصویر ارسال شده، نام محصول را از تصویر، لوگو، نوشته‌های بسته‌بندی، شکل محصول و کاربرد آن استخراج کن. اگر نام خام کاربر با تصویر تناقض دارد، نام خام را کنار بگذار و محصول واقعی تصویر را بنویس.
1.2. اگر تصویر ارسال نشده، نام خام کاربر را با احتیاط اصلاح کن و محصول را به مدل یا دسته کاملاً نامرتبط تبدیل نکن.\n2. اگر محصول تعداد، وزن، حجم، مدل، برند، سری، رنگ، رایحه یا طعم دارد و از نام/عکس/توضیح مشخص است، آن را به نام و مشخصات اضافه کن.\n3. fullDescription را با قالب پایه بساز و بخش تکمیلی را فقط بر اساس نیاز و نوع همان محصول انتخاب کن؛ تیترهای نامناسب را برای همه محصولات تکرار نکن.\n4. متن باید مخصوص همین محصول باشد و کلی‌گویی بی‌ارزش نداشته باشد.\n5. اگر اطلاعاتی مطمئن نیست، آن را به صورت عدد/مدل قطعی ننویس.
6. اگر کاربر فیلدهایی مثل برند، مدل، حجم، کشور مبدأ، کشور سازنده یا نوع محصول داده، همان‌ها را در بخش 📦 مشخصات محصول حفظ کن و حذف نکن.
7. برای لینک داخلی فقط از دسته‌بندی‌های واقعی سایت noon-valqalam.ir استفاده کن. href="#" ننویس؛ لینک نهایی توسط کد از لیست دسته‌بندی‌های واقعی سایت جایگزین می‌شود.`;

  if (productImage && imageAttachedForThisModel) {
    userPrompt += '\n\nتصویر محصول هم ارسال شده است. تصویر را دقیق بخوان: متن روی بسته‌بندی، لوگو، برند، تعداد، وزن/حجم، واحدهایی مثل oz/ml/g، مدل، SPF، PA، UVA/UVB، شماره رنگ، رنگ، رایحه/طعم، نوع پوست/مو، ترکیبات شاخص، کاربرد و جزئیات ظاهری را استخراج کن و در نام اصلاح‌شده، توضیحات و مشخصات محصول لحاظ کن؛ اما فقط اگر واقعاً قابل مشاهده یا قابل استنباط مطمئن از عکس بود. اگر نام خام کاربر با تصویر فرق داشت، تصویر را منبع معتبرتر بدان و نام محصول را بر اساس تصویر اصلاح کن.';
  } else if (productImage) {
    userPrompt += '\n\nکاربر تصویر ارسال کرده، اما این مدل fallback متنی است و تصویر را نمی‌بیند. بنابراین فقط بر اساس نام و توضیحات اولیه بهترین خروجی سئویی را بساز و جزئیات نامطمئن تصویر را اختراع نکن.';
  }

  if (webSearchContext && webSearchContext.trim()) {
    userPrompt += `\n\n# اطلاعات تازه از جستجوی وب\n${webSearchContext.trim()}\n\nقانون استفاده از سرچ وب:\n- اگر تصویر محصول ارسال شده، تصویر و متن روی بسته‌بندی از نتایج سرچ و نام خام کاربر معتبرتر است.
- اگر تصویر ارسال نشده، این اطلاعات را برای مدل‌ها/نسخه‌های جدید، مشخصات محصول و اصلاح نام، از دانش داخلی خودت معتبرتر بدان.\n- اگر نام خام محصول جدید است، آن را به محصول قدیمی‌تر تغییر نده. مثال: اگر کاربر «ایفون 17» نوشته، آن را به «ایفون 13» تبدیل نکن.\n- اگر نتایج سرچ فقط بخشی از مشخصات را تأیید می‌کنند، فقط همان بخش‌های مطمئن را بنویس و بقیه را عمومی و بدون عددسازی توضیح بده.\n- قیمت روز، موجودی، تاریخ عرضه قطعی و مشخصات عددی نامطمئن را اختراع نکن.`;
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
    // Keep real noon-valqalam internal category links, but remove random/external links from model output.
    .replace(/<a\b([^>]*)href=["']([^"']*)["']([^>]*)>/gi, (_match, before, href, after) => {
      const safeHref = String(href || '');
      if (safeHref.startsWith('https://noon-valqalam.ir/')) {
        return `<a href="${safeHref}">`;
      }
      return '<a>';
    })
    .replace(/<a\b(?![^>]*href=)([^>]*)>/gi, '<a>')
    .replace(/https?:\/\/[^\s<"']+/gi, '')
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
    
    { label: 'SPF', regex: /\bSPF\s*[:：\-]?\s*([0-9]{2,3}\+?)\b/i },
    { label: 'PA', regex: /\bPA\s*[:：\-]?\s*(\+{1,4})\b/i },
    { label: 'محافظت', regex: /\b(UVA\/UVB|UVA|UVB)\b/i },
    { label: 'حجم/وزن', regex: /\b([0-9]+(?:\.[0-9]+)?\s*(?:fl\s*)?oz)\b/i },
    { label: 'حجم', regex: /\b([0-9]+(?:\.[0-9]+)?\s*(?:ml|mL|میل(?:ی)?\s*لیتر))\b/i },
    { label: 'وزن', regex: /\b([0-9]+(?:\.[0-9]+)?\s*(?:g|gr|گرم|کیلوگرم))\b/i },
    { label: 'شماره رنگ', regex: /(?:شماره\s*رنگ|رنگ\s*شماره|shade|color)\s*[:：\-]?\s*([A-Za-z0-9آ-ی\s\-\/]+)$/i },
    { label: 'نوع پوست', regex: /(?:نوع\s*پوست|مناسب\s*پوست)\s*[:：\-]?\s*([آ-ی\s]+)$/i },
    { label: 'نوع مو', regex: /(?:نوع\s*مو|مناسب\s*مو)\s*[:：\-]?\s*([آ-ی\s]+)$/i },
    { label: 'نوع محصول', regex: /^\s*نوع\s*محصول\s*[:：\-]\s*(.+)$/i },
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
  const details = extractStructuredInputDetails(rawProductName, briefDescription)
    .filter((detail) => !/کشور|مبدا|مبدأ|سازنده/i.test(detail.label));
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

const SITE_CATEGORIES: Array<{ title: string; href: string; keywords: string[] }> = [
  { title: "بهداشت بانوان و آقایان", href: "https://noon-valqalam.ir/product-category//deodorant-spray/women-men-care/", keywords: ["بهداشت بانوان و آقایان"] },
  { title: "ابزار آرایش و پیرایش", href: "https://noon-valqalam.ir/product-category/cosmetics/hair/hair-cutting-tools/", keywords: ["ابزار آرایش و پیرایش"] },
  { title: "لوازم آرایشی بهداشتی", href: "https://noon-valqalam.ir/product-category/cosmetics/", keywords: ["لوازم آرایشی بهداشتی", "آرایشی بهداشتی", "cosmetics"] },
  { title: "بهداشت دهان و دندان", href: "https://noon-valqalam.ir/product-category/cosmetics/personal-care/mouth-teeth/", keywords: ["بهداشت دهان و دندان", "خمیر دندان", "مسواک", "دهان", "دندان", "toothpaste", "tooth"] },
  { title: "دئودرانت و ضد تعریق", href: "https://noon-valqalam.ir/product-category//deodorant-spray/women-men-care/deodorant/", keywords: ["دئودرانت و ضد تعریق", "دئودرانت", "ضد تعریق", "deodorant"] },
  { title: "جعبه کادویی زعفران", href: "https://noon-valqalam.ir/product-category/saffron/saffron-gift-pack/", keywords: ["جعبه کادویی زعفران"] },
  { title: "مراقبت و زیبایی مو", href: "https://noon-valqalam.ir/product-category/cosmetics/hair/", keywords: ["مراقبت و زیبایی مو", "مو", "ماسک مو", "سرم مو", "نرم کننده مو", "hair"] },
  { title: "پاک کننده و شوینده", href: "https://noon-valqalam.ir/product-category/skincare/cleanser/", keywords: ["پاک کننده و شوینده"] },
  { title: "زعفران نیم مثقالی", href: "https://noon-valqalam.ir/product-category/saffron/saffron-nim-mesghal/", keywords: ["زعفران نیم مثقالی"] },
  { title: "مراقبت دست و ناخن", href: "https://noon-valqalam.ir/product-category/skincare/hand-nail-treat/", keywords: ["مراقبت دست و ناخن"] },
  { title: "مراقبت چشم و ابرو", href: "https://noon-valqalam.ir/product-category/skincare/eye-care/", keywords: ["مراقبت چشم و ابرو"] },
  { title: "آرایش چشم و ابرو", href: "https://noon-valqalam.ir/product-category/cosmetics/makeup-cosmetics-2/eye-makeup/", keywords: ["آرایش چشم و ابرو", "ریمل", "مداد چشم", "سایه", "ابرو", "آرایش چشم"] },
  { title: "خوشبو کننده لباس", href: "https://noon-valqalam.ir/product-category/%d8%ae%d9%88%d8%b4%d8%a8%d9%88-%da%a9%d9%86%d9%86%d8%af%d9%87-%d9%84%d8%a8%d8%a7%d8%b3/", keywords: ["خوشبو کننده لباس"] },
  { title: "زعفران دو مثقالی", href: "https://noon-valqalam.ir/product-category/saffron/saffron-2-mesghal/", keywords: ["زعفران دو مثقالی"] },
  { title: "زعفران چهار گرمی", href: "https://noon-valqalam.ir/product-category/saffron/4g-saffron-saffron/", keywords: ["زعفران چهار گرمی"] },
  { title: "زعفران یک مثقالی", href: "https://noon-valqalam.ir/product-category/saffron/saffron-1-mesghal/", keywords: ["زعفران یک مثقالی"] },
  { title: "خوشبو کننده هوا", href: "https://noon-valqalam.ir/product-category/cosmetics/perfume/air-freshner/", keywords: ["خوشبو کننده هوا"] },
  { title: "زعفران نیم گرمی", href: "https://noon-valqalam.ir/product-category/saffron/%d8%b2%d8%b9%d9%81%d8%b1%d8%a7%d9%86-%d9%86%db%8c%d9%85-%da%af%d8%b1%d9%85%db%8c/", keywords: ["زعفران نیم گرمی"] },
  { title: "زعفران پنج گرمی", href: "https://noon-valqalam.ir/product-category/saffron/5g-saffron/", keywords: ["زعفران پنج گرمی"] },
  { title: "پسته احمد آقایی", href: "https://noon-valqalam.ir/product-category/nuts/nut/pistachios/pistachio-ahmad-aghaei/", keywords: ["پسته احمد آقایی"] },
  { title: "زعفران ده گرمی", href: "https://noon-valqalam.ir/product-category/saffron/10g-saffron/", keywords: ["زعفران ده گرمی"] },
  { title: "زعفران دو گرمی", href: "https://noon-valqalam.ir/product-category/saffron/2gr-saffron/", keywords: ["زعفران دو گرمی"] },
  { title: "زعفران سه گرمی", href: "https://noon-valqalam.ir/product-category/saffron/4g-saffron/", keywords: ["زعفران سه گرمی"] },
  { title: "زعفران یک گرمی", href: "https://noon-valqalam.ir/product-category/saffron/1g-saffron/", keywords: ["زعفران یک گرمی"] },
  { title: "محصولات کادوئی", href: "https://noon-valqalam.ir/product-category/gifts/", keywords: ["محصولات کادوئی"] },
  { title: "خشکبار و آجیل", href: "https://noon-valqalam.ir/product-category/nuts/", keywords: ["خشکبار و آجیل", "آجیل و خشکبار"] },
  { title: "پسته کله قوچی", href: "https://noon-valqalam.ir/product-category/nuts/nut/pistachios/pistachio-kalleh-ghouchi/", keywords: ["پسته کله قوچی"] },
  { title: "کمربند حرارتی", href: "https://noon-valqalam.ir/product-category/%da%a9%d9%85%d8%b1%d8%a8%d9%86%d8%af-%d8%ad%d8%b1%d8%a7%d8%b1%d8%aa%db%8c/", keywords: ["کمربند حرارتی"] },
  { title: "آجیل مناسبتی", href: "https://noon-valqalam.ir/product-category/nuts/nut/date-nuts/", keywords: ["آجیل مناسبتی"] },
  { title: "دیگر محصولات", href: "https://noon-valqalam.ir/product-category/uncategorized/", keywords: ["دیگر محصولات"] },
  { title: "مراقبت از مو", href: "https://noon-valqalam.ir/product-category/cosmetics/hair/hair-care/", keywords: ["مراقبت از مو"] },
  { title: "مغز پسته خام", href: "https://noon-valqalam.ir/product-category/nuts/nut/pistachios/raw-pistachio/", keywords: ["مغز پسته خام"] },
  { title: "ژله و کارامل", href: "https://noon-valqalam.ir/product-category/hypermarket/jelly-and-caramel/", keywords: ["ژله و کارامل"] },
  { title: "آجیل ترکیبی", href: "https://noon-valqalam.ir/product-category/nuts/nut/mixed-nuts/", keywords: ["آجیل ترکیبی"] },
  { title: "ابزار آرایش", href: "https://noon-valqalam.ir/product-category/cosmetics/makeup-cosmetics-2/makeup-accessories/", keywords: ["ابزار آرایش"] },
  { title: "بادام زمینی", href: "https://noon-valqalam.ir/product-category/nuts/peanuts/", keywords: ["بادام زمینی"] },
  { title: "بهداشت شخصی", href: "https://noon-valqalam.ir/product-category/cosmetics/personal-care/", keywords: ["بهداشت شخصی"] },
  { title: "حبه میوه ای", href: "https://noon-valqalam.ir/product-category/nuts/dried-fruits/fruit-cubes/", keywords: ["حبه میوه ای"] },
  { title: "زیبایی پوست", href: "https://noon-valqalam.ir/product-category/%d8%b2%db%8c%d8%a8%d8%a7%db%8c%db%8c-%d9%be%d9%88%d8%b3%d8%aa/", keywords: ["زیبایی پوست"] },
  { title: "عطر و ادکلن", href: "https://noon-valqalam.ir/product-category/cosmetics/perfume/fragrance/", keywords: ["عطر و ادکلن", "عطر", "ادکلن", "perfume", "fragrance"] },
  { title: "عطر و اسپری", href: "https://noon-valqalam.ir/product-category/cosmetics/perfume/", keywords: ["عطر و اسپری"] },
  { title: "غلات صبحانه", href: "https://noon-valqalam.ir/product-category/hypermarket/cornflakes/", keywords: ["غلات صبحانه"] },
  { title: "لوازم اصلاح", href: "https://noon-valqalam.ir/product-category/cosmetics/personal-care/shaving-supplies/", keywords: ["لوازم اصلاح"] },
  { title: "لوازم قنادی", href: "https://noon-valqalam.ir/product-category/confectionery/", keywords: ["لوازم قنادی"] },
  { title: "مراقبت صورت", href: "https://noon-valqalam.ir/product-category/skincare/face-care/", keywords: ["مراقبت صورت"] },
  { title: "مراقبت پوست", href: "https://noon-valqalam.ir/product-category/skincare/", keywords: ["مراقبت پوست", "پوست", "آبرسان", "مرطوب کننده", "سرم پوست", "کرم صورت", "کرم پوست", "skin", "serum", "cream"] },
  { title: "مواد شوینده", href: "https://noon-valqalam.ir/product-category/hypermarket/%d9%85%d9%88%d8%a7%d8%af-%d8%b4%d9%88%db%8c%d9%86%d8%af%d9%87/", keywords: ["مواد شوینده", "شوینده", "مایع لباسشویی", "پودر لباسشویی", "جرم گیر", "detergent", "cleaner"] },
  { title: "پسته بادامی", href: "https://noon-valqalam.ir/product-category/nuts/nut/pistachios/pistachio-badami/", keywords: ["پسته بادامی"] },
  { title: "پودر سوخاری", href: "https://noon-valqalam.ir/product-category/hypermarket/breadcrumbs/", keywords: ["پودر سوخاری"] },
  { title: "آرایش صورت", href: "https://noon-valqalam.ir/product-category/cosmetics/makeup-cosmetics-2/face-makeup/", keywords: ["آرایش صورت", "کرم پودر", "پنکک", "کانسیلر"] },
  { title: "آرایش ناخن", href: "https://noon-valqalam.ir/product-category/cosmetics/makeup-cosmetics-2/nail/", keywords: ["آرایش ناخن"] },
  { title: "بادام هندی", href: "https://noon-valqalam.ir/product-category/nuts/nut/cashew/", keywords: ["بادام هندی"] },
  { title: "بادی اسپلش", href: "https://noon-valqalam.ir/product-category/cosmetics/perfume/bod-splash/", keywords: ["بادی اسپلش", "body splash"] },
  { title: "بدن و حمام", href: "https://noon-valqalam.ir/product-category//deodorant-spray/body-bath/", keywords: ["بدن و حمام"] },
  { title: "روغن زیتون", href: "https://noon-valqalam.ir/product-category/hypermarket/olive-oil/", keywords: ["روغن زیتون"] },
  { title: "لوسیون بدن", href: "https://noon-valqalam.ir/product-category/%d9%84%d9%88%d8%b3%db%8c%d9%88%d9%86-%d8%a8%d8%af%d9%86/", keywords: ["لوسیون بدن", "body lotion", "lotion body"] },
  { title: "مراقبت بدن", href: "https://noon-valqalam.ir/product-category/skincare/body-care/", keywords: ["مراقبت بدن", "بدن", "body care", "body"] },
  { title: "هایپرمارکت", href: "https://noon-valqalam.ir/product-category/hypermarket/", keywords: ["هایپرمارکت"] },
  { title: "وسایل برقی", href: "https://noon-valqalam.ir/product-category/%d9%88%d8%b3%d8%a7%db%8c%d9%84-%d8%a8%d8%b1%d9%82%db%8c/", keywords: ["وسایل برقی"] },
  { title: "ویفر شکلات", href: "https://noon-valqalam.ir/product-category/hypermarket/%d9%88%db%8c%d9%81%d8%b1-%d8%b4%da%a9%d9%84%d8%a7%d8%aa/", keywords: ["ویفر شکلات", "ویفر"] },
  { title: "پسته اکبری", href: "https://noon-valqalam.ir/product-category/nuts/nut/pistachios/pistachio-akbari/", keywords: ["پسته اکبری"] },
  { title: "پودر شکلات", href: "https://noon-valqalam.ir/product-category/hypermarket/%d9%be%d9%88%d8%af%d8%b1-%d8%b4%da%a9%d9%84%d8%a7%d8%aa/", keywords: ["پودر شکلات"] },
  { title: "کرم خوراکی", href: "https://noon-valqalam.ir/product-category/hypermarket/edible-cream/", keywords: ["کرم خوراکی"] },
  { title: "کرم کارامل", href: "https://noon-valqalam.ir/product-category/%da%a9%d8%b1%d9%85-%da%a9%d8%a7%d8%b1%d8%a7%d9%85%d9%84/", keywords: ["کرم کارامل"] },
  { title: "اسپری بدن", href: "https://noon-valqalam.ir/product-category/cosmetics/perfume/body-spray/", keywords: ["اسپری بدن"] },
  { title: "اسکراب مو", href: "https://noon-valqalam.ir/product-category/%d8%a7%d8%b3%da%a9%d8%b1%d8%a7%d8%a8-%d9%85%d9%88/", keywords: ["اسکراب مو"] },
  { title: "انجیر خشک", href: "https://noon-valqalam.ir/product-category/nuts/dried-fruits/fig/", keywords: ["انجیر خشک"] },
  { title: "تراول ماگ", href: "https://noon-valqalam.ir/product-category/%d8%aa%d8%b1%d8%a7%d9%88%d9%84-%d9%85%d8%a7%da%af/", keywords: ["تراول ماگ"] },
  { title: "جو و ماجی", href: "https://noon-valqalam.ir/product-category/hypermarket/jo-and-maji/", keywords: ["جو و ماجی"] },
  { title: "زیبایی مو", href: "https://noon-valqalam.ir/product-category/cosmetics/hair/hair-makeup/", keywords: ["زیبایی مو"] },
  { title: "قهوه فوری", href: "https://noon-valqalam.ir/product-category/hypermarket/instant-coffee/", keywords: ["قهوه فوری", "نسکافه فوری", "instant coffee", "nescafe", "کافی میت", "کافی مت", "کافی mate", "coffee mate", "creamer"] },
  { title: "مراقبت لب", href: "https://noon-valqalam.ir/product-category/skincare/lip-care/", keywords: ["مراقبت لب", "لب", "بالم لب", "lip"] },
  { title: "مراقبت پا", href: "https://noon-valqalam.ir/product-category/skincare/feet-care/", keywords: ["مراقبت پا"] },
  { title: "هات چاکلت", href: "https://noon-valqalam.ir/product-category/%d9%87%d8%a7%d8%aa-%da%86%d8%a7%da%a9%d9%84%d8%aa/", keywords: ["هات چاکلت", "hot chocolate"] },
  { title: "پودر شربت", href: "https://noon-valqalam.ir/product-category/hypermarket/syrup-powder/", keywords: ["پودر شربت"] },
  { title: "آرایش لب", href: "https://noon-valqalam.ir/product-category/cosmetics/makeup-cosmetics-2/lip-makeup/", keywords: ["آرایش لب", "رژ لب", "خط لب"] },
  { title: "اسمارتیز", href: "https://noon-valqalam.ir/product-category/%d8%a7%d8%b3%d9%85%d8%a7%d8%b1%d8%aa%db%8c%d8%b2/", keywords: ["اسمارتیز"] },
  { title: "بیسکوویت", href: "https://noon-valqalam.ir/product-category/hypermarket/biscuit/", keywords: ["بیسکوویت", "بیسکویت", "biscuit"] },
  { title: "ساعت مچی", href: "https://noon-valqalam.ir/product-category/%d8%b3%d8%a7%d8%b9%d8%aa-%d9%85%da%86%db%8c/", keywords: ["ساعت مچی"] },
  { title: "ضد آفتاب", href: "https://noon-valqalam.ir/product-category/skincare/sunscreen/", keywords: ["ضد آفتاب", "sunscreen"] },
  { title: "عطر جیبی", href: "https://noon-valqalam.ir/product-category/cosmetics/perfume/pocket-perfume/", keywords: ["عطر جیبی"] },
  { title: "قالب موج", href: "https://noon-valqalam.ir/product-category/%d9%82%d8%a7%d9%84%d8%a8-%d9%85%d9%88%d8%ac/", keywords: ["قالب موج"] },
  { title: "قرص قهوه", href: "https://noon-valqalam.ir/product-category/%d9%82%d8%b1%d8%b5-%d9%82%d9%87%d9%88%d9%87/", keywords: ["قرص قهوه"] },
  { title: "میوه خشک", href: "https://noon-valqalam.ir/product-category/nuts/%d9%85%db%8c%d9%88%d9%87-%d8%ae%d8%b4%da%a9/", keywords: ["میوه خشک"] },
  { title: "پودر ژله", href: "https://noon-valqalam.ir/product-category/%d9%be%d9%88%d8%af%d8%b1-%da%98%d9%84%d9%87/", keywords: ["پودر ژله"] },
  { title: "کافی شاپ", href: "https://noon-valqalam.ir/product-category/cafe/", keywords: ["کافی شاپ"] },
  { title: "برگه ها", href: "https://noon-valqalam.ir/product-category/nuts/dried-fruits/appricot/", keywords: ["برگه ها"] },
  { title: "سبزیجات", href: "https://noon-valqalam.ir/product-category/nuts/dried-herbs/", keywords: ["سبزیجات"] },
  { title: "شیر خشک", href: "https://noon-valqalam.ir/product-category/%d8%b4%db%8c%d8%b1-%d8%ae%d8%b4%da%a9/", keywords: ["شیر خشک"] },
  { title: "عرقیجات", href: "https://noon-valqalam.ir/product-category/%d8%b9%d8%b1%d9%82%db%8c%d8%ac%d8%a7%d8%aa/", keywords: ["عرقیجات"] },
  { title: "نوشیدنی", href: "https://noon-valqalam.ir/shop/", keywords: ["نوشیدنی", "آب زمزم", "زمزم", "آب معدنی", "آب آشامیدنی", "نوشابه", "آبمیوه", "water", "zamzam", "drink", "beverage"] },
  { title: "پسته ها", href: "https://noon-valqalam.ir/product-category/nuts/nut/pistachios/", keywords: ["پسته ها"] },
  { title: "چای کرک", href: "https://noon-valqalam.ir/product-category/%da%86%d8%a7%db%8c-%da%a9%d8%b1%da%a9/", keywords: ["چای کرک", "karak"] },
  { title: "کرم دست", href: "https://noon-valqalam.ir/product-category/%da%a9%d8%b1%d9%85-%d8%af%d8%b3%d8%aa/", keywords: ["کرم دست", "hand cream"] },
  { title: "آبنبات", href: "https://noon-valqalam.ir/product-category/%d8%a2%d8%a8%d9%86%d8%a8%d8%a7%d8%aa/", keywords: ["آبنبات", "candy"] },
  { title: "آرایشی", href: "https://noon-valqalam.ir/product-category/cosmetics/makeup-cosmetics-2/", keywords: ["آرایشی"] },
  { title: "تنقلات", href: "https://noon-valqalam.ir/product-category/snacks/", keywords: ["تنقلات"] },
  { title: "حبوبات", href: "https://noon-valqalam.ir/product-category/nuts/%d8%ad%d8%a8%d9%88%d8%a8%d8%a7%d8%aa/", keywords: ["حبوبات"] },
  { title: "خشکبار", href: "https://noon-valqalam.ir/product-category/nuts/dried-fruits/", keywords: ["خشکبار", "میوه خشک", "dried"] },
  { title: "زعفران", href: "https://noon-valqalam.ir/product-category/saffron/", keywords: ["زعفران", "saffron"] },
  { title: "سوغاتی", href: "https://noon-valqalam.ir/product-category/hypermarket/souvenir/", keywords: ["سوغاتی"] },
  { title: "شوینده", href: "https://noon-valqalam.ir/product-category/hypermarket/detergent/", keywords: ["شوینده", "detergent"] },
  { title: "شیرینی", href: "https://noon-valqalam.ir/product-category/sweets/", keywords: ["شیرینی"] },
  { title: "لوسیون", href: "https://noon-valqalam.ir/product-category/%d9%84%d9%88%d8%b3%db%8c%d9%88%d9%86/", keywords: ["لوسیون", "lotion"] },
  { title: "نسکافه", href: "https://noon-valqalam.ir/product-category/%d9%86%d8%b3%da%a9%d8%a7%d9%81%d9%87/", keywords: ["نسکافه", "nescafe"] },
  { title: "کادویی", href: "https://noon-valqalam.ir/product-category/%da%a9%d8%a7%d8%af%d9%88%db%8c%db%8c/", keywords: ["کادویی"] },
  { title: "آدامس", href: "https://noon-valqalam.ir/product-category/hypermarket/gum/", keywords: ["آدامس", "gum"] },
  { title: "ادویه", href: "https://noon-valqalam.ir/product-category/nuts/spices/", keywords: ["ادویه"] },
  { title: "بادام", href: "https://noon-valqalam.ir/product-category/nuts/almond/", keywords: ["بادام"] },
  { title: "دمنوش", href: "https://noon-valqalam.ir/product-category/%d8%af%d9%85%d9%86%d9%88%d8%b4/", keywords: ["دمنوش", "herbal tea"] },
  { title: "رمضان", href: "https://noon-valqalam.ir/product-category/%d8%b1%d9%85%d8%b6%d8%a7%d9%86/", keywords: ["رمضان"] },
  { title: "زیتون", href: "https://noon-valqalam.ir/product-category/%d8%b2%db%8c%d8%aa%d9%88%d9%86/", keywords: ["زیتون"] },
  { title: "سرلاک", href: "https://noon-valqalam.ir/product-category/%d8%b3%d8%b1%d9%84%d8%a7%da%a9/", keywords: ["سرلاک"] },
  { title: "سوهان", href: "https://noon-valqalam.ir/product-category/%d8%b3%d9%88%d9%87%d8%a7%d9%86/", keywords: ["سوهان"] },
  { title: "سیروپ", href: "https://noon-valqalam.ir/product-category/hypermarket/syrup/", keywords: ["سیروپ"] },
  { title: "شامپو", href: "https://noon-valqalam.ir/product-category/cosmetics/hair/shampoo/", keywords: ["شامپو", "shampoo"] },
  { title: "شکلات", href: "https://noon-valqalam.ir/product-category/hypermarket/chocolate/", keywords: ["شکلات", "chocolate"] },
  { title: "ضدجوش", href: "https://noon-valqalam.ir/product-category/%d8%b6%d8%af%d8%ac%d9%88%d8%b4/", keywords: ["ضدجوش"] },
  { title: "قنادی", href: "https://noon-valqalam.ir/product-category/%d9%82%d9%86%d8%a7%d8%af%db%8c/", keywords: ["قنادی"] },
  { title: "وانیل", href: "https://noon-valqalam.ir/product-category/%d9%88%d8%a7%d9%86%db%8c%d9%84/", keywords: ["وانیل"] },
  { title: "کمپوت", href: "https://noon-valqalam.ir/product-category/hypermarket/compote/", keywords: ["کمپوت"] },
  { title: "آجیل", href: "https://noon-valqalam.ir/product-category/nuts/nut/", keywords: ["آجیل", "مغز", "nut", "nuts"] },
  { title: "ارده", href: "https://noon-valqalam.ir/product-category/nuts/%d8%a7%d8%b1%d8%af%d9%87/", keywords: ["ارده"] },
  { title: "برنج", href: "https://noon-valqalam.ir/product-category/nuts/%d8%a8%d8%b1%d9%86%d8%ac/", keywords: ["برنج"] },
  { title: "تخمه", href: "https://noon-valqalam.ir/product-category/nuts/%d8%aa%d8%ae%d9%85%d9%87/", keywords: ["تخمه"] },
  { title: "حلوا", href: "https://noon-valqalam.ir/product-category/%d8%ad%d9%84%d9%88%d8%a7/", keywords: ["حلوا"] },
  { title: "خرما", href: "https://noon-valqalam.ir/product-category/nuts/dried-fruits/dates/", keywords: ["خرما"] },
  { title: "روغن", href: "https://noon-valqalam.ir/product-category/hypermarket/oil/", keywords: ["روغن"] },
  { title: "زرشک", href: "https://noon-valqalam.ir/product-category/nuts/%d8%b2%d8%b1%d8%b4%da%a9/", keywords: ["زرشک"] },
  { title: "شربت", href: "https://noon-valqalam.ir/product-category/%d8%b4%d8%b1%d8%a8%d8%aa/", keywords: ["شربت", "syrup"] },
  { title: "شلات", href: "https://noon-valqalam.ir/product-category/%d8%b4%d9%84%d8%a7%d8%aa/", keywords: ["شلات"] },
  { title: "فندق", href: "https://noon-valqalam.ir/product-category/nuts/%d9%81%d9%86%d8%af%d9%82/", keywords: ["فندق"] },
  { title: "قهوه", href: "https://noon-valqalam.ir/product-category/coffee/", keywords: ["قهوه", "اسپرسو", "کاپوچینو", "لاته", "coffee", "nescafe", "کافی"] },
  { title: "میوه", href: "https://noon-valqalam.ir/product-category/%d9%85%db%8c%d9%88%d9%87/", keywords: ["میوه"] },
  { title: "نبات", href: "https://noon-valqalam.ir/product-category/nuts/%d9%86%d8%a8%d8%a7%d8%aa/", keywords: ["نبات"] },
  { title: "نخود", href: "https://noon-valqalam.ir/product-category/nuts/%d9%86%d8%ae%d9%88%d8%af/", keywords: ["نخود"] },
  { title: "نودل", href: "https://noon-valqalam.ir/product-category/hypermarket/noodles/", keywords: ["نودل", "noodle", "noodles"] },
  { title: "پنیر", href: "https://noon-valqalam.ir/product-category/hypermarket/cheese/", keywords: ["پنیر", "cheese"] },
  { title: "چیپس", href: "https://noon-valqalam.ir/product-category/snacks/chips/", keywords: ["چیپس", "chips"] },
  { title: "کشمش", href: "https://noon-valqalam.ir/product-category/nuts/dried-fruits/%da%a9%d8%b4%d9%85%d8%b4/", keywords: ["کشمش"] },
  { title: "کنجد", href: "https://noon-valqalam.ir/product-category/nuts/%da%a9%d9%86%d8%ac%d8%af/", keywords: ["کنجد"] },
  { title: "گردو", href: "https://noon-valqalam.ir/product-category/nuts/%da%af%d8%b1%d8%af%d9%88/", keywords: ["گردو"] },
  { title: "توت", href: "https://noon-valqalam.ir/product-category/nuts/dried-fruits/berry/", keywords: ["توت"] },
  { title: "دسر", href: "https://noon-valqalam.ir/product-category/%d8%af%d8%b3%d8%b1/", keywords: ["دسر"] },
  { title: "قند", href: "https://noon-valqalam.ir/product-category/nuts/%d9%82%d9%86%d8%af/", keywords: ["قند"] },
  { title: "چای", href: "https://noon-valqalam.ir/product-category/%da%86%d8%a7%db%8c-2/", keywords: ["چای", "tea"] },
  { title: "ژله", href: "https://noon-valqalam.ir/product-category/%da%98%d9%84%d9%87/", keywords: ["ژله"] },
  { title: "کشک", href: "https://noon-valqalam.ir/product-category/nuts/%da%a9%d8%b4%da%a9/", keywords: ["کشک"] },
  { title: "جو", href: "https://noon-valqalam.ir/product-category/nuts/%d8%ac%d9%88/", keywords: ["جو"] },
  { title: "سس", href: "https://noon-valqalam.ir/product-category/hypermarket/sauce/", keywords: ["سس"] },
  { title: "هل", href: "https://noon-valqalam.ir/product-category/nuts/%d9%87%d9%84/", keywords: ["هل"] },
  { title: "گز", href: "https://noon-valqalam.ir/product-category/%da%af%d8%b2/", keywords: ["گز"] },
];

function normalizeCategoryMatchText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chooseBestInternalCategory(
  rawProductName: string,
  data: ProductData,
  isNutsOrDriedFruit: boolean,
): { title: string; href: string } {
  const text = normalizeCategoryMatchText([
    rawProductName,
    data.correctedProductName,
    data.focusKeyword,
    data.englishProductName,
    data.shortDescription,
    data.metaDescription,
    ...(data.advancedSeoAnalysis?.keyphraseSynonyms || []),
    ...(data.advancedSeoAnalysis?.lsiKeywords || []),
    ...(data.advancedSeoAnalysis?.semanticEntities || []),
  ].filter(Boolean).join(' '));

  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));
  const byTitle = (title: string) => SITE_CATEGORIES.find((cat) => cat.title === title);

  const priorityRules: Array<{ patterns: RegExp[]; title: string }> = [
    { patterns: [/آب\s*زمزم|زمزم|آب\s*معدنی|آب\s*آشامیدنی|نوشیدنی|water|zamzam|drink|beverage/], title: 'نوشیدنی' },
    { patterns: [/کافی\s*میت|کافی\s*مت|قهوه\s*فوری|نسکافه|instant\s*coffee|coffee\s*mate|creamer|nescafe/], title: 'قهوه فوری' },
    { patterns: [/هات\s*چاکلت|hot\s*chocolate/], title: 'هات چاکلت' },
    { patterns: [/قهوه|اسپرسو|کاپوچینو|لاته|coffee/], title: 'قهوه' },
    { patterns: [/لوسیون\s*بدن|body\s*lotion/], title: 'لوسیون بدن' },
    { patterns: [/لوسیون|lotion/], title: 'لوسیون' },
    { patterns: [/شامپو|shampoo/], title: 'شامپو' },
    { patterns: [/ماسک\s*مو|سرم\s*مو|نرم.?کننده\s*مو|مراقبت\s*مو|hair/], title: 'مراقبت و زیبایی مو' },
    { patterns: [/کرم\s*دست|hand\s*cream/], title: 'کرم دست' },
    { patterns: [/ضد\s*آفتاب|sunscreen/], title: 'ضد آفتاب' },
    { patterns: [/آبرسان|مرطوب.?کننده|سرم\s*پوست|کرم\s*صورت|مراقبت\s*پوست|skin|serum/], title: 'مراقبت پوست' },
    { patterns: [/خمیر\s*دندان|مسواک|دهان|دندان|tooth|oral/], title: 'بهداشت دهان و دندان' },
    { patterns: [/دئودرانت|ضد\s*تعریق|deodorant/], title: 'دئودرانت و ضد تعریق' },
    { patterns: [/عطر|ادکلن|perfume|fragrance/], title: 'عطر و ادکلن' },
    { patterns: [/شوینده|لباسشویی|ظرفشویی|پاک.?کننده|جرم.?گیر|detergent|cleaner/], title: 'مواد شوینده' },
    { patterns: [/زعفران|saffron/], title: 'زعفران' },
    { patterns: [/پسته\s*اکبری/], title: 'پسته اکبری' },
    { patterns: [/پسته\s*احمد/], title: 'پسته احمد آقایی' },
    { patterns: [/پسته\s*کله/], title: 'پسته کله قوچی' },
    { patterns: [/پسته|مغز\s*پسته/], title: 'پسته ها' },
    { patterns: [/بادام\s*هندی|cashew/], title: 'بادام هندی' },
    { patterns: [/بادام\s*زمینی|peanut/], title: 'بادام زمینی' },
    { patterns: [/بادام|almond/], title: 'بادام' },
    { patterns: [/گردو|walnut/], title: 'گردو' },
    { patterns: [/فندق|hazelnut/], title: 'فندق' },
    { patterns: [/خرما|date/], title: 'خرما' },
    { patterns: [/انجیر|fig/], title: 'انجیر خشک' },
    { patterns: [/کشمش|raisin/], title: 'کشمش' },
    { patterns: [/میوه\s*خشک|dried\s*fruit/], title: 'میوه خشک' },
    { patterns: [/آجیل|nut|nuts/], title: isNutsOrDriedFruit ? 'آجیل' : 'خشکبار و آجیل' },
    { patterns: [/چای\s*کرک|karak/], title: 'چای کرک' },
    { patterns: [/چای|tea/], title: 'چای' },
    { patterns: [/نودل|noodle/], title: 'نودل' },
    { patterns: [/پنیر|cheese/], title: 'پنیر' },
    { patterns: [/شکلات|chocolate/], title: 'شکلات' },
    { patterns: [/بیسکویت|بیسکوویت|biscuit/], title: 'بیسکوویت' },
    { patterns: [/ویفر/], title: 'ویفر شکلات' },
    { patterns: [/چیپس|chips/], title: 'چیپس' },
    { patterns: [/سس|sauce/], title: 'سس' },
    { patterns: [/قند/], title: 'قند' },
    { patterns: [/نبات/], title: 'نبات' },
    { patterns: [/سوهان/], title: 'سوهان' },
    { patterns: [/گز/], title: 'گز' },
  ];

  for (const rule of priorityRules) {
    if (has(rule.patterns)) {
      const found = byTitle(rule.title);
      if (found) return found;
    }
  }

  let best: { title: string; href: string; score: number } | null = null;
  for (const cat of SITE_CATEGORIES) {
    let score = 0;
    for (const keyword of cat.keywords) {
      const key = normalizeCategoryMatchText(keyword);
      if (!key) continue;
      if (text.includes(key)) score += Math.max(3, key.length);
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { title: cat.title, href: cat.href, score };
    }
  }

  if (best) return { title: best.title, href: best.href };

  return byTitle('هایپرمارکت') || {
    title: 'هایپرمارکت',
    href: 'https://noon-valqalam.ir/product-category/hypermarket/',
  };
}

function getNaturalInlineLinkSentence(
  rawProductName: string,
  data: ProductData,
  isNutsOrDriedFruit: boolean,
): string {
  const category = chooseBestInternalCategory(rawProductName, data, isNutsOrDriedFruit);
  return `برای مشاهده محصولات مرتبط، دسته <a href="${category.href}">${category.title}</a> می‌تواند انتخاب‌های نزدیک‌تری به این محصول نشان دهد.`;
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
  const category = chooseBestInternalCategory(rawProductName, data, isNutsOrDriedFruit);
  return {
    target: `${category.title} — ${category.href}`,
    anchor: data.focusKeyword || data.correctedProductName || category.title,
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
    .replace(/همچنین\s*برای\s*تجربه[^.؟<]*(?:،|,)\s*می‌توانید\s*آن\s*را\s*همراه\s*با\s*(?:<a\b[^>]*>[^<]+<\/a>|[^.؟]+)\s*استفاده\s*کنید\.?/g,
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


function restoreRawIdentityIfModelSwappedProduct(data: ProductData, rawProductName: string, hasProductImage = false): ProductData {
  // Do not force the raw typed name when image exists.
  // The user may type a fake/wrong name; the image/label must win.
  if (hasProductImage) return data;

  const raw = String(rawProductName || '').trim();
  if (!raw) return data;

  const corrected = String(data.correctedProductName || '').trim();
  const focus = String(data.focusKeyword || '').trim();

  // Only repair empty/useless output. Do NOT prevent normal name correction.
  if (!corrected || corrected.length < 2) {
    return {
      ...data,
      correctedProductName: raw,
      focusKeyword: focus || raw,
      seoTitle: `خرید ${raw}`.slice(0, 60),
      metaDescription: `خرید ${raw} با توضیحات کامل، مشخصات محصول و راهنمای انتخاب برای ثبت سفارش مطمئن‌تر.`,
      altImageText: raw,
    };
  }

  return data;
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
  if (/آب\s*زمزم|زمزم|آب\s*معدنی|آب\s*آشامیدنی|نوشیدنی|برنج|روغن|چای|شکلات|بیسکویت|خوراکی|غذایی|رب|تن ماهی|ماکارونی|زعفران|water|zamzam|food|tea/.test(text)) {
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



function toEnglishDigitsForUnitCompare(input: string): string {
  return String(input || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizeDuplicateMeasurementUnits(text: string): string {
  let output = String(text || '');

  // Normalize half-space variants only for unit cleanup; keep the visible Persian form.
  output = output
    .replace(/میلی[\s\u200c]*لیتر/gi, 'میلی‌لیتر')
    .replace(/میل[\s\u200c]*لیتر/gi, 'میلی‌لیتر');

  // Convert Persian/Arabic digits to English for reliable regex comparison.
  output = toEnglishDigitsForUnitCompare(output);

  // Same value repeated in Persian + English units: keep Persian for Persian product copy.
  output = output
    .replace(/(\d+(?:[.,]\d+)?)\s*میلی‌لیتر\s+\1\s*(?:ml|mL)\b/gi, '$1 میلی‌لیتر')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:ml|mL)\s+\1\s*میلی‌لیتر\b/gi, '$1 میلی‌لیتر')
    .replace(/(\d+(?:[.,]\d+)?)\s*گرم\s+\1\s*(?:g|gr)\b/gi, '$1 گرم')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:g|gr)\s+\1\s*گرم\b/gi, '$1 گرم')
    .replace(/(\d+(?:[.,]\d+)?)\s*کیلوگرم\s+\1\s*(?:kg)\b/gi, '$1 کیلوگرم')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:kg)\s+\1\s*کیلوگرم\b/gi, '$1 کیلوگرم');

  // Also catch common repeated "حجم 300 میلی‌لیتر 300 ml" style even if words are between them.
  output = output
    .replace(/(حجم\s*[:：\-]?\s*)(\d+(?:[.,]\d+)?)\s*میلی‌لیتر\s+\2\s*(?:ml|mL)\b/gi, '$1$2 میلی‌لیتر')
    .replace(/(وزن\s*[:：\-]?\s*)(\d+(?:[.,]\d+)?)\s*گرم\s+\2\s*(?:g|gr)\b/gi, '$1$2 گرم');

  // Common adjacent duplicate tokens from model/image text extraction.
  output = output
    .replace(/\b(SPF\s*\d{2,3}\+?)\s+\1\b/gi, '$1')
    .replace(/\b(PA\s*\+{1,4})\s+\1\b/gi, '$1')
    .replace(/\b(UVA\/UVB)\s+\1\b/gi, '$1')
    .replace(/(\d+(?:[.,]\d+)?\s*(?:oz|fl\s*oz))\s+\1\b/gi, '$1');

  return output
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([،؛:.])/g, '$1')
    .trim();
}

function normalizeDuplicateMeasurementUnitsInHtml(html: string): string {
  return normalizeDuplicateMeasurementUnits(String(html || ''));
}

function extractVisibleSpecTokensFromInput(rawProductName: string, briefDescription: string): string[] {
  const source = normalizeDuplicateMeasurementUnits(`${rawProductName || ''} ${briefDescription || ''}`);

  const hasPersianMl = (num: string) => new RegExp(`${num.replace('.', '\\.')}\\s*(?:میلی\\u200cلیتر|میلی\\s*لیتر|میل\\s*لیتر)`, 'i').test(source);
  const hasPersianGram = (num: string) => new RegExp(`${num.replace('.', '\\.')}\\s*(?:گرم)`, 'i').test(source);

  const patterns: RegExp[] = [
    /\bSPF\s*[:：\-]?\s*[0-9]{2,3}\+?\b/gi,
    /\bPA\s*[:：\-]?\s*\+{1,4}\b/gi,
    /\bUVA\/UVB\b/gi,
    /\b[0-9]+(?:\.[0-9]+)?\s*(?:fl\s*)?oz\b/gi,
    /\b[0-9]+(?:\.[0-9]+)?\s*(?:ml|mL|g|gr)\b/g,
    /[0-9]+(?:\.[0-9]+)?\s*(?:میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|گرم|کیلوگرم)/g,
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const matches = source.match(pattern) || [];
    for (const match of matches) {
      let clean = String(match || '').replace(/\s+/g, ' ').trim();
      if (!clean) continue;

      const numMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)/);
      const num = numMatch ? numMatch[1] : '';

      // If same value exists as Persian unit, do not also add English ml/g/gr.
      if (num && /\b(?:ml|mL)\b/.test(clean) && hasPersianMl(num)) continue;
      if (num && /\b(?:g|gr)\b/.test(clean) && hasPersianGram(num)) continue;

      clean = normalizeDuplicateMeasurementUnits(clean);
      if (clean && !found.some((item) => item.toLowerCase() === clean.toLowerCase())) {
        found.push(clean);
      }
    }
  }

  return found;
}

function ensureVisibleSpecTokensInName(data: ProductData, rawProductName: string, briefDescription: string): ProductData {
  const tokens = extractVisibleSpecTokensFromInput(rawProductName, briefDescription);
  if (tokens.length === 0) return data;

  let name = String(data.correctedProductName || '').trim();
  let focus = String(data.focusKeyword || '').trim();
  let title = String(data.seoTitle || '').trim();
  let alt = String(data.altImageText || '').trim();

  for (const token of tokens) {
    const tokenNorm = token.toLowerCase();
    if (name && !name.toLowerCase().includes(tokenNorm)) name = `${name} ${token}`;
    if (focus && !focus.toLowerCase().includes(tokenNorm) && /spf|pa|oz|ml|g|گرم|لیتر/i.test(token)) focus = `${focus} ${token}`;
    if (title && !title.toLowerCase().includes(tokenNorm) && title.length < 58) title = `${title} ${token}`.slice(0, 70);
    if (alt && !alt.toLowerCase().includes(tokenNorm) && alt.length < 100) alt = `${alt} ${token}`;
  }

  return {
    ...data,
    correctedProductName: name || data.correctedProductName,
    focusKeyword: focus || data.focusKeyword,
    seoTitle: title || data.seoTitle,
    altImageText: alt || data.altImageText,
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

  return enrichAdvancedSeoAnalysis(cleanSpecsRepetitionInProductData(cleanDuplicateMeasurementUnitsInProductData(ensureYoastSeoFields(cleanedData))));
}



function cleanDuplicateMeasurementUnitsInProductData(data: ProductData): ProductData {
  const clean = (value: string) => normalizeDuplicateMeasurementUnits(normalizeDuplicateMeasurementUnits(value));
  return {
    ...data,
    correctedProductName: clean(data.correctedProductName),
    englishProductName: clean(data.englishProductName),
    fullDescription: clean(data.fullDescription),
    shortDescription: clean(data.shortDescription),
    seoTitle: clean(data.seoTitle),
    slug: data.slug,
    focusKeyword: clean(data.focusKeyword),
    metaDescription: clean(data.metaDescription),
    altImageText: clean(data.altImageText),
  };
}


function normalizeSpecValueKey(value: string): string {
  let output = normalizeDuplicateMeasurementUnits(String(value || ''))
    .toLowerCase()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/میلی[\s\u200c]*لیتر|میل[\s\u200c]*لیتر|ml|ml\./gi, 'ml')
    .replace(/گرم|gr|g\b/gi, 'g')
    .replace(/کیلوگرم|kg/gi, 'kg')
    .replace(/\s+/g, '')
    .replace(/[،,:：؛\-]/g, '')
    .trim();

  return output;
}

function getSpecLabelAndValue(liInner: string): { label: string; value: string } {
  const clean = String(liInner || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = clean.split(/[:：]/);
  if (parts.length >= 2) {
    return {
      label: parts[0].trim(),
      value: parts.slice(1).join(':').trim(),
    };
  }

  const match = clean.match(/^(حجم|وزن|تعداد|مدل|برند|نوع محصول|کاربرد|رایحه|طعم|رنگ|شماره رنگ|SPF|PA|محافظت)\s+(.+)$/i);
  if (match) {
    return { label: match[1].trim(), value: match[2].trim() };
  }

  return { label: clean, value: '' };
}

function isSpecLikeText(text: string): boolean {
  const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // User preference: only volume must not be repeated in feature/benefit sections.
  // SPF, PA, UVA/UVB, model, shade/color, scent, etc. may appear in features when meaningful.
  if (/^حجم\s*[:：]?\s*/i.test(clean)) return true;

  // Standalone volume measurement as a bullet should live in specs, not features.
  if (/^(?:حجم)?\s*[0-9۰-۹٠-٩]+(?:[.,][0-9۰-۹٠-٩]+)?\s*(?:میلی[\s\u200c]*لیتر|میل[\s\u200c]*لیتر|ml|mL|لیتر|l)\b/i.test(clean)) return true;

  return false;
}

function cleanSpecsRepetitionInHtml(html: string): string {
  let output = String(html || '');

  // 1) Inside "مشخصات محصول", keep one clean item per spec label.
  // For volume, keep Persian unit when both Persian and English exist.
  const specsPattern = /(<h5>\s*📦\s*مشخصات\s*محصول\s*:?\s*<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/i;

  output = output.replace(specsPattern, (_match, open, body, close) => {
    const items = String(body || '').match(/<li>[\s\S]*?<\/li>/gi) || [];
    const bestByLabel = new Map<string, string>();
    const order: string[] = [];

    const getLabelFamily = (label: string): string => {
      const normLabel = String(label || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (/حجم/.test(normLabel)) return 'حجم';
      if (/وزن/.test(normLabel)) return 'وزن';
      if (/تعداد/.test(normLabel)) return 'تعداد';
      if (/spf/i.test(normLabel)) return 'SPF';
      if (/pa/i.test(normLabel)) return 'PA';
      if (/مدل/.test(normLabel)) return 'مدل';
      if (/برند/.test(normLabel)) return 'برند';
      if (/نوع\s*محصول/.test(normLabel)) return 'نوع محصول';
      if (/کاربرد/.test(normLabel)) return 'کاربرد';
      if (/رایحه/.test(normLabel)) return 'رایحه';
      if (/طعم/.test(normLabel)) return 'طعم';
      if (/رنگ/.test(normLabel)) return 'رنگ';
      return normLabel;
    };

    const scoreItem = (labelFamily: string, item: string): number => {
      let score = 0;
      const clean = normalizeDuplicateMeasurementUnits(item);

      // Prefer Persian units for Persian output.
      if (/میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|گرم|کیلوگرم/.test(clean)) score += 20;
      if (/\b(?:ml|mL|g|gr|kg)\b/.test(clean)) score -= 10;

      // Prefer item that actually has a value after colon.
      if (/[:：]\s*\S+/.test(clean)) score += 5;

      // For volume, a Persian volume line must beat English duplicate.
      if (labelFamily === 'حجم' && /میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر/.test(clean)) score += 50;
      if (labelFamily === 'حجم' && /\b(?:ml|mL)\b/.test(clean)) score -= 50;

      return score;
    };

    for (const item of items) {
      let inner = item.replace(/^<li>/i, '').replace(/<\/li>$/i, '').trim();
      inner = normalizeDuplicateMeasurementUnits(inner);
      if (!inner) continue;

      const { label } = getSpecLabelAndValue(inner);
      const labelFamily = getLabelFamily(label || inner);
      const currentItem = `<li>${inner}</li>`;

      if (!bestByLabel.has(labelFamily)) {
        bestByLabel.set(labelFamily, currentItem);
        order.push(labelFamily);
        continue;
      }

      const previous = bestByLabel.get(labelFamily) || '';
      if (scoreItem(labelFamily, currentItem) > scoreItem(labelFamily, previous)) {
        bestByLabel.set(labelFamily, currentItem);
      }
    }

    const kept = order
      .map((label) => bestByLabel.get(label))
      .filter(Boolean)
      .join('');

    return `${open}${kept}${close}`;
  });

  // 2) Remove only volume-like bullets from non-spec sections. SPF and other real features may stay.
  output = output.replace(/(<h5>(?!\s*📦\s*مشخصات\s*محصول)[\s\S]*?<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/gi, (_match, open, body, close) => {
    const items = String(body || '').match(/<li>[\s\S]*?<\/li>/gi) || [];
    const kept = items.filter((item) => {
      const inner = item.replace(/^<li>/i, '').replace(/<\/li>$/i, '').trim();
      return !isSpecLikeText(inner);
    });
    return `${open}${kept.join('')}${close}`;
  });

  return normalizeDuplicateMeasurementUnits(output)
    .replace(/<ul>\s*<\/ul>/gi, '')
    .replace(/>\s+</g, '><')
    .trim();
}


function removeDuplicateVolumeLinesInSpecs(html: string): string {
  return String(html || '').replace(
    /(<h5>\s*📦\s*مشخصات\s*محصول\s*:?\s*<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/i,
    (_match, open, body, close) => {
      const items = String(body || '').match(/<li>[\s\S]*?<\/li>/gi) || [];
      let chosenVolume = '';
      const others: string[] = [];

      for (const item of items) {
        const inner = normalizeDuplicateMeasurementUnits(item.replace(/^<li>/i, '').replace(/<\/li>$/i, '').trim());
        if (/^حجم\s*[:：]/i.test(inner)) {
          if (!chosenVolume) {
            chosenVolume = `<li>${inner}</li>`;
          } else {
            const currentIsPersian = /میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر/.test(inner);
            const chosenIsPersian = /میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر/.test(chosenVolume);
            if (currentIsPersian && !chosenIsPersian) chosenVolume = `<li>${inner}</li>`;
          }
        } else {
          others.push(`<li>${inner}</li>`);
        }
      }

      const outputItems: string[] = [];
      for (const item of others) {
        outputItems.push(item);
        if (/^<li>\s*نوع\s*محصول\s*[:：]/i.test(item) && chosenVolume) {
          outputItems.push(chosenVolume);
          chosenVolume = '';
        }
      }
      if (chosenVolume) outputItems.push(chosenVolume);

      return `${open}${outputItems.join('')}${close}`;
    }
  );
}

function cleanSpecsRepetitionInProductData(data: ProductData): ProductData {
  return {
    ...data,
    correctedProductName: normalizeDuplicateMeasurementUnits(data.correctedProductName),
    fullDescription: removeDuplicateVolumeLinesInSpecs(cleanSpecsRepetitionInHtml(data.fullDescription)),
    shortDescription: normalizeDuplicateMeasurementUnits(data.shortDescription),
    seoTitle: normalizeDuplicateMeasurementUnits(data.seoTitle),
    focusKeyword: normalizeDuplicateMeasurementUnits(data.focusKeyword),
    metaDescription: normalizeDuplicateMeasurementUnits(data.metaDescription),
    altImageText: normalizeDuplicateMeasurementUnits(data.altImageText),
  };
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
  if (/آب\s*زمزم|زمزم|آب\s*معدنی|آب\s*آشامیدنی|نوشیدنی|برنج|روغن|چای|قهوه|شکلات|بیسکویت|خوراکی|غذایی|پنیر|لبنیات|water|zamzam|food|coffee|tea/.test(text)) return 'food';
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
  const seriesCountryItem = '';

  // Do not show "country of brand origin"; user wants real product origin if known.
  output = output.replace(
    /<li>\s*کشور\s*مب[ددا][أا]?\s*برند\s*[:：][\s\S]*?<\/li>/gi,
    ''
  );

  // If country fields leaked prompt/instruction/unknown values, convert to the safe batch phrase.
  output = output.replace(
    /<li>\s*(?:کشور\s*مب[ددا][أا]?|کشور\s*سازنده|مب[ددا][أا]?\s*تولید)\s*[:：]\s*(?:اگر\s*مشخص\s*است|اگر\s*قطعی\s*و\s*مشخص\s*است|فقط\s*اگر\s*قطعی\s*و\s*مشخص\s*است|اگر\s*کشور\s*واقعی\s*مشخص\s*است[\s\S]*?|نامشخص|نامعلوم|مشخص\s*نیست|ذکر\s*نشده|ندارد|n\/a|unknown|not\s*specified|null|undefined)\s*<\/li>/gi,
    seriesCountryItem
  );

  // Remove other unknown values in specs.
  output = output.replace(
    /<li>\s*(?!(?:کشور\s*مب[ددا][أا]?|کشور\s*سازنده)\s*[:：])[^<:：]*[:：]\s*(?:اگر\s*مشخص\s*است|نامشخص|نامعلوم|مشخص\s*نیست|ذکر\s*نشده|ندارد|n\/a|unknown|not\s*specified|null|undefined)\s*<\/li>/gi,
    ''
  );

  const specsPattern = /(<h5>\s*📦\s*مشخصات\s*محصول\s*:?\s*<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/i;
  output = output.replace(specsPattern, (_match, open, body, close) => {
    let bodyText = String(body || '');

    const hasRealOrigin = /<li>\s*کشور\s*مب[ددا][أا]?\s*[:：]\s*(?!بستگی|نامشخص|نامعلوم|اگر\s*مشخص\s*است)[\s\S]*?<\/li>/i.test(bodyText);
    const hasManufacturer = /<li>\s*کشور\s*سازنده\s*[:：]\s*[\s\S]*?<\/li>/i.test(bodyText);

    if (hasRealOrigin) {
      bodyText = bodyText.replace(/<li>\s*کشور\s*سازنده\s*[:：]\s*بستگی\s*به\s*سری\s*ساخت\s*دارد\s*<\/li>/gi, '');
      return `${open}${bodyText}${close}`;
    }

    if (!hasManufacturer) {
      bodyText = `${bodyText.trimEnd()}\n${seriesCountryItem}\n`;
    }

    return `${open}${bodyText}${close}`;
  });

  let seenOrigin = false;
  output = output.replace(/<li>\s*کشور\s*مب[ددا][أا]?\s*[:：][\s\S]*?<\/li>/gi, (item) => {
    if (seenOrigin) return '';
    seenOrigin = true;
    return item;
  });

  let seenManufacturer = false;
  output = output.replace(/<li>\s*کشور\s*سازنده\s*[:：][\s\S]*?<\/li>/gi, (item) => {
    if (seenOrigin && /بستگی\s*به\s*سری\s*ساخت/.test(item)) return '';
    if (seenManufacturer) return '';
    seenManufacturer = true;
    if (/اگر\s*مشخص\s*است|نامشخص|نامعلوم|unknown|not\s*specified|undefined|null/i.test(item)) {
      return seriesCountryItem;
    }
    return item;
  });

  output = output
    .replace(/<a\s+href=["']#["']/gi, '<a href="https://noon-valqalam.ir/product-category/hypermarket/"')
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

      const rawGeneratedData = cleanSpecsRepetitionInProductData(cleanDuplicateMeasurementUnitsInProductData(ensureVisibleSpecTokensInName(restoreRawIdentityIfModelSwappedProduct(normalizeProductData(extractJson(text)), productName, Boolean(productImage)), productName, briefDescription)));
      const generatedData = cleanSpecsRepetitionInProductData(cleanDuplicateMeasurementUnitsInProductData(sanitizeCountryFieldsInProductData(ensureMohannadFullDescriptionDepth(
        rawGeneratedData,
        productName,
        briefDescription,
        isNutsOrDriedFruit,
      ))));
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
