import type { ProductData, ImageFile } from '../types';

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
        ? 'درخواست بیش از حد طول کشید. تولید متن دوباره امتحان شود؛ جستجوی لینک داخلی حالا زمان‌دار شده است.'
        : rawText && rawText.length < 300
          ? rawText
          : `خطای سرور ${response.status}: ${response.statusText || 'پاسخ نامعتبر از Vercel'}`;

      const errorMessage = errorData.message || fallbackMessage;
      throw new Error(errorMessage);
    }

    const data: ProductData = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling backend API:", error);
    if (error instanceof Error) {
        // Re-throw a more user-friendly message
        throw new Error(`${error.message}`);
    }
    throw new Error("یک خطای ناشناخته در ارتباط با سرور رخ داد.");
  }
};