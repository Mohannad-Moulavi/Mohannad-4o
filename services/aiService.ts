import type { ProductData, ImageFile } from '../types';

const normalizeDuplicateUnitsClient = (input: string): string => {
  let output = String(input || '');

  output = output
    .replace(/میلی[\s\u200c]*لیتر/gi, 'میلی‌لیتر')
    .replace(/میل[\s\u200c]*لیتر/gi, 'میلی‌لیتر')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  output = output
    .replace(/(\d+(?:[.,]\d+)?)\s*میلی‌لیتر\s+\1\s*(?:ml|mL)\b/gi, '$1 میلی‌لیتر')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:ml|mL)\s+\1\s*میلی‌لیتر\b/gi, '$1 میلی‌لیتر')
    .replace(/(\d+(?:[.,]\d+)?)\s*گرم\s+\1\s*(?:g|gr)\b/gi, '$1 گرم')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:g|gr)\s+\1\s*گرم\b/gi, '$1 گرم')
    .replace(/\b(SPF\s*\d{2,3}\+?)\s+\1\b/gi, '$1')
    .replace(/\b(PA\s*\+{1,4})\s+\1\b/gi, '$1');

  return output.replace(/\s{2,}/g, ' ').trim();
};

const normalizeHrClient = (input: string): string => {
  let output = String(input || '').replace(/<hr\s*\/?>/gi, '<hr />');

  output = output
    .replace(/\s*<hr\s*\/>\s*/gi, '<hr />')
    .replace(/(?:<hr\s*\/>\s*){2,}/gi, '<hr />')
    .replace(/(?:<hr\s*\/>\s*)+<h5>/gi, '<hr /><h5>')
    .replace(/^\s*(?:<hr\s*\/>\s*)+/i, '')
    .replace(/(?:<hr\s*\/>\s*)+$/i, '')
    .replace(/>\s+</g, '><')
    .trim();

  return output;
};

const cleanHtmlSpecsVolumeClient = (input: string): string => {
  let output = String(input || '');

  output = output.replace(
    /(<h5>\s*📦\s*مشخصات\s*محصول\s*:?\s*<\/h5>\s*<ul>)([\s\S]*?)(<\/ul>)/gi,
    (_match, open, body, close) => {
      const items = String(body || '').match(/<li>[\s\S]*?<\/li>/gi) || [];
      let volume = '';
      const others: string[] = [];

      for (const rawItem of items) {
        const inner = normalizeDuplicateUnitsClient(
          String(rawItem || '').replace(/^<li>/i, '').replace(/<\/li>$/i, '').trim()
        );
        if (!inner) continue;

        if (/^حجم\s*[:：]/i.test(inner)) {
          const item = `<li>${inner}</li>`;
          if (!volume) {
            volume = item;
          } else {
            const currentPersian = /میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر/.test(inner);
            const chosenPersian = /میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر/.test(volume);
            if (currentPersian && !chosenPersian) volume = item;
          }
          continue;
        }

        others.push(`<li>${inner}</li>`);
      }

      const result: string[] = [];
      let inserted = false;

      for (const item of others) {
        result.push(item);
        if (!inserted && volume && /^<li>\s*نوع\s*محصول\s*[:：]/i.test(item)) {
          result.push(volume);
          inserted = true;
        }
      }

      if (volume && !inserted) result.push(volume);

      return `${open}${result.join('')}${close}`;
    }
  );

  return output;
};

