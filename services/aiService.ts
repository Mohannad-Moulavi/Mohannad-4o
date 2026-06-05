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
      const errorData = await response.json().catch(() => ({ message: 'An unknown server error occurred.' }));
      // Use the server's message, but have a fallback.
      const errorMessage = errorData.message || `Error ${response.status}: ${response.statusText}`;
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