const cleanPlainSpecsVolumeClient = (input: string): string => {
  const lines = String(input || '').split(/\r?\n/);
  const result: string[] = [];
  let insideSpecs = false;
  let volume = '';
  let buffer: string[] = [];

  const flush = () => {
    if (!insideSpecs) return;

    const out: string[] = [];
    let inserted = false;

    for (const rawLine of buffer) {
      const line = normalizeDuplicateUnitsClient(rawLine);
      if (/^\s*حجم\s*[:：]/i.test(line)) {
        if (!volume) {
          volume = line;
        } else {
          const currentPersian = /میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر/.test(line);
          const chosenPersian = /میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر/.test(volume);
          if (currentPersian && !chosenPersian) volume = line;
        }
        continue;
      }

      out.push(line);

      if (!inserted && volume && /^\s*نوع\s*محصول\s*[:：]/i.test(line)) {
        out.push(volume);
        inserted = true;
      }
    }

    if (volume && !inserted) out.push(volume);

    result.push(...out);
    insideSpecs = false;
    buffer = [];
    volume = '';
  };

  for (const raw of lines) {
    const line = normalizeDuplicateUnitsClient(raw);

    if (/^\s*📦?\s*مشخصات\s*محصول\s*[:：]?\s*$/i.test(line)) {
      flush();
      result.push(line);
      insideSpecs = true;
      continue;
    }

    if (insideSpecs && /^\s*(توضیحات\s*کوتاه|کلیدواژه|عنوان\s*سئو|نامک|توضیحات\s*متا|متن\s*جایگزین|کلیدواژه‌های\s*مرتبط)\b/i.test(line)) {
      flush();
      result.push(line);
      continue;
    }

    if (insideSpecs) {
      buffer.push(line);
    } else {
      result.push(line);
    }
  }

  flush();

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const stripLeakedSectionsClient = (input: string): string => {
  return String(input || '').replace(
    /(?:\n|<br\s*\/?>|\s)*(?:توضیحات\s*کوتاه\s*(?:\(|（)?\s*Short\s*Desc[\s\S]*|کلیدواژه\s*کانونی[\s\S]*|عنوان\s*سئو[\s\S]*|نامک\s*(?:\(|（)?\s*Slug[\s\S]*|توضیحات\s*متا[\s\S]*|متن\s*جایگزین\s*تصویر[\s\S]*|کلیدواژه‌های\s*مرتبط[\s\S]*)$/i,
    ''
  ).trim();
};

const finalCleanClientText = (input: string): string => {
  let output = String(input || '');
  output = stripLeakedSectionsClient(output);
  output = normalizeDuplicateUnitsClient(output);
  output = cleanHtmlSpecsVolumeClient(output);
  output = cleanPlainSpecsVolumeClient(output);
  output = normalizeHrClient(output);

  // Last brutal fallback for adjacent duplicate volume lines anywhere.
  output = output
    .replace(/(حجم\s*[:：]\s*\d+(?:[.,]\d+)?\s*(?:میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر))\s*(?:<br\s*\/?>|\n|\s)*حجم\s*[:：]\s*\d+(?:[.,]\d+)?\s*(?:ml|mL)\b/gi, '$1')
    .replace(/(حجم\s*[:：]\s*\d+(?:[.,]\d+)?\s*(?:ml|mL))\s*(?:<br\s*\/?>|\n|\s)*(حجم\s*[:：]\s*\d+(?:[.,]\d+)?\s*(?:میلی‌لیتر|میلی\s*لیتر|میل\s*لیتر|لیتر))/gi, '$2')
    .replace(/(?:<hr\s*\/>\s*){2,}/gi, '<hr />')
    .replace(/>\s+</g, '><')
    .trim();

  return output;
};


const clientYoastFocus = (data: ProductData): string => {
  const stop = new Set(['مدل','حجم','وزن','عدد','تعداد','خرید','قیمت','محصول','برای','مناسب','انواع']);
  const source = String(data.focusKeyword || data.correctedProductName || '')
    .replace(/\s+مدل\s+[A-Za-z0-9][A-Za-z0-9\s\-_.]+/gi, ' ')
    .replace(/\s+حجم\s*[:：]?\s*[0-9۰-۹٠-٩]+(?:[.,][0-9۰-۹٠-٩]+)?\s*(?:میلی[\s\u200c]*لیتر|میل[\s\u200c]*لیتر|ml|mL|گرم|g|gr|oz|fl\s*oz|لیتر)/gi, ' ')
    .replace(/[()（）،,:：؛\-|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = source
    .split(/\s+/)
    .map((word) => word.replace(/[^\u0600-\u06FF‌]/g, '').trim())
    .filter((word) => word && !stop.has(word));

  return words.slice(0, 4).join(' ').trim() || data.focusKeyword || '';
};

const clientEnsureYoastFields = (data: ProductData): ProductData => {
  const focus = clientYoastFocus(data);
  if (!focus) return data;

  const ensureContains = (value: string, fallback: string) => {
    const text = String(value || '').trim();
    return text.includes(focus) ? text : fallback;
  };

  let fullDescription = String(data.fullDescription || '');
  if (!fullDescription.includes(focus)) {
    fullDescription = fullDescription.replace(/<p>/i, `<p>${focus}؛ `);
  }

  return {
    ...data,
    focusKeyword: focus,
    fullDescription,
    seoTitle: ensureContains(data.seoTitle, `خرید ${focus} | نون و القلم`),
    metaDescription: ensureContains(data.metaDescription, `خرید ${focus} با بررسی مشخصات، کاربرد و توضیحات محصول در فروشگاه نون و القلم. مناسب انتخاب مطمئن و روزانه.`).slice(0, 155),
    altImageText: ensureContains(data.altImageText, `تصویر محصول ${focus} برای معرفی و خرید در نون و القلم`),
  };
};


const sanitizeProductDataOnClient = (data: ProductData): ProductData => ({
  ...data,
  correctedProductName: finalCleanClientText(data.correctedProductName),
  englishProductName: finalCleanClientText(data.englishProductName),
  fullDescription: finalCleanClientText(data.fullDescription),
  shortDescription: finalCleanClientText(data.shortDescription),
  seoTitle: finalCleanClientText(data.seoTitle),
  focusKeyword: finalCleanClientText(data.focusKeyword),
  metaDescription: finalCleanClientText(data.metaDescription),
  altImageText: finalCleanClientText(data.altImageText),
});




const sampleStyleClientFinal = (data: ProductData): ProductData => {
  const source = `${data.correctedProductName || ''} ${data.focusKeyword || ''} ${data.fullDescription || ''}`;
  const brandMap: Record<string, string> = { cantu: 'کانتو', cliven: 'کلیون', nivea: 'نیوآ', garnier: 'گارنیر', loreal: 'لورآل' };
  let brand = '';
  for (const b of Object.values(brandMap)) if (source.includes(b)) brand = b;
  if (!brand) {
    const latin = source.match(/\b[A-Za-z][A-Za-z0-9&.'’-]{1,}\b/g) || [];
    const banned = new Set(['shea','butter','leave','in','deep','treatment','masque','mask','conditioning','conditioner','cream','ml','g','oz']);
    for (const token of latin) {
      const key = token.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!banned.has(key)) { brand = brandMap[key] || token; break; }
    }
  }

  const ingredient = /شی\s*باتر|shea\s*butter/i.test(source) ? 'شی باتر' : '';
  const types = ['ماسک مو', 'کرم نرم‌کننده مو', 'نرم‌کننده مو', 'کرم مو', 'کرم چندمنظوره', 'کرم ضد آفتاب', 'ضد آفتاب', 'لوسیون بدن', 'شامپو', 'سرم مو'];
  const type = types.find((t) => source.includes(t)) || '';

  if (!type) return data;

  const focus = [type, brand, ingredient].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!focus) return data;

  return {
    ...data,
    focusKeyword: focus,
    seoTitle: data.seoTitle.includes(focus) ? data.seoTitle : `خرید ${focus} | نون و القلم`,
    metaDescription: data.metaDescription.includes(focus) ? data.metaDescription : `${focus} برای بررسی مشخصات، کاربرد و خرید مطمئن در فروشگاه نون و القلم مناسب است.`.slice(0, 155),
    altImageText: data.altImageText.includes(focus) ? data.altImageText : `${focus} برای معرفی و خرید محصول`,
    fullDescription: data.fullDescription.includes(focus) ? data.fullDescription : data.fullDescription.replace(/<p>/i, `<p>${focus}؛ `),
  };
};


export const generateProductContent = async (
  productName: string,
  productImage: ImageFile | null,
  briefDescription: string,
  isNutsOrDriedFruit: boolean,
): Promise<ProductData> => {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productName, productImage, briefDescription, isNutsOrDriedFruit }),
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      let errorData: { message?: string; details?: unknown } = {};

      try {
        errorData = rawText ? JSON.parse(rawText) : {};
      } catch (_error) {
        errorData = {};
      }

      const fallbackMessage = response.status === 504
        ? 'درخواست بیش از حد طول کشید. تولید متن را دوباره امتحان کنید یا عکس کوچک‌تری ارسال کنید.'
        : rawText && rawText.length < 300
          ? rawText
          : `خطای سرور ${response.status}: ${response.statusText || 'پاسخ نامعتبر از Vercel'}`;

      const errorMessage = errorData.message || fallbackMessage;
      throw new Error(errorMessage);
    }

    const data: ProductData = await response.json();
    return sampleStyleClientFinal(clientEnsureYoastFields(sanitizeProductDataOnClient(data)));
  } catch (error) {
    console.error("Error calling backend API:", error);
    if (error instanceof Error) {
        // Re-throw a more user-friendly message
        throw new Error(`${error.message}`);
    }
    throw new Error("یک خطای ناشناخته در ارتباط با سرور رخ داد.");
  }
